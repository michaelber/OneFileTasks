import React from 'react';
import { 
  CheckCircle2, Plus, Folder, Tag, AlignLeft, ListTodo, 
  Undo2, Redo2, RefreshCw, FileJson, X, Save, FileDown, FileUp, HelpCircle, Settings 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { type ViewType, type AppSettings } from '../types';

interface SidebarProps {
  settings: AppSettings;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  setQuickAddModalOpen: (open: boolean) => void;
  setHelpModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  undo: () => void;
  canUndo: boolean;
  redo: () => void;
  canRedo: boolean;
  supportsFileSystemAccess: boolean;
  fileHandle: FileSystemFileHandle | null;
  syncStatus: 'idle' | 'syncing' | 'error' | 'needs_permission';
  requestPermissionAndSync: () => void;
  unlinkFile: () => void;
  linkFile: () => void;
  createNewFile: () => void;
  manualExport: () => void;
  manualImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Sidebar({
  settings,
  currentView,
  setCurrentView,
  setQuickAddModalOpen,
  setHelpModalOpen,
  setSettingsModalOpen,
  undo,
  canUndo,
  redo,
  canRedo,
  supportsFileSystemAccess,
  fileHandle,
  syncStatus,
  requestPermissionAndSync,
  unlinkFile,
  linkFile,
  createNewFile,
  manualExport,
  manualImport
}: SidebarProps) {
  return (
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
        <hr className="md:hidden mx-4 mt-3 mb-2 border-zinc-200 dark:border-zinc-800" />
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

        <div className="px-3 mt-8 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:block">File</div>
        <hr className="md:hidden mx-4 mt-3 mb-2 border-zinc-200 dark:border-zinc-800" />
        <div className="px-2 md:px-4 space-y-2">
          {supportsFileSystemAccess && fileHandle && (
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
              <div className="text-xs text-zinc-500 flex items-center justify-center md:justify-start gap-2 p-2 group relative" title={`Linked to ${fileHandle.name}`}>
                <FileJson size={14} className="text-accent-500 shrink-0" />
                <span className="hidden md:inline truncate flex-1">Linked to {fileHandle.name}</span>
                <button 
                  onClick={unlinkFile}
                  className="absolute right-1 top-1 md:relative md:right-auto md:top-auto md:opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-500 md:ml-auto"
                  title="Unlink file"
                >
                  <X size={12} />
                </button>
              </div>
            )
          )}

          {(!supportsFileSystemAccess || !fileHandle) && (
            <>
              {supportsFileSystemAccess && (
                <button 
                  onClick={createNewFile}
                  title="Save as file"
                  className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors"
                >
                  <Save size={14} className="shrink-0" /> <span className="hidden md:inline">Save as file</span>
                </button>
              )}

              {supportsFileSystemAccess ? (
                <button 
                  onClick={linkFile}
                  title="Open file"
                  className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors"
                >
                  <FileUp size={14} className="shrink-0" /> <span className="hidden md:inline">Open file</span>
                </button>
              ) : (
                <label 
                  title="Open file"
                  className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  <FileUp size={14} className="shrink-0" /> <span className="hidden md:inline">Open file</span>
                  <input type="file" accept=".json" className="hidden" onChange={manualImport} />
                </label>
              )}

              {!supportsFileSystemAccess && (
                <button 
                  onClick={manualExport}
                  title="Export to file"
                  className="w-full flex items-center justify-center gap-2 p-2 md:px-3 md:py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium transition-colors"
                >
                  <FileDown size={14} className="shrink-0" /> <span className="hidden md:inline">Export to file</span>
                </button>
              )}
            </>
          )}
        </div>
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
  );
}
