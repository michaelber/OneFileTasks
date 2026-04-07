import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isToday, isTomorrow, isYesterday, differenceInDays, startOfDay } from 'date-fns';
import {
  CheckCircle2, ChevronRight, ChevronDown, Plus, Folder, Briefcase,
  AlignLeft, Flag, Trash2, CheckSquare, Square, Tag, Repeat
} from 'lucide-react';

import { 
  type RecurrencePattern, type RecurrenceConfig, type AppSettings, 
  DEFAULT_SETTINGS, type Task, type TaskNode, type ViewType 
} from './types';
import { db } from './lib/db';
import { cn, generateId } from './lib/utils';

import { SettingsModal } from './components/modals/SettingsModal';
import { QuickAddModal } from './components/modals/QuickAddModal';
import { useFileSystemSync } from './hooks/useFileSystemSync';
import { useSettings } from './hooks/useSettings';
import { useTaskHistory } from './hooks/useTaskHistory';
import { useTaskTree } from './hooks/useTaskTree';
import { useTaskActions } from './hooks/useTaskActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { RecurrenceModal } from './components/modals/RecurrenceModal';
import { HelpModal } from './components/modals/HelpModal';
import { TaskDetails } from './components/tasks/TaskDetails';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DeleteConfirmationModal } from './components/modals/DeleteConfirmationModal';
import { TaskListItem } from './components/tasks/TaskListItem';

