import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'de' | 'en';

export interface Translations {
  notes: string;
  tasks: string;
  graph: string;
  vaultExplorer: string;
  myNotes: string;
  sharedWithMe: string;
  newNote: string;
  newFolder: string;
  folderName: string;
  createFolder: string;
  deleteFolder: string;
  folderEmpty: string;
  searchNotes: string;
  searchTasks: string;
  filterTags: string;
  allTags: string;
  openTasks: string;
  overdue: string;
  dueToday: string;
  thisWeek: string;
  completed: string;
  goToNote: string;
  noTasksFound: string;
  settings: string;
  languageSelect: string;
  printA4: string;
  dockerDiagnostics: string;
  shareNote: string;
  themeToggle: string;
  darkMode: string;
  lightMode: string;
  installPwa: string;
  switchUser: string;
  logout: string;
  passwordProtected: string;
  noPassword: string;
  setPassword: string;
  enterPassword: string;
  passwordSaved: string;
  passwordRemoved: string;
  loginError: string;
  cancel: string;
  back: string;
  save: string;
  saved: string;
  deleteNoteConfirm: string;
  deleteFolderConfirm: string;
  toolsHide: string;
  toolsShow: string;
  splitPane: string;
  equalSplit: string;
  addTab: string;
  closeTab: string;
  allSynced: string;
  inQueue: string;
  words: string;
  chars: string;
  lines: string;
  readingTime: string;
}

export const translations: Record<Language, Translations> = {
  de: {
    notes: 'Notizen',
    tasks: 'Aufgaben',
    graph: 'Wissensgraph',
    vaultExplorer: 'Vault Explorer',
    myNotes: 'Meine Notizen',
    sharedWithMe: 'Für mich freigegeben',
    newNote: 'Neue Notiz',
    newFolder: 'Neuer Ordner',
    folderName: 'Ordnername...',
    createFolder: 'Ordner anlegen',
    deleteFolder: 'Ordner löschen',
    folderEmpty: '(Keine Notizen)',
    searchNotes: 'Notizen durchsuchen...',
    searchTasks: 'Aufgaben durchsuchen...',
    filterTags: 'Tags filtern',
    allTags: 'Alle Tags',
    openTasks: 'Offene Aufgaben',
    overdue: 'Überfällig',
    dueToday: 'Heute fällig',
    thisWeek: 'Diese Woche',
    completed: 'Erledigt',
    goToNote: 'Zur Notiz springen',
    noTasksFound: 'Keine Aufgaben in dieser Ansicht',
    settings: 'Einstellungen & Vault',
    languageSelect: 'Sprachauswahl / Language',
    printA4: 'DIN A4 Druck / PDF',
    dockerDiagnostics: 'Docker Container & Diagnose',
    shareNote: 'Notiz teilen',
    themeToggle: 'Design',
    darkMode: 'Dunkelmodus',
    lightMode: 'Hellmodus',
    installPwa: 'App installieren (PWA)',
    switchUser: 'Benutzer wechseln',
    logout: 'Abmelden / Sperren',
    passwordProtected: 'Geschützt',
    noPassword: 'Kein Passwort',
    setPassword: 'Passwort festlegen',
    enterPassword: 'Passwort eingeben...',
    passwordSaved: 'Passwort erfolgreich gespeichert!',
    passwordRemoved: 'Passwort entfernt.',
    loginError: 'Anmeldung fehlgeschlagen oder falsches Passwort',
    cancel: 'Abbrechen',
    back: 'Zurück',
    save: 'Speichern',
    saved: 'Gespeichert',
    deleteNoteConfirm: 'Notiz wirklich löschen?',
    deleteFolderConfirm: 'Ordner löschen? (Nur möglich wenn leer)',
    toolsHide: 'Werkzeugleiste ausblenden',
    toolsShow: 'Werkzeugleiste einblenden',
    splitPane: 'Split',
    equalSplit: '50/50',
    addTab: 'Tab hinzufügen',
    closeTab: 'Tab schließen',
    allSynced: 'Alles synchron',
    inQueue: 'in Warteschlange',
    words: 'Wörter',
    chars: 'Zeichen',
    lines: 'Zeilen',
    readingTime: 'min Lesezeit',
  },
  en: {
    notes: 'Notes',
    tasks: 'Tasks',
    graph: 'Knowledge Graph',
    vaultExplorer: 'Vault Explorer',
    myNotes: 'My Notes',
    sharedWithMe: 'Shared with me',
    newNote: 'New Note',
    newFolder: 'New Folder',
    folderName: 'Folder name...',
    createFolder: 'Create Folder',
    deleteFolder: 'Delete Folder',
    folderEmpty: '(No notes)',
    searchNotes: 'Search notes...',
    searchTasks: 'Search tasks...',
    filterTags: 'Filter tags',
    allTags: 'All tags',
    openTasks: 'Open Tasks',
    overdue: 'Overdue',
    dueToday: 'Due Today',
    thisWeek: 'This Week',
    completed: 'Completed',
    goToNote: 'Go to Note',
    noTasksFound: 'No tasks found in this view',
    settings: 'Settings & Vault',
    languageSelect: 'Language Selection',
    printA4: 'Print A4 / PDF',
    dockerDiagnostics: 'Docker Container & Diagnostics',
    shareNote: 'Share Note',
    themeToggle: 'Theme',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    installPwa: 'Install App (PWA)',
    switchUser: 'Switch User',
    logout: 'Lock / Logout',
    passwordProtected: 'Protected',
    noPassword: 'No Password',
    setPassword: 'Set Password',
    enterPassword: 'Enter password...',
    passwordSaved: 'Password saved successfully!',
    passwordRemoved: 'Password removed.',
    loginError: 'Login failed or incorrect password',
    cancel: 'Cancel',
    back: 'Back',
    save: 'Save',
    saved: 'Saved',
    deleteNoteConfirm: 'Delete this note?',
    deleteFolderConfirm: 'Delete this folder? (Only allowed if empty)',
    toolsHide: 'Hide toolbar',
    toolsShow: 'Show toolbar',
    splitPane: 'Split',
    equalSplit: '50/50',
    addTab: 'Add Tab',
    closeTab: 'Close Tab',
    allSynced: 'All synchronized',
    inQueue: 'in sync queue',
    words: 'Words',
    chars: 'Chars',
    lines: 'Lines',
    readingTime: 'min read',
  },
};

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}>({
  language: 'de',
  setLanguage: () => {},
  t: translations.de,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('ochre_language');
      if (saved === 'en' || saved === 'de') return saved;
    } catch {}
    return 'de';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('ochre_language', lang);
      window.dispatchEvent(new Event('ochre_language_changed'));
    } catch {}
  };

  useEffect(() => {
    const handler = () => {
      try {
        const saved = localStorage.getItem('ochre_language');
        if ((saved === 'en' || saved === 'de') && saved !== language) {
          setLanguageState(saved);
        }
      } catch {}
    };
    window.addEventListener('ochre_language_changed', handler);
    return () => window.removeEventListener('ochre_language_changed', handler);
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: translations[language] || translations.de,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useTranslation = () => useContext(LanguageContext);
