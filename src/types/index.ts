export type RecurrencePattern = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceConfig {
  pattern: RecurrencePattern;
  interval: number;
  daysOfWeek: number[]; // 0=Sun, 1=Mon...
  endType: 'none' | 'after_occurrences' | 'by_date';
  endOccurrences: number;
  endDate: number | null;
}

export interface AppSettings {
  weekStart: 'monday' | 'sunday';
  autoHideCompletedDays: number; // 0 means never
  density: 'compact' | 'expanded';
  useContexts: boolean;
  theme: 'light' | 'dark' | 'auto';
  accentColor: string;
  defaultView: 'next-actions' | 'projects' | 'contexts' | 'all';
}

export const DEFAULT_SETTINGS: AppSettings = {
  weekStart: 'monday',
  autoHideCompletedDays: 1,
  density: 'compact',
  useContexts: true,
  theme: 'auto',
  accentColor: 'emerald',
  defaultView: 'all',
};

export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  notes: string;
  isCompleted: boolean;
  isProject: boolean;
  isFolder: boolean;
  contexts: string[];
  startDate: number | null;
  dueDate: number | null;
  priority: 'low' | 'normal' | 'high';
  createdAt: number;
  updatedAt: number;
  order: number;
  hideBranchInTodo: boolean;
  completeInOrder: boolean;
  inheritContexts?: boolean;
  backgroundColor?: string;
  recurrence?: RecurrenceConfig;
}

export type TaskNode = Task & { children: TaskNode[] };
export type ViewType = 'next-actions' | 'projects' | 'all' | 'contexts';
