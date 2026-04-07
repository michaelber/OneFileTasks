import React from 'react';
import { Plus, X, Eye, EyeOff, Clock } from 'lucide-react';
import { type ViewType, type AppSettings } from '../types';

interface TopBarProps {
  currentView: ViewType;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  completedFilter: 'show_all' | 'hide_all' | 'hide_old';
  setCompletedFilter: (filter: 'show_all' | 'hide_all' | 'hide_old') => void;
  settings: AppSettings;
  addTask: (parentId?: string | null, siblingId?: string | null) => void;
  selectedTaskId: string | null;
}

export function TopBar({
  currentView,
  searchQuery,
  setSearchQuery,
  completedFilter,
  setCompletedFilter,
  settings,
  addTask,
  selectedTaskId
}: TopBarProps) {
  const toggleCompletedFilter = () => {
    if (completedFilter === 'show_all') {
      setCompletedFilter('hide_all');
    } else if (completedFilter === 'hide_all') {
      if (settings.autoHideCompletedDays > 0) {
        setCompletedFilter('hide_old');
      } else {
        setCompletedFilter('show_all');
      }
    } else {
      setCompletedFilter('show_all');
    }
  };

  const getFilterIcon = () => {
    if (completedFilter === 'show_all') return <Eye size={18} />;
    if (completedFilter === 'hide_all') return <EyeOff size={18} />;
    return <Clock size={18} />;
  };

  const getFilterTooltip = () => {
    if (completedFilter === 'show_all') return 'Showing all completed tasks';
    if (completedFilter === 'hide_all') return 'Hiding all completed tasks';
    return `Hiding completed tasks older than ${settings.autoHideCompletedDays} days`;
  };

  return (
    <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 md:px-6 justify-between gap-2 md:gap-4 overflow-hidden">
      <h2 className="font-semibold capitalize shrink-0">{currentView.replace('-', ' ')}</h2>
      <div className="flex-1 hidden min-[300px]:flex justify-center min-w-0">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all min-w-[100px]"
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
      <div className="flex items-center gap-2 md:gap-3 shrink-0 ml-auto">
        <button
          onClick={toggleCompletedFilter}
          title={getFilterTooltip()}
          className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {getFilterIcon()}
        </button>
        <button 
          onClick={() => {
            if (currentView !== 'next-actions' && selectedTaskId) {
              addTask(null, selectedTaskId);
            } else {
              addTask(null);
            }
          }}
          title="Add Task"
          className="flex items-center justify-center w-8 h-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shrink-0"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
