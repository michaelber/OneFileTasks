import { useMemo, useCallback } from 'react';
import { type Task, type TaskNode, type ViewType, type AppSettings } from '../types';

export function useTaskTree(
  allTasks: Task[],
  currentView: ViewType,
  completedFilter: 'show_all' | 'hide_all' | 'hide_old',
  searchQuery: string,
  settings: AppSettings,
  expandedIds: Set<string>
) {
  const buildTree = useCallback((tasks: Task[], parentId: string | null = null, inheritedContexts: string[] = []): TaskNode[] => {
    return tasks
      .filter(t => t.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map(t => {
        const effectiveContexts = Array.from(new Set([...(t.contexts || []), ...inheritedContexts]));
        const nextInheritedContexts = t.inheritContexts ? effectiveContexts : inheritedContexts;
        return { 
          ...t, 
          contexts: effectiveContexts,
          children: buildTree(tasks, t.id, nextInheritedContexts) 
        };
      });
  }, []);

  const fullTree = useMemo(() => buildTree(allTasks), [allTasks, buildTree]);

  const filteredTree = useMemo(() => {
    const taskMap = new Map<string, Task>();
    allTasks.forEach(t => taskMap.set(t.id, t));

    const isHiddenInTodo = (taskId: string): boolean => {
      let current = taskMap.get(taskId);
      while (current) {
        if (current.hideBranchInTodo) return true;
        current = current.parentId ? taskMap.get(current.parentId) : undefined;
      }
      return false;
    };

    const isNextAction = (task: Task): boolean => {
      if (isHiddenInTodo(task.id)) return false;
      if (task.startDate && task.startDate > Date.now()) return false;

      const children = allTasks.filter(c => c.parentId === task.id).sort((a, b) => a.order - b.order);
      const uncompletedChildren = children.filter(c => !c.isCompleted);
      
      if (uncompletedChildren.length > 0) {
        return false;
      }

      if (task.parentId) {
        const parent = taskMap.get(task.parentId);
        if (parent && parent.completeInOrder) {
          const siblings = allTasks.filter(c => c.parentId === parent.id).sort((a, b) => a.order - b.order);
          const firstUncompleted = siblings.find(c => !c.isCompleted);
          if (!task.isCompleted && firstUncompleted && firstUncompleted.id !== task.id) {
            return false;
          }
        }
      }

      return true;
    };

    const applyCompletedFilter = (nodes: TaskNode[]): TaskNode[] => {
      if (completedFilter === 'show_all') return nodes;
      
      const hideOldDays = settings.autoHideCompletedDays > 0 ? settings.autoHideCompletedDays : 7;
      const oldThreshold = Date.now() - hideOldDays * 24 * 60 * 60 * 1000;

      return nodes.filter(t => {
        if (t.isCompleted) {
          if (completedFilter === 'hide_all') return false;
          if (completedFilter === 'hide_old' && t.updatedAt < oldThreshold) return false;
        }
        return true;
      }).map(t => ({ ...t, children: applyCompletedFilter(t.children) }));
    };

    let baseNodes: TaskNode[] = [];

    const flattenTree = (nodes: TaskNode[]): TaskNode[] => {
      return nodes.reduce((acc: TaskNode[], node) => {
        acc.push(node);
        return acc.concat(flattenTree(node.children));
      }, []);
    };

    const allNodes = flattenTree(fullTree);

    const getPriorityValue = (p: string) => p === 'high' ? 3 : p === 'normal' ? 2 : 1;
    const sortLikeNextActions = (a: TaskNode, b: TaskNode) => {
      if (a.dueDate && b.dueDate) {
        if (a.dueDate !== b.dueDate) return a.dueDate - b.dueDate;
      } else if (a.dueDate) {
        return -1;
      } else if (b.dueDate) {
        return 1;
      }
      
      const pA = getPriorityValue(a.priority);
      const pB = getPriorityValue(b.priority);
      if (pA !== pB) return pB - pA;

      const parentA = a.parentId || '';
      const parentB = b.parentId || '';
      if (parentA !== parentB) {
        return parentA.localeCompare(parentB);
      }

      return a.createdAt - b.createdAt;
    };

    if (currentView === 'all') {
      baseNodes = fullTree;
    } else if (currentView === 'next-actions') {
      baseNodes = allNodes
        .filter(t => !t.isFolder && isNextAction(t))
        .sort(sortLikeNextActions)
        .map(t => ({ ...t, children: [] }));
    } else if (currentView === 'projects') {
      baseNodes = allNodes.filter(t => t.isProject && !t.isCompleted);
    } else if (currentView === 'contexts') {
      const contextsMap = new Map<string, TaskNode[]>();
      const noContextTasks: TaskNode[] = [];

      allNodes.forEach(task => {
        if ((task.isFolder || task.isProject) && task.children.length > 0) {
          return;
        }

        const node: TaskNode = { ...task, children: [] };
        
        if (!task.contexts || task.contexts.length === 0) {
          noContextTasks.push(node);
        } else {
          task.contexts.forEach(ctx => {
            if (!contextsMap.has(ctx)) contextsMap.set(ctx, []);
            contextsMap.get(ctx)!.push({ ...node });
          });
        }
      });

      const contextNodes: TaskNode[] = [];
      Array.from(contextsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ctx, tasks], index) => {
        contextNodes.push({
          id: `context-${ctx}`,
          parentId: null,
          title: ctx,
          notes: '',
          isCompleted: false,
          isProject: false,
          isFolder: true,
          contexts: [],
          startDate: null,
          dueDate: null,
          priority: 'normal',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          order: index,
          hideBranchInTodo: false,
          completeInOrder: false,
          children: tasks.sort(sortLikeNextActions)
        });
      });

      if (noContextTasks.length > 0) {
        contextNodes.push({
          id: `context-none`,
          parentId: null,
          title: 'No Context',
          notes: '',
          isCompleted: false,
          isProject: false,
          isFolder: true,
          contexts: [],
          startDate: null,
          dueDate: null,
          priority: 'normal',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          order: contextNodes.length,
          hideBranchInTodo: false,
          completeInOrder: false,
          children: noContextTasks.sort(sortLikeNextActions)
        });
      }
      baseNodes = contextNodes;
    }

    let finalNodes = applyCompletedFilter(baseNodes);
    if (currentView === 'contexts') {
      finalNodes = finalNodes.filter(n => n.children.length > 0);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const searchFilter = (nodes: TaskNode[]): TaskNode[] | null => {
        const result: TaskNode[] = [];
        for (const node of nodes) {
          const matches = node.title.toLowerCase().includes(query) || node.notes.toLowerCase().includes(query);
          const filteredChildren = searchFilter(node.children);
          
          if (matches || (filteredChildren && filteredChildren.length > 0)) {
            result.push({
              ...node,
              children: filteredChildren || []
            });
          }
        }
        return result.length > 0 ? result : null;
      };
      
      finalNodes = searchFilter(finalNodes) || [];
    }

    return finalNodes;
  }, [allTasks, currentView, fullTree, completedFilter, searchQuery, settings.autoHideCompletedDays]);

  const visibleTasks = useMemo(() => {
    const result: TaskNode[] = [];
    const traverse = (nodes: TaskNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (expandedIds.has(node.id) && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(filteredTree);
    return result;
  }, [filteredTree, expandedIds]);

  const getTaskPath = useCallback((taskId: string): string => {
    let path: string[] = [];
    let current = allTasks.find(t => t.id === taskId);
    while (current && current.parentId) {
      const parent = allTasks.find(t => t.id === current!.parentId);
      if (parent) {
        path.unshift(parent.title);
        current = parent;
      } else {
        break;
      }
    }
    return path.join(' / ');
  }, [allTasks]);

  const getTaskColor = useCallback((taskId: string): string | undefined => {
    let current = allTasks.find(t => t.id === taskId);
    while (current) {
      if (current.backgroundColor) return current.backgroundColor;
      if (!current.parentId) break;
      current = allTasks.find(t => t.id === current!.parentId);
    }
    return undefined;
  }, [allTasks]);

  const isTaskActive = useCallback((task: TaskNode): boolean => {
    if (task.isCompleted) return false;
    if (task.isProject || task.isFolder || task.id.startsWith('context-')) return false;

    let current: Task | undefined = task;
    while (current) {
      if (current.hideBranchInTodo) return false;
      current = current.parentId ? allTasks.find(t => t.id === current!.parentId) : undefined;
    }

    if (task.startDate) {
      const start = new Date(task.startDate);
      start.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start.getTime() > today.getTime()) {
        return false;
      }
    }

    if (task.parentId) {
      const parent = allTasks.find(t => t.id === task.parentId);
      if (parent && parent.completeInOrder) {
        const siblings = allTasks.filter(t => t.parentId === task.parentId).sort((a, b) => a.order - b.order);
        for (const sibling of siblings) {
          if (sibling.id === task.id) {
            break;
          }
          if (!sibling.isCompleted) {
            return false;
          }
        }
      }
    }

    return true;
  }, [allTasks]);

  return {
    fullTree,
    filteredTree,
    visibleTasks,
    getTaskPath,
    getTaskColor,
    isTaskActive
  };
}
