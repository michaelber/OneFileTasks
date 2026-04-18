import React, { useRef, useState, useEffect } from 'react';
import { Bold, Italic, Underline, List as ListIcon, ListOrdered, Edit2, Link as LinkIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export const RichTextEditor = ({ value, onChange, taskId }: { value: string, onChange: (val: string) => void, taskId: string, key?: string }) => {
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

    const html = `<a href="${href}" rel="noopener noreferrer" class="text-accent-600 hover:underline">${savedSelectionText || linkUrl}</a>`;
    
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
        return `<a href="${href}" rel="noopener noreferrer" class="text-accent-600 hover:underline">${match}</a>`;
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
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        document.execCommand('outdent', false, undefined);
      } else {
        document.execCommand('indent', false, undefined);
      }
      handleInput();
      return;
    }

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
        onClick={async (e) => {
          const target = e.target as HTMLElement;
          const anchor = target.closest('a');
          if (anchor) {
            e.preventDefault();
            e.stopPropagation();
            const href = anchor.getAttribute('href');
            if (href) {
              if ('__TAURI_INTERNALS__' in window) {
                try {
                  const { open } = await import('@tauri-apps/plugin-shell');
                  await open(href);
                } catch (err) {
                  console.error('Failed to open link in Tauri:', err);
                  window.open(href, '_blank', 'noopener,noreferrer');
                }
              } else {
                window.open(href, '_blank', 'noopener,noreferrer');
              }
            }
          }
        }}
      />
    </div>
  );
};
