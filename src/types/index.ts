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

export type SuiteModuleId = 'notes' | 'recipes' | 'finance';

export interface EnabledModules {
  notes: boolean;
  recipes: boolean;
  finance: boolean;
}

// Recipes & Meal Planning Types
export interface RecipeIngredient {
  id: string;
  name: string;
  amount: string;
}

export interface Recipe {
  id: string;
  title: string;
  category: 'Frühstück' | 'Mittagessen' | 'Abendessen' | 'Snack' | 'Dessert';
  prepTimeMinutes: number;
  portions: number;
  description: string;
  instructions: string[];
  ingredients: RecipeIngredient[];
  tags: string[];
  color?: string;
}

export interface MealCycleDay {
  dayIndex: number; // 0 to cycleLength - 1
  label: string; // e.g. "Tag 1"
  recipeIds: string[]; // Assigned recipe ids for this cycle day
}

export interface MealCycle {
  id: string;
  name: string;
  cycleLengthDays: number; // e.g. 7, 14, 21
  startDate: string; // YYYY-MM-DD
  days: MealCycleDay[];
}

export interface MealCalendarOverride {
  date: string; // YYYY-MM-DD
  recipeIds: string[]; // Specific recipes for this single date
  note?: string;
  isOneTimeChange: boolean;
}

// Finance & CSV Creditor Types
export interface CreditorCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface CreditorRule {
  id: string;
  matchPattern: string; // Keyword or regex to match creditor in CSV
  creditorName: string;
  categoryId: string;
}

export interface FinanceTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  creditor: string;
  categoryId: string;
  amount: number; // Positive = income, Negative = expense
  description: string;
  type: 'card' | 'transfer' | 'cash' | 'direct_debit';
  isCash?: boolean;
}
