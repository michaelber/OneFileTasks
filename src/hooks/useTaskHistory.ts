import { useState, useRef } from 'react';
import { db } from '../lib/db';
import { type Task } from '../types';

export type HistoryAction = 
  | { type: 'ADD', task: Task, timestamp: number }
  | { type: 'UPDATE', id: string, oldTask: Task, newTask: Task, timestamp: number }
  | { type: 'DELETE', tasks: Task[], timestamp: number }
  | { type: 'BULK_UPDATE', updates: { oldTask: Task, newTask: Task }[], timestamp: number }
  | { type: 'COMPOSITE', actions: HistoryAction[], timestamp: number };

export function useTaskHistory() {
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

  const removeLastUndoAction = () => {
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setCanUndo(undoStackRef.current.length > 0);
  };

  return {
    undoStackRef,
    redoStackRef,
    canUndo,
    canRedo,
    pushHistory,
    undo,
    redo,
    removeLastUndoAction
  };
}
