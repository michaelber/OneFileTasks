import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isToday, isTomorrow, isYesterday } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { get, set } from 'idb-keyval';
import {
  CheckCircle2, ChevronRight, ChevronDown, Plus, Folder, Briefcase,
  Inbox, ListTodo, AlignLeft, Flag, Clock,
  FileJson, Save, RefreshCw, Trash2, X,
  FileUp, FileDown, CheckSquare, Square,
  Bold, Italic, Underline, List as ListIcon, ListOrdered, Tag, Play, EyeOff,
  Undo2, Redo2, Palette, Repeat, HelpCircle, Link as LinkIcon, Edit2, Settings
} from 'lucide-react';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function generateId() {
  return crypto.randomUUID();
}

// --- Database ---
export type RecurrencePattern = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceConfig {
  pattern: RecurrencePattern;
  interval: number;
  daysOfWeek: number[]; // 0=Sun, 1=Mon...
  endType: 'none' | 'after_occurrences' | 'by_date';
  endOccurrences: number;
  endDate: number | null;
}

export interface AppSettings {
  weekStart: 'monday' | 'sunday';
  autoHideCompletedDays: number; // 0 means never
  density: 'compact' | 'expanded';
  useContexts: boolean;
  theme: 'light' | 'dark' | 'auto';
  accentColor: string;
  defaultView: 'next-actions' | 'projects' | 'contexts' | 'all';
  autoSaveInterval: number; // in minutes
}

export const DEFAULT_SETTINGS: AppSettings = {
  weekStart: 'monday',
  autoHideCompletedDays: 1,
  density: 'compact',
  useContexts: true,
  theme: 'auto',
  accentColor: 'emerald',
  defaultView: 'all',
  autoSaveInterval: 1,
};

export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  notes: string;
  isCompleted: boolean;
  isProject: boolean;
  isFolder: boolean;
  contexts: string[];
  startDate: number | null;
  dueDate: number | null;
  priority: 'low' | 'normal' | 'high';
  createdAt: number;
  updatedAt: number;
  order: number;
  hideBranchInTodo: boolean;
  completeInOrder: boolean;
  backgroundColor?: string;
  recurrence?: RecurrenceConfig;
}

class TaskDatabase extends Dexie {
  tasks!: Table<Task, string>;

  constructor() {
    super('LifeOrganizerDB');
    this.version(1).stores({
      tasks: 'id, parentId, isCompleted, isProject, dueDate, priority, order'
    });
    this.version(2).stores({
      tasks: 'id, parentId, isCompleted, isProject, dueDate, priority, order, startDate, hideBranchInTodo, completeInOrder'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        if (task.startDate === undefined) task.startDate = null;
        if (task.hideBranchInTodo === undefined) task.hideBranchInTodo = false;
        if (task.completeInOrder === undefined) task.completeInOrder = false;
      });
    });
    this.version(3).stores({
      tasks: 'id, parentId, isCompleted, isProject, isFolder, dueDate, priority, order, startDate, hideBranchInTodo, completeInOrder'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        if (task.isFolder === undefined) task.isFolder = false;
      });
    });
  }
}

const db = new TaskDatabase();

// --- Types ---
type TaskNode = Task & { children: TaskNode[] };
type ViewType = 'next-actions' | 'projects' | 'all' | 'contexts';

// --- File System Sync Hook ---
function useFileSystemSync() {
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'needs_permission'>('idle');
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  useEffect(() => {
    get('savedFileHandle').then(async (handle) => {
      if (handle) {
        setFileHandle(handle);
        try {
          const permission = await (handle as any).queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            await loadFromFile(handle);
          } else {
            setSyncStatus('needs_permission');
          }
        } catch (err) {
          console.error('Error checking permission:', err);
          setSyncStatus('needs_permission');
        }
      }
    });
  }, []);

  const requestPermissionAndSync = async () => {
    if (!fileHandle) return;
    try {
      const permission = await (fileHandle as any).requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await loadFromFile(fileHandle);
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      console.error('Error requesting permission:', err);
      setSyncStatus('error');
    }
  };

  const linkFile = async () => {
    try {
      if (!('showOpenFilePicker' in window)) {
        alert('File System Access API is not supported in this browser. Use manual export/import.');
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      setFileHandle(handle);
      await set('savedFileHandle', handle);
      await loadFromFile(handle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error linking file:', err);
        setSyncStatus('error');
      }
    }
  };

  const createNewFile = async () => {
    try {
      if (!('showSaveFilePicker' in window)) {
        alert('File System Access API is not supported in this browser.');
        return;
      }
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: 'one-file-tasks.json',
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      setFileHandle(handle);
      await set('savedFileHandle', handle);
      await syncToFile(handle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error creating file:', err);
        setSyncStatus('error');
      }
    }
  };

  const loadFromFile = async (handle: FileSystemFileHandle) => {
    setSyncStatus('syncing');
    try {
      const file = await handle.getFile();
      const text = await file.text();
      if (text.trim()) {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          await db.transaction('rw', db.tasks, async () => {
            await db.tasks.clear();
            await db.tasks.bulkAdd(data);
          });
        }
      }
      setSyncStatus('synced');
      setLastSynced(Date.now());
    } catch (err) {
      console.error('Error loading from file:', err);
      setSyncStatus('error');
    }
  };

  const syncToFile = async (handle: FileSystemFileHandle | null = fileHandle) => {
    if (!handle) return;
    setSyncStatus('syncing');
    try {
      const writable = await handle.createWritable();
      const allTasks = await db.tasks.toArray();
      await writable.write(JSON.stringify(allTasks, null, 2));
      await writable.close();
      setSyncStatus('synced');
      setLastSynced(Date.now());
    } catch (err) {
      console.error('Error syncing to file:', err);
      setSyncStatus('error');
    }
  };

  const manualExport = async () => {
    const allTasks = await db.tasks.toArray();
    const blob = new Blob([JSON.stringify(allTasks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'one-file-tasks.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const manualImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          await db.transaction('rw', db.tasks, async () => {
            await db.tasks.clear();
            await db.tasks.bulkAdd(data);
          });
        }
      } catch (err) {
        console.error('Error importing file:', err);
      }
    };
    reader.readAsText(file);
  };

  const unlinkFile = async () => {
    setFileHandle(null);
    setSyncStatus('idle');
    await set('savedFileHandle', null);
  };

  return { fileHandle, syncStatus, lastSynced, linkFile, createNewFile, syncToFile, manualExport, manualImport, requestPermissionAndSync, unlinkFile };
}

// --- Rich Text Editor Component ---
const RichTextEditor = ({ value, onChange, taskId }: { value: string, onChange: (val: string) => void, taskId: string, key?: string }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const [savedSelectionText, setSavedSelectionText] = useState('');
  const [isLinkActive, setIsLinkActive] = useState(false);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value;
    }
  }, [taskId]); // Only update innerHTML when the selected task changes

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    checkSelection();
  };

  const checkSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setIsLinkActive(false);
      activeLinkRef.current = null;
      return;
    }
    
    let node = selection.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode as Node;
    }
    
    const anchor = (node as HTMLElement).closest?.('a');
    if (anchor && editorRef.current?.contains(anchor)) {
      setIsLinkActive(true);
      activeLinkRef.current = anchor;
    } else {
      setIsLinkActive(false);
      activeLinkRef.current = null;
    }
  };

  const execCmd = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    editorRef.current?.focus();
    handleInput();
  };

  const handleLink = () => {
    if (isLinkActive && activeLinkRef.current) {
      setLinkUrl(activeLinkRef.current.getAttribute('href') || '');
      setShowLinkInput(true);
      return;
    }

    const selection = window.getSelection();
    let range: Range | null = null;
    let selectedText = '';
    
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
      selectedText = range.toString();
    }
    
    setSavedRange(range);
    setSavedSelectionText(selectedText);
    setLinkUrl('');
    setShowLinkInput(true);
  };

  const confirmLink = () => {
    if (!linkUrl) {
      if (isLinkActive && activeLinkRef.current) {
        const text = document.createTextNode(activeLinkRef.current.textContent || '');
        activeLinkRef.current.parentNode?.replaceChild(text, activeLinkRef.current);
        handleInput();
      }
      setShowLinkInput(false);
      return;
    }

    const href = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    
    if (isLinkActive && activeLinkRef.current) {
      activeLinkRef.current.href = href;
      handleInput();
      setShowLinkInput(false);
      return;
    }

    const html = `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-accent-600 hover:underline">${savedSelectionText || linkUrl}</a>`;
    
    const selection = window.getSelection();
    if (savedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    } else {
      editorRef.current?.focus();
    }
    
    document.execCommand('insertHTML', false, html);
    handleInput();
    setShowLinkInput(false);
    setSavedRange(null);
    setSavedSelectionText('');
  };

  const cancelLink = () => {
    setShowLinkInput(false);
    setSavedRange(null);
    setSavedSelectionText('');
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const originalText = e.clipboardData.getData('text/plain');

    const urlRegex = /(https?:\/\/[^\s]+|(?:www\.)[^\s]+)/g;
    
    const lines = originalText.split('\n');
    const validLines = lines.filter(line => {
      const trimmed = line.trim();
      if (trimmed === '') return false;
      if (/^[-*]\s*$/.test(trimmed)) return false;
      if (/^\d+\.\s*$/.test(trimmed)) return false;
      return true;
    });

    let isList = false;
    let listType = '';
    let listItemsText: string[] = [];
    
    if (validLines.length > 1) {
      const allBullets = validLines.every(line => /^\s*[-*]\s/.test(line));
      const allNumbers = validLines.every(line => /^\s*\d+\.\s/.test(line));
      
      if (allBullets) {
        isList = true;
        listType = 'insertUnorderedList';
        listItemsText = validLines.map(line => line.replace(/^\s*[-*]\s/, ''));
      } else if (allNumbers) {
        isList = true;
        listType = 'insertOrderedList';
        listItemsText = validLines.map(line => line.replace(/^\s*\d+\.\s/, ''));
      }
    }

    const linkify = (text: string) => {
      return text.replace(urlRegex, (match) => {
        const href = match.startsWith('http') ? match : `https://${match}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-accent-600 hover:underline">${match}</a>`;
      });
    };

    if (isList) {
      const html = listItemsText.map(line => `<li>${linkify(line)}</li>`).join('');
      const listHtml = listType === 'insertOrderedList' ? `<ol>${html}</ol>` : `<ul>${html}</ul>`;
      document.execCommand('insertHTML', false, listHtml);
    } else {
      const htmlWithLinks = linkify(originalText).replace(/\n/g, '<br>');
      if (htmlWithLinks !== originalText.replace(/\n/g, '<br>')) {
        document.execCommand('insertHTML', false, htmlWithLinks);
      } else {
        document.execCommand('insertText', false, originalText);
      }
    }
    handleInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      if (!range.collapsed) return;

      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const offset = range.startOffset;
        
        const textBeforeCursor = text.slice(0, offset);
        const match = textBeforeCursor.match(/(https?:\/\/[^\s]+)$/);
        
        if (match) {
          const url = match[1];
          const urlStart = offset - url.length;
          
          const urlRange = document.createRange();
          urlRange.setStart(node, urlStart);
          urlRange.setEnd(node, offset);
          
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.className = "text-accent-600 hover:underline";
          
          urlRange.deleteContents();
          urlRange.insertNode(a);
          
          // Move cursor after the link
          range.setStartAfter(a);
          range.setEndAfter(a);
          selection.removeAllRanges();
          selection.addRange(range);
          
          handleInput();
        }
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden min-h-[300px]">
      <div className="flex items-center gap-1 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 relative">
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('bold')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400" title="Bold"><Bold size={14}/></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('italic')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400" title="Italic"><Italic size={14}/></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('underline')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400" title="Underline"><Underline size={14}/></button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('insertUnorderedList')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400" title="Bullet List"><ListIcon size={14}/></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('insertOrderedList')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400" title="Numbered List"><ListOrdered size={14}/></button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1" />
        <button 
          onMouseDown={(e) => e.preventDefault()} 
          onClick={handleLink} 
          className={cn("p-1.5 rounded", isLinkActive ? "bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400" : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400")} 
          title={isLinkActive ? "Edit Link" : "Add Link"}
        >
          {isLinkActive ? <Edit2 size={14}/> : <LinkIcon size={14}/>}
        </button>
        
        {showLinkInput && (
          <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-10 flex gap-2 items-center">
            <input 
              type="text" 
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Enter link URL"
              className="px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded bg-transparent focus:outline-none focus:border-accent-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmLink();
                if (e.key === 'Escape') cancelLink();
              }}
            />
            <button onClick={confirmLink} className="px-2 py-1 text-xs bg-accent-600 text-white rounded hover:bg-accent-700">Save</button>
            <button onClick={cancelLink} className="px-2 py-1 text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600">Cancel</button>
          </div>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onKeyUp={checkSelection}
        onMouseUp={checkSelection}
        onFocus={checkSelection}
        className="flex-1 p-3 bg-transparent focus:outline-none overflow-y-auto text-sm [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_b]:font-bold [&_i]:italic [&_u]:underline [&_a]:text-accent-600 [&_a]:hover:underline [&_a]:cursor-pointer"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const anchor = target.closest('a');
          if (anchor) {
            const href = anchor.getAttribute('href');
            if (href) {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          }
        }}
      />
    </div>
  );
};

