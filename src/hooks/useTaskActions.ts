import React, { useCallback } from 'react';
import { db } from '../lib/db';
import { type Task, type TaskNode } from '../types';
import { type HistoryAction } from './useTaskHistory';
import { generateId } from '../lib/utils';

interface UseTaskActionsProps {
  allTasks: Task[];
  pushHistory: (action: HistoryAction) => void;
  setSelectedTaskId: (id: string | null) => void;
  setEditingTaskId: (id: string | null) => void;
  setNewTaskBeingEdited: (id: string | null) => void;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setQuickAddModalOpen: (open: boolean) => void;
  hideDeleteWarning: boolean;
  tasksToDelete: string[] | null;
  setTasksToDelete: (ids: string[] | null) => void;
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: (ids: Set<string>) => void;
  visibleTasks: TaskNode[];
  draggedId: string | null;
  dropTarget: { id: string, position: 'before' | 'after' | 'inside' } | null;
  setDropTarget: (target: { id: string, position: 'before' | 'after' | 'inside' } | null) => void;
  setDraggedId: (id: string | null) => void;
}

export function useTaskActions({
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
}: UseTaskActionsProps) {

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
      if (updates.startDate !== undefined && updates.dueDate === undefined) {
        // Start date was moved forward alone, push due date forward
        finalDueDate = finalStartDate;
      } else if (updates.dueDate !== undefined && updates.startDate === undefined) {
        // Due date was moved backward alone, push start date backward
        finalStartDate = finalDueDate;
      } else {
        // Both updated or other case, default to start date taking precedence
        finalDueDate = finalStartDate;
      }
    }

    const finalUpdates = {
      ...updates,
      startDate: finalStartDate,
      dueDate: finalDueDate
    };

    const newTask = { ...oldTask, ...finalUpdates, updatedAt: Date.now() };
    
    const compositeActions: HistoryAction[] = [];
    const isDateUpdate = updates.startDate !== undefined || updates.dueDate !== undefined;

    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.update(id, { ...finalUpdates, updatedAt: Date.now() });
      compositeActions.push({ type: 'UPDATE', id, oldTask, newTask, timestamp: Date.now() });
      
      if (isDateUpdate) {
        const propagate = async (parentId: string, pStart: number | null, pDue: number | null) => {
          const children = allTasks.filter(t => t.parentId === parentId);
          for (const child of children) {
            let childUpdates: Partial<Task> = {};
            let needsUpdate = false;
            
            if (pStart !== null && child.startDate === null) {
              childUpdates.startDate = pStart;
              needsUpdate = true;
            }
            if (pDue !== null && child.dueDate === null) {
              childUpdates.dueDate = pDue;
              needsUpdate = true;
            }
            
            if (needsUpdate) {
              const updatedChild = { 
                ...child, 
                startDate: childUpdates.startDate !== undefined ? childUpdates.startDate : child.startDate,
                dueDate: childUpdates.dueDate !== undefined ? childUpdates.dueDate : child.dueDate,
                updatedAt: Date.now() 
              };
              await db.tasks.update(child.id, updatedChild);
              compositeActions.push({ type: 'UPDATE', id: child.id, oldTask: child, newTask: updatedChild, timestamp: Date.now() });
              
              await propagate(child.id, updatedChild.startDate, updatedChild.dueDate);
            }
          }
        };
        
        await propagate(id, newTask.startDate, newTask.dueDate);
      }
    });

    if (compositeActions.length > 1) {
      pushHistory({ type: 'COMPOSITE', actions: compositeActions, timestamp: Date.now() });
    } else {
      pushHistory(compositeActions[0]);
    }
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
    const selectedTaskId = Array.from(selectedTaskIds)[0] || null;
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

  const handleDrop = async (
    e: React.DragEvent, 
    targetNode: TaskNode
  ) => {
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

  return {
    addTask,
    handleBulkAdd,
    updateTask,
    toggleComplete,
    requestDelete,
    executeDelete,
    confirmDelete,
    toggleExpand,
    handleDrop
  };
}
