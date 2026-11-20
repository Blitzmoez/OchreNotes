import {
  SuiteProfileSettings,
  EnabledModules,
  DashboardSettings,
  DashboardWidgetId,
  MealSectionConfig,
  SuiteModuleId,
  ProjectColumnConfig,
} from '../types';

export const DEFAULT_MODULE_ORDER: SuiteModuleId[] = [
  'dashboard',
  'notes',
  'wiki',
  'recipes',
  'finance',
  'projects',
  'smarthome',
  'rss',
];

export const FINANCE_UNASSIGNED_CATEGORY_ID = 'cat_unassigned';

export const DEFAULT_PROJECT_COLUMNS: ProjectColumnConfig[] = [
  { id: 'todo', label: 'Offen', color: '#6B7280' },
  { id: 'in_progress', label: 'In Arbeit', color: '#B45309' },
  { id: 'review', label: 'Prüfung', color: '#2563EB' },
  { id: 'done', label: 'Erledigt', color: '#10B981' },
];

export const OCHRE_COLOR_PRESETS = [
  { name: 'Klassik Ocker', hex: '#C87D20' },
  { name: 'Terrakotta Ocker', hex: '#C26D2D' },
  { name: 'Kupfer Siena', hex: '#B87333' },
  { name: 'Bronze Amber', hex: '#8E6126' },
  { name: 'Röst-Ocker', hex: '#B45309' },
  { name: 'Senf Gold', hex: '#A67C21' },
  { name: 'Umbra Dunkel', hex: '#6D4C2F' },
  { name: 'Salbei Olive', hex: '#6E7F4F' },
];

export const DEFAULT_MEAL_SECTIONS: MealSectionConfig[] = [
  { id: 'mittag', label: 'Mittag' },
  { id: 'abend', label: 'Abend' },
];

export const DEFAULT_WEEKDAY_COLORS: Record<string, string> = {
  '1': '#C87D20', // Mo
  '2': '#B87333', // Di
  '3': '#A67C21', // Mi
  '4': '#C26D2D', // Do
  '5': '#6E7F4F', // Fr
  '6': '#8E6126', // Sa
  '0': '#B45309', // So
};

export const MEAL_TYPE_OPTIONS: string[] = [
  'Frühstück',
  'Mittag',
  'Abend',
  'Snack',
  'Dessert',
];

export const DEFAULT_MEAL_UNITS: string[] = [
  'Gramm',
  'KG',
  'Liter',
  'ml',
  'Päckchen',
  'Stück',
  'EL',
  'TL',
  'Bund',
  'Prise',
  'Dose',
  'Becher',
];

export const DEFAULT_ENABLED_MODULES: EnabledModules = {
  dashboard: true,
  notes: true,
  wiki: true,
  recipes: true,
  finance: true,
  smarthome: true,
  projects: true,
  rss: true,
};

export const DEFAULT_PROFILE_SETTINGS: SuiteProfileSettings = {
  enableSecondProfile: true,
  activeProfileId: 'profile1',
  mobileBarPosition: 'top',
  moduleOrder: DEFAULT_MODULE_ORDER,
  offlineModules: {},
  profile1: {
    id: 'profile1',
    name: 'Privat',
    colors: {
      dashboard: '#A67C21',
      notes: '#C87D20',
      wiki: '#B87333',
      recipes: '#C26D2D',
      finance: '#8E6126',
      smarthome: '#6E7F4F',
      projects: '#B45309',
      rss: '#D97706',
    },
  },
  profile2: {
    id: 'profile2',
    name: 'Business',
    colors: {
      dashboard: '#6D4C2F',
      notes: '#8F5E1E',
      wiki: '#9E6B2B',
      recipes: '#B45309',
      finance: '#6D4C2F',
      smarthome: '#5C6B42',
      projects: '#8E6126',
      rss: '#B45309',
    },
  },
};

export const MAX_DASHBOARD_WIDGETS = 6;

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  module: 'notes' | 'recipes' | 'wiki' | 'finance' | 'smarthome' | 'projects' | 'rss' | 'system';
  title: string;
  description: string;
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetDefinition[] = [
  {
    id: 'notes_tasks_open',
    module: 'notes',
    title: 'Offene Aufgaben (Notes)',
    description: 'Zeigt fällige & offene To-dos mit direktem Abhaken in der Kachel.',
  },
  {
    id: 'cookbook_shopping_open',
    module: 'recipes',
    title: 'Offener Einkaufs-Forecast (Essensplan)',
    description: 'Noch nicht abgehakte Verbrauchsgüter dieser Woche mit 1-Klick-Abhaken.',
  },
  {
    id: 'cookbook_today_meals',
    module: 'recipes',
    title: 'Essensplan Heute & Morgen',
    description: 'Geplante Gerichte inkl. Portionen, Zubereitungszeit und Direktlink.',
  },
  {
    id: 'finance_balance',
    module: 'finance',
    title: 'Finanzen Monats-Bilanz',
    description: 'Aktueller Kontosaldo, Einnahmen, Ausgaben & Barzahlungs-Anteil.',
  },
  {
    id: 'notes_summary',
    module: 'notes',
    title: 'Notizen & Inbox Übersicht',
    description: 'Notizen-Anzahl, Ordner, unsortierte Inbox-Notizen & letzte Einträge.',
  },
  {
    id: 'wiki_overview',
    module: 'wiki',
    title: 'Wiki Wissens-Statistik',
    description: 'Anzahl gespeicherter Artikel, Kategorien, Fotos & Code-Snippets.',
  },
  {
    id: 'cookbook_catalog_stats',
    module: 'recipes',
    title: 'Essensplan Katalog & Zutaten-Stats',
    description: 'Rezepte, gesammelte Zutaten, ausgeschlossene Posten & Duplikate.',
  },
  {
    id: 'finance_recent_tx',
    module: 'finance',
    title: 'Letzte Buchungen (Finanzen)',
    description: 'Die 4 aktuellsten Bank- und Bartransaktionen im Überblick.',
  },
  {
    id: 'smarthome_overview',
    module: 'smarthome',
    title: 'Smarthome Live-Werte',
    description: 'Aktuelle MQTT & Datenbank-Kacheln direkt auf dem Dashboard.',
  },
  {
    id: 'projects_open',
    module: 'projects',
    title: 'Aktive Projekte & Kanban',
    description: 'Laufende Projekte, offene Kanban-Aufgaben und anstehende Deadlines.',
  },
  {
    id: 'rss_overview',
    module: 'rss',
    title: 'RSS Feed-Quellen',
    description: 'Aktive News-Quellen und schneller Einstieg in deinen ablenkungsfreien Reader.',
  },
  {
    id: 'system_health',
    module: 'system',
    title: 'Server & Sync Status',
    description: 'Docker-Volume, Offline-Queue, Speicherverbrauch & Systemzustand.',
  },
  {
    id: 'quick_actions',
    module: 'system',
    title: 'Modul-Schnellzugriffe',
    description: 'Direkte Sprungbuttons zu Kalender, Wochenshow, Notizen & Modulen.',
  },
];

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  maxWidgets: MAX_DASHBOARD_WIDGETS,
  selectedWidgets: [
    'notes_tasks_open',
    'cookbook_shopping_open',
    'cookbook_today_meals',
    'finance_balance',
    'projects_open',
    'smarthome_overview',
  ],
};
