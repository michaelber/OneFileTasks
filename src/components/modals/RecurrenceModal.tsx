import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { Task, RecurrenceConfig, AppSettings, RecurrencePattern } from '../../types';

export const RecurrenceModal = ({ 
  task, 
  onClose, 
  onSave,
  settings
}: { 
  task: Task, 
  onClose: () => void, 
  onSave: (recurrence: RecurrenceConfig | undefined) => void,
  settings: AppSettings
}) => {
  const [config, setConfig] = useState<RecurrenceConfig>(task.recurrence || {
    pattern: 'weekly',
    interval: 1,
    daysOfWeek: [new Date().getDay()],
    endType: 'none',
    endOccurrences: 10,
    endDate: null
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleDay = (day: number) => {
    setConfig(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day) 
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day].sort()
    }));
  };

  const getPatternLabel = (pattern: RecurrencePattern) => {
    switch (pattern) {
      case 'hourly': return 'hour';
      case 'daily': return 'day';
      case 'weekly': return 'week';
      case 'monthly': return 'month';
      case 'yearly': return 'year';
    }
  };

  const weekDays = settings.weekStart === 'monday' 
    ? [{name: 'Monday', idx: 1}, {name: 'Tuesday', idx: 2}, {name: 'Wednesday', idx: 3}, {name: 'Thursday', idx: 4}, {name: 'Friday', idx: 5}, {name: 'Saturday', idx: 6}, {name: 'Sunday', idx: 0}]
    : [{name: 'Sunday', idx: 0}, {name: 'Monday', idx: 1}, {name: 'Tuesday', idx: 2}, {name: 'Wednesday', idx: 3}, {name: 'Thursday', idx: 4}, {name: 'Friday', idx: 5}, {name: 'Saturday', idx: 6}];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[600px] max-w-[90vw] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Task Recurrence</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[70vh]">
          {/* Recurrence Pattern */}
          <div className="flex gap-6">
            <div className="flex flex-col gap-3 w-32 shrink-0 border-r border-zinc-200 dark:border-zinc-800 pr-4">
              <h3 className="text-sm font-medium text-zinc-500 mb-1">Recurrence pattern</h3>
              {['hourly', 'daily', 'weekly', 'monthly', 'yearly'].map(pattern => (
                <label key={pattern} className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="pattern" 
                    checked={config.pattern === pattern}
                    onChange={() => setConfig({ ...config, pattern: pattern as RecurrencePattern })}
                    className="text-accent-500 focus:ring-accent-500"
                  />
                  <span className="capitalize">{pattern}</span>
                </label>
              ))}
            </div>

            <div className="flex-1 flex flex-col gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <span>Recur every</span>
                <input 
                  type="number" 
                  min="1"
                  value={config.interval}
                  onChange={e => setConfig({ ...config, interval: parseInt(e.target.value) || 1 })}
                  className="w-16 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
                <span>{getPatternLabel(config.pattern)}(s) {config.pattern === 'weekly' ? 'on' : ''}</span>
              </label>

              {config.pattern === 'weekly' && (
                <div className="grid grid-cols-3 gap-2 ml-6">
                  {weekDays.map(({name, idx}) => (
                    <label key={name} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={config.daysOfWeek.includes(idx)}
                        onChange={() => toggleDay(idx)}
                        className="rounded text-accent-500 focus:ring-accent-500"
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            {/* Next Occurrence */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-zinc-500">Next occurrence</h3>
              <div className="flex items-center gap-3">
                <span className="w-12 text-sm">Start</span>
                <input 
                  type="date"
                  value={task.startDate ? format(task.startDate, 'yyyy-MM-dd') : ''}
                  readOnly
                  className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-12 text-sm">Due</span>
                <input 
                  type="date"
                  value={task.dueDate ? format(task.dueDate, 'yyyy-MM-dd') : ''}
                  readOnly
                  className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                />
              </div>
            </div>

            {/* End Occurrences */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-zinc-500">End occurrences</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="endType" 
                  checked={config.endType === 'none'}
                  onChange={() => setConfig({ ...config, endType: 'none' })}
                  className="text-accent-500 focus:ring-accent-500"
                />
                <span>No end date</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="endType" 
                  checked={config.endType === 'after_occurrences'}
                  onChange={() => setConfig({ ...config, endType: 'after_occurrences' })}
                  className="text-accent-500 focus:ring-accent-500"
                />
                <span>End after</span>
                <input 
                  type="number" 
                  min="1"
                  value={config.endOccurrences}
                  onChange={e => setConfig({ ...config, endOccurrences: parseInt(e.target.value) || 1 })}
                  className="w-16 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
                <span>occurrences</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="endType" 
                  checked={config.endType === 'by_date'}
                  onChange={() => setConfig({ ...config, endType: 'by_date' })}
                  className="text-accent-500 focus:ring-accent-500"
                />
                <span>End by</span>
                <input 
                  type="date"
                  value={config.endDate ? format(config.endDate, 'yyyy-MM-dd') : ''}
                  onChange={e => setConfig({ ...config, endDate: e.target.value ? new Date(e.target.value).getTime() : null })}
                  className="flex-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 rounded-b-lg">
          <div className="flex gap-2">
            <button 
              onClick={() => onSave(config)}
              className="px-4 py-2 bg-accent-500 text-white rounded-md font-medium hover:bg-accent-600 transition-colors"
            >
              OK
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
          <button 
            onClick={() => onSave(undefined)}
            className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md font-medium transition-colors"
          >
            Remove Recurrence
          </button>
        </div>
      </div>
    </div>
  );
};
