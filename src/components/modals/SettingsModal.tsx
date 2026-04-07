import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Palette } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS } from '../../types';
import { db } from '../../lib/db';
import { cn } from '../../lib/utils';

export const SettingsModal = ({ 
  settings, 
  setSettings, 
  onClose 
}: { 
  settings: AppSettings, 
  setSettings: (s: AppSettings | ((prev: AppSettings) => AppSettings)) => void, 
  onClose: () => void 
}) => {
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, confirmAction]);

  const handleReset = () => {
    setConfirmAction({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all settings to defaults?',
      onConfirm: () => {
        setSettings(DEFAULT_SETTINGS);
        setConfirmAction(null);
      }
    });
  };

  const handleClearData = () => {
    setConfirmAction({
      title: 'Clear All Data',
      message: 'WARNING: This will delete all your tasks and data permanently. Are you sure?',
      isDestructive: true,
      onConfirm: async () => {
        await db.delete();
        window.location.reload();
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        
        {/* Confirmation Overlay */}
        <AnimatePresence>
          {confirmAction && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-lg">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4"
              >
                <h3 className="text-lg font-semibold mb-2">{confirmAction.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">{confirmAction.message}</p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmAction.onConfirm}
                    className={cn(
                      "px-4 py-2 text-sm font-medium text-white rounded-md transition-colors",
                      confirmAction.isDestructive 
                        ? "bg-red-500 hover:bg-red-600" 
                        : "bg-accent-500 hover:bg-accent-600"
                    )}
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Task Management */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">Task Management</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Week start day</div>
                <div className="text-sm text-zinc-500">First day of the week in calendars</div>
              </div>
              <select 
                value={settings.weekStart}
                onChange={e => setSettings(s => ({ ...s, weekStart: e.target.value as 'monday' | 'sunday' }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Task archival</div>
                <div className="text-sm text-zinc-500">Auto-hide completed tasks after N days (0 to disable)</div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0"
                  value={settings.autoHideCompletedDays}
                  onChange={e => setSettings(s => ({ ...s, autoHideCompletedDays: parseInt(e.target.value) || 0 }))}
                  className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                />
                <span className="text-sm text-zinc-500">days</span>
              </div>
            </div>
          </section>

          {/* UI/Display */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">UI / Display</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Task list density</div>
                <div className="text-sm text-zinc-500">Compact or expanded view for tasks</div>
              </div>
              <select 
                value={settings.density}
                onChange={e => setSettings(s => ({ ...s, density: e.target.value as 'compact' | 'expanded' }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="expanded">Expanded</option>
                <option value="compact">Compact</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Show contexts</div>
                <div className="text-sm text-zinc-500">Enable or disable context tags globally</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={settings.useContexts}
                  onChange={e => setSettings(s => ({ ...s, useContexts: e.target.checked }))}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Theme</div>
                <div className="text-sm text-zinc-500">Light, dark, or system default</div>
              </div>
              <select 
                value={settings.theme}
                onChange={e => setSettings(s => ({ ...s, theme: e.target.value as 'light' | 'dark' | 'auto' }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Accent color</div>
                <div className="text-sm text-zinc-500">Choose your preferred color scheme</div>
              </div>
              <div className="flex gap-2">
                {['emerald', 'blue', 'purple', 'rose', 'amber'].map(color => (
                  <button
                    key={color}
                    onClick={() => setSettings(s => ({ ...s, accentColor: color }))}
                    className={cn(
                      "w-6 h-6 rounded-full border-2",
                      settings.accentColor === color ? "border-zinc-900 dark:border-white" : "border-transparent",
                      color === 'emerald' && "bg-[#10b981]",
                      color === 'blue' && "bg-[#3b82f6]",
                      color === 'purple' && "bg-[#a855f7]",
                      color === 'rose' && "bg-[#f43f5e]",
                      color === 'amber' && "bg-[#f59e0b]"
                    )}
                    title={color}
                  />
                ))}
                <label 
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer relative overflow-hidden",
                    settings.accentColor.startsWith('#') ? "border-zinc-900 dark:border-white" : "border-transparent"
                  )}
                  title="Custom Color"
                  style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                >
                  <Palette size={12} className="text-white drop-shadow-md pointer-events-none z-10" />
                  <input 
                    type="color" 
                    value={settings.accentColor.startsWith('#') ? settings.accentColor : '#10b981'}
                    onChange={(e) => setSettings(s => ({ ...s, accentColor: e.target.value }))}
                    className="absolute inset-[-10px] w-[50px] h-[50px] cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Default view</div>
                <div className="text-sm text-zinc-500">Which view opens on startup</div>
              </div>
              <select 
                value={settings.defaultView}
                onChange={e => setSettings(s => ({ ...s, defaultView: e.target.value as any }))}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="all">All Tasks</option>
                <option value="next-actions">Next Actions</option>
                <option value="projects">Projects</option>
                {settings.useContexts && <option value="contexts">Contexts</option>}
              </select>
            </div>
          </section>

          {/* Advanced Options */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">Advanced Options</h3>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors w-full text-left"
              >
                Reset all settings to defaults
              </button>
              
              <button 
                onClick={handleClearData}
                className="px-4 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors w-full text-left"
              >
                Clear all data (IndexedDB cleanup)
              </button>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">OneFileTasks</p>
              <p>Built for instant productivity.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