// --- Main App Component ---
export default function App() {
  const { settings, setSettings } = useSettings();
  const allTasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const [currentView, setCurrentView] = useState<ViewType>(
    settings.defaultView === 'contexts' && !settings.useContexts ? 'all' : settings.defaultView
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilters, setViewFilters] = useState<Record<ViewType, 'show_all' | 'hide_all' | 'hide_old'>>({
    'all': settings.autoHideCompletedDays > 0 ? 'hide_old' : 'show_all',
    'next-actions': 'hide_all',
    'projects': 'hide_all',
    'contexts': 'hide_all'
  });
  const completedFilter = viewFilters[currentView] || 'show_all';
  const setCompletedFilter = (filter: 'show_all' | 'hide_all' | 'hide_old') => {
    setViewFilters(prev => ({ ...prev, [currentView]: filter }));
  };
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

  const { fileHandle, syncStatus, linkFile, createNewFile, syncToFile, manualExport, manualImport, requestPermissionAndSync, unlinkFile } = useFileSystemSync();
  const supportsFileSystemAccess = 'showOpenFilePicker' in window;

  useEffect(() => {
    if (fileHandle) {
      document.title = `OneFileTasks - ${fileHandle.name}`;
    } else {
      document.title = 'OneFileTasks';
    }
  }, [fileHandle]);

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

  const { undoStackRef, canUndo, canRedo, pushHistory, undo, redo, removeLastUndoAction } = useTaskHistory(syncToFile, fileHandle);

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

  // Auto-sync effect
  useEffect(() => {
    if (fileHandle && allTasks.length > 0 && syncStatus !== 'needs_permission') {
      const timeout = setTimeout(() => {
        syncToFile();
      }, settings.autoSaveInterval * 60 * 1000); // Debounce sync based on settings
      return () => clearTimeout(timeout);
    }
  }, [allTasks, fileHandle, syncStatus, settings.autoSaveInterval]);

  const {
    fullTree,
    filteredTree,
    visibleTasks,
    getTaskPath,
    getTaskColor,
    isTaskActive
  } = useTaskTree(allTasks, currentView, completedFilter, searchQuery, settings, expandedIds);

  const {
    addTask,
    handleBulkAdd,
    updateTask,
    toggleComplete,
    requestDelete,
    executeDelete,
    confirmDelete,
    toggleExpand,
    handleDrop
  } = useTaskActions({
    allTasks,
    pushHistory,
    setSelectedTaskId,
    setEditingTaskId,
    setNewTaskBeingEdited,
    setExpandedIds,
    setQuickAddModalOpen,
    hideDeleteWarning,
    tasksToDelete,
    setTasksToDelete,
    selectedTaskIds,
    setSelectedTaskIds,
    visibleTasks,
    draggedId,
    dropTarget,
    setDropTarget,
    setDraggedId
  });

  const selectedTask = useMemo(() => allTasks.find(t => t.id === selectedTaskId), [allTasks, selectedTaskId]);

  useKeyboardShortcuts({
    selectedTaskId,
    allTasks,
    visibleTasks,
    expandedIds,
    selectedTaskIds,
    currentView,
    addTask,
    toggleComplete,
    setQuickAddModalOpen,
    requestDelete,
    setEditingTaskId,
    setSelectedTaskId,
    setSelectedTaskIds,
    setLastSelectedId,
    toggleExpand
  });

  const renderTaskNode = (node: TaskNode, depth: number = 0) => {
    return (
      <TaskListItem
        key={node.id}
        node={node}
        depth={depth}
        allTasks={allTasks}
        visibleTasks={visibleTasks}
        expandedIds={expandedIds}
        selectedTaskIds={selectedTaskIds}
        selectedTaskId={selectedTaskId}
        editingTaskId={editingTaskId}
        currentView={currentView}
        settings={settings}
        draggedId={draggedId}
        dropTarget={dropTarget}
        newTaskBeingEdited={newTaskBeingEdited}
        lastSelectedId={lastSelectedId}
        getTaskColor={getTaskColor}
        isTaskActive={isTaskActive}
        setDraggedId={setDraggedId}
        setDropTarget={setDropTarget}
        setSelectedTaskIds={setSelectedTaskIds}
        setSelectedTaskId={setSelectedTaskId}
        setLastSelectedId={setLastSelectedId}
        setCurrentView={setCurrentView}
        setExpandedIds={setExpandedIds}
        setPropertiesCollapsed={setPropertiesCollapsed}
        setEditingTaskId={setEditingTaskId}
        setNewTaskBeingEdited={setNewTaskBeingEdited}
        handleDrop={handleDrop}
        toggleExpand={toggleExpand}
        toggleComplete={toggleComplete}
        addTask={addTask}
        requestDelete={requestDelete}
        updateTask={updateTask}
        undoStackRef={undoStackRef}
        removeLastUndoAction={removeLastUndoAction}
      />
    );
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      
      <Sidebar
        settings={settings}
        currentView={currentView}
        setCurrentView={setCurrentView}
        setQuickAddModalOpen={setQuickAddModalOpen}
        setHelpModalOpen={setHelpModalOpen}
        setSettingsModalOpen={setSettingsModalOpen}
        undo={undo}
        canUndo={canUndo}
        redo={redo}
        canRedo={canRedo}
        supportsFileSystemAccess={supportsFileSystemAccess}
        fileHandle={fileHandle}
        syncStatus={syncStatus}
        requestPermissionAndSync={requestPermissionAndSync}
        unlinkFile={unlinkFile}
        linkFile={linkFile}
        createNewFile={createNewFile}
        manualExport={manualExport}
        manualImport={manualImport}
      />

      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950",
        selectedTask ? "hidden md:flex" : "flex"
      )}>
        <TopBar
          currentView={currentView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          completedFilter={completedFilter}
          setCompletedFilter={setCompletedFilter}
          settings={settings}
          addTask={addTask}
          selectedTaskId={selectedTaskId}
        />

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
        <TaskDetails
          selectedTask={selectedTask}
          updateTask={updateTask}
          detailsWidth={detailsWidth}
          setDetailsWidth={setDetailsWidth}
          setSelectedTaskId={setSelectedTaskId}
          propertiesCollapsed={propertiesCollapsed}
          setPropertiesCollapsed={setPropertiesCollapsed}
          setRecurrenceModalOpen={setRecurrenceModalOpen}
          settings={settings}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        tasksToDelete={tasksToDelete}
        hideDeleteWarning={hideDeleteWarning}
        setHideDeleteWarning={setHideDeleteWarning}
        setTasksToDelete={setTasksToDelete}
        confirmDelete={confirmDelete}
      />

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
