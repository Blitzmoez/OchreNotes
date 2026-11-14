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

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
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
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function sendPushNotification(
  title: string,
  body: string,
  tag?: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: tag || `ochre_${Date.now()}`,
    data: { url: '/?view=tasks', ...(data || {}) },
  };

  // Prefer ServiceWorkerRegistration.showNotification (required on Android/Mobile Chrome & PWA)
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch {}

  // Fallback for desktop environments without an active SW registration
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
      n.close();
    };
    return true;
  } catch {
    return false;
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
  if (!force && (!settings.enabled || getNotificationPermission() !== 'granted')) {
    return { pushedCount: 0, dueCount: 0 };
  }
  if (getNotificationPermission() !== 'granted') {
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
    const ok = await sendPushNotification(
      `${prefix}: ${task.title}`,
      `Notiz: ${task.noteTitle} · Fällig am ${task.dueDate}`,
      `ochre-task-${task.id}`,
      { noteTitle: task.noteTitle, taskId: task.id }
    );
    if (ok) pushed = 1;
  } else {
    // Push up to 2 highlighted items + summary so mobile & desktop notification trays stay crisp
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
    const ok = await sendPushNotification(
      `${summaryTitle} (${parts.join(', ')})`,
      previewLines + (pending.length > 3 ? `\n+ ${pending.length - 3} weitere` : ''),
      `ochre-tasks-summary-${todayIso}`,
      { count: pending.length }
    );
    if (ok) pushed = pending.length;
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

  return sendPushNotification(
    `${label}: ${task.title}`,
    `Aus Notiz: ${task.noteTitle}`,
    `ochre-task-manual-${task.id}`,
    { noteTitle: task.noteTitle, taskId: task.id }
  );
}
