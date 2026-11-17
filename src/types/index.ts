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
  isInbox?: boolean;
}

export interface NoteContent extends NoteMetadata {
  content: string;
}

export interface NoteMediaItem {
  filename: string;
  url: string;
  size: number;
  mtime: number;
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

export type SuiteModuleId = 'dashboard' | 'notes' | 'wiki' | 'recipes' | 'finance';

export interface EnabledModules {
  dashboard: boolean;
  notes: boolean;
  wiki: boolean;
  recipes: boolean;
  finance: boolean;
}

export type NoteProfileId = 'profile1' | 'profile2';

export interface ModuleColors {
  dashboard?: string;
  notes: string;
  wiki: string;
  recipes: string;
  finance: string;
}

export interface NoteProfileConfig {
  id: NoteProfileId;
  name: string;
  colors: ModuleColors;
}

export interface OfflineQueueItem {
  id: string;
  action: 'saveNote' | 'saveWiki' | 'saveCookbook' | 'saveFinance';
  payload: any;
  timestamp: number;
  attempts?: number;
  lastError?: string;
}

export interface SuiteProfileSettings {
  enableSecondProfile: boolean;
  activeProfileId: NoteProfileId;
  mobileBarPosition?: 'top' | 'bottom';
  profile1: NoteProfileConfig;
  profile2: NoteProfileConfig;
}

export type DashboardWidgetId =
  | 'notes_tasks_open'
  | 'cookbook_shopping_open'
  | 'cookbook_today_meals'
  | 'notes_summary'
  | 'finance_balance'
  | 'wiki_overview'
  | 'cookbook_catalog_stats'
  | 'finance_recent_tx'
  | 'system_health'
  | 'quick_actions';

export interface DashboardSettings {
  maxWidgets: number;
  selectedWidgets: DashboardWidgetId[];
}

// Open-Standard Wiki Types (saved as standard Markdown + YAML frontmatter + local asset files)
export interface WikiCodeSnippet {
  id: string;
  title: string;
  language: string;
  code: string;
}

export interface WikiImage {
  id: string;
  url: string;
  alt: string;
  caption?: string;
}

export interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  updatedAt: string;
  body: string;
  images: WikiImage[];
  snippets: WikiCodeSnippet[];
  rawMarkdown?: string;
}

// Essensplan (Meals & Meal Planning) Types
export type CookbookTab = 'calendar' | 'cycle' | 'recipes' | 'shopping' | 'presentation';

export interface MealSectionConfig {
  id: string;
  label: string;
}

export interface CookbookSettings {
  defaultCyclePortions: number;
  enableShoppingList?: boolean;
  enableCycle?: boolean;
  mealSections?: MealSectionConfig[];
  weekdayColors?: Record<string, string>; // key: '0'..'6' (JS Date.getDay(), '1'=Mo..'0'=So)
  units?: string[];
}

export interface MealPlanLibrary {
  id: string;
  name: string;
  ownerUsername: string;
  ownerDisplayName: string;
  visibility: 'private' | 'shared';
  invitedUsers: string[];
  members: string[];
  createdAt: number;
}

export interface MealPlanInvitation {
  libraryId: string;
  name: string;
  ownerUsername: string;
  ownerDisplayName: string;
  membersCount: number;
  createdAt: number;
}

export interface IngredientMeta {
  key: string;
  displayName: string;
  excludeFromShoppingList?: boolean;
  defaultUnit?: string;
  isCustom?: boolean;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  amount: string;
}

export interface Recipe {
  id: string;
  title: string;
  category: string;
  mealTypes?: string[]; // Multiple choice e.g. ['Mittag', 'Abend']
  prepTimeMinutes: number;
  portions: number;
  description: string;
  instructions: string[];
  ingredients: RecipeIngredient[];
  tags: string[];
  color?: string;
  sharedFrom?: string;
  images?: string[];
  mediaDir?: string;
  excludeFromShoppingList?: boolean;
}

export interface MealCycleDay {
  dayIndex: number; // 0 to cycleLength - 1
  label: string; // e.g. "Tag 1"
  recipeIds: string[]; // Flat legacy/compatibility union of planned recipes
  slots?: Record<string, string[]>; // Section-based mapping: sectionId -> recipeIds
  portions?: number; // Target portions for this cycle day
}

export interface MealCycle {
  id: string;
  name: string;
  cycleLengthDays: number; // e.g. 7, 14, 21
  startDate: string; // YYYY-MM-DD
  defaultPortions?: number;
  days: MealCycleDay[];
}

export interface MealCalendarOverride {
  date: string; // YYYY-MM-DD
  recipeIds: string[]; // Flat union of recipes for this date
  slots?: Record<string, string[]>; // Section-based mapping: sectionId -> recipeIds
  portions?: number;
  note?: string;
  isOneTimeChange: boolean;
}

export interface CookbookSharingSettings {
  shareCatalog: boolean;
  catalogSharedWith: string[]; // ['*'] for all users, or specific usernames
  shareCycleAndCalendar: boolean;
  cycleSharedWith: string[]; // ['*'] for all users, or specific usernames
}

export interface SharedCookbookCatalog {
  ownerUsername: string;
  ownerDisplayName: string;
  recipes: Recipe[];
  categories: string[];
}

export interface SharedMealPlan {
  ownerUsername: string;
  ownerDisplayName: string;
  cycle: MealCycle;
  overrides: Record<string, MealCalendarOverride>;
  recipes: Recipe[];
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

export interface TaskNotificationSettings {
  enabled: boolean;
  notifyToday: boolean;
  notifyOverdue: boolean;
  reminderTime: string; // HH:mm
}
