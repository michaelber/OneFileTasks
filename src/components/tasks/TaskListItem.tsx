import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isToday, isTomorrow, isYesterday, differenceInDays, startOfDay } from 'date-fns';
import {
  ChevronRight, ChevronDown, Plus, Folder, Briefcase,
  AlignLeft, Flag, Trash2, CheckSquare, Square, Tag, Repeat
} from 'lucide-react';
import { type TaskNode, type ViewType, type AppSettings, type Task } from '../../types';
import { cn } from '../../lib/utils';
import { db } from '../../lib/db';

interface TaskListItemProps {
  node: TaskNode;
  depth?: number;
  allTasks: Task[];
  visibleTasks: TaskNode[];
  expandedIds: Set<string>;
  selectedTaskIds: Set<string>;
  selectedTaskId: string | null;
  editingTaskId: string | null;
  currentView: ViewType;
  settings: AppSettings;
  draggedId: string | null;
  dropTarget: { id: string, position: 'before' | 'after' | 'inside' } | null;
  newTaskBeingEdited: string | null;
  lastSelectedId: string | null;
  
  getTaskColor: (taskId: string) => string;
  isTaskActive: (node: TaskNode) => boolean;
  
  setDraggedId: (id: string | null) => void;
  setDropTarget: (target: { id: string, position: 'before' | 'after' | 'inside' } | null) => void;
  setSelectedTaskIds: (ids: Set<string>) => void;
  setSelectedTaskId: (id: string | null) => void;
  setLastSelectedId: (id: string | null) => void;
  setCurrentView: (view: ViewType) => void;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setPropertiesCollapsed: (collapsed: boolean) => void;
  setEditingTaskId: (id: string | null) => void;
  setNewTaskBeingEdited: (id: string | null) => void;
  
  handleDrop: (e: React.DragEvent, targetNode: TaskNode) => void;
  toggleExpand: (id: string) => void;
  toggleComplete: (task: TaskNode) => void;
  addTask: (parentId: string | null, insertAfterId?: string | null) => void;
  requestDelete: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  
  undoStackRef: React.MutableRefObject<any[]>;
  removeLastUndoAction: () => void;
}

