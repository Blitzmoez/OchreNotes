import { TaskItem, NoteProfileId, TaskNotificationSettings } from '../types';
import { api } from './api';

const DEFAULT_SETTINGS: TaskNotificationSettings = {
  enabled: false,
  notifyToday: true,
  notifyOverdue: true,
  reminderTime: '08:00',
};

function settingsKey(username: string) {
  return `ochre_task_notifications_${username}`;
}

function notifiedKey(username: string, dateIso: string) {
  return `ochre_notified_tasks_${username}_${dateIso}`;
}

export function isEmbeddedInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return window.Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function querySyncedNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  const direct = getNotificationPermission();
  if (direct === 'granted') return 'granted';
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied' && direct === 'denied') return 'denied';
    }
  } catch {}
  return direct;
}

export function loadNotificationSettings(username: string): TaskNotificationSettings {
  try {
    const raw = localStorage.getItem(settingsKey(username));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveNotificationSettings(username: string, settings: TaskNotificationSettings): void {
  try {
    localStorage.setItem(settingsKey(username), JSON.stringify(settings));
  } catch {}
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';

  const current = await querySyncedNotificationPermission();
  if (current === 'granted') return 'granted';

  try {
    // Support both modern Promise-based and legacy callback-based Notification.requestPermission
    const result = await new Promise<NotificationPermission>((resolve) => {
      let settled = false;
      const done = (perm: NotificationPermission) => {
        if (!settled) {
          settled = true;
          resolve(perm);
        }
      };
      try {
        const ret = window.Notification.requestPermission((perm) => done(perm));
        if (ret && typeof ret.then === 'function') {
          ret.then(done).catch(() => done(getNotificationPermission() === 'granted' ? 'granted' : 'denied'));
        }
      } catch {
        done(getNotificationPermission() === 'granted' ? 'granted' : 'denied');
      }
      setTimeout(() => done(getNotificationPermission() === 'granted' ? 'granted' : 'default'), 4000);
    });
    if (result === 'granted') return 'granted';
    return await querySyncedNotificationPermission();
  } catch {
    return await querySyncedNotificationPermission();
  }
}

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;

    // Ensure registration exists (e.g. if SW hadn't registered yet)
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch {}

    const readyReg = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(existing || null), 1500)),
    ]);
    return readyReg || null;
  } catch {
    return null;
  }
}

export async function sendPushNotification(
  title: string,
  body: string,
  tag?: string,
  data?: Record<string, any>
): Promise<{ ok: boolean; via?: 'sw' | 'notification'; reason?: string }> {
  if (!isNotificationSupported()) {
    return { ok: false, reason: 'Dieser Browser unterstützt keine Web-Benachrichtigungen.' };
  }

  const perm = await querySyncedNotificationPermission();
  if (perm !== 'granted') {
    if (isEmbeddedInIframe()) {
      return {
        ok: false,
        reason: 'Browser blockiert Push innerhalb der eingebetteten Vorschau – bitte App im eigenen Tab oder als PWA öffnen.',
      };
    }
    return {
      ok: false,
      reason:
        perm === 'denied'
          ? 'In den Browser-/Website-Einstellungen für diese Adresse blockiert.'
          : 'Berechtigung noch nicht erteilt.',
    };
  }

  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tag || `ochre_${Date.now()}`,
    data: { url: '/?view=tasks', ...(data || {}) },
  };

  // 1. Prefer ServiceWorkerRegistration.showNotification (required on Android Chrome & installed PWAs)
  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, options);
      return { ok: true, via: 'sw' };
    }
  } catch (err) {
    console.warn('SW showNotification failed, trying Window Notification fallback:', err);
  }

  // 2. Desktop / Safari fallback via standard Notification constructor
  try {
    const n = new window.Notification(title, options);
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
      n.close();
    };
    return { ok: true, via: 'notification' };
  } catch (err: any) {
    return {
      ok: false,
      reason: err?.message || 'System-Benachrichtigung konnte nicht erstellt werden.',
    };
  }
}