// --- Recurrence Modal ---
const RecurrenceModal = ({ 
  task, 
  onClose, 
  onSave,
  settings
}: { 
  task: Task, 
  onClose: () => void, 
  onSave: (recurrence: RecurrenceConfig | undefined) => void,
  settings: AppSettings
}) => {
  const [config, setConfig] = useState<RecurrenceConfig>(task.recurrence || {
    pattern: 'weekly',
    interval: 1,
    daysOfWeek: [new Date().getDay()],
    endType: 'none',
    endOccurrences: 10,
    endDate: null
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleDay = (day: number) => {
    setConfig(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day) 
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day].sort()
    }));
  };

  const getPatternLabel = (pattern: RecurrencePattern) => {
    switch (pattern) {
      case 'hourly': return 'hour';
      case 'daily': return 'day';
      case 'weekly': return 'week';
      case 'monthly': return 'month';
      case 'yearly': return 'year';
    }
  };

  const weekDays = settings.weekStart === 'monday' 
    ? [{name: 'Monday', idx: 1}, {name: 'Tuesday', idx: 2}, {name: 'Wednesday', idx: 3}, {name: 'Thursday', idx: 4}, {name: 'Friday', idx: 5}, {name: 'Saturday', idx: 6}, {name: 'Sunday', idx: 0}]
    : [{name: 'Sunday', idx: 0}, {name: 'Monday', idx: 1}, {name: 'Tuesday', idx: 2}, {name: 'Wednesday', idx: 3}, {name: 'Thursday', idx: 4}, {name: 'Friday', idx: 5}, {name: 'Saturday', idx: 6}];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[600px] max-w-[90vw] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Task Recurrence</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[70vh]">
          {/* Recurrence Pattern */}
          <div className="flex gap-6">
            <div className="flex flex-col gap-3 w-32 shrink-0 border-r border-zinc-200 dark:border-zinc-800 pr-4">
              <h3 className="text-sm font-medium text-zinc-500 mb-1">Recurrence pattern</h3>
              {['hourly', 'daily', 'weekly', 'monthly', 'yearly'].map(pattern => (
                <label key={pattern} className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="pattern" 
                    checked={config.pattern === pattern}
                    onChange={() => setConfig({ ...config, pattern: pattern as RecurrencePattern })}
                    className="text-accent-500 focus:ring-accent-500"
                  />
                  <span className="capitalize">{pattern}</span>
                </label>
              ))}
            </div>

            <div className="flex-1 flex flex-col gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <span>Recur every</span>
                <input 
                  type="number" 
                  min="1"
                  value={config.interval}
                  onChange={e => setConfig({ ...config, interval: parseInt(e.target.value) || 1 })}
                  className="w-16 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
                <span>{getPatternLabel(config.pattern)}(s) {config.pattern === 'weekly' ? 'on' : ''}</span>
              </label>

              {config.pattern === 'weekly' && (
                <div className="grid grid-cols-3 gap-2 ml-6">
                  {weekDays.map(({name, idx}) => (
                    <label key={name} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={config.daysOfWeek.includes(idx)}
                        onChange={() => toggleDay(idx)}
                        className="rounded text-accent-500 focus:ring-accent-500"
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            {/* Next Occurrence */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-zinc-500">Next occurrence</h3>
              <div className="flex items-center gap-3">
                <span className="w-12 text-sm">Start</span>
                <input 
                  type="date"
                  value={task.startDate ? format(task.startDate, 'yyyy-MM-dd') : ''}
                  readOnly
                  className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-12 text-sm">Due</span>
                <input 
                  type="date"
                  value={task.dueDate ? format(task.dueDate, 'yyyy-MM-dd') : ''}
                  readOnly
                  className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                />
              </div>
            </div>

            {/* End Occurrences */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-zinc-500">End occurrences</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="endType" 
                  checked={config.endType === 'none'}
                  onChange={() => setConfig({ ...config, endType: 'none' })}
                  className="text-accent-500 focus:ring-accent-500"
                />
                <span>No end date</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="endType" 
                  checked={config.endType === 'after_occurrences'}
                  onChange={() => setConfig({ ...config, endType: 'after_occurrences' })}
                  className="text-accent-500 focus:ring-accent-500"
                />
                <span>End after</span>
                <input 
                  type="number" 
                  min="1"
                  value={config.endOccurrences}
                  onChange={e => setConfig({ ...config, endOccurrences: parseInt(e.target.value) || 1 })}
                  className="w-16 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
                <span>occurrences</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="endType" 
                  checked={config.endType === 'by_date'}
                  onChange={() => setConfig({ ...config, endType: 'by_date' })}
                  className="text-accent-500 focus:ring-accent-500"
                />
                <span>End by</span>
                <input 
                  type="date"
                  value={config.endDate ? format(config.endDate, 'yyyy-MM-dd') : ''}
                  onChange={e => setConfig({ ...config, endDate: e.target.value ? new Date(e.target.value).getTime() : null })}
                  className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 rounded-b-lg">
          <div className="flex gap-2">
            <button 
              onClick={() => onSave(config)}
              className="px-4 py-2 bg-accent-500 text-white rounded-md font-medium hover:bg-accent-600 transition-colors"
            >
              OK
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
          <button 
            onClick={() => onSave(undefined)}
            className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md font-medium transition-colors"
          >
            Remove Recurrence
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Help Modal ---
const HelpModal = ({ onClose }: { onClose: () => void }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[600px] max-w-[90vw] flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <HelpCircle size={20} className="text-accent-500" />
            Help & Information
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          <section>
            <h3 className="font-semibold text-base mb-2">General Features</h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              OneFileTasks is a local-first task manager. You can organize tasks into projects and folders, assign contexts, set due dates, and configure recurring tasks. The "Next Actions" view automatically filters tasks to show only actionable items (tasks without uncompleted dependencies).
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-base mb-2">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-2 text-zinc-600 dark:text-zinc-400">
              <div className="flex justify-between"><span>Add Task</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">Insert</kbd></div>
              <div className="flex justify-between"><span>Quick Add</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">+</kbd></div>
              <div className="flex justify-between"><span>Toggle Complete</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">Space</kbd></div>
              <div className="flex justify-between"><span>Delete Task</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">Delete</kbd></div>
              <div className="flex justify-between"><span>Edit Task</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">F2</kbd></div>
              <div className="flex justify-between"><span>Navigate</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">↑ / ↓</kbd></div>
              <div className="flex justify-between"><span>Expand/Collapse</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">→ / ←</kbd></div>
              <div className="flex justify-between"><span>Undo</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">Ctrl+Z</kbd></div>
              <div className="flex justify-between"><span>Redo</span><kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">Ctrl+Y</kbd></div>
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-base mb-2">Import / Export / Sync</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-2">
              All your data is stored locally in your browser. You can export it to a JSON file and import it back at any time.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              <strong>Sync (File System Access API):</strong> On supported browsers (like Chrome/Edge on desktop), you can link a local file. The app will automatically sync changes to this file. Note that this feature is restricted by browsers and typically does not work on mobile devices or in Safari.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

// --- Quick Add Modal ---
const QuickAddModal = ({ 
  onClose, 
  onAdd, 
  allTasks 
}: { 
  onClose: () => void; 
  onAdd: (tasks: Task[]) => void; 
  allTasks: Task[];
}) => {
  const [text, setText] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentSearch, setParentSearch] = useState('');
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const parentOptions = allTasks.filter(t => t.isFolder || t.isProject);
  const filteredParents = parentOptions.filter(p => p.title.toLowerCase().includes(parentSearch.toLowerCase()));

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (text.trim()) {
          handleAdd();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onClose, text, parentId, parentSearch, allTasks]);

  const handleAdd = () => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const newTasks: Task[] = [];
    const stack: { id: string, indent: number }[] = [];
    
    let finalParentId = parentId;
    if (!finalParentId && parentSearch.trim()) {
      const exactMatch = parentOptions.find(p => p.title.toLowerCase() === parentSearch.trim().toLowerCase());
      if (exactMatch) {
        finalParentId = exactMatch.id;
      }
    }
    
    if (finalParentId) {
      stack.push({ id: finalParentId, indent: -1 });
    }
    
    let currentOrder = allTasks.filter(t => t.parentId === finalParentId).length;
    
    lines.forEach(line => {
      const match = line.match(/^(\s*)/);
      const indentStr = match ? match[1] : '';
      const indent = indentStr.replace(/\t/g, '    ').length;
      
      let title = line.trim();
      let isFolder = false;
      let isProject = false;
      
      const folderMatch = title.match(/^\[(.*)\]$/);
      if (folderMatch) {
        isFolder = true;
        title = folderMatch[1].trim();
      } else {
        const projectMatch = title.match(/^!(.*)!$/);
        if (projectMatch) {
          isProject = true;
          title = projectMatch[1].trim();
        }
      }
      
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      
      const currentParentId = stack.length > 0 ? stack[stack.length - 1].id : null;
      
      const task: Task = {
        id: generateId(),
        parentId: currentParentId,
        title,
        notes: '',
        isCompleted: false,
        isProject,
        isFolder,
        contexts: [],
        startDate: null,
        dueDate: null,
        priority: 'normal',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: currentOrder++,
        hideBranchInTodo: false,
        completeInOrder: false,
      };
      
      newTasks.push(task);
      stack.push({ id: task.id, indent });
    });
    
    onAdd(newTasks);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[600px] max-w-[90vw] flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Quick Add Tasks
            <button 
              onClick={() => setShowHelp(!showHelp)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 ml-2"
              title="Help"
            >
              <HelpCircle size={16} />
            </button>
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
          {showHelp && (
            <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-md text-sm text-zinc-700 dark:text-zinc-300">
              <p className="mb-2"><strong>Bulk Entry Syntax:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>One task per line.</li>
                <li>Use leading spaces or tabs to create subtasks.</li>
                <li>Wrap the title in brackets <code>[Folder Name]</code> to create a folder.</li>
                <li>Wrap the title in exclamation marks <code>!Project Name!</code> to create a project.</li>
              </ul>
            </div>
          )}
          
          <div className="relative">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Add to Project/Folder
            </label>
            <input
              type="text"
              value={parentSearch}
              onChange={e => {
                setParentSearch(e.target.value);
                setIsParentDropdownOpen(true);
                setParentId(null);
              }}
              onFocus={() => setIsParentDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsParentDropdownOpen(false), 200)}
              placeholder="(Root)"
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent-500"
            />
            {isParentDropdownOpen && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg max-h-48 overflow-y-auto">
                <div 
                  className="px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-zinc-500"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setParentId(null);
                    setParentSearch('');
                    setIsParentDropdownOpen(false);
                  }}
                >
                  (Root)
                </div>
                {filteredParents.map(p => (
                  <div 
                    key={p.id}
                    className="px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setParentId(p.id);
                      setParentSearch(p.title);
                      setIsParentDropdownOpen(false);
                    }}
                  >
                    {p.title}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex-1 flex flex-col min-h-[200px]">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Tasks
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Task 1&#10;  Subtask 1.1&#10;  Subtask 1.2&#10;!My Project!&#10;  Task in project&#10;[My Folder]&#10;  Task in folder"
              className="w-full flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent-500 font-mono resize-none"
              autoFocus
            />
          </div>
        </div>
        
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleAdd}
            disabled={!text.trim()}
            className="px-4 py-2 text-sm font-medium bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Tasks
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Settings Hook ---
function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('appSettings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const setSettings = useCallback((newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettingsState(prev => {
      const updated = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
      localStorage.setItem('appSettings', JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    // Apply theme
    if (settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Apply accent color
    if (settings.accentColor.startsWith('#')) {
      document.documentElement.setAttribute('data-accent', 'custom');
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : null;
      };
      const mixColors = (color1: {r: number, g: number, b: number}, color2: {r: number, g: number, b: number}, weight: number) => {
        return `#${Math.round(color1.r * weight + color2.r * (1 - weight)).toString(16).padStart(2, '0')}${Math.round(color1.g * weight + color2.g * (1 - weight)).toString(16).padStart(2, '0')}${Math.round(color1.b * weight + color2.b * (1 - weight)).toString(16).padStart(2, '0')}`;
      };
      
      const rgb = hexToRgb(settings.accentColor);
      if (rgb) {
        const white = {r: 255, g: 255, b: 255};
        const black = {r: 0, g: 0, b: 0};
        document.documentElement.style.setProperty('--accent-50', mixColors(rgb, white, 0.1));
        document.documentElement.style.setProperty('--accent-100', mixColors(rgb, white, 0.2));
        document.documentElement.style.setProperty('--accent-200', mixColors(rgb, white, 0.4));
        document.documentElement.style.setProperty('--accent-300', mixColors(rgb, white, 0.6));
        document.documentElement.style.setProperty('--accent-400', mixColors(rgb, white, 0.8));
        document.documentElement.style.setProperty('--accent-500', settings.accentColor);
        document.documentElement.style.setProperty('--accent-600', mixColors(rgb, black, 0.8));
        document.documentElement.style.setProperty('--accent-700', mixColors(rgb, black, 0.6));
        document.documentElement.style.setProperty('--accent-800', mixColors(rgb, black, 0.4));
        document.documentElement.style.setProperty('--accent-900', mixColors(rgb, black, 0.2));
        document.documentElement.style.setProperty('--accent-950', mixColors(rgb, black, 0.1));
      }
    } else {
      document.documentElement.setAttribute('data-accent', settings.accentColor);
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].forEach(i => {
        document.documentElement.style.removeProperty(`--accent-${i}`);
      });
    }
  }, [settings.theme, settings.accentColor]);

  return { settings, setSettings };
}

// --- Settings Modal ---
const SettingsModal = ({ 
  settings, 
  setSettings, 
  onClose 
}: { 
  settings: AppSettings, 
  setSettings: (s: AppSettings | ((prev: AppSettings) => AppSettings)) => void, 
  onClose: () => void 
}) => {
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, confirmAction]);

  const handleReset = () => {
    setConfirmAction({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all settings to defaults?',
      onConfirm: () => {
        setSettings(DEFAULT_SETTINGS);
        setConfirmAction(null);
      }
    });
  };

  const handleClearData = () => {
    setConfirmAction({
      title: 'Clear All Data',
      message: 'WARNING: This will delete all your tasks and data permanently. Are you sure?',
      isDestructive: true,
      onConfirm: async () => {
        await db.delete();
        window.location.reload();
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        
        {/* Confirmation Overlay */}
        <AnimatePresence>
          {confirmAction && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-lg">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4"
              >
                <h3 className="text-lg font-semibold mb-2">{confirmAction.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">{confirmAction.message}</p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmAction.onConfirm}
                    className={cn(
                      "px-4 py-2 text-sm font-medium text-white rounded-md transition-colors",
                      confirmAction.isDestructive 
                        ? "bg-red-500 hover:bg-red-600" 
                        : "bg-accent-500 hover:bg-accent-600"
                    )}
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Task Management */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">Task Management</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Week start day</div>
                <div className="text-sm text-zinc-500">First day of the week in calendars</div>
              </div>
              <select 
                value={settings.weekStart}
                onChange={e => setSettings(s => ({ ...s, weekStart: e.target.value as 'monday' | 'sunday' }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Task archival</div>
                <div className="text-sm text-zinc-500">Auto-hide completed tasks after N days (0 to disable)</div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0"
                  value={settings.autoHideCompletedDays}
                  onChange={e => setSettings(s => ({ ...s, autoHideCompletedDays: parseInt(e.target.value) || 0 }))}
                  className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                />
                <span className="text-sm text-zinc-500">days</span>
              </div>
            </div>
          </section>

          {/* UI/Display */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">UI / Display</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Task list density</div>
                <div className="text-sm text-zinc-500">Compact or expanded view for tasks</div>
              </div>
              <select 
                value={settings.density}
                onChange={e => setSettings(s => ({ ...s, density: e.target.value as 'compact' | 'expanded' }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="expanded">Expanded</option>
                <option value="compact">Compact</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Show contexts</div>
                <div className="text-sm text-zinc-500">Enable or disable context tags globally</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={settings.useContexts}
                  onChange={e => setSettings(s => ({ ...s, useContexts: e.target.checked }))}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Theme</div>
                <div className="text-sm text-zinc-500">Light, dark, or system default</div>
              </div>
              <select 
                value={settings.theme}
                onChange={e => setSettings(s => ({ ...s, theme: e.target.value as 'light' | 'dark' | 'auto' }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Accent color</div>
                <div className="text-sm text-zinc-500">Choose your preferred color scheme</div>
              </div>
              <div className="flex gap-2">
                {['emerald', 'blue', 'purple', 'rose', 'amber'].map(color => (
                  <button
                    key={color}
                    onClick={() => setSettings(s => ({ ...s, accentColor: color }))}
                    className={cn(
                      "w-6 h-6 rounded-full border-2",
                      settings.accentColor === color ? "border-zinc-900 dark:border-white" : "border-transparent",
                      color === 'emerald' && "bg-[#10b981]",
                      color === 'blue' && "bg-[#3b82f6]",
                      color === 'purple' && "bg-[#a855f7]",
                      color === 'rose' && "bg-[#f43f5e]",
                      color === 'amber' && "bg-[#f59e0b]"
                    )}
                    title={color}
                  />
                ))}
                <label 
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer relative overflow-hidden",
                    settings.accentColor.startsWith('#') ? "border-zinc-900 dark:border-white" : "border-transparent"
                  )}
                  title="Custom Color"
                  style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                >
                  <Palette size={12} className="text-white drop-shadow-md pointer-events-none z-10" />
                  <input 
                    type="color" 
                    value={settings.accentColor.startsWith('#') ? settings.accentColor : '#10b981'}
                    onChange={(e) => setSettings(s => ({ ...s, accentColor: e.target.value }))}
                    className="absolute inset-[-10px] w-[50px] h-[50px] cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Default view</div>
                <div className="text-sm text-zinc-500">Which view opens on startup</div>
              </div>
              <select 
                value={settings.defaultView}
                onChange={e => setSettings(s => ({ ...s, defaultView: e.target.value as any }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="all">All Tasks</option>
                <option value="next-actions">Next Actions</option>
                <option value="projects">Projects</option>
                {settings.useContexts && <option value="contexts">Contexts</option>}
              </select>
            </div>
          </section>

          {/* Data & Sync */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">Data & Sync</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Auto-save interval</div>
                <div className="text-sm text-zinc-500">How often changes sync to file (if linked)</div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="1"
                  value={settings.autoSaveInterval}
                  onChange={e => setSettings(s => ({ ...s, autoSaveInterval: Math.max(1, parseInt(e.target.value) || 5) }))}
                  className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                />
                <span className="text-sm text-zinc-500">minutes</span>
              </div>
            </div>
          </section>

          {/* Advanced Options */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">Advanced Options</h3>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors w-full text-left"
              >
                Reset all settings to defaults
              </button>
              
              <button 
                onClick={handleClearData}
                className="px-4 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors w-full text-left"
              >
                Clear all data (IndexedDB cleanup)
              </button>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">OneFileTasks</p>
              <p>Built for instant productivity.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const { settings, setSettings } = useSettings();
  const allTasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const [currentView, setCurrentView] = useState<ViewType>(
    settings.defaultView === 'contexts' && !settings.useContexts ? 'all' : settings.defaultView
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [completedFilter, setCompletedFilter] = useState<'show_all' | 'hide_all' | 'hide_old'>(
    settings.autoHideCompletedDays > 0 ? 'hide_old' : 'show_all'
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('expandedIds');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (currentView === 'contexts' && !settings.useContexts) {
      setCurrentView('all');
    }
  }, [settings.useContexts, currentView]);

  useEffect(() => {
    if (settings.autoHideCompletedDays === 0 && completedFilter === 'hide_old') {
      setCompletedFilter('show_all');
    }
  }, [settings.autoHideCompletedDays, completedFilter]);

  useEffect(() => {
    localStorage.setItem('expandedIds', JSON.stringify(Array.from(expandedIds)));
  }, [expandedIds]);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskBeingEdited, setNewTaskBeingEdited] = useState<string | null>(null);
  const [detailsWidth, setDetailsWidth] = useState(384);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{id: string, position: 'before'|'after'|'inside'} | null>(null);
  const [tasksToDelete, setTasksToDelete] = useState<string[] | null>(null);
  const [hideDeleteWarning, setHideDeleteWarning] = useState<boolean>(() => {
    return localStorage.getItem('hideDeleteWarning') === 'true';
  });

  type HistoryAction = 
    | { type: 'ADD', task: Task, timestamp: number }
    | { type: 'UPDATE', id: string, oldTask: Task, newTask: Task, timestamp: number }
    | { type: 'DELETE', tasks: Task[], timestamp: number }
    | { type: 'BULK_UPDATE', updates: { oldTask: Task, newTask: Task }[], timestamp: number }
    | { type: 'COMPOSITE', actions: HistoryAction[], timestamp: number };

  const undoStackRef = useRef<HistoryAction[]>([]);
  const redoStackRef = useRef<HistoryAction[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = (action: HistoryAction) => {
    const prev = undoStackRef.current;
    const newStack = [...prev];
    if (action.type === 'UPDATE' && newStack.length > 0) {
      const lastAction = newStack[newStack.length - 1];
      if (lastAction.type === 'UPDATE' && lastAction.id === action.id) {
        if (action.timestamp - lastAction.timestamp < 2000) {
          newStack[newStack.length - 1] = {
            ...lastAction,
            newTask: action.newTask,
            timestamp: action.timestamp
          };
          undoStackRef.current = newStack;
          return;
        }
      }
    }
    newStack.push(action);
    undoStackRef.current = newStack.slice(-50);
    redoStackRef.current = [];
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const undo = async () => {
    if (undoStackRef.current.length === 0) return;
    const action = undoStackRef.current[undoStackRef.current.length - 1];
    
    const revertAction = async (act: HistoryAction) => {
      switch (act.type) {
        case 'ADD':
          await db.tasks.delete(act.task.id);
          break;
        case 'UPDATE':
          await db.tasks.put(act.oldTask);
          break;
        case 'DELETE':
          await db.tasks.bulkAdd(act.tasks);
          break;
        case 'BULK_UPDATE':
          await db.tasks.bulkPut(act.updates.map(u => u.oldTask));
          break;
        case 'COMPOSITE':
          for (let i = act.actions.length - 1; i >= 0; i--) {
            await revertAction(act.actions[i]);
          }
          break;
      }
    };
    
    await revertAction(action);

    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, action];
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const redo = async () => {
    if (redoStackRef.current.length === 0) return;
    const action = redoStackRef.current[redoStackRef.current.length - 1];
    
    const applyAction = async (act: HistoryAction) => {
      switch (act.type) {
        case 'ADD':
          await db.tasks.add(act.task);
          break;
        case 'UPDATE':
          await db.tasks.put(act.newTask);
          break;
        case 'DELETE':
          await db.tasks.bulkDelete(act.tasks.map(t => t.id));
          break;
        case 'BULK_UPDATE':
          await db.tasks.bulkPut(act.updates.map(u => u.newTask));
          break;
        case 'COMPOSITE':
          for (const subAct of act.actions) {
            await applyAction(subAct);
          }
          break;
      }
    };
    
    await applyAction(action);

    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, action];
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;
      if (isInput) return; // Let native undo handle it
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleTouch = (e: TouchEvent) => {
      if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text') {
        if (!document.activeElement.contains(e.target as Node)) {
          document.activeElement.blur();
        }
      }
    };
    document.addEventListener('touchstart', handleTouch);
    return () => document.removeEventListener('touchstart', handleTouch);
  }, []);

  const { fileHandle, syncStatus, linkFile, createNewFile, syncToFile, manualExport, manualImport, requestPermissionAndSync, unlinkFile } = useFileSystemSync();
  const supportsFileSystemAccess = 'showOpenFilePicker' in window;

  // Auto-sync effect
  useEffect(() => {
    if (fileHandle && allTasks.length > 0 && syncStatus !== 'needs_permission') {
      const timeout = setTimeout(() => {
        syncToFile();
      }, settings.autoSaveInterval * 60 * 1000); // Debounce sync based on settings
      return () => clearTimeout(timeout);
    }
  }, [allTasks, fileHandle, syncStatus, settings.autoSaveInterval]);

  // Build tree
  const buildTree = useCallback((tasks: Task[], parentId: string | null = null): TaskNode[] => {
    return tasks
      .filter(t => t.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map(t => ({ ...t, children: buildTree(tasks, t.id) }));
  }, []);

  const fullTree = useMemo(() => buildTree(allTasks), [allTasks, buildTree]);

  // Filtered Tree based on view
  const filteredTree = useMemo(() => {
    const taskMap = new Map<string, Task>();
    allTasks.forEach(t => taskMap.set(t.id, t));

    const isHiddenInTodo = (taskId: string): boolean => {
      let current = taskMap.get(taskId);
      while (current) {
        if (current.hideBranchInTodo) return true;
        current = current.parentId ? taskMap.get(current.parentId) : undefined;
      }
      return false;
    };

    const isNextAction = (task: Task): boolean => {
      if (task.isCompleted) return false;
      if (isHiddenInTodo(task.id)) return false;
      if (task.startDate && task.startDate > Date.now()) return false;

      const children = allTasks.filter(c => c.parentId === task.id).sort((a, b) => a.order - b.order);
      const uncompletedChildren = children.filter(c => !c.isCompleted);
      
      if (uncompletedChildren.length > 0) {
        return false;
      }

      if (task.parentId) {
        const parent = taskMap.get(task.parentId);
        if (parent && parent.completeInOrder) {
          const siblings = allTasks.filter(c => c.parentId === parent.id).sort((a, b) => a.order - b.order);
          const firstUncompleted = siblings.find(c => !c.isCompleted);
          if (firstUncompleted && firstUncompleted.id !== task.id) {
            return false;
          }
        }
      }

      return true;
    };

    const applyCompletedFilter = (nodes: TaskNode[]): TaskNode[] => {
      if (completedFilter === 'show_all') return nodes;
      
      const hideOldDays = settings.autoHideCompletedDays > 0 ? settings.autoHideCompletedDays : 7;
      const oldThreshold = Date.now() - hideOldDays * 24 * 60 * 60 * 1000;

      return nodes.filter(t => {
        if (t.isCompleted) {
          if (completedFilter === 'hide_all') return false;
          if (completedFilter === 'hide_old' && t.updatedAt < oldThreshold) return false;
        }
        return true;
      }).map(t => ({ ...t, children: applyCompletedFilter(t.children) }));
    };

    let baseNodes: TaskNode[] = [];

    if (currentView === 'all') {
      baseNodes = fullTree;
    } else if (currentView === 'next-actions') {
      // Next actions: not completed, no uncompleted children
      const getPriorityValue = (p: string) => p === 'high' ? 3 : p === 'normal' ? 2 : 1;
      baseNodes = allTasks
        .filter(t => !t.isFolder && isNextAction(t))
        .sort((a, b) => {
          // 1. Primary: Due Date
          if (a.dueDate && b.dueDate) {
            if (a.dueDate !== b.dueDate) return a.dueDate - b.dueDate;
          } else if (a.dueDate) {
            return -1;
          } else if (b.dueDate) {
            return 1;
          }
          
          // 2. Secondary: Priority
          const pA = getPriorityValue(a.priority);
          const pB = getPriorityValue(b.priority);
          if (pA !== pB) return pB - pA;

          // 3. Tertiary: Group by parent/project
          const parentA = a.parentId || '';
          const parentB = b.parentId || '';
          if (parentA !== parentB) {
            return parentA.localeCompare(parentB);
          }

          // 4. Fallback: Creation time
          return a.createdAt - b.createdAt;
        })
        .map(t => ({ ...t, children: [] }));
    } else if (currentView === 'projects') {
      baseNodes = allTasks
        .filter(t => t.isProject && !t.isCompleted)
        .map(t => ({ ...t, children: buildTree(allTasks, t.id) }));
    } else if (currentView === 'contexts') {
      const contextsMap = new Map<string, TaskNode[]>();
      const noContextTasks: TaskNode[] = [];

      allTasks.forEach(task => {
        const node: TaskNode = { ...task, children: [] };
        
        if (!task.contexts || task.contexts.length === 0) {
          noContextTasks.push(node);
        } else {
          task.contexts.forEach(ctx => {
            if (!contextsMap.has(ctx)) contextsMap.set(ctx, []);
            contextsMap.get(ctx)!.push({ ...node });
          });
        }
      });

      const contextNodes: TaskNode[] = [];
      Array.from(contextsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ctx, tasks], index) => {
        contextNodes.push({
          id: `context-${ctx}`,
          parentId: null,
          title: ctx,
          notes: '',
          isCompleted: false,
          isProject: false,
          isFolder: true,
          contexts: [],
          startDate: null,
          dueDate: null,
          priority: 'normal',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          order: index,
          hideBranchInTodo: false,
          completeInOrder: false,
          children: tasks.sort((a, b) => a.order - b.order)
        });
      });

      if (noContextTasks.length > 0) {
        contextNodes.push({
          id: `context-none`,
          parentId: null,
          title: 'No Context',
          notes: '',
          isCompleted: false,
          isProject: false,
          isFolder: true,
          contexts: [],
          startDate: null,
          dueDate: null,
          priority: 'normal',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          order: contextNodes.length,
          hideBranchInTodo: false,
          completeInOrder: false,
          children: noContextTasks.sort((a, b) => a.order - b.order)
        });
      }
      baseNodes = contextNodes;
    }

    let finalNodes = applyCompletedFilter(baseNodes);
    if (currentView === 'contexts') {
      finalNodes = finalNodes.filter(n => n.children.length > 0);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const searchFilter = (nodes: TaskNode[]): TaskNode[] | null => {
        const result: TaskNode[] = [];
        for (const node of nodes) {
          const matches = node.title.toLowerCase().includes(query) || node.notes.toLowerCase().includes(query);
          const filteredChildren = searchFilter(node.children);
          
          if (matches || (filteredChildren && filteredChildren.length > 0)) {
            result.push({
              ...node,
              children: filteredChildren || []
            });
          }
        }
        return result.length > 0 ? result : null;
      };
      
      finalNodes = searchFilter(finalNodes) || [];
    }

    return finalNodes;
  }, [allTasks, currentView, fullTree, buildTree, completedFilter, searchQuery]);

  const visibleTasks = useMemo(() => {
    const result: TaskNode[] = [];
    const traverse = (nodes: TaskNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (expandedIds.has(node.id) && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(filteredTree);
    return result;
  }, [filteredTree, expandedIds]);

  const getTaskPath = useCallback((taskId: string): string => {
    let path: string[] = [];
    let current = allTasks.find(t => t.id === taskId);
    while (current && current.parentId) {
      const parent = allTasks.find(t => t.id === current!.parentId);
      if (parent) {
        path.unshift(parent.title);
        current = parent;
      } else {
        break;
      }
    }
    return path.join(' / ');
  }, [allTasks]);

  const getTaskColor = useCallback((taskId: string): string | undefined => {
    let current = allTasks.find(t => t.id === taskId);
    while (current) {
      if (current.backgroundColor) return current.backgroundColor;
      if (!current.parentId) break;
      current = allTasks.find(t => t.id === current!.parentId);
    }
    return undefined;
  }, [allTasks]);

  // Actions
  const addTask = async (parentId: string | null = null, insertAfterId: string | null = null) => {
    let newOrder = allTasks.filter(t => t.parentId === parentId).length;
    let actualParentId = parentId;

    if (insertAfterId) {
      const afterTask = allTasks.find(t => t.id === insertAfterId);
      if (afterTask) {
        actualParentId = afterTask.parentId;
        newOrder = afterTask.order + 1;
        
        const tasksToUpdate = allTasks
          .filter(t => t.parentId === actualParentId && t.order >= newOrder)
          .map(t => ({ ...t, order: t.order + 1 }));
        
        if (tasksToUpdate.length > 0) {
          await db.tasks.bulkPut(tasksToUpdate);
        }
      }
    }

    const newTask: Task = {
      id: generateId(),
      parentId: actualParentId,
      title: 'New Task',
      notes: '',
      isCompleted: false,
      isProject: false,
      isFolder: false,
      contexts: [],
      startDate: null,
      dueDate: null,
      priority: 'normal',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: newOrder,
      hideBranchInTodo: false,
      completeInOrder: false,
    };
    await db.tasks.add(newTask);
    pushHistory({ type: 'ADD', task: newTask, timestamp: Date.now() });
    setSelectedTaskId(newTask.id);
    setEditingTaskId(newTask.id);
    setNewTaskBeingEdited(newTask.id);
    if (actualParentId) {
      setExpandedIds(prev => new Set(prev).add(actualParentId));
    }
  };

  const handleBulkAdd = async (tasks: Task[]) => {
    await db.tasks.bulkAdd(tasks);
    const actions: HistoryAction[] = tasks.map(task => ({ type: 'ADD', task, timestamp: Date.now() }));
    pushHistory({ type: 'COMPOSITE', actions, timestamp: Date.now() });
    setQuickAddModalOpen(false);
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const oldTask = await db.tasks.get(id);
    if (!oldTask) return;
    
    let finalStartDate = updates.startDate !== undefined ? updates.startDate : oldTask.startDate;
    let finalDueDate = updates.dueDate !== undefined ? updates.dueDate : oldTask.dueDate;

    if (finalDueDate !== null && finalStartDate === null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      finalStartDate = today.getTime();
    }

    if (finalStartDate !== null && finalDueDate !== null && finalStartDate > finalDueDate) {
      finalDueDate = finalStartDate;
    }

    const finalUpdates = {
      ...updates,
      ...(finalStartDate !== oldTask.startDate ? { startDate: finalStartDate } : {}),
      ...(finalDueDate !== oldTask.dueDate ? { dueDate: finalDueDate } : {})
    };

    const newTask = { ...oldTask, ...finalUpdates, updatedAt: Date.now() };
    await db.tasks.update(id, newTask);
    pushHistory({ type: 'UPDATE', id, oldTask, newTask, timestamp: Date.now() });
  };

  const toggleComplete = async (task: TaskNode) => {
    const newStatus = !task.isCompleted;
    
    if (newStatus && task.recurrence) {
      const config = task.recurrence;
      const now = new Date();
      
      let baseDate = now;
      if (task.dueDate) {
        baseDate = new Date(task.dueDate);
      }
      
      const nextDate = new Date(baseDate);
      
      if (config.pattern === 'hourly') {
        nextDate.setHours(nextDate.getHours() + config.interval);
      } else if (config.pattern === 'daily') {
        nextDate.setDate(nextDate.getDate() + config.interval);
      } else if (config.pattern === 'weekly') {
        if (config.daysOfWeek.length > 0) {
          let currentDay = nextDate.getDay();
          let daysToAdd = 1;
          while (daysToAdd <= 7) {
            const checkDay = (currentDay + daysToAdd) % 7;
            if (config.daysOfWeek.includes(checkDay)) {
              break;
            }
            daysToAdd++;
          }
          nextDate.setDate(nextDate.getDate() + daysToAdd);
        } else {
          nextDate.setDate(nextDate.getDate() + config.interval * 7);
        }
      } else if (config.pattern === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + config.interval);
      } else if (config.pattern === 'yearly') {
        nextDate.setFullYear(nextDate.getFullYear() + config.interval);
      }
      
      const nextDue = nextDate.getTime();
      let nextStart = task.startDate;
      
      if (task.startDate && task.dueDate) {
        const diff = task.dueDate - task.startDate;
        nextStart = nextDue - diff;
      } else if (task.startDate) {
        const diff = nextDate.getTime() - baseDate.getTime();
        nextStart = task.startDate + diff;
      }
      
      let shouldGenerate = true;
      let newEndOccurrences = config.endOccurrences;
      
      if (config.endType === 'after_occurrences') {
        if (config.endOccurrences <= 1) {
          shouldGenerate = false;
        } else {
          newEndOccurrences -= 1;
        }
      } else if (config.endType === 'by_date' && config.endDate) {
        if (nextDue > config.endDate) {
          shouldGenerate = false;
        }
      }
      
      if (shouldGenerate) {
        const timeShift = nextDue - baseDate.getTime();
        const compositeActions: HistoryAction[] = [];
        
        const duplicateTaskTree = async (originalId: string, newParentId: string | null): Promise<void> => {
          const originalTask = allTasks.find(t => t.id === originalId);
          if (!originalTask) return;
          
          const newId = generateId();
          const isRoot = originalId === task.id;
          
          let finalStartDate = isRoot ? nextStart : (originalTask.startDate ? originalTask.startDate + timeShift : null);
          let finalDueDate = isRoot ? nextDue : (originalTask.dueDate ? originalTask.dueDate + timeShift : null);

          if (finalDueDate !== null && finalStartDate === null) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            finalStartDate = today.getTime();
          }

          if (finalStartDate !== null && finalDueDate !== null && finalStartDate > finalDueDate) {
            finalDueDate = finalStartDate;
          }

          const newTask: Task = {
            ...originalTask,
            id: newId,
            parentId: newParentId,
            isCompleted: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            startDate: finalStartDate,
            dueDate: finalDueDate,
            recurrence: isRoot ? { ...config, endOccurrences: newEndOccurrences } : originalTask.recurrence
          };
          
          await db.tasks.add(newTask);
          compositeActions.push({ type: 'ADD', task: newTask, timestamp: Date.now() });
          
          const children = allTasks.filter(t => t.parentId === originalId);
          for (const child of children) {
            await duplicateTaskTree(child.id, newId);
          }
        };
        
        await duplicateTaskTree(task.id, task.parentId);
        
        // Remove recurrence from the completed task
        const oldTask = allTasks.find(t => t.id === task.id)!;
        const newTask = { ...oldTask, isCompleted: true, recurrence: undefined, updatedAt: Date.now() };
        await db.tasks.update(task.id, newTask);
        compositeActions.push({ type: 'UPDATE', id: task.id, oldTask, newTask, timestamp: Date.now() });
        
        pushHistory({ type: 'COMPOSITE', actions: compositeActions, timestamp: Date.now() });
        return;
      }
      
      // Remove recurrence from the completed task
      const oldTask = allTasks.find(t => t.id === task.id)!;
      const newTask = { ...oldTask, isCompleted: true, recurrence: undefined, updatedAt: Date.now() };
      await db.tasks.update(task.id, newTask);
      pushHistory({ type: 'UPDATE', id: task.id, oldTask, newTask, timestamp: Date.now() });
      return;
    }
    
    await updateTask(task.id, { isCompleted: newStatus });
  };

  const requestDelete = (id: string) => {
    let ids: string[] = [];
    if (selectedTaskIds.has(id)) {
      ids = [...selectedTaskIds].filter(taskId => !taskId.startsWith('context-'));
    } else {
      if (!id.startsWith('context-')) ids = [id];
    }
    
    if (ids.length > 0) {
      if (hideDeleteWarning) {
        executeDelete(ids);
      } else {
        setTasksToDelete(ids);
      }
    }
  };

  const executeDelete = async (ids: string[]) => {
    // recursively delete children
    const getChildrenIds = (parentId: string): string[] => {
      const children = allTasks.filter(t => t.parentId === parentId);
      return children.reduce((acc, child) => [...acc, child.id, ...getChildrenIds(child.id)], [] as string[]);
    };
    
    const idsToDeleteSet = new Set<string>();
    for (const id of ids) {
      idsToDeleteSet.add(id);
      getChildrenIds(id).forEach(childId => idsToDeleteSet.add(childId));
    }
    const idsToDelete = Array.from(idsToDeleteSet);

    let nextSelectedId: string | null = null;
    if (selectedTaskId && ids.includes(selectedTaskId)) {
      const index = visibleTasks.findIndex(t => t.id === selectedTaskId);
      if (index !== -1) {
        let found = false;
        // Look forward for a task not being deleted
        for (let i = index + 1; i < visibleTasks.length; i++) {
          if (!idsToDelete.includes(visibleTasks[i].id)) {
            nextSelectedId = visibleTasks[i].id;
            found = true;
            break;
          }
        }
        // If not found forward, look backward
        if (!found) {
          for (let i = index - 1; i >= 0; i--) {
            if (!idsToDelete.includes(visibleTasks[i].id)) {
              nextSelectedId = visibleTasks[i].id;
              break;
            }
          }
        }
      }
    } else {
      nextSelectedId = selectedTaskId;
    }

    const tasksToDeleteObjects = await db.tasks.where('id').anyOf(idsToDelete).toArray();
    await db.tasks.bulkDelete(idsToDelete);
    pushHistory({ type: 'DELETE', tasks: tasksToDeleteObjects, timestamp: Date.now() });
    
    setSelectedTaskId(nextSelectedId);
    setSelectedTaskIds(nextSelectedId ? new Set([nextSelectedId]) : new Set());
    setTasksToDelete(null);
  };

  const confirmDelete = async () => {
    if (!tasksToDelete || tasksToDelete.length === 0) return;
    await executeDelete(tasksToDelete);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTask = useMemo(() => allTasks.find(t => t.id === selectedTaskId), [allTasks, selectedTaskId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Insert') {
        e.preventDefault();
        if (currentView !== 'next-actions' && selectedTaskId) {
          addTask(null, selectedTaskId);
        } else {
          addTask(null);
        }
      } else if (e.key === ' ') {
        if (target.tagName === 'BUTTON' || target.tagName === 'SELECT') return;
        if (selectedTaskId) {
          e.preventDefault();
          const task = visibleTasks.find(t => t.id === selectedTaskId);
          if (task) {
            toggleComplete(task);
          }
        }
      } else if (e.key === '+') {
        e.preventDefault();
        setQuickAddModalOpen(true);
      } else if (e.key === 'Delete' && selectedTaskIds.size > 0) {
        e.preventDefault();
        requestDelete(selectedTaskId || Array.from(selectedTaskIds)[0]);
      } else if (e.key === 'F2' && selectedTaskId) {
        e.preventDefault();
        setEditingTaskId(selectedTaskId);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = visibleTasks.findIndex(t => t.id === selectedTaskId);
        if (idx > 0) {
          const newId = visibleTasks[idx - 1].id;
          setSelectedTaskId(newId);
          setSelectedTaskIds(new Set([newId]));
          setLastSelectedId(newId);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = visibleTasks.findIndex(t => t.id === selectedTaskId);
        if (idx >= 0 && idx < visibleTasks.length - 1) {
          const newId = visibleTasks[idx + 1].id;
          setSelectedTaskId(newId);
          setSelectedTaskIds(new Set([newId]));
          setLastSelectedId(newId);
        }
        else if (idx === -1 && visibleTasks.length > 0) {
          const newId = visibleTasks[0].id;
          setSelectedTaskId(newId);
          setSelectedTaskIds(new Set([newId]));
          setLastSelectedId(newId);
        }
      } else if (e.key === 'ArrowRight') {
        const task = visibleTasks.find(t => t.id === selectedTaskId);
        if (task && task.children.length > 0 && !expandedIds.has(task.id)) {
          e.preventDefault();
          toggleExpand(task.id);
        }
      } else if (e.key === 'ArrowLeft') {
        const task = visibleTasks.find(t => t.id === selectedTaskId);
        if (task && expandedIds.has(task.id)) {
          e.preventDefault();
          toggleExpand(task.id);
        } else if (task && task.parentId) {
          e.preventDefault();
          setSelectedTaskId(task.parentId);
          setSelectedTaskIds(new Set([task.parentId]));
          setLastSelectedId(task.parentId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskId, allTasks, visibleTasks, expandedIds, selectedTaskIds]);

  const handleDrop = async (e: React.DragEvent, targetNode: TaskNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedId || draggedId === targetNode.id || !dropTarget) return;

    let draggedTaskIds = selectedTaskIds.has(draggedId) ? Array.from(selectedTaskIds) : [draggedId];

    const isDescendant = (parentId: string, childId: string) => {
      let current = allTasks.find(t => t.id === childId);
      while (current) {
        if (current.parentId === parentId) return true;
        current = allTasks.find(t => t.id === current.parentId);
      }
      return false;
    };

    // Prevent dropping any task into itself or its descendants
    draggedTaskIds = draggedTaskIds.filter(id => {
      if (id === targetNode.id) return false;
      if (isDescendant(id, targetNode.id)) return false;
      return true;
    });

    if (draggedTaskIds.length === 0) {
      setDropTarget(null);
      setDraggedId(null);
      return;
    }

    let newParentId: string | null;
    let baseOrder: number;

    if (dropTarget.position === 'inside') {
      newParentId = targetNode.id;
      const children = allTasks.filter(t => t.parentId === targetNode.id).sort((a, b) => a.order - b.order);
      baseOrder = children.length > 0 ? children[children.length - 1].order + 1 : 0;
      setExpandedIds(prev => new Set(prev).add(targetNode.id));
    } else {
      newParentId = targetNode.parentId;
      const siblings = allTasks.filter(t => t.parentId === targetNode.parentId).sort((a, b) => a.order - b.order);
      const targetIndex = siblings.findIndex(t => t.id === targetNode.id);
      baseOrder = dropTarget.position === 'before' ? targetIndex : targetIndex + 1;
    }

    const siblings = allTasks.filter(t => t.parentId === newParentId && !draggedTaskIds.includes(t.id)).sort((a, b) => a.order - b.order);
    const tasksToInsert = draggedTaskIds.map(id => allTasks.find(t => t.id === id)!).filter(Boolean);
    
    siblings.splice(baseOrder, 0, ...tasksToInsert);

    const updates: { oldTask: Task, newTask: Task }[] = [];

    await db.transaction('rw', db.tasks, async () => {
      for (let i = 0; i < siblings.length; i++) {
        const task = siblings[i];
        if (draggedTaskIds.includes(task.id)) {
          const newTask = { ...task, parentId: newParentId, order: i, updatedAt: Date.now() };
          updates.push({ oldTask: task, newTask });
          await db.tasks.update(task.id, newTask);
        } else if (task.order !== i) {
          const newTask = { ...task, order: i };
          updates.push({ oldTask: task, newTask });
          await db.tasks.update(task.id, newTask);
        }
      }
    });

    if (updates.length > 0) {
      pushHistory({ type: 'BULK_UPDATE', updates, timestamp: Date.now() });
    }

    setDropTarget(null);
    setDraggedId(null);
  };

  const isTaskActive = useCallback((task: TaskNode): boolean => {
    if (task.isCompleted) return false;
    if (task.isProject || task.isFolder || task.id.startsWith('context-')) return false;

    if (task.startDate) {
      const start = new Date(task.startDate);
      start.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start.getTime() > today.getTime()) {
        return false;
      }
    }

    if (task.parentId) {
      const parent = allTasks.find(t => t.id === task.parentId);
      if (parent && parent.completeInOrder) {
        const siblings = allTasks.filter(t => t.parentId === task.parentId).sort((a, b) => a.order - b.order);
        for (const sibling of siblings) {
          if (sibling.id === task.id) {
            break;
          }
          if (!sibling.isCompleted) {
            return false;
          }
        }
      }
    }

    return true;
  }, [allTasks]);

  // Render Task Node
  const renderTaskNode = (node: TaskNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedTaskIds.has(node.id) || selectedTaskId === node.id;
    const isEditing = editingTaskId === node.id;
    const isProjectOrFolder = node.isProject || node.isFolder;
    const isContextNode = node.id.startsWith('context-');
    const taskColor = getTaskColor(node.id);

    const hasUncompletedDescendants = (n: TaskNode): boolean => {
      return n.children.some(c => !c.isCompleted || hasUncompletedDescendants(c));
    };
    const canComplete = !(isProjectOrFolder && hasUncompletedDescendants(node)) && !isContextNode;

    return (
      <div key={node.id} className={cn("flex flex-col", isProjectOrFolder && "my-0.5")}>
        <div 
          draggable={!isEditing && currentView !== 'contexts'}
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggedId(node.id);
            if (!selectedTaskIds.has(node.id)) {
              setSelectedTaskIds(new Set([node.id]));
              setSelectedTaskId(node.id);
              setLastSelectedId(node.id);
            }
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentView === 'contexts') return;
            if (selectedTaskIds.has(node.id)) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            let position: 'before'|'after'|'inside' = 'inside';
            if (y < rect.height * 0.25) position = 'before';
            else if (y > rect.height * 0.75) position = 'after';
            setDropTarget({ id: node.id, position });
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => handleDrop(e, node)}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTarget(null);
          }}
          className={cn(
            "group rounded-md cursor-pointer text-sm transition-colors relative leading-tight overflow-hidden",
            settings.density === 'compact' ? "py-0.5 px-2" : "py-2 px-3",
            isSelected ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
            dropTarget?.id === node.id && dropTarget.position === 'before' && "border-t-2 border-accent-500",
            dropTarget?.id === node.id && dropTarget.position === 'after' && "border-b-2 border-accent-500",
            dropTarget?.id === node.id && dropTarget.position === 'inside' && "bg-accent-100 dark:bg-accent-900/30",
            isProjectOrFolder && "font-medium",
            selectedTaskIds.has(node.id) && draggedId && "opacity-50"
          )}
          style={{ 
            paddingLeft: `${depth * 1.5 + 0.5}rem`,
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (currentView === 'next-actions') {
              setCurrentView('all');
              let current = allTasks.find(t => t.id === node.id);
              const parentsToExpand = new Set<string>();
              while (current && current.parentId) {
                parentsToExpand.add(current.parentId);
                current = allTasks.find(t => t.id === current!.parentId);
              }
              if (parentsToExpand.size > 0) {
                setExpandedIds(prev => new Set([...prev, ...parentsToExpand]));
              }
              setSelectedTaskId(node.id);
              setSelectedTaskIds(new Set([node.id]));
              setLastSelectedId(node.id);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.shiftKey && lastSelectedId) {
              const visibleIds = visibleTasks.map(t => t.id);
              const startIdx = visibleIds.indexOf(lastSelectedId);
              const endIdx = visibleIds.indexOf(node.id);
              if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const newSelection = new Set(selectedTaskIds);
                for (let i = min; i <= max; i++) {
                  newSelection.add(visibleIds[i]);
                }
                setSelectedTaskIds(newSelection);
              }
            } else if (e.metaKey || e.ctrlKey) {
              const newSelection = new Set(selectedTaskIds);
              if (newSelection.has(node.id)) {
                newSelection.delete(node.id);
                if (selectedTaskId === node.id) {
                  setSelectedTaskId(newSelection.size > 0 ? Array.from(newSelection)[newSelection.size - 1] : null);
                }
              } else {
                newSelection.add(node.id);
                setSelectedTaskId(node.id);
              }
              setSelectedTaskIds(newSelection);
              setLastSelectedId(node.id);
            } else {
              setSelectedTaskIds(new Set([node.id]));
              setLastSelectedId(node.id);
              setSelectedTaskId(node.id);
              setPropertiesCollapsed(false);
            }
          }}
        >
          {!isSelected && taskColor && (
            <div 
              className="absolute inset-0 opacity-100 dark:opacity-30 pointer-events-none" 
              style={{ backgroundColor: taskColor }} 
            />
          )}
          <div className="relative flex items-center w-full z-10">
          <div 
            className="w-5 h-5 flex items-center justify-center mr-1 cursor-pointer text-zinc-400 hover:text-zinc-600"
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
          >
            {hasChildren ? (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <div className="w-4" />}
          </div>
          
          {canComplete && (
            <div 
              className="mr-2 cursor-pointer text-zinc-400 hover:text-zinc-600"
              onClick={(e) => { e.stopPropagation(); toggleComplete(node); }}
            >
              {node.isCompleted ? (
                <CheckSquare size={16} className="text-accent-500" />
              ) : node.recurrence ? (
                <div className="relative flex items-center justify-center w-4 h-4">
                  <Square size={16} className="absolute" />
                  <Repeat size={10} className="absolute" />
                </div>
              ) : (
                <Square size={16} />
              )}
            </div>
          )}

          {isEditing ? (
            <input
              autoFocus
              onFocus={(e) => e.target.select()}
              defaultValue={node.title}
              onBlur={(e) => {
                if (newTaskBeingEdited === node.id && e.target.value.trim() === '') {
                  db.tasks.delete(node.id);
                  if (undoStackRef.current.length > 0) {
                    const lastAction = undoStackRef.current[undoStackRef.current.length - 1];
                    if (lastAction.type === 'ADD' && lastAction.task.id === node.id) {
                      undoStackRef.current.pop();
                      setCanUndo(undoStackRef.current.length > 0);
                    }
                  }
                } else {
                  updateTask(node.id, { title: e.target.value });
                }
                setEditingTaskId(null);
                setNewTaskBeingEdited(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateTask(node.id, { title: e.currentTarget.value });
                  setEditingTaskId(null);
                  setNewTaskBeingEdited(null);
                } else if (e.key === 'Escape') {
                  if (newTaskBeingEdited === node.id) {
                    db.tasks.delete(node.id);
                    if (undoStackRef.current.length > 0) {
                      const lastAction = undoStackRef.current[undoStackRef.current.length - 1];
                      if (lastAction.type === 'ADD' && lastAction.task.id === node.id) {
                        undoStackRef.current.pop();
                        setCanUndo(undoStackRef.current.length > 0);
                      }
                    }
                  }
                  setEditingTaskId(null);
                  setNewTaskBeingEdited(null);
                }
              }}
              className="flex-1 bg-white dark:bg-zinc-900 border border-accent-500 px-1 rounded text-sm outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex-1 flex flex-col min-w-0">
              {(currentView === 'next-actions' || currentView === 'contexts') && getTaskPath(node.id) && !isContextNode && (
                <span className="text-[10px] text-zinc-400 truncate leading-tight mb-0.5">
                  {getTaskPath(node.id)}
                </span>
              )}
              <div className="flex items-center min-w-0">
                {node.isProject && !isContextNode && <Briefcase size={14} className="mr-1.5 text-blue-500 dark:text-blue-400 shrink-0" />}
                {node.isFolder && !isContextNode && <Folder size={14} className="mr-1.5 text-yellow-500 dark:text-yellow-400 shrink-0" />}
                {isContextNode && <Tag size={14} className="mr-1.5 text-purple-500 dark:text-purple-400 shrink-0" />}
                <span 
                  className={cn(
                    "truncate cursor-text",
                    node.isCompleted ? "line-through text-zinc-400" : (isTaskActive(node) ? "text-accent-600 dark:text-accent-400" : ""),
                    isProjectOrFolder && "font-semibold"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isContextNode) {
                      if (window.innerWidth >= 768) {
                        setEditingTaskId(node.id);
                      }
                    }
                    setSelectedTaskId(node.id);
                    setPropertiesCollapsed(false);
                  }}
                >
                  {node.title || 'Untitled Task'}
                </span>
                {node.priority === 'high' && !isContextNode && (
                  <Flag size={14} className="ml-2 text-red-500 shrink-0 fill-current" />
                )}
                {node.notes && node.notes.trim() !== '' && !isContextNode && (
                  <AlignLeft 
                    size={14} 
                    className="ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0 cursor-pointer" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTaskId(node.id);
                      setPropertiesCollapsed(true);
                      
                      // Focus the rich text editor if possible
                      setTimeout(() => {
                        const editor = document.querySelector('.ProseMirror') as HTMLElement;
                        if (editor) editor.focus();
                      }, 50);
                    }}
                    title="View Notes"
                  />
                )}
              </div>
            </div>
          )}

          {settings.useContexts && node.contexts.length > 0 && !isEditing && !isContextNode && (
            <div className="flex gap-1 mr-2">
              {node.contexts.map(ctx => (
                <span key={ctx} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300">
                  @{ctx}
                </span>
              ))}
            </div>
          )}

          {node.dueDate && !isEditing && !isContextNode && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium mr-2",
              isPast(node.dueDate) && !isToday(node.dueDate) ? "bg-red-500 text-white" : 
              (isToday(node.dueDate) || isTomorrow(node.dueDate)) ? "bg-yellow-500 text-yellow-950" : 
              "text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
            )}>
              {isToday(node.dueDate) ? 'Today' : 
               isTomorrow(node.dueDate) ? 'Tomorrow' : 
               isYesterday(node.dueDate) ? 'Yesterday' : 
               format(node.dueDate, 'dd.MM.yyyy')}
            </span>
          )}

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            {currentView !== 'next-actions' && currentView !== 'contexts' && !isContextNode && (
              <button 
                className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                onClick={(e) => { e.stopPropagation(); addTask(node.id); }}
                title="Add Subtask"
              >
                <Plus size={14} />
              </button>
            )}
            {!isContextNode && (
              <button 
                className="p-1 text-zinc-400 hover:text-red-500"
                onClick={(e) => { e.stopPropagation(); requestDelete(node.id); }}
                title="Delete Task"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        </div>

        <AnimatePresence>
          {isExpanded && hasChildren && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {node.children.map(child => renderTaskNode(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-16 md:w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 flex flex-col transition-all duration-300">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-3 items-center md:items-stretch">
          <h1 className="font-semibold text-lg flex items-center gap-2 justify-center md:justify-start">
            <CheckCircle2 className="text-accent-500 shrink-0" />
            <span className="hidden md:inline">OneFileTasks</span>
          </h1>
          <button
            onClick={() => setQuickAddModalOpen(true)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-2 md:px-3 md:py-1.5 text-sm text-center md:text-left text-zinc-500 hover:border-accent-500 transition-colors flex items-center justify-center md:justify-between"
            title="Quick add tasks"
          >
            <span className="hidden md:inline">Quick add tasks</span>
            <Plus className="md:hidden shrink-0" size={16} />
            <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">+</kbd>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-3 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:block">Views</div>
          <nav className="space-y-0.5 px-2">
            {[
              { id: 'next-actions', icon: ListTodo, label: 'Next Actions' },
              { id: 'projects', icon: Folder, label: 'Projects' },
              ...(settings.useContexts ? [{ id: 'contexts', icon: Tag, label: 'Contexts' }] : []),
              { id: 'all', icon: AlignLeft, label: 'All Tasks' },
            ].map(view => (
              <button
                key={view.id}
                onClick={() => setCurrentView(view.id as ViewType)}
                title={view.label}
                className={cn(
                  "w-full flex items-center justify-center md:justify-start gap-2 p-2 md:px-3 md:py-2 rounded-md text-sm transition-colors",
                  currentView === view.id 
                    ? "bg-zinc-200 dark:bg-zinc-800 font-medium" 
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
                )}
              >
                <view.icon size={16} className="shrink-0" />
                <span className="hidden md:inline">{view.label}</span>
              </button>
            ))}
          </nav>

          <div className="px-3 mt-8 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:block">History</div>
          <div className="px-2 md:px-4 flex flex-col md:flex-row gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 rounded text-xs font-medium transition-colors",
                canUndo ? "bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 cursor-not-allowed"
              )}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} className="shrink-0" /> <span className="hidden md:inline">Undo</span>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 rounded text-xs font-medium transition-colors",
                canRedo ? "bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 cursor-not-allowed"
              )}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={14} className="shrink-0" /> <span className="hidden md:inline">Redo</span>
            </button>
          </div>

          {supportsFileSystemAccess && (
            <>
              <div className="px-3 mt-8 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:block">Sync</div>
              <div className="px-2 md:px-4 space-y-3">
                {fileHandle ? (
                  syncStatus === 'needs_permission' ? (
                    <button
                      onClick={requestPermissionAndSync}
                      className="w-full text-left text-xs text-amber-600 flex items-center justify-center md:justify-start gap-2 p-2 hover:bg-amber-50 rounded-md transition-colors"
                      title={`Restore link to ${fileHandle.name}`}
                    >
                      <RefreshCw size={14} className="shrink-0" />
                      <span className="hidden md:inline truncate">Restore {fileHandle.name}</span>
                    </button>
                  ) : (
                    <div className="text-xs text-zinc-500 flex items-center justify-center md:justify-start gap-2 p-2 group" title={`Linked to ${fileHandle.name}`}>
                      <FileJson size={14} className="text-accent-500 shrink-0" />
                      <span className="hidden md:inline truncate flex-1">Linked to {fileHandle.name}</span>
                      <button 
                        onClick={unlinkFile}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-500 ml-auto hidden md:block"
                        title="Unlink file"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    <button 
                      onClick={linkFile}
                      title="Link Local File"
                      className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors"
                    >
                      <FileJson size={14} className="shrink-0" /> <span className="hidden md:inline">Link Local File</span>
                    </button>
                    <button 
                      onClick={createNewFile}
                      title="Create New File"
                      className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors"
                    >
                      <Save size={14} className="shrink-0" /> <span className="hidden md:inline">Create New File</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <>
            <div className="px-3 mt-8 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:block">Export / Import</div>
            <div className="px-2 md:px-4 space-y-2">
              <button 
                onClick={manualExport}
                title="Export to file"
                className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors"
              >
                <FileDown size={14} className="shrink-0" /> <span className="hidden md:inline">Export to file</span>
              </button>
              <label 
                title="Open file"
                className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                <FileUp size={14} className="shrink-0" /> <span className="hidden md:inline">Open file</span>
                <input type="file" accept=".json" className="hidden" onChange={manualImport} />
              </label>
            </div>
          </>
        </div>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-center md:justify-start">
          <button 
            onClick={() => setHelpModalOpen(true)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            title="Help"
          >
            <HelpCircle size={20} />
          </button>
          <button 
            onClick={() => setSettingsModalOpen(true)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors ml-2"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950",
        selectedTask ? "hidden md:flex" : "flex"
      )}>
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 md:px-6 justify-between gap-2 md:gap-4">
          <h2 className="font-semibold capitalize shrink-0 hidden sm:block">{currentView.replace('-', ' ')}</h2>
          <div className="flex-1 flex justify-center min-w-0">
            <div className="relative w-full max-w-md">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <select
              value={completedFilter}
              onChange={(e) => setCompletedFilter(e.target.value as any)}
              className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-md px-1 md:px-2 py-1.5 text-xs md:text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 max-w-[120px] md:max-w-none"
            >
              <option value="show_all">Show All Completed</option>
              {settings.autoHideCompletedDays > 0 && (
                <option value="hide_old">Hide Completed (&gt; {settings.autoHideCompletedDays}d)</option>
              )}
              <option value="hide_all">Hide All Completed</option>
            </select>
            <button 
              onClick={() => {
                if (currentView !== 'next-actions' && selectedTaskId) {
                  addTask(null, selectedTaskId);
                } else {
                  addTask(null);
                }
              }}
              className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-xs md:text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Add Task</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredTree.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
              <CheckCircle2 size={48} className="mb-4 opacity-20" />
              <p>No tasks found in this view.</p>
              <p className="text-sm mt-2">Press <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">Insert</kbd> to add a task</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {filteredTree.map(node => renderTaskNode(node, 0))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Pane */}
      {selectedTask && (
        <div 
          className="border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 md:dark:bg-zinc-900/30 flex flex-col shrink-0 fixed inset-0 z-50 md:relative md:inset-auto md:z-auto w-full md:w-[var(--details-width)]"
          style={{ '--details-width': `${detailsWidth}px` } as React.CSSProperties}
        >
          {/* Drag Handle */}
          <div 
            className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-500/50 z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = detailsWidth;
              const onMouseMove = (moveEvent: MouseEvent) => {
                const newWidth = Math.max(250, Math.min(800, startWidth - (moveEvent.clientX - startX)));
                setDetailsWidth(newWidth);
              };
              const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
              };
              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          />

          <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 justify-between">
            <h3 className="font-medium text-sm text-zinc-500">Task Details</h3>
            <button 
              onClick={() => setSelectedTaskId(null)}
              className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            {/* Title */}
            <div>
              <input
                type="text"
                value={selectedTask.title}
                onChange={(e) => updateTask(selectedTask.id, { title: e.target.value })}
                placeholder="Task title"
                className="w-full bg-transparent text-lg font-semibold focus:outline-none placeholder-zinc-400"
              />
            </div>

            {/* Properties */}
            <div>
              <button 
                onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
                className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 hover:text-zinc-700 dark:hover:text-zinc-300 w-full text-left"
              >
                {propertiesCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                Properties
              </button>
              
              {!propertiesCollapsed && (
                <div className="space-y-3 mt-3">
                  <label className="flex items-center gap-3 text-sm cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedTask.isFolder}
                      onChange={(e) => updateTask(selectedTask.id, { isFolder: e.target.checked, isProject: e.target.checked ? false : selectedTask.isProject })}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                    <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                      <Folder size={16} className="text-yellow-500 dark:text-yellow-400" /> Is Folder
                    </span>
                  </label>

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.isProject}
                  onChange={(e) => updateTask(selectedTask.id, { isProject: e.target.checked, isFolder: e.target.checked ? false : selectedTask.isFolder })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <Briefcase size={16} className="text-blue-500 dark:text-blue-400" /> Is Project
                </span>
              </label>

              <div className="flex flex-col gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <Play size={16} className="text-zinc-400" />
                    <span className="w-10 text-zinc-500">Start</span>
                    <input 
                      type="date"
                      value={selectedTask.startDate ? format(selectedTask.startDate, 'yyyy-MM-dd') : ''}
                      onChange={(e) => {
                        const date = e.target.value ? new Date(e.target.value).getTime() : null;
                        updateTask(selectedTask.id, { startDate: date });
                      }}
                      className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1 flex-1"
                    />
                  </div>
                  <div className="flex gap-1 ml-16">
                    <button onClick={() => {
                      const d = new Date();
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Today</button>
                    <button onClick={() => {
                      const d = selectedTask.startDate ? new Date(selectedTask.startDate) : new Date(); d.setDate(d.getDate() + 1);
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Tomorrow</button>
                    <button onClick={() => {
                      const d = selectedTask.startDate ? new Date(selectedTask.startDate) : new Date(); d.setDate(d.getDate() + 7);
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Week</button>
                    <button onClick={() => {
                      const d = selectedTask.startDate ? new Date(selectedTask.startDate) : new Date(); d.setMonth(d.getMonth() + 1);
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Month</button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-zinc-400" />
                    <span className="w-10 text-zinc-500">Due</span>
                    <input 
                      type="date"
                      value={selectedTask.dueDate ? format(selectedTask.dueDate, 'yyyy-MM-dd') : ''}
                      onChange={(e) => {
                        const date = e.target.value ? new Date(e.target.value).getTime() : null;
                        updateTask(selectedTask.id, { dueDate: date });
                      }}
                      className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1 flex-1"
                    />
                  </div>
                  <div className="flex gap-1 ml-16">
                    <button onClick={() => {
                      const d = new Date();
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Today</button>
                    <button onClick={() => {
                      const d = selectedTask.dueDate ? new Date(selectedTask.dueDate) : new Date(); d.setDate(d.getDate() + 1);
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Tomorrow</button>
                    <button onClick={() => {
                      const d = selectedTask.dueDate ? new Date(selectedTask.dueDate) : new Date(); d.setDate(d.getDate() + 7);
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Week</button>
                    <button onClick={() => {
                      const d = selectedTask.dueDate ? new Date(selectedTask.dueDate) : new Date(); d.setMonth(d.getMonth() + 1);
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Month</button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Repeat size={16} className="text-zinc-400" />
                  <button 
                    onClick={() => setRecurrenceModalOpen(true)}
                    className="text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left flex-1 border-b border-zinc-200 dark:border-zinc-800 pb-1"
                  >
                    {selectedTask.recurrence ? `Repeats ${selectedTask.recurrence.pattern}` : 'Does not repeat'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Flag size={16} className="text-zinc-400" />
                <select
                  value={selectedTask.priority}
                  onChange={(e) => updateTask(selectedTask.id, { priority: e.target.value as any })}
                  className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1"
                >
                  <option value="low">Low Priority</option>
                  <option value="normal">Normal Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>

              {settings.useContexts && (
                <div className="flex items-start gap-3 text-sm">
                  <Tag size={16} className="text-zinc-400 mt-1" />
                  <div className="flex-1">
                    <input 
                      key={`context-${selectedTask.id}-${selectedTask.contexts.join(',')}`}
                      type="text"
                      placeholder="Contexts (comma separated)"
                      defaultValue={selectedTask.contexts.join(', ')}
                      onBlur={(e) => {
                        const contexts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        updateTask(selectedTask.id, { contexts });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const contexts = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean);
                          updateTask(selectedTask.id, { contexts });
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.hideBranchInTodo}
                  onChange={(e) => updateTask(selectedTask.id, { hideBranchInTodo: e.target.checked })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <EyeOff size={16} /> Hide branch in Next Actions
                </span>
              </label>

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.completeInOrder}
                  onChange={(e) => updateTask(selectedTask.id, { completeInOrder: e.target.checked })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <ListOrdered size={16} /> Complete subtasks in order
                </span>
              </label>

              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 min-w-[120px]">
                  <Palette size={16} /> Background Color
                </span>
                <div className="flex gap-1 flex-wrap flex-1 items-center">
                  {[
                    { label: 'None', value: '' },
                    { label: 'Red', value: '#fee2e2' },
                    { label: 'Orange', value: '#ffedd5' },
                    { label: 'Yellow', value: '#fef3c7' },
                    { label: 'Green', value: '#dcfce7' },
                    { label: 'Blue', value: '#dbeafe' },
                    { label: 'Purple', value: '#f3e8ff' },
                    { label: 'Pink', value: '#fce7f3' },
                    { label: 'Gray', value: '#f3f4f6' },
                  ].map(color => (
                    <button
                      key={color.label}
                      onClick={() => updateTask(selectedTask.id, { backgroundColor: color.value || undefined })}
                      className={cn(
                        "w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700 transition-transform hover:scale-110 flex items-center justify-center shrink-0 relative overflow-hidden",
                        (selectedTask.backgroundColor || '') === color.value && "ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-zinc-900"
                      )}
                      title={color.label}
                    >
                      <div 
                        className="absolute inset-0 opacity-100 dark:opacity-30 pointer-events-none"
                        style={{ backgroundColor: color.value || 'transparent' }}
                      />
                      {color.value === '' && <X size={12} className="text-zinc-400 relative z-10" />}
                    </button>
                  ))}
                  <div 
                    className="relative w-6 h-6 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700 transition-transform hover:scale-110 flex items-center justify-center shrink-0 ml-1" 
                    title="Custom Color"
                    style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                  >
                    <Palette size={12} className="text-white drop-shadow-md pointer-events-none" />
                    <input
                      type="color"
                      value={selectedTask.backgroundColor || '#ffffff'}
                      onChange={(e) => updateTask(selectedTask.id, { backgroundColor: e.target.value })}
                      className="absolute inset-[-8px] w-10 h-10 cursor-pointer opacity-0"
                    />
                  </div>
                </div>
              </div>
            </div>
            )}
            </div>

            {/* Notes */}
            <div className="flex flex-col flex-1 min-h-[300px]">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Notes</h4>
              <RichTextEditor 
                key={selectedTask.id}
                taskId={selectedTask.id}
                value={selectedTask.notes} 
                onChange={(val) => updateTask(selectedTask.id, { notes: val })} 
              />
            </div>
            
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
              Created: {format(selectedTask.createdAt, 'PP p')}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {tasksToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4"
            >
              <h3 className="text-lg font-semibold mb-2">Delete Task{tasksToDelete.length > 1 ? 's' : ''}</h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                Are you sure you want to delete {tasksToDelete.length > 1 ? `these ${tasksToDelete.length} tasks` : 'this task'}?
              </p>
              <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-6 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hideDeleteWarning}
                  onChange={(e) => {
                    setHideDeleteWarning(e.target.checked);
                    localStorage.setItem('hideDeleteWarning', String(e.target.checked));
                  }}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-accent-500 focus:ring-accent-500"
                />
                Don't show this warning again
              </label>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setTasksToDelete(null)}
                  className="px-4 py-2 rounded-md font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-md font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {recurrenceModalOpen && selectedTask && (
        <RecurrenceModal 
          task={selectedTask}
          settings={settings}
          onClose={() => setRecurrenceModalOpen(false)}
          onSave={(recurrence) => {
            updateTask(selectedTask.id, { recurrence });
            setRecurrenceModalOpen(false);
          }}
        />
      )}

      {helpModalOpen && (
        <HelpModal onClose={() => setHelpModalOpen(false)} />
      )}

      {settingsModalOpen && (
        <SettingsModal 
          settings={settings} 
          setSettings={setSettings} 
          onClose={() => setSettingsModalOpen(false)} 
        />
      )}

      {quickAddModalOpen && (
        <QuickAddModal 
          onClose={() => setQuickAddModalOpen(false)} 
          onAdd={handleBulkAdd} 
          allTasks={allTasks} 
        />
      )}
    </div>
  );
}
