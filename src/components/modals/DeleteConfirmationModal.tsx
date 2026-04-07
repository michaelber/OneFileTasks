import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface DeleteConfirmationModalProps {
  tasksToDelete: string[] | null;
  hideDeleteWarning: boolean;
  setHideDeleteWarning: (hide: boolean) => void;
  setTasksToDelete: (tasks: string[] | null) => void;
  confirmDelete: () => void;
}

export function DeleteConfirmationModal({
  tasksToDelete,
  hideDeleteWarning,
  setHideDeleteWarning,
  setTasksToDelete,
  confirmDelete
}: DeleteConfirmationModalProps) {
  return (
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
  );
}