export function TaskListItem({
  node,
  depth = 0,
  allTasks,
  visibleTasks,
  expandedIds,
  selectedTaskIds,
  selectedTaskId,
  editingTaskId,
  currentView,
  settings,
  draggedId,
  dropTarget,
  newTaskBeingEdited,
  lastSelectedId,
  getTaskColor,
  isTaskActive,
  setDraggedId,
  setDropTarget,
  setSelectedTaskIds,
  setSelectedTaskId,
  setLastSelectedId,
  setCurrentView,
  setExpandedIds,
  setPropertiesCollapsed,
  setEditingTaskId,
  setNewTaskBeingEdited,
  handleDrop,
  toggleExpand,
  toggleComplete,
  addTask,
  requestDelete,
  updateTask,
  undoStackRef,
  removeLastUndoAction
}: TaskListItemProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedTaskIds.has(node.id) || selectedTaskId === node.id;
  const isEditing = editingTaskId === node.id;
  const isProjectOrFolder = node.isProject || node.isFolder;
  const isContextNode = node.id.startsWith('context-');
  const taskColor = getTaskColor(node.id);

  const hasUncompletedDescendants = (n: TaskNode): boolean => {
    return n.children.some(c => !c.isCompleted || hasUncompletedDescendants(c));
  };
  const canComplete = !(isProjectOrFolder && hasUncompletedDescendants(node)) && !isContextNode;

  let parentProjectOrFolder = '';
  if ((currentView === 'next-actions' || currentView === 'contexts') && node.parentId) {
    let curr = allTasks.find(t => t.id === node.parentId);
    while (curr) {
      if (curr.isProject || curr.isFolder) {
        parentProjectOrFolder = curr.title;
        break;
      }
      curr = allTasks.find(t => t.id === curr!.parentId);
    }
  }

  return (
    <div className={cn("flex flex-col", isProjectOrFolder && "my-0.5")}>
      <div 
        draggable={!isEditing && currentView !== 'contexts'}
        onDragStart={(e) => {
          e.stopPropagation();
          setDraggedId(node.id);
          if (!selectedTaskIds.has(node.id)) {
            setSelectedTaskIds(new Set([node.id]));
            setSelectedTaskId(node.id);
            setLastSelectedId(node.id);
          }
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (currentView === 'contexts') return;
          if (selectedTaskIds.has(node.id)) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - rect.top;
          let position: 'before'|'after'|'inside' = 'inside';
          if (y < rect.height * 0.25) position = 'before';
          else if (y > rect.height * 0.75) position = 'after';
          setDropTarget({ id: node.id, position });
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => handleDrop(e, node)}
        onDragEnd={() => {
          setDraggedId(null);
          setDropTarget(null);
        }}
        className={cn(
          "group rounded-md cursor-pointer text-sm transition-colors relative leading-tight overflow-hidden",
          settings.density === 'compact' ? "py-0.5 px-2" : "py-2 px-3",
          isSelected ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
          dropTarget?.id === node.id && dropTarget.position === 'before' && "border-t-2 border-accent-500",
          dropTarget?.id === node.id && dropTarget.position === 'after' && "border-b-2 border-accent-500",
          dropTarget?.id === node.id && dropTarget.position === 'inside' && "bg-accent-100 dark:bg-accent-900/30",
          isProjectOrFolder && "font-medium",
          selectedTaskIds.has(node.id) && draggedId && "opacity-50"
        )}
        style={{ 
          paddingLeft: `${depth * 1.5 + 0.5}rem`,
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (currentView === 'next-actions') {
            setCurrentView('all');
            let current = allTasks.find(t => t.id === node.id);
            const parentsToExpand = new Set<string>();
            while (current && current.parentId) {
              parentsToExpand.add(current.parentId);
              current = allTasks.find(t => t.id === current!.parentId);
            }
            if (parentsToExpand.size > 0) {
              setExpandedIds(prev => new Set([...prev, ...parentsToExpand]));
            }
            setSelectedTaskId(node.id);
            setSelectedTaskIds(new Set([node.id]));
            setLastSelectedId(node.id);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey && lastSelectedId) {
            const visibleIds = visibleTasks.map(t => t.id);
            const startIdx = visibleIds.indexOf(lastSelectedId);
            const endIdx = visibleIds.indexOf(node.id);
            if (startIdx !== -1 && endIdx !== -1) {
              const min = Math.min(startIdx, endIdx);
              const max = Math.max(startIdx, endIdx);
              const newSelection = new Set(selectedTaskIds);
              for (let i = min; i <= max; i++) {
                newSelection.add(visibleIds[i]);
              }
              setSelectedTaskIds(newSelection);
            }
          } else if (e.metaKey || e.ctrlKey) {
            const newSelection = new Set(selectedTaskIds);
            if (newSelection.has(node.id)) {
              newSelection.delete(node.id);
              if (selectedTaskId === node.id) {
                setSelectedTaskId(newSelection.size > 0 ? Array.from(newSelection)[newSelection.size - 1] : null);
              }
            } else {
              newSelection.add(node.id);
              setSelectedTaskId(node.id);
            }
            setSelectedTaskIds(newSelection);
            setLastSelectedId(node.id);
          } else {
            setSelectedTaskId(node.id);
            setSelectedTaskIds(new Set([node.id]));
            setLastSelectedId(node.id);
            setPropertiesCollapsed(false);
          }
        }}
      >
        {taskColor && (
          <div 
            className="absolute inset-0 opacity-[0.6] pointer-events-none" 
            style={{ backgroundColor: taskColor }} 
          />
        )}
        <div className="flex items-center relative z-10">
          <div 
            className={cn(
              "flex items-center justify-center w-5 h-5 mr-1 shrink-0",
              hasChildren ? "cursor-pointer text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" : "opacity-0"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
          >
            {hasChildren && (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            )}
          </div>
          
          {canComplete && (
            <div 
              className={cn(
                "mr-2 cursor-pointer shrink-0 transition-colors",
                node.isCompleted ? "text-accent-500" : "text-zinc-300 hover:text-accent-500 dark:text-zinc-600"
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleComplete(node);
              }}
            >
              {node.isCompleted ? <CheckSquare size={16} /> : <Square size={16} />}
            </div>
          )}

          {isEditing ? (
            <input
              autoFocus
              onFocus={(e) => e.target.select()}
              defaultValue={node.title}
              onBlur={(e) => {
                if (newTaskBeingEdited === node.id && e.target.value.trim() === '') {
                  db.tasks.delete(node.id);
                  if (undoStackRef.current.length > 0) {
                    const lastAction = undoStackRef.current[undoStackRef.current.length - 1];
                    if (lastAction.type === 'ADD' && lastAction.task.id === node.id) {
                      removeLastUndoAction();
                    }
                  }
                } else {
                  updateTask(node.id, { title: e.target.value });
                }
                setEditingTaskId(null);
                setNewTaskBeingEdited(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateTask(node.id, { title: e.currentTarget.value });
                  setEditingTaskId(null);
                  setNewTaskBeingEdited(null);
                } else if (e.key === 'Escape') {
                  if (newTaskBeingEdited === node.id) {
                    db.tasks.delete(node.id);
                    if (undoStackRef.current.length > 0) {
                      const lastAction = undoStackRef.current[undoStackRef.current.length - 1];
                      if (lastAction.type === 'ADD' && lastAction.task.id === node.id) {
                        removeLastUndoAction();
                      }
                    }
                  }
                  setEditingTaskId(null);
                  setNewTaskBeingEdited(null);
                }
              }}
              className="flex-1 bg-white dark:bg-zinc-900 border border-accent-500 px-1 rounded text-sm outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex-1 flex items-center min-w-0">
              {node.isFolder && !isContextNode && <Folder size={14} className="mr-1.5 text-yellow-500 dark:text-yellow-400 shrink-0" />}
              {node.isProject && <Briefcase size={14} className="mr-1.5 text-blue-500 dark:text-blue-400 shrink-0" />}
              {node.recurrence && <Repeat size={12} className="mr-1.5 text-accent-500 shrink-0" />}
              {isContextNode && <Tag size={14} className="mr-1.5 text-purple-500 dark:text-purple-400 shrink-0" />}
              <span 
                className={cn(
                  "truncate cursor-text",
                  node.isCompleted ? "line-through text-zinc-400" : (isTaskActive(node) ? "text-accent-600 dark:text-accent-400" : ""),
                  isProjectOrFolder && "font-semibold"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isContextNode) {
                    if (window.innerWidth >= 768) {
                      setEditingTaskId(node.id);
                    }
                  }
                  setSelectedTaskId(node.id);
                }}
              >
                {(currentView === 'next-actions' || currentView === 'contexts') && parentProjectOrFolder && !isContextNode ? (
                  <><span className="text-zinc-500 dark:text-zinc-400 font-normal">[{parentProjectOrFolder}]</span> - {node.title || 'Untitled Task'}</>
                ) : (
                  node.title || 'Untitled Task'
                )}
              </span>
              {node.priority === 'high' && !isContextNode && (
                <Flag size={14} className="ml-2 text-red-500 shrink-0 fill-current" />
              )}
              {node.notes && node.notes.trim() !== '' && !isContextNode && (
                <AlignLeft 
                  size={14} 
                  className="ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0 cursor-pointer" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTaskId(node.id);
                    setPropertiesCollapsed(true);
                    
                    // Focus the rich text editor if possible
                    setTimeout(() => {
                      const editor = document.querySelector('.ProseMirror') as HTMLElement;
                      if (editor) editor.focus();
                    }, 50);
                  }}
                  title="View Notes"
                />
              )}
            </div>
          )}

        {settings.useContexts && node.contexts.length > 0 && !isEditing && !isContextNode && (
          <div className="flex gap-1 mr-2">
            {node.contexts.map(ctx => (
              <span key={ctx} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300">
                @{ctx}
              </span>
            ))}
          </div>
        )}

        {node.dueDate && !isEditing && !isContextNode && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium mr-2",
            isPast(node.dueDate) && !isToday(node.dueDate) ? "bg-red-500 text-white" : 
            (isToday(node.dueDate) || isTomorrow(node.dueDate)) ? "bg-yellow-500 text-yellow-950" : 
            "text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
          )}>
            {(() => {
              if (isToday(node.dueDate)) return 'Today';
              if (isTomorrow(node.dueDate)) return 'Tomorrow';
              if (isYesterday(node.dueDate)) return 'Yesterday';
              const daysDiff = differenceInDays(startOfDay(node.dueDate), startOfDay(new Date()));
              if (daysDiff > 1 && daysDiff < 30) return `in ${daysDiff} days`;
              return format(node.dueDate, 'dd.MM.yyyy');
            })()}
          </span>
        )}

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
          {currentView !== 'next-actions' && currentView !== 'contexts' && !isContextNode && (
            <button 
              className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              onClick={(e) => { e.stopPropagation(); addTask(node.id); }}
              title="Add Subtask"
            >
              <Plus size={14} />
            </button>
          )}
          {!isContextNode && (
            <button 
              className="p-1 text-zinc-400 hover:text-red-500"
              onClick={(e) => { e.stopPropagation(); requestDelete(node.id); }}
              title="Delete Task"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      </div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children.map(child => (
              <TaskListItem
                key={child.id}
                node={child}
                depth={depth + 1}
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
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