function getNotifiedIdsToday(username: string, todayIso: string): Set<string> {
  try {
    const raw = localStorage.getItem(notifiedKey(username, todayIso));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markNotifiedIdsToday(username: string, todayIso: string, ids: string[]): void {
  try {
    const current = getNotifiedIdsToday(username, todayIso);
    ids.forEach((id) => current.add(id));
    localStorage.setItem(notifiedKey(username, todayIso), JSON.stringify(Array.from(current)));
  } catch {}
}

export async function checkAndNotifyDueTasks(params: {
  username: string;
  activeProfile: NoteProfileId;
  enableSecondProfile?: boolean;
  force?: boolean;
}): Promise<{ pushedCount: number; dueCount: number }> {
  const { username, activeProfile, enableSecondProfile, force = false } = params;
  const settings = loadNotificationSettings(username);
  const perm = await querySyncedNotificationPermission();
  if ((!force && !settings.enabled) || perm !== 'granted') {
    return { pushedCount: 0, dueCount: 0 };
  }

  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  if (!force && settings.reminderTime) {
    const [hh, mm] = settings.reminderTime.split(':').map((x) => parseInt(x, 10));
    if (!isNaN(hh) && !isNaN(mm)) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const targetMinutes = hh * 60 + mm;
      if (currentMinutes < targetMinutes) {
        return { pushedCount: 0, dueCount: 0 };
      }
    }
  }

  const profilesToCheck: NoteProfileId[] = enableSecondProfile
    ? ['profile1', 'profile2']
    : [activeProfile];

  const allTasks: TaskItem[] = [];
  for (const prof of profilesToCheck) {
    try {
      const fetched = await api.fetchTasks(username, prof);
      allTasks.push(...fetched);
    } catch {}
  }

  const dueTasks = allTasks.filter((task) => {
    if (task.completed || !task.dueDate) return false;
    if (task.isDueToday && settings.notifyToday) return true;
    if (task.isOverdue && settings.notifyOverdue) return true;
    return false;
  });

  if (dueTasks.length === 0) {
    return { pushedCount: 0, dueCount: 0 };
  }

  const alreadySent = force ? new Set<string>() : getNotifiedIdsToday(username, todayIso);
  const pending = dueTasks.filter((t) => !alreadySent.has(t.id));
  if (pending.length === 0) {
    return { pushedCount: 0, dueCount: dueTasks.length };
  }

  let pushed = 0;
  if (pending.length === 1) {
    const task = pending[0];
    const prefix = task.isOverdue ? 'Überfällige Aufgabe' : 'Heute fällig';
    const res = await sendPushNotification(
      `${prefix}: ${task.title}`,
      `Notiz: ${task.noteTitle} · Fällig am ${task.dueDate}`,
      `ochre-task-${task.id}`,
      { noteTitle: task.noteTitle, taskId: task.id }
    );
    if (res.ok) pushed = 1;
  } else {
    const overdueCount = pending.filter((t) => t.isOverdue).length;
    const todayCount = pending.filter((t) => t.isDueToday).length;
    const previewLines = pending
      .slice(0, 3)
      .map((t) => `• ${t.title} (${t.dueDate})`)
      .join('\n');
    const summaryTitle = `Ochre Aufgaben: ${pending.length} fällig`;
    const parts: string[] = [];
    if (todayCount > 0) parts.push(`${todayCount} heute`);
    if (overdueCount > 0) parts.push(`${overdueCount} überfällig`);
    const res = await sendPushNotification(
      `${summaryTitle} (${parts.join(', ')})`,
      previewLines + (pending.length > 3 ? `\n+ ${pending.length - 3} weitere` : ''),
      `ochre-tasks-summary-${todayIso}`,
      { count: pending.length }
    );
    if (res.ok) pushed = pending.length;
  }

  if (pushed > 0) {
    markNotifiedIdsToday(
      username,
      todayIso,
      pending.map((t) => t.id)
    );
  }

  return { pushedCount: pushed, dueCount: dueTasks.length };
}

export async function notifySingleTask(task: TaskItem): Promise<boolean> {
  const label = task.isOverdue
    ? 'Überfällige Aufgabe'
    : task.isDueToday
    ? 'Heute fällig'
    : task.dueDate
    ? `Erinnerung (${task.dueDate})`
    : 'Aufgaben-Erinnerung';

  const res = await sendPushNotification(
    `${label}: ${task.title}`,
    `Aus Notiz: ${task.noteTitle}`,
    `ochre-task-manual-${task.id}`,
    { noteTitle: task.noteTitle, taskId: task.id }
  );
  return res.ok;
}
