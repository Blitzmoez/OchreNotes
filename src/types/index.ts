export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: 'admin' | 'user' | 'family';
  description?: string;
  hasPassword?: boolean;
}

export interface NoteMetadata {
  id: string;
  path: string;
  title: string;
  folder: string;
  mtime: number;
  size: number;
  tags: string[];
  tasksCount: number;
  completedTasksCount: number;
  isShared?: boolean;
  sharedFromUser?: string;
  sharedFromDisplayName?: string;
  permission?: 'read' | 'write';
}

export interface NoteContent extends NoteMetadata {
  content: string;
}

export interface TaskItem {
  id: string;
  notePath: string;
  noteTitle: string;
  lineIndex: number;
  rawText: string;
  title: string;
  completed: boolean;
  dueDate: string | null; // YYYY-MM-DD
  isOverdue: boolean;
  isDueToday: boolean;
  priority: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
  recurrence?: string;
  isShared?: boolean;
  sharedFrom?: string;
}

export interface ShareRecord {
  id: string;
  notePath: string;
  ownerId: string;
  ownerUsername?: string;
  ownerDisplayName?: string;
  sharedWithUserId: string;
  sharedWithUsername?: string;
  permission: 'read' | 'write';
  createdAt: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  source: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error';
  uptimeSeconds: number;
  vaultPath: string;
  volumeWritable: boolean;
  notesCount: number;
  tasksCount: number;
  memoryMb: number;
  dockerDetected: boolean;
  port: number;
  logsCount: number;
}

export type PaneType = 'editor' | 'preview' | 'split' | 'tasks' | 'graph';

export interface WorkspacePane {
  id: string;
  type: PaneType;
  notePath: string | null;
  title: string;
  isPinned?: boolean;
}

export type YouTubeDisplayMode = 'player' | 'card' | 'link';

export interface GraphNode {
  id: string;
  label: string;
  type: 'note' | 'tag';
  folder?: string;
  val: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
