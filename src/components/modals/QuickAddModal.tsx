import React, { useState, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Task } from '../../types';
import { generateId } from '../../lib/utils';

export const QuickAddModal = ({ 
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
