import { useEffect } from 'react';
import { type TaskNode, type ViewType } from '../types';

interface UseKeyboardShortcutsProps {
  selectedTaskId: string | null;
  allTasks: any[]; // Using any to avoid circular dependency if not needed, or import Task
  visibleTasks: TaskNode[];
  expandedIds: Set<string>;
  selectedTaskIds: Set<string>;
  currentView: ViewType;
  addTask: (parentId: string | null, insertAfterId: string | null) => void;
  toggleComplete: (task: TaskNode) => void;
  setQuickAddModalOpen: (open: boolean) => void;
  requestDelete: (id: string) => void;
  setEditingTaskId: (id: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  setSelectedTaskIds: (ids: Set<string>) => void;
  setLastSelectedId: (id: string | null) => void;
  toggleExpand: (id: string) => void;
}

export function useKeyboardShortcuts({
  selectedTaskId,
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
}: UseKeyboardShortcutsProps) {
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
          addTask(null, null);
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
  }, [
    selectedTaskId, 
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
  ]);
}
