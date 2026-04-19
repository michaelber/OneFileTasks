import React, { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { db } from '../lib/db';

export function useFileSystemSync() {
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'needs_permission'>('idle');
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  useEffect(() => {
    get('savedFileHandle').then(async (handle) => {
      if (handle) {
        setFileHandle(handle);
        try {
          let permission = await (handle as any).queryPermission({ mode: 'readwrite' });
          if (permission !== 'granted') {
            try {
              permission = await (handle as any).requestPermission({ mode: 'readwrite' });
            } catch (e) {
              console.log('Auto request permission failed', e);
            }
          }
          if (permission === 'granted') {
            await loadFromFile(handle);
          } else {
            setSyncStatus('needs_permission');
          }
        } catch (err) {
          console.error('Error checking permission:', err);
          setSyncStatus('needs_permission');
        }
      }
    });
  }, []);

  const requestPermissionAndSync = async () => {
    if (!fileHandle) return;
    try {
      const permission = await (fileHandle as any).requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await loadFromFile(fileHandle);
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      console.error('Error requesting permission:', err);
      setSyncStatus('error');
    }
  };

  const linkFile = async () => {
    try {
      if (!('showOpenFilePicker' in window)) {
        alert('File System Access API is not supported in this browser. Use manual export/import.');
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      setFileHandle(handle);
      await set('savedFileHandle', handle);
      await loadFromFile(handle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error linking file:', err);
        setSyncStatus('error');
      }
    }
  };

  const createNewFile = async () => {
    try {
      if (!('showSaveFilePicker' in window)) {
        alert('File System Access API is not supported in this browser.');
        return;
      }
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: 'one-file-tasks.json',
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      setFileHandle(handle);
      await set('savedFileHandle', handle);
      await syncToFile(handle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error creating file:', err);
        setSyncStatus('error');
      }
    }
  };

  const loadFromFile = async (handle: FileSystemFileHandle) => {
    setSyncStatus('syncing');
    try {
      const file = await handle.getFile();
      const text = await file.text();
      if (text.trim()) {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          await db.transaction('rw', db.tasks, async () => {
            await db.tasks.clear();
            await db.tasks.bulkAdd(data);
          });
        }
      }
      setSyncStatus('synced');
      setLastSynced(Date.now());
    } catch (err) {
      console.error('Error loading from file:', err);
      setSyncStatus('error');
    }
  };

  const syncToFile = async (handle: FileSystemFileHandle | null = fileHandle): Promise<boolean> => {
    if (!handle) return false;
    setSyncStatus('syncing');
    try {
      const writable = await handle.createWritable();
      const allTasks = await db.tasks.toArray();
      await writable.write(JSON.stringify(allTasks, null, 2));
      await writable.close();
      setSyncStatus('synced');
      setLastSynced(Date.now());
      return true;
    } catch (err) {
      console.error('Error syncing to file:', err);
      setSyncStatus('error');
      return false;
    }
  };

  const manualExport = async () => {
    const allTasks = await db.tasks.toArray();
    const blob = new Blob([JSON.stringify(allTasks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'one-file-tasks.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const manualImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          await db.transaction('rw', db.tasks, async () => {
            await db.tasks.clear();
            await db.tasks.bulkAdd(data);
          });
        }
      } catch (err) {
        console.error('Error importing file:', err);
      }
    };
    reader.readAsText(file);
  };

  const unlinkFile = async () => {
    setFileHandle(null);
    setSyncStatus('idle');
    await set('savedFileHandle', null);
  };

  return { fileHandle, syncStatus, lastSynced, linkFile, createNewFile, syncToFile, manualExport, manualImport, requestPermissionAndSync, unlinkFile };
}
