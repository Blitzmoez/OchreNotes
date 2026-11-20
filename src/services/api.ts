import {
  NoteMetadata,
  NoteContent,
  NoteMediaItem,
  TaskItem,
  User,
  ShareRecord,
  SystemHealth,
  SystemLog,
  GraphData,
  NoteProfileId,
  SuiteProfileSettings,
  EnabledModules,
  WikiArticle,
  WikiVisibility,
  Recipe,
  MealCycle,
  MealCalendarOverride,
  CookbookSharingSettings,
  CookbookSettings,
  SharedCookbookCatalog,
  SharedMealPlan,
  DashboardSettings,
  IngredientMeta,
  MealPlanLibrary,
  MealPlanInvitation,
  OfflineQueueItem,
  OpenGraphPreview,
  SmarthomeBrokerConfig,
  SmarthomeDiscoveredBroker,
  SmarthomeDbSource,
  SmarthomeTile,
  SmarthomeLiveValue,
  SmarthomeState,
  SmarthomeDiscoveredTopic,
  ProjectItem,
  ChangelogResponse,
  SuiteModuleId,
  OfflineConflictItem,
  RssSource,
  RssArticle,
  RssReaderResponse,
} from '../types';

const OFFLINE_QUEUE_KEY = 'ochrenotes_offline_queue';
const CLIENT_LOGS_KEY = 'ochrenotes_client_logs';
const OFFLINE_CONFLICTS_KEY = 'ochre_offline_conflicts';
const OFFLINE_MODULES_KEY = 'ochre_offline_modules_map';
const MAX_CLIENT_LOGS = 150;

