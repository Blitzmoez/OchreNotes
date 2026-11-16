import { NoteMetadata, NoteContent, NoteMediaItem, TaskItem, User, ShareRecord, SystemHealth, SystemLog, GraphData, NoteProfileId, SuiteProfileSettings, EnabledModules, WikiArticle, Recipe, MealCycle, MealCalendarOverride, CookbookSharingSettings, CookbookSettings, SharedCookbookCatalog, SharedMealPlan, DashboardSettings, IngredientMeta } from '../types';

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
          await this.saveNote(item.payload.username, item.payload.path, item.payload.content, item.payload.isShared, item.payload.sharedFrom, item.payload.profile || 'profile1');
        } else if (item.action === 'toggleTask') {
          await this.toggleTask(item.payload.username, item.payload.notePath, item.payload.lineIndex, item.payload.completed, item.payload.isShared, item.payload.sharedFrom, item.payload.profile || 'profile1');
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

  async createUser(payload: {
    username: string;
    displayName: string;
    role?: 'admin' | 'user' | 'family';
    description?: string;
    password?: string;
    avatarDataUrl?: string;
    avatarUrl?: string;
  }): Promise<User> {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Benutzer konnte nicht erstellt werden');
    }
    const data = await res.json();
    return data.user;
  }

  async updateUser(
    username: string,
    payload: {
      displayName?: string;
      role?: 'admin' | 'user' | 'family';
      description?: string;
      avatarDataUrl?: string;
      avatarUrl?: string;
      clearAvatar?: boolean;
    }
  ): Promise<User> {
    const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Benutzerprofil konnte nicht aktualisiert werden');
    }
    const data = await res.json();
    return data.user;
  }

  async deleteUser(username: string): Promise<void> {
    const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Benutzer konnte nicht gelöscht werden');
    }
  }

  async fetchFolders(username: string, profile: NoteProfileId = 'profile1'): Promise<string[]> {
    try {
      const res = await fetch(`/api/vault/folders?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}`);
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

  async fetchProfileSettings(username: string): Promise<{ profileSettings?: SuiteProfileSettings; enabledModules?: EnabledModules; dashboardSettings?: DashboardSettings } | null> {
    try {
      const res = await fetch(`/api/system/profile-settings?username=${encodeURIComponent(username)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async saveProfileSettings(
    username: string,
    profileSettings: SuiteProfileSettings,
    enabledModules: EnabledModules,
    dashboardSettings?: DashboardSettings
  ): Promise<boolean> {
    try {
      const res = await fetch('/api/system/profile-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, profileSettings, enabledModules, dashboardSettings }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchNotes(username: string, profile: NoteProfileId = 'profile1'): Promise<NoteMetadata[]> {
    try {
      const res = await fetch(`/api/vault/notes?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}`);
      if (!res.ok) throw new Error('Fehler beim Laden der Notizen');
      const notes = await res.json();
      localStorage.setItem(`ochrenotes_notes_${username}_${profile}`, JSON.stringify(notes));
      return notes;
    } catch (err) {
      const cached = localStorage.getItem(`ochrenotes_notes_${username}_${profile}`);
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

  async readNote(username: string, path: string, isShared = false, sharedFrom = '', profile: NoteProfileId = 'profile1'): Promise<NoteContent> {
    const cacheKey = `note_content_${isShared ? sharedFrom : `${username}_${profile}`}_${path}`;
    try {
      const url = `/api/vault/notes/read?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}&path=${encodeURIComponent(path)}&isShared=${isShared}&sharedFrom=${encodeURIComponent(sharedFrom)}`;
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

  async saveNote(username: string, path: string, content: string, isShared = false, sharedFrom = '', profile: NoteProfileId = 'profile1'): Promise<{ success: boolean; mtime: number }> {
    const cacheKey = `note_content_${isShared ? sharedFrom : `${username}_${profile}`}_${path}`;
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
        payload: { username, path, content, isShared, sharedFrom, profile },
      });
      this.saveQueue();
      return { success: true, mtime: Date.now() };
    }

    try {
      const res = await fetch('/api/vault/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, profile, path, content, isShared, sharedFrom }),
      });
      if (!res.ok) throw new Error('Fehler beim Speichern');
      return await res.json();
    } catch (err) {
      this.offlineSyncQueue.push({
        action: 'saveNote',
        payload: { username, path, content, isShared, sharedFrom, profile },
      });
      this.saveQueue();
      return { success: true, mtime: Date.now() };
    }
  }

  async createNote(username: string, path: string, content = '', profile: NoteProfileId = 'profile1'): Promise<boolean> {
    const res = await this.saveNote(username, path, content, false, '', profile);
    return res.success;
  }

  async deleteNote(username: string, path: string, profile: NoteProfileId = 'profile1'): Promise<boolean> {
    const res = await fetch(`/api/vault/notes?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}&path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    return res.ok;
  }

  async moveNote(username: string, oldPath: string, newPath: string, profile: NoteProfileId = 'profile1'): Promise<boolean> {
    const res = await fetch('/api/vault/notes/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, profile, oldPath, newPath }),
    });
    return res.ok;
  }

  async createFolder(username: string, folderPath: string, profile: NoteProfileId = 'profile1'): Promise<boolean> {
    const res = await fetch('/api/vault/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, profile, folderPath }),
    });
    return res.ok;
  }

  async deleteFolder(username: string, folderPath: string, profile: NoteProfileId = 'profile1'): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/vault/folders?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}&folderPath=${encodeURIComponent(folderPath)}`, {
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

  async listNoteMedia(
    username: string,
    notePath: string,
    profile: NoteProfileId = 'profile1',
    isShared = false,
    sharedFrom = ''
  ): Promise<NoteMediaItem[]> {
    try {
      const url = `/api/notes/media/list?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}&notePath=${encodeURIComponent(notePath)}&isShared=${isShared}&sharedFrom=${encodeURIComponent(sharedFrom)}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async uploadNoteMedia(payload: {
    username: string;
    profile?: NoteProfileId;
    notePath: string;
    filename: string;
    dataUrl: string;
    isShared?: boolean;
    sharedFrom?: string;
  }): Promise<NoteMediaItem> {
    const res = await fetch('/api/notes/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Bild-Upload fehlgeschlagen');
    }
    const data = await res.json();
    return data.item;
  }

  async deleteNoteMedia(payload: {
    username: string;
    profile?: NoteProfileId;
    notePath: string;
    filename: string;
    isShared?: boolean;
    sharedFrom?: string;
  }): Promise<boolean> {
    const res = await fetch('/api/notes/media/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async fetchTasks(username: string, profile: NoteProfileId = 'profile1'): Promise<TaskItem[]> {
    try {
      const res = await fetch(`/api/tasks?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}`);
      if (!res.ok) throw new Error('Fehler beim Abrufen der Aufgaben');
      const tasks = await res.json();
      localStorage.setItem(`ochrenotes_tasks_${username}_${profile}`, JSON.stringify(tasks));
      return tasks;
    } catch (err) {
      const cached = localStorage.getItem(`ochrenotes_tasks_${username}_${profile}`);
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
    sharedFrom = '',
    profile: NoteProfileId = 'profile1'
  ): Promise<boolean> {
    if (!navigator.onLine) {
      this.offlineSyncQueue.push({
        action: 'toggleTask',
        payload: { username, notePath, lineIndex, completed, isShared, sharedFrom, profile },
      });
      this.saveQueue();
      return true;
    }

    try {
      const res = await fetch('/api/tasks/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, profile, notePath, lineIndex, completed, isShared, sharedFrom }),
      });
      return res.ok;
    } catch (err) {
      this.offlineSyncQueue.push({
        action: 'toggleTask',
        payload: { username, notePath, lineIndex, completed, isShared, sharedFrom, profile },
      });
      this.saveQueue();
      return true;
    }
  }

  async fetchGraph(username: string, profile: NoteProfileId = 'profile1'): Promise<GraphData> {
    try {
      const res = await fetch(`/api/graph?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}`);
      if (!res.ok) throw new Error('Fehler beim Abrufen des Graphen');
      return await res.json();
    } catch (err) {
      return { nodes: [], links: [] };
    }
  }

  // Open-Standard Wiki API
  async fetchWikiArticles(username: string): Promise<WikiArticle[]> {
    try {
      const res = await fetch(`/api/wiki/articles?username=${encodeURIComponent(username)}`);
      if (!res.ok) return [];
      const data = await res.json();
      localStorage.setItem(`ochre_wiki_cache_${username}`, JSON.stringify(data));
      return data;
    } catch {
      const cached = localStorage.getItem(`ochre_wiki_cache_${username}`);
      return cached ? JSON.parse(cached) : [];
    }
  }

  async saveWikiArticle(username: string, article: WikiArticle, oldSlug?: string): Promise<WikiArticle> {
    const res = await fetch('/api/wiki/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, article, oldSlug }),
    });
    if (!res.ok) throw new Error('Fehler beim Speichern des Wiki-Artikels');
    return await res.json();
  }

  async deleteWikiArticle(username: string, slug: string): Promise<boolean> {
    const res = await fetch(`/api/wiki/articles?username=${encodeURIComponent(username)}&slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    return res.ok;
  }

  async uploadWikiImage(username: string, filename: string, dataUrl: string): Promise<{ url: string; filename: string }> {
    const res = await fetch('/api/wiki/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, filename, dataUrl }),
    });
    if (!res.ok) throw new Error('Bild-Upload fehlgeschlagen');
    return await res.json();
  }

  async shareWikiArticle(fromUsername: string, toUsername: string, slug: string): Promise<{ success: boolean; targetSlug?: string }> {
    const res = await fetch('/api/wiki/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUsername, toUsername, slug }),
    });
    if (!res.ok) throw new Error('Wiki-Artikel konnte nicht geteilt werden');
    return await res.json();
  }

  async fetchCookbook(username: string): Promise<{
    recipes: Recipe[];
    categories: string[];
    cycle: MealCycle;
    overrides: Record<string, MealCalendarOverride>;
    sharing: CookbookSharingSettings;
    settings?: CookbookSettings;
    ingredientMeta?: Record<string, IngredientMeta>;
    dismissedDuplicates?: string[];
    sharedCatalogs: SharedCookbookCatalog[];
    sharedPlans: SharedMealPlan[];
  }> {
    const res = await fetch(`/api/cookbook?username=${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error('Fehler beim Laden des Kochbuchs');
    return await res.json();
  }

  async saveCookbook(
    username: string,
    payload: {
      recipes?: Recipe[];
      categories?: string[];
      cycle?: MealCycle;
      overrides?: Record<string, MealCalendarOverride>;
      sharing?: CookbookSharingSettings;
      settings?: Partial<CookbookSettings>;
      ingredientMeta?: Record<string, IngredientMeta>;
      dismissedDuplicates?: string[];
    }
  ): Promise<boolean> {
    const res = await fetch('/api/cookbook/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, ...payload }),
    });
    return res.ok;
  }

  async shareCookbookRecipe(fromUsername: string, toUsername: string, recipe: Recipe): Promise<{ success: boolean }> {
    const res = await fetch('/api/cookbook/share-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUsername, toUsername, recipe }),
    });
    if (!res.ok) throw new Error('Rezept konnte nicht geteilt werden');
    return await res.json();
  }

  async listRecipeMedia(username: string, recipeDir: string): Promise<NoteMediaItem[]> {
    if (!recipeDir) return [];
    try {
      const res = await fetch(
        `/api/cookbook/media/list?username=${encodeURIComponent(username)}&recipeDir=${encodeURIComponent(recipeDir)}`
      );
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async uploadRecipeMedia(
    username: string,
    recipeDir: string,
    filename: string,
    dataUrl: string,
    recipeId?: string
  ): Promise<NoteMediaItem | null> {
    const res = await fetch('/api/cookbook/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, recipeDir, recipeId, filename, dataUrl }),
    });
    if (!res.ok) throw new Error('Rezept-Bild konnte nicht gespeichert werden');
    const data = await res.json();
    return data.item || null;
  }

  async deleteRecipeMedia(
    username: string,
    recipeDir: string,
    filename: string,
    recipeId?: string
  ): Promise<boolean> {
    const res = await fetch('/api/cookbook/media/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, recipeDir, recipeId, filename }),
    });
    return res.ok;
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

  async exportBackup(username: string, profile: NoteProfileId = 'profile1'): Promise<Blob> {
    const res = await fetch(`/api/vault/backup?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}`);
    return await res.blob();
  }

  async restoreBackup(username: string, backupData: any, profile: NoteProfileId = 'profile1'): Promise<{ success: boolean; restoredCount: number }> {
    const res = await fetch('/api/vault/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, profile, backup: backupData }),
    });
    return await res.json();
  }
}

export const api = new ApiService();
