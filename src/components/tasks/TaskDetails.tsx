import React from 'react';
import { format } from 'date-fns';
import { 
  ChevronRight, ChevronDown, Folder, Briefcase, Play, Clock, 
  Repeat, Flag, Tag, EyeOff, ListOrdered, Palette, X 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Task, AppSettings } from '../../types';
import { RichTextEditor } from './RichTextEditor';

interface TaskDetailsProps {
  selectedTask: Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  detailsWidth: number;
  setDetailsWidth: (width: number) => void;
  setSelectedTaskId: (id: string | null) => void;
  propertiesCollapsed: boolean;
  setPropertiesCollapsed: (collapsed: boolean) => void;
  setRecurrenceModalOpen: (open: boolean) => void;
  settings: AppSettings;
}

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  selectedTask,
  updateTask,
  detailsWidth,
  setDetailsWidth,
  setSelectedTaskId,
  propertiesCollapsed,
  setPropertiesCollapsed,
  setRecurrenceModalOpen,
  settings
}) => {
  const touchStartXRef = React.useRef<number | null>(null);
  const touchCurrentXRef = React.useRef<number | null>(null);
  const startDateRef = React.useRef<HTMLInputElement>(null);
  const dueDateRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (startDateRef.current && document.activeElement !== startDateRef.current) {
      startDateRef.current.value = selectedTask.startDate ? format(selectedTask.startDate, 'yyyy-MM-dd') : '';
    }
    if (dueDateRef.current && document.activeElement !== dueDateRef.current) {
      dueDateRef.current.value = selectedTask.dueDate ? format(selectedTask.dueDate, 'yyyy-MM-dd') : '';
    }
  }, [selectedTask.id, selectedTask.startDate, selectedTask.dueDate]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchCurrentXRef.current !== null) {
      const diff = touchCurrentXRef.current - touchStartXRef.current;
      // If swiped right by more than 100px, close it
      if (diff > 100) {
        setSelectedTaskId(null);
      }
    }
    touchStartXRef.current = null;
    touchCurrentXRef.current = null;
  };

  return (
    <div 
      className="border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 md:dark:bg-zinc-900/30 flex flex-col shrink-0 fixed top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] left-[env(safe-area-inset-left)] right-[env(safe-area-inset-right)] z-50 md:relative md:top-auto md:bottom-auto md:left-auto md:right-auto md:z-auto w-full md:w-[var(--details-width)]"
      style={{ '--details-width': `${detailsWidth}px` } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag Handle */}
      <div 
        className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-500/50 z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = detailsWidth;
          const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(250, Math.min(800, startWidth - (moveEvent.clientX - startX)));
            setDetailsWidth(newWidth);
          };
          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      />

      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 justify-between gap-2">
        <input
          type="text"
          value={selectedTask.title}
          onChange={(e) => updateTask(selectedTask.id, { title: e.target.value })}
          placeholder="Task title"
          className="flex-1 min-w-0 bg-transparent text-lg font-semibold focus:outline-none placeholder-zinc-400"
        />
        <button 
          onClick={() => setSelectedTaskId(null)}
          className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Properties */}
        <div>
          <button 
            onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 hover:text-zinc-700 dark:hover:text-zinc-300 w-full text-left"
          >
            {propertiesCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            Properties
          </button>
          
          {!propertiesCollapsed && (
            <div className="space-y-3 mt-3">
              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.isFolder}
                  onChange={(e) => updateTask(selectedTask.id, { isFolder: e.target.checked, isProject: e.target.checked ? false : selectedTask.isProject })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <Folder size={16} className="text-yellow-500 dark:text-yellow-400" /> Is Folder
                </span>
              </label>

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.isProject}
                  onChange={(e) => updateTask(selectedTask.id, { isProject: e.target.checked, isFolder: e.target.checked ? false : selectedTask.isFolder })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <Briefcase size={16} className="text-blue-500 dark:text-blue-400" /> Is Project
                </span>
              </label>

              <div className="flex flex-col gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <Play size={16} className="text-zinc-400" />
                    <span className="w-10 text-zinc-500">Start</span>
                    <input 
                      ref={startDateRef}
                      type="date"
                      onChange={(e) => {
                        // For date pickers, we still want immediate feedback if a full valid date is picked
                        const val = e.target.value;
                        if (val && val.length === 10) {
                          const date = new Date(val).getTime();
                          if (date !== selectedTask.startDate) {
                            updateTask(selectedTask.id, { startDate: date });
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.target.value;
                        const date = val ? new Date(val).getTime() : null;
                        if (date !== selectedTask.startDate) {
                          updateTask(selectedTask.id, { startDate: date });
                        }
                      }}
                      className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1 flex-1"
                    />
                  </div>
                  <div className="flex gap-1 ml-16">
                    <button onClick={() => {
                      const d = new Date();
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Today</button>
                    <button onClick={() => {
                      const d = selectedTask.startDate ? new Date(selectedTask.startDate) : new Date(); d.setDate(d.getDate() + 1);
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Tomorrow</button>
                    <button onClick={() => {
                      const d = selectedTask.startDate ? new Date(selectedTask.startDate) : new Date(); d.setDate(d.getDate() + 7);
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Week</button>
                    <button onClick={() => {
                      const d = selectedTask.startDate ? new Date(selectedTask.startDate) : new Date(); d.setMonth(d.getMonth() + 1);
                      updateTask(selectedTask.id, { startDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Month</button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-zinc-400" />
                    <span className="w-10 text-zinc-500">Due</span>
                    <input 
                      ref={dueDateRef}
                      type="date"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && val.length === 10) {
                          const date = new Date(val).getTime();
                          if (date !== selectedTask.dueDate) {
                            updateTask(selectedTask.id, { dueDate: date });
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.target.value;
                        const date = val ? new Date(val).getTime() : null;
                        if (date !== selectedTask.dueDate) {
                          updateTask(selectedTask.id, { dueDate: date });
                        }
                      }}
                      className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1 flex-1"
                    />
                  </div>
                  <div className="flex gap-1 ml-16">
                    <button onClick={() => {
                      const d = new Date();
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Today</button>
                    <button onClick={() => {
                      const d = selectedTask.dueDate ? new Date(selectedTask.dueDate) : new Date(); d.setDate(d.getDate() + 1);
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Tomorrow</button>
                    <button onClick={() => {
                      const d = selectedTask.dueDate ? new Date(selectedTask.dueDate) : new Date(); d.setDate(d.getDate() + 7);
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Week</button>
                    <button onClick={() => {
                      const d = selectedTask.dueDate ? new Date(selectedTask.dueDate) : new Date(); d.setMonth(d.getMonth() + 1);
                      updateTask(selectedTask.id, { dueDate: d.getTime() });
                    }} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors rounded">Next Month</button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Repeat size={16} className="text-zinc-400" />
                  <button 
                    onClick={() => setRecurrenceModalOpen(true)}
                    className="text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors text-left flex-1 border-b border-zinc-200 dark:border-zinc-800 pb-1"
                  >
                    {selectedTask.recurrence ? `Repeats ${selectedTask.recurrence.pattern}` : 'Does not repeat'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Flag size={16} className="text-zinc-400" />
                <select
                  value={selectedTask.priority}
                  onChange={(e) => updateTask(selectedTask.id, { priority: e.target.value as any })}
                  className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1"
                >
                  <option value="low">Low Priority</option>
                  <option value="normal">Normal Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>

              {settings.useContexts && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-3 text-sm">
                    <Tag size={16} className="text-zinc-400 mt-1" />
                    <div className="flex-1">
                      <input 
                        key={`context-${selectedTask.id}-${selectedTask.contexts.join(',')}`}
                        type="text"
                        placeholder="Contexts (comma separated)"
                        defaultValue={selectedTask.contexts.join(', ')}
                        onBlur={(e) => {
                          const contexts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          updateTask(selectedTask.id, { contexts });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const contexts = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean);
                            updateTask(selectedTask.id, { contexts });
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 focus:outline-none text-zinc-600 dark:text-zinc-300 pb-1"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-sm cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedTask.inheritContexts || false}
                      onChange={(e) => updateTask(selectedTask.id, { inheritContexts: e.target.checked })}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                    <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                      <Tag size={16} /> Inherit contexts to subtasks
                    </span>
                  </label>
                </div>
              )}

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.hideBranchInTodo}
                  onChange={(e) => updateTask(selectedTask.id, { hideBranchInTodo: e.target.checked })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <EyeOff size={16} /> Hide branch in Next Actions
                </span>
              </label>

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedTask.completeInOrder}
                  onChange={(e) => updateTask(selectedTask.id, { completeInOrder: e.target.checked })}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <ListOrdered size={16} /> Complete subtasks in order
                </span>
              </label>

              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 min-w-[120px]">
                  <Palette size={16} /> Background Color
                </span>
                <div className="flex gap-1 flex-wrap flex-1 items-center">
                  {[
                    { label: 'None', value: '' },
                    { label: 'Red', value: '#fee2e2' },
                    { label: 'Orange', value: '#ffedd5' },
                    { label: 'Yellow', value: '#fef3c7' },
                    { label: 'Green', value: '#dcfce7' },
                    { label: 'Blue', value: '#dbeafe' },
                    { label: 'Purple', value: '#f3e8ff' },
                    { label: 'Pink', value: '#fce7f3' },
                    { label: 'Gray', value: '#f3f4f6' },
                  ].map(color => (
                    <button
                      key={color.label}
                      onClick={() => updateTask(selectedTask.id, { backgroundColor: color.value || undefined })}
                      className={cn(
                        "w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700 transition-transform hover:scale-110 flex items-center justify-center shrink-0 relative overflow-hidden",
                        (selectedTask.backgroundColor || '') === color.value && "ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-zinc-900"
                      )}
                      title={color.label}
                    >
                      <div 
                        className="absolute inset-0 opacity-100 dark:opacity-30 pointer-events-none"
                        style={{ backgroundColor: color.value || 'transparent' }}
                      />
                      {color.value === '' && <X size={12} className="text-zinc-400 relative z-10" />}
                    </button>
                  ))}
                  <div 
                    className="relative w-6 h-6 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700 transition-transform hover:scale-110 flex items-center justify-center shrink-0 ml-1" 
                    title="Custom Color"
                    style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                  >
                    <Palette size={12} className="text-white drop-shadow-md pointer-events-none" />
                    <input
                      type="color"
                      value={selectedTask.backgroundColor || '#ffffff'}
                      onChange={(e) => updateTask(selectedTask.id, { backgroundColor: e.target.value })}
                      className="absolute inset-[-8px] w-10 h-10 cursor-pointer opacity-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="flex flex-col flex-1 min-h-[300px]">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Notes</h4>
          <RichTextEditor 
            key={selectedTask.id}
            taskId={selectedTask.id}
            value={selectedTask.notes} 
            onChange={(val) => updateTask(selectedTask.id, { notes: val })} 
          />
        </div>
        
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
          Created: {format(selectedTask.createdAt, 'PP p')}
        </div>
      </div>
    </div>
  );
};