class ApiService {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private offlineSyncQueue: OfflineQueueItem[] = [];
  private queueListeners: Set<(count: number) => void> = new Set();
  private offlineConflicts: OfflineConflictItem[] = [];
  private conflictListeners: Set<(items: OfflineConflictItem[]) => void> = new Set();
  private offlineModulesMap: Partial<Record<SuiteModuleId, boolean>> = {};
  private clientLogs: SystemLog[] = [];
  private isFlushing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadLogs();
      this.loadQueue();
      this.loadConflicts();
      this.loadOfflineModulesMap();

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.addClientLog('info', 'Netzwerkverbindung wiederhergestellt – starte Warteschlangen-Sync', 'SYNC');
        this.flushOfflineQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.addClientLog('warn', 'Netzwerk offline – Änderungen werden lokal zwischengespeichert', 'SYNC');
      });
      window.addEventListener('focus', () => {
        if (navigator.onLine && this.offlineSyncQueue.length > 0) {
          this.flushOfflineQueue();
        }
      });

      // Automatically flush stale queued items on startup when online
      if (navigator.onLine && this.offlineSyncQueue.length > 0) {
        setTimeout(() => {
          this.flushOfflineQueue();
        }, 600);
      }
    }
  }

  private loadLogs() {
    try {
      const saved = localStorage.getItem(CLIENT_LOGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) this.clientLogs = parsed.slice(-MAX_CLIENT_LOGS);
      }
    } catch {
      this.clientLogs = [];
    }
  }

  private saveLogs() {
    try {
      localStorage.setItem(CLIENT_LOGS_KEY, JSON.stringify(this.clientLogs.slice(-MAX_CLIENT_LOGS)));
    } catch {}
  }

  public addClientLog(level: 'info' | 'warn' | 'error', message: string, source = 'CLIENT') {
    const entry: SystemLog = {
      id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      source: `CLIENT:${source}`,
    };
    this.clientLogs.push(entry);
    if (this.clientLogs.length > MAX_CLIENT_LOGS) {
      this.clientLogs = this.clientLogs.slice(-MAX_CLIENT_LOGS);
    }
    this.saveLogs();
  }

  public getClientLogs(): SystemLog[] {
    return [...this.clientLogs].reverse();
  }

  public clearClientLogs() {
    this.clientLogs = [];
    this.saveLogs();
  }

  private getQueueDedupeKey(action: string, payload: any): string {
    if (action === 'saveNote') {
      return `saveNote:${payload?.username || ''}:${payload?.profile || 'profile1'}:${payload?.path || ''}`;
    }
    if (action === 'toggleTask') {
      return `toggleTask:${payload?.username || ''}:${payload?.profile || 'profile1'}:${payload?.notePath || ''}:${payload?.lineIndex ?? ''}`;
    }
    if (action === 'saveWiki') {
      return `saveWiki:${payload?.username || ''}:${payload?.article?.slug || ''}`;
    }
    if (action === 'saveCookbook') {
      return `saveCookbook:${payload?.username || ''}`;
    }
    if (action === 'saveProject') {
      return `saveProject:${payload?.username || ''}:${payload?.project?.id || ''}`;
    }
    return `${action}:${JSON.stringify(payload || {})}`;
  }

  private loadOfflineModulesMap() {
    try {
      const saved = localStorage.getItem(OFFLINE_MODULES_KEY);
      if (saved) this.offlineModulesMap = JSON.parse(saved) || {};
    } catch {
      this.offlineModulesMap = {};
    }
  }

  public setOfflineModulesMap(_map: Partial<Record<SuiteModuleId, boolean>>) {
    this.offlineModulesMap = {};
  }

  public isModuleOfflineEnabled(_moduleId: SuiteModuleId): boolean {
    return false;
  }

  public shouldUseOfflineMode(_moduleId: SuiteModuleId): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  public getModuleOfflineSnapshot<T>(moduleId: SuiteModuleId, key: string): { data: T; savedAt: number } | null {
    try {
      const raw = localStorage.getItem(`ochre_offline_snap_${moduleId}_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public setModuleOfflineSnapshot<T>(moduleId: SuiteModuleId, key: string, data: T, savedAt = Date.now()) {
    try {
      localStorage.setItem(`ochre_offline_snap_${moduleId}_${key}`, JSON.stringify({ data, savedAt }));
    } catch {}
  }

  private loadConflicts() {
    try {
      const saved = localStorage.getItem(OFFLINE_CONFLICTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) this.offlineConflicts = parsed;
      }
    } catch {
      this.offlineConflicts = [];
    }
  }

  private saveConflicts() {
    try {
      localStorage.setItem(OFFLINE_CONFLICTS_KEY, JSON.stringify(this.offlineConflicts));
    } catch {}
    this.conflictListeners.forEach((cb) => {
      try {
        cb([...this.offlineConflicts]);
      } catch {}
    });
  }

  public getOfflineConflicts(): OfflineConflictItem[] {
    return [...this.offlineConflicts];
  }

  public subscribeOfflineConflicts(listener: (items: OfflineConflictItem[]) => void): () => void {
    this.conflictListeners.add(listener);
    listener([...this.offlineConflicts]);
    return () => {
      this.conflictListeners.delete(listener);
    };
  }

  public addOfflineConflict(item: OfflineConflictItem) {
    this.offlineConflicts = [
      ...this.offlineConflicts.filter((c) => c.resourceKey !== item.resourceKey),
      item,
    ];
    this.saveConflicts();
    this.addClientLog('warn', `Sync-Konflikt erkannt: ${item.title} (${item.module})`, 'CONFLICT');
  }

  public async resolveOfflineConflict(conflictId: string, resolution: 'local' | 'server'): Promise<void> {
    const target = this.offlineConflicts.find((c) => c.id === conflictId);
    if (!target) return;
    if (resolution === 'local') {
      if (target.module === 'projects' && target.localData?.project) {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.localData.project),
        });
        if (!res.ok) throw new Error('Projekt-Konflikt konnte nicht auf Server geschrieben werden');
      } else if (target.module === 'wiki' && target.localData?.article) {
        const res = await fetch('/api/wiki/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.localData),
        });
        if (!res.ok) throw new Error('Wiki-Konflikt konnte nicht auf Server geschrieben werden');
      } else if (target.module === 'recipes' && target.localData) {
        const res = await fetch('/api/cookbook/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.localData),
        });
        if (!res.ok) throw new Error('Essensplan-Konflikt konnte nicht auf Server geschrieben werden');
      } else if (target.module === 'notes' && target.localData) {
        const res = await fetch('/api/vault/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.localData),
        });
        if (!res.ok) throw new Error('Notiz-Konflikt konnte nicht auf Server geschrieben werden');
      }
    }
    this.offlineConflicts = this.offlineConflicts.filter((c) => c.id !== conflictId);
    this.saveConflicts();
    this.addClientLog(
      'info',
      `Konflikt gelöst (${resolution === 'local' ? 'Lokal übernommen' : 'Server behalten'}): ${target.title}`,
      'CONFLICT'
    );
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (saved) {
        const raw = JSON.parse(saved);
        if (Array.isArray(raw)) {
          // Migrate legacy queue items & deduplicate by target key keeping newest
          const deduped = new Map<string, OfflineQueueItem>();
          raw.forEach((item: any, idx: number) => {
            if (!item || !item.action || !item.payload) return;
            const normalized: OfflineQueueItem = {
              id: item.id || `q_${Date.now()}_${idx}`,
              action: item.action,
              payload: item.payload,
              timestamp: item.timestamp || Date.now(),
              attempts: item.attempts || 0,
              lastError: item.lastError,
            };
            const key = this.getQueueDedupeKey(normalized.action, normalized.payload);
            deduped.set(key, normalized);
          });
          this.offlineSyncQueue = Array.from(deduped.values());
          this.saveQueue();
        }
      }
    } catch {
      this.offlineSyncQueue = [];
    }
  }

  private notifyQueueListeners() {
    const count = this.offlineSyncQueue.length;
    this.queueListeners.forEach((cb) => {
      try {
        cb(count);
      } catch {}
    });
  }

  private saveQueue() {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.offlineSyncQueue));
    } catch {}
    this.notifyQueueListeners();
  }

  private enqueueOffline(action: OfflineQueueItem['action'], payload: any, lastError?: string) {
    const key = this.getQueueDedupeKey(action, payload);
    const nextItem: OfflineQueueItem = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action,
      payload,
      timestamp: Date.now(),
      attempts: 0,
      lastError,
    };
    const filtered = this.offlineSyncQueue.filter(
      (existing) => this.getQueueDedupeKey(existing.action, existing.payload) !== key
    );
    filtered.push(nextItem);
    this.offlineSyncQueue = filtered;
    this.saveQueue();
    this.addClientLog(
      'warn',
      `Element in Offline-Warteschlange eingereiht (${action}: ${payload?.path || payload?.notePath || 'Payload'})${lastError ? ` – Grund: ${lastError}` : ''}`,
      'QUEUE'
    );
  }

  public subscribePendingSync(listener: (count: number) => void): () => void {
    this.queueListeners.add(listener);
    listener(this.offlineSyncQueue.length);
    return () => {
      this.queueListeners.delete(listener);
    };
  }

  public getOnlineStatus() {
    return this.isOnline;
  }

  public getPendingSyncCount() {
    return this.offlineSyncQueue.length;
  }

  public getOfflineQueue(): OfflineQueueItem[] {
    return [...this.offlineSyncQueue];
  }

  public clearOfflineQueue() {
    const count = this.offlineSyncQueue.length;
    this.offlineSyncQueue = [];
    this.saveQueue();
    this.addClientLog('info', `Offline-Warteschlange manuell geleert (${count} Einträge verworfen)`, 'QUEUE');
  }

  public async flushQueueNow(): Promise<{ processed: number; remaining: number; dropped: number }> {
    return this.flushOfflineQueue();
  }

  private async flushOfflineQueue(): Promise<{ processed: number; remaining: number; dropped: number }> {
    if (this.isFlushing || this.offlineSyncQueue.length === 0) {
      return { processed: 0, remaining: this.offlineSyncQueue.length, dropped: 0 };
    }
    this.isFlushing = true;
    const queue = [...this.offlineSyncQueue];
    const remaining: OfflineQueueItem[] = [];
    let processed = 0;
    let dropped = 0;

    try {
      for (const item of queue) {
        try {
          if (item.action === 'saveNote') {
            const p = item.payload;
            const res = await fetch('/api/vault/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: p.username,
                profile: p.profile || 'profile1',
                path: p.path,
                content: p.content,
                isShared: p.isShared,
                sharedFrom: p.sharedFrom,
              }),
            });
            if (!res.ok) {
              if (res.status >= 400 && res.status < 500) {
                dropped++;
                this.addClientLog('error', `Permanenter Fehler (${res.status}) beim Sync von '${p.path}' – verworfen`, 'QUEUE');
                continue;
              }
              throw new Error(`HTTP ${res.status}`);
            }
            processed++;
          } else if ((item.action as string) === 'toggleTask') {
            const p = item.payload;
            const res = await fetch('/api/tasks/toggle', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: p.username,
                profile: p.profile || 'profile1',
                notePath: p.notePath,
                lineIndex: p.lineIndex,
                completed: p.completed,
                isShared: p.isShared,
                sharedFrom: p.sharedFrom,
              }),
            });
            if (!res.ok) {
              if (res.status >= 400 && res.status < 500) {
                dropped++;
                this.addClientLog('error', `Permanenter Task-Sync-Fehler (${res.status}) – verworfen`, 'QUEUE');
                continue;
              }
              throw new Error(`HTTP ${res.status}`);
            }
            processed++;
          } else if (item.action === 'saveWiki') {
            const p = item.payload;
            const res = await fetch('/api/wiki/articles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(p),
            });
            if (!res.ok) {
              if (res.status >= 400 && res.status < 500) {
                dropped++;
                continue;
              }
              throw new Error(`HTTP ${res.status}`);
            }
            processed++;
          } else if (item.action === 'saveCookbook') {
            const p = item.payload;
            const res = await fetch('/api/cookbook/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(p),
            });
            if (!res.ok) {
              if (res.status >= 400 && res.status < 500) {
                dropped++;
                continue;
              }
              throw new Error(`HTTP ${res.status}`);
            }
            processed++;
          } else if (item.action === 'saveProject') {
            const p = item.payload;
            // Check server version timestamp for conflict detection
            try {
              const checkRes = await fetch(`/api/projects?username=${encodeURIComponent(p.username)}`);
              if (checkRes.ok) {
                const list: ProjectItem[] = await checkRes.json();
                const srv = list.find((x) => x.id === p.project?.id);
                if (srv && srv.updatedAt > (p.baseUpdatedAt || item.timestamp) && srv.updatedAt !== p.project?.updatedAt) {
                  this.addOfflineConflict({
                    id: `conf_${Date.now()}_${p.project.id}`,
                    module: 'projects',
                    resourceKey: `project:${p.project.id}`,
                    title: p.project.title || 'Projekt',
                    localData: { project: p.project },
                    serverData: srv,
                    localTimestamp: item.timestamp,
                    serverTimestamp: srv.updatedAt,
                    localSummary: `${p.project.tasks?.length || 0} Aufgaben (Lokal: ${new Date(item.timestamp).toLocaleTimeString('de-DE')})`,
                    serverSummary: `${srv.tasks?.length || 0} Aufgaben (Server: ${new Date(srv.updatedAt).toLocaleTimeString('de-DE')})`,
                  });
                  processed++;
                  continue;
                }
              }
            } catch {}
            const res = await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(p.project),
            });
            if (!res.ok) {
              if (res.status >= 400 && res.status < 500) {
                dropped++;
                continue;
              }
              throw new Error(`HTTP ${res.status}`);
            }
            processed++;
          } else {
            dropped++;
          }
        } catch (err: any) {
          remaining.push({
            ...item,
            attempts: (item.attempts || 0) + 1,
            lastError: err?.message || 'Netzwerkfehler',
          });
        }
      }

      this.offlineSyncQueue = remaining;
      this.saveQueue();
      if (processed > 0 || dropped > 0) {
        this.addClientLog(
          'info',
          `Offline-Sync abgeschlossen: ${processed} synchronisiert, ${dropped} verworfen, ${remaining.length} offen`,
          'SYNC'
        );
      }
      return { processed, remaining: remaining.length, dropped };
    } finally {
      this.isFlushing = false;
    }
  }

  async fetchUsers(): Promise<User[]> {
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) throw new Error('Fehler beim Laden der Benutzer');
      const users = await res.json();
      localStorage.setItem('ochrenotes_cached_users', JSON.stringify(users));
      return users;
    } catch (err: any) {
      this.addClientLog('warn', `fetchUsers Fallback auf Cache: ${err?.message || err}`, 'AUTH');
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
      this.addClientLog('warn', `Login fehlgeschlagen für '${username}': ${errData.error || res.status}`, 'AUTH');
      throw new Error(errData.error || 'Anmeldung fehlgeschlagen');
    }
    const data = await res.json();
    this.addClientLog('info', `Angemeldet als '${data.user.displayName}'`, 'AUTH');
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
    } catch {
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
    } catch (err: any) {
      this.addClientLog('warn', `fetchNotes Offline-Cache genutzt: ${err?.message || err}`, 'NOTES');
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
    } catch {
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
      this.enqueueOffline('saveNote', { username, path, content, isShared, sharedFrom, profile }, 'Offline');
      return { success: true, mtime: Date.now() };
    }

    try {
      const res = await fetch('/api/vault/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, profile, path, content, isShared, sharedFrom }),
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          this.addClientLog('error', `saveNote abgelehnt (${res.status}) für '${path}'`, 'NOTES');
          throw new Error(`HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      // Only enqueue transient / server-unavailable failures, not client 4xx errors
      const msg = err?.message || 'Netzwerkfehler';
      if (!msg.startsWith('HTTP 4')) {
        this.enqueueOffline('saveNote', { username, path, content, isShared, sharedFrom, profile }, msg);
      }
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
    } catch {
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
      this.enqueueOffline('toggleTask' as any, { username, notePath, lineIndex, completed, isShared, sharedFrom, profile }, 'Offline');
      return true;
    }

    try {
      const res = await fetch('/api/tasks/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, profile, notePath, lineIndex, completed, isShared, sharedFrom }),
      });
      return res.ok;
    } catch (err: any) {
      this.enqueueOffline('toggleTask' as any, { username, notePath, lineIndex, completed, isShared, sharedFrom, profile }, err?.message || 'Netzwerkfehler');
      return true;
    }
  }

  async fetchGraph(username: string, profile: NoteProfileId = 'profile1'): Promise<GraphData> {
    try {
      const res = await fetch(`/api/graph?username=${encodeURIComponent(username)}&profile=${encodeURIComponent(profile)}`);
      if (!res.ok) throw new Error('Fehler beim Abrufen des Graphen');
      return await res.json();
    } catch {
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

  async saveWikiArticle(
    username: string,
    article: WikiArticle,
    oldSlug?: string,
    oldVisibility?: WikiVisibility
  ): Promise<WikiArticle> {
    if (!navigator.onLine) {
      const snap = this.getModuleOfflineSnapshot<WikiArticle[]>('wiki', username)?.data || [];
      const merged = [article, ...snap.filter((a) => a.slug !== (oldSlug || article.slug))];
      this.setModuleOfflineSnapshot('wiki', username, merged);
      localStorage.setItem(`ochre_wiki_cache_${username}`, JSON.stringify(merged));
      this.enqueueOffline('saveWiki', { username, article, oldSlug, oldVisibility }, 'Offline');
      return article;
    }
    const res = await fetch('/api/wiki/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, article, oldSlug, oldVisibility }),
    });
    if (!res.ok) throw new Error('Fehler beim Speichern des Wiki-Artikels');
    return await res.json();
  }

  async deleteWikiArticle(username: string, slug: string, visibility?: WikiVisibility): Promise<boolean> {
    const visParam = visibility ? `&visibility=${encodeURIComponent(visibility)}` : '';
    const res = await fetch(
      `/api/wiki/articles?username=${encodeURIComponent(username)}&slug=${encodeURIComponent(slug)}${visParam}`,
      { method: 'DELETE' }
    );
    return res.ok;
  }

  async uploadWikiMedia(
    username: string,
    filename: string,
    dataUrl: string,
    visibility: WikiVisibility = 'public'
  ): Promise<{ url: string; filename: string; mediaKind: 'image' | 'video' }> {
    const res = await fetch('/api/wiki/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, filename, dataUrl, visibility }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Medien-Upload fehlgeschlagen');
    }
    return await res.json();
  }

  async uploadWikiImage(
    username: string,
    filename: string,
    dataUrl: string,
    visibility: WikiVisibility = 'public'
  ): Promise<{ url: string; filename: string }> {
    return this.uploadWikiMedia(username, filename, dataUrl, visibility);
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
    hasLibrary: boolean;
    library: MealPlanLibrary | null;
    libraries?: MealPlanLibrary[];
    invitations: MealPlanInvitation[];
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
    try {
      const res = await fetch(`/api/cookbook?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Fehler beim Laden des Essensplans');
      const data = await res.json();
      this.setModuleOfflineSnapshot('recipes', username, data);
      return data;
    } catch (err) {
      const snap = this.getModuleOfflineSnapshot<any>('recipes', username);
      if (snap?.data) return snap.data;
      throw err;
    }
  }

  async createOrUpdateMealLibrary(payload: {
    username: string;
    libraryId?: string;
    name: string;
    visibility: 'private' | 'shared';
    invitedUsers?: string[];
    createNew?: boolean;
  }): Promise<{ success: boolean; library: MealPlanLibrary }> {
    const res = await fetch('/api/cookbook/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Library konnte nicht gespeichert werden');
    }
    return await res.json();
  }

  async selectMealLibrary(username: string, libraryId: string): Promise<{ success: boolean; library: MealPlanLibrary }> {
    const res = await fetch('/api/cookbook/library/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, libraryId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Konnte Bibliothek nicht wechseln');
    }
    return await res.json();
  }

  async deleteMealLibrary(username: string, libraryId: string): Promise<boolean> {
    const res = await fetch(
      `/api/cookbook/library?username=${encodeURIComponent(username)}&libraryId=${encodeURIComponent(libraryId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Bibliothek konnte nicht gelöscht werden');
    }
    return true;
  }

  async joinMealLibrary(username: string, libraryId: string): Promise<{ success: boolean; library: MealPlanLibrary }> {
    const res = await fetch('/api/cookbook/library/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, libraryId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Konnte Library nicht beitreten');
    }
    return await res.json();
  }

  async declineMealLibrary(username: string, libraryId: string): Promise<boolean> {
    const res = await fetch('/api/cookbook/library/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, libraryId }),
    });
    return res.ok;
  }

  async leaveMealLibrary(username: string, libraryId: string): Promise<boolean> {
    const res = await fetch('/api/cookbook/library/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, libraryId }),
    });
    return res.ok;
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
    if (!navigator.onLine) {
      const snap = this.getModuleOfflineSnapshot<any>('recipes', username)?.data || {};
      this.setModuleOfflineSnapshot('recipes', username, { ...snap, ...payload });
      this.enqueueOffline('saveCookbook', { username, ...payload }, 'Offline');
      return true;
    }
    try {
      const res = await fetch('/api/cookbook/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ...payload }),
      });
      return res.ok;
    } catch (err: any) {
      this.enqueueOffline('saveCookbook', { username, ...payload }, err?.message || 'Netzwerkfehler');
      return true;
    }
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
    } catch {
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
    try {
      const res = await fetch('/api/system/logs');
      if (!res.ok) return [];
      return await res.json();
    } catch (err: any) {
      this.addClientLog('error', `Fehler beim Abrufen der Server-Logs: ${err?.message || err}`, 'DIAG');
      return [];
    }
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

  // OpenGraph Link Preview
  async fetchOpenGraph(url: string): Promise<OpenGraphPreview> {
    const res = await fetch(`/api/og-preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Vorschau nicht verfügbar');
    return await res.json();
  }

  // Projects API
  async fetchProjects(username: string): Promise<ProjectItem[]> {
    try {
      const res = await fetch(`/api/projects?username=${encodeURIComponent(username)}`);
      if (!res.ok) return [];
      const data = await res.json();
      localStorage.setItem(`ochre_projects_cache_${username}`, JSON.stringify(data));
      return data;
    } catch {
      const cached = localStorage.getItem(`ochre_projects_cache_${username}`);
      return cached ? JSON.parse(cached) : [];
    }
  }

  async saveProject(username: string, project: ProjectItem): Promise<ProjectItem> {
    const cachedListRaw = localStorage.getItem(`ochre_projects_cache_${username}`);
    const cachedList: ProjectItem[] = cachedListRaw ? JSON.parse(cachedListRaw) : [];
    const baseUpdatedAt = cachedList.find((p) => p.id === project.id)?.updatedAt || project.updatedAt;
    if (!navigator.onLine) {
      const next = [project, ...cachedList.filter((p) => p.id !== project.id)];
      localStorage.setItem(`ochre_projects_cache_${username}`, JSON.stringify(next));
      this.enqueueOffline('saveProject', { username, project, baseUpdatedAt }, 'Offline');
      return project;
    }
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...project, ownerUsername: project.ownerUsername || username }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Projekt konnte nicht gespeichert werden');
      }
      const data = await res.json();
      return data.project || data;
    } catch (err: any) {
      this.enqueueOffline('saveProject', { username, project, baseUpdatedAt }, err?.message || 'Netzwerkfehler');
      return project;
    }
  }

  async deleteProject(username: string, projectId: string): Promise<boolean> {
    const res = await fetch(
      `/api/projects?username=${encodeURIComponent(username)}&id=${encodeURIComponent(projectId)}`,
      { method: 'DELETE' }
    );
    return res.ok;
  }

  // Smarthome MQTT & Telemetry API
  async fetchSmarthomeState(username: string): Promise<SmarthomeState> {
    try {
      const res = await fetch(`/api/smarthome/state?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Fehler beim Laden');
      const data = await res.json();
      return {
        brokers: Array.isArray(data.brokers) ? data.brokers : [],
        dbSources: Array.isArray(data.dbSources) ? data.dbSources : [],
        tiles: Array.isArray(data.tiles) ? data.tiles : [],
        values: data.values || {},
      };
    } catch {
      return { brokers: [], dbSources: [], tiles: [], values: {} };
    }
  }

  async discoverSmarthomeBrokers(): Promise<SmarthomeDiscoveredBroker[]> {
    const res = await fetch('/api/smarthome/discover', { method: 'POST' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.discovered || data.found || [];
  }

  async saveSmarthomeBroker(broker: SmarthomeBrokerConfig): Promise<SmarthomeBrokerConfig> {
    const res = await fetch('/api/smarthome/brokers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broker),
    });
    if (!res.ok) throw new Error('Broker konnte nicht gespeichert werden');
    const data = await res.json();
    return data.broker || data;
  }

  async deleteSmarthomeBroker(brokerId: string): Promise<boolean> {
    const res = await fetch(`/api/smarthome/brokers?id=${encodeURIComponent(brokerId)}`, { method: 'DELETE' });
    return res.ok;
  }

  async saveSmarthomeDbSource(source: SmarthomeDbSource): Promise<SmarthomeDbSource> {
    const res = await fetch('/api/smarthome/db-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source),
    });
    if (!res.ok) throw new Error('Datenbank-Quelle konnte nicht gespeichert werden');
    const data = await res.json();
    return data.source || data;
  }

  async deleteSmarthomeDbSource(sourceId: string): Promise<boolean> {
    const res = await fetch(`/api/smarthome/db-sources?id=${encodeURIComponent(sourceId)}`, { method: 'DELETE' });
    return res.ok;
  }

  async pollSmarthomeDbSource(sourceId?: string): Promise<{ success: boolean; values?: Record<string, SmarthomeLiveValue> }> {
    const res = await fetch('/api/smarthome/db-sources/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    });
    if (!res.ok) return { success: false };
    return await res.json();
  }

  async saveSmarthomeTile(tile: SmarthomeTile): Promise<SmarthomeTile> {
    const res = await fetch('/api/smarthome/tiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tile),
    });
    if (!res.ok) throw new Error('Kachel konnte nicht gespeichert werden');
    const data = await res.json();
    return data.tile || data;
  }

  async deleteSmarthomeTile(tileId: string): Promise<boolean> {
    const res = await fetch(`/api/smarthome/tiles?id=${encodeURIComponent(tileId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  }

  async adoptSmarthomePreset(username: string, presetId: string): Promise<SmarthomeTile> {
    const res = await fetch('/api/smarthome/tiles/adopt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, presetId }),
    });
    if (!res.ok) throw new Error('Vorgabe konnte nicht übernommen werden');
    const data = await res.json();
    return data.tile || data;
  }

  async fetchSmarthomeMqttTopics(brokerId?: string): Promise<SmarthomeDiscoveredTopic[]> {
    try {
      const q = brokerId ? `?brokerId=${encodeURIComponent(brokerId)}` : '';
      const res = await fetch(`/api/smarthome/mqtt-topics${q}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.topics) ? data.topics : [];
    } catch {
      return [];
    }
  }

  async testSmarthomeMqtt(broker: Partial<SmarthomeBrokerConfig>): Promise<{
    ok: boolean;
    latencyMs: number;
    message: string;
    detail?: string;
  }> {
    const res = await fetch('/api/smarthome/test-mqtt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broker),
    });
    return await res.json();
  }

  async testSmarthomeDb(
    source: Partial<SmarthomeDbSource>,
    samplePath?: string
  ): Promise<{
    ok: boolean;
    latencyMs: number;
    message: string;
    detail?: string;
    sampleValue?: string;
  }> {
    const res = await fetch('/api/smarthome/test-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, samplePath }),
    });
    return await res.json();
  }

  async triggerSmarthomeAction(payload: {
    tileId: string;
    fieldId?: string;
    targetState: boolean;
    value?: string;
  }): Promise<{ ok: boolean; value?: string; message?: string }> {
    const res = await fetch('/api/smarthome/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  // RSS Reader API (Sources persisted in Vault, Articles live-only)
  async fetchRssSources(username: string): Promise<RssSource[]> {
    try {
      const res = await fetch(`/api/rss/sources?username=${encodeURIComponent(username)}`);
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data.sources) ? data.sources : Array.isArray(data) ? data : [];
      this.setModuleOfflineSnapshot('rss', username, list);
      return list;
    } catch {
      return this.getModuleOfflineSnapshot<RssSource[]>('rss', username)?.data || [];
    }
  }

  async saveRssSources(username: string, sources: RssSource[]): Promise<RssSource[]> {
    this.setModuleOfflineSnapshot('rss', username, sources);
    const res = await fetch('/api/rss/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, sources }),
    });
    if (!res.ok) throw new Error('RSS-Quellen konnten nicht gespeichert werden');
    const data = await res.json();
    return Array.isArray(data.sources) ? data.sources : sources;
  }

  async fetchRssFeed(
    sources: RssSource[],
    hidePaidGlobal: boolean
  ): Promise<{ articles: RssArticle[]; errors: { sourceId: string; title: string; error: string }[] }> {
    const res = await fetch('/api/rss/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources, hidePaidGlobal }),
    });
    if (!res.ok) throw new Error('Feed konnte nicht abgerufen werden');
    return await res.json();
  }

  async fetchRssArticleReader(
    url: string,
    fallbackTitle?: string,
    fallbackSummary?: string,
    fallbackContent?: string
  ): Promise<RssReaderResponse> {
    const res = await fetch('/api/rss/reader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, fallbackTitle, fallbackSummary, fallbackContent }),
    });
    if (!res.ok) throw new Error('Artikel konnte nicht geladen werden');
    return await res.json();
  }

  async fetchChangelog(): Promise<ChangelogResponse> {
    try {
      const res = await fetch('/api/system/changelog');
      if (!res.ok) return { versions: [], raw: '' };
      return await res.json();
    } catch {
      return { versions: [], raw: '' };
    }
  }
}

export const api = new ApiService();
