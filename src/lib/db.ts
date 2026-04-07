import Dexie, { type Table } from 'dexie';
import { Task } from '../types';

export class TaskDatabase extends Dexie {
  tasks!: Table<Task, string>;

  constructor() {
    super('OneFileTasksDB');
    this.version(1).stores({
      tasks: 'id, parentId, isCompleted, isProject, isFolder, dueDate, priority, order, startDate, hideBranchInTodo, completeInOrder'
    });
  }
}

export const db = new TaskDatabase();
