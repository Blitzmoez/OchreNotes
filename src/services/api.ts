import { NoteMetadata, NoteContent, TaskItem, User, ShareRecord, SystemHealth, SystemLog, GraphData } from '../types';

class ApiService {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private offlineSyncQueue: Array<{ action: string; payload: any }> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.flushOfflineQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
      this.loadQueue();
    }
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem('ochrenotes_offline_queue');
      if (saved) this.offlineSyncQueue = JSON.parse(saved);
    } catch (e) {
      this.offlineSyncQueue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem('ochrenotes_offline_queue', JSON.stringify(this.offlineSyncQueue));
    } catch (e) {}
  }

  public getOnlineStatus() {
    return this.isOnline;
  }

  public getPendingSyncCount() {
    return this.offlineSyncQueue.length;
  }

  private async flushOfflineQueue() {
    if (this.offlineSyncQueue.length === 0) return;
    const queue = [...this.offlineSyncQueue];
    this.offlineSyncQueue = [];
    this.saveQueue();

    for (const item of queue) {
      try {
        if (item.action === 'saveNote') {
          await this.saveNote(item.payload.username, item.payload.path, item.payload.content, item.payload.isShared, item.payload.sharedFrom);
        } else if (item.action === 'toggleTask') {
          await this.toggleTask(item.payload.username, item.payload.notePath, item.payload.lineIndex, item.payload.completed, item.payload.isShared, item.payload.sharedFrom);
        }
      } catch (e) {
        // Re-queue on failure
        this.offlineSyncQueue.push(item);
        this.saveQueue();
      }
    }
  }

  async fetchUsers(): Promise<User[]> {
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) throw new Error('Fehler beim Laden der Benutzer');
      const users = await res.json();
      localStorage.setItem('ochrenotes_cached_users', JSON.stringify(users));
      return users;
    } catch (err) {
      const cached = localStorage.getItem('ochrenotes_cached_users');
      if (cached) return JSON.parse(cached);
      throw err;
    }
  }

  async login(username: string, password?: string): Promise<User> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Anmeldung fehlgeschlagen');
    }
    const data = await res.json();
    return data.user;
  }

  async setPassword(username: string, password: string): Promise<{ success: boolean; hasPassword: boolean; user?: User }> {
    const res = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Fehler beim Speichern des Passworts');
    }
    return await res.json();
  }

  async fetchFolders(username: string): Promise<string[]> {
    try {
      const res = await fetch(`/api/vault/folders?username=${encodeURIComponent(username)}`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async fetchAppConfig(): Promise<{ appTitle: string }> {
    try {
      const res = await fetch('/api/system/config');
      if (!res.ok) return { appTitle: 'OchreNotes' };
      return await res.json();
    } catch (e) {
      return { appTitle: 'OchreNotes' };
    }
  }

  async saveAppConfig(appTitle: string): Promise<boolean> {
    const res = await fetch('/api/system/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appTitle }),
    });
    return res.ok;
  }

  async fetchNotes(username: string): Promise<NoteMetadata[]> {
    try {
      const res = await fetch(`/api/vault/notes?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Fehler beim Laden der Notizen');
      const notes = await res.json();
      localStorage.setItem(`ochrenotes_notes_${username}`, JSON.stringify(notes));
      return notes;
    } catch (err) {
      const cached = localStorage.getItem(`ochrenotes_notes_${username}`);
      if (cached) return JSON.parse(cached);
      return [];
    }
  }

  async fetchSharedWithMe(username: string): Promise<NoteMetadata[]> {
    try {
      const res = await fetch(`/api/vault/shared-with-me?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Fehler beim Laden geteilter Notizen');
      const shared = await res.json();
      localStorage.setItem(`ochrenotes_shared_${username}`, JSON.stringify(shared));
      return shared;
    } catch (err) {
      const cached = localStorage.getItem(`ochrenotes_shared_${username}`);
      if (cached) return JSON.parse(cached);
      return [];
    }
  }

  async readNote(username: string, path: string, isShared = false, sharedFrom = ''): Promise<NoteContent> {
    const cacheKey = `note_content_${isShared ? sharedFrom : username}_${path}`;
    try {
      const url = `/api/vault/notes/read?username=${encodeURIComponent(username)}&path=${encodeURIComponent(path)}&isShared=${isShared}&sharedFrom=${encodeURIComponent(sharedFrom)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Notiz konnte nicht geladen werden');
      const data = await res.json();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch (err) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
      throw err;
    }
  }

  async saveNote(username: string, path: string, content: string, isShared = false, sharedFrom = ''): Promise<{ success: boolean; mtime: number }> {
    const cacheKey = `note_content_${isShared ? sharedFrom : username}_${path}`;
    // Always update local cache immediately for zero-latency feel
    const cachedData: any = {
      path,
      title: path.replace(/^.*[\\\/]/, '').replace(/\.md$/, ''),
      content,
      mtime: Date.now(),
      size: content.length,
      isShared,
      sharedFromUser: isShared ? sharedFrom : undefined,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cachedData));

    if (!navigator.onLine) {
      this.offlineSyncQueue.push({
        action: 'saveNote',
        payload: { username, path, content, isShared, sharedFrom },
      });
      this.saveQueue();
      return { success: true, mtime: Date.now() };
    }

    try {
      const res = await fetch('/api/vault/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, path, content, isShared, sharedFrom }),
      });
      if (!res.ok) throw new Error('Fehler beim Speichern');
      return await res.json();
    } catch (err) {
      this.offlineSyncQueue.push({
        action: 'saveNote',
        payload: { username, path, content, isShared, sharedFrom },
      });
      this.saveQueue();
      return { success: true, mtime: Date.now() };
    }
  }

  async createNote(username: string, path: string, content = ''): Promise<boolean> {
    const res = await this.saveNote(username, path, content);
    return res.success;
  }

  async deleteNote(username: string, path: string): Promise<boolean> {
    const res = await fetch(`/api/vault/notes?username=${encodeURIComponent(username)}&path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    return res.ok;
  }

  async moveNote(username: string, oldPath: string, newPath: string): Promise<boolean> {
    const res = await fetch('/api/vault/notes/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, oldPath, newPath }),
    });
    return res.ok;
  }

  async createFolder(username: string, folderPath: string): Promise<boolean> {
    const res = await fetch('/api/vault/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, folderPath }),
    });
    return res.ok;
  }

  async deleteFolder(username: string, folderPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/vault/folders?username=${encodeURIComponent(username)}&folderPath=${encodeURIComponent(folderPath)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || 'Fehler beim Löschen des Ordners' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Netzwerkfehler' };
    }
  }

  async fetchTasks(username: string): Promise<TaskItem[]> {
    try {
      const res = await fetch(`/api/tasks?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Fehler beim Abrufen der Aufgaben');
      const tasks = await res.json();
      localStorage.setItem(`ochrenotes_tasks_${username}`, JSON.stringify(tasks));
      return tasks;
    } catch (err) {
      const cached = localStorage.getItem(`ochrenotes_tasks_${username}`);
      if (cached) return JSON.parse(cached);
      return [];
    }
  }

  async toggleTask(
    username: string,
    notePath: string,
    lineIndex: number,
    completed: boolean,
    isShared = false,
    sharedFrom = ''
  ): Promise<boolean> {
    if (!navigator.onLine) {
      this.offlineSyncQueue.push({
        action: 'toggleTask',
        payload: { username, notePath, lineIndex, completed, isShared, sharedFrom },
      });
      this.saveQueue();
      return true;
    }

    try {
      const res = await fetch('/api/tasks/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, notePath, lineIndex, completed, isShared, sharedFrom }),
      });
      return res.ok;
    } catch (err) {
      this.offlineSyncQueue.push({
        action: 'toggleTask',
        payload: { username, notePath, lineIndex, completed, isShared, sharedFrom },
      });
      this.saveQueue();
      return true;
    }
  }

  async fetchGraph(username: string): Promise<GraphData> {
    try {
      const res = await fetch(`/api/graph?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Fehler beim Abrufen des Graphen');
      return await res.json();
    } catch (err) {
      return { nodes: [], links: [] };
    }
  }

  async fetchSharesForNote(owner: string, path: string): Promise<ShareRecord[]> {
    try {
      const res = await fetch(`/api/vault/shares-for-note?owner=${encodeURIComponent(owner)}&path=${encodeURIComponent(path)}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async shareNote(notePath: string, ownerUsername: string, sharedWithUserId: string, permission: 'read' | 'write'): Promise<boolean> {
    const res = await fetch('/api/vault/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notePath, ownerUsername, sharedWithUserId, permission }),
    });
    return res.ok;
  }

  async revokeShare(shareId: string): Promise<boolean> {
    const res = await fetch('/api/vault/share', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId }),
    });
    return res.ok;
  }

  async fetchSystemHealth(): Promise<SystemHealth> {
    const res = await fetch('/api/system/health');
    return await res.json();
  }

  async fetchSystemLogs(): Promise<SystemLog[]> {
    const res = await fetch('/api/system/logs');
    return await res.json();
  }

  async exportBackup(username: string): Promise<Blob> {
    const res = await fetch(`/api/vault/backup?username=${encodeURIComponent(username)}`);
    return await res.blob();
  }

  async restoreBackup(username: string, backupData: any): Promise<{ success: boolean; restoredCount: number }> {
    const res = await fetch('/api/vault/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, backup: backupData }),
    });
    return await res.json();
  }
}

export const api = new ApiService();
