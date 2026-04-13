import React, { useEffect } from 'react';
import { X, HelpCircle } from 'lucide-react';

export const HelpModal = ({ onClose }: { onClose: () => void }) => {
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
        
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
          Version {import.meta.env.VITE_APP_VERSION || '1.0.0'}
        </div>
      </div>
    </div>
  );
};
