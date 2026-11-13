import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User, NoteMetadata, PaneType, SuiteModuleId, EnabledModules, SuiteProfileSettings, NoteProfileId, WikiArticle, Recipe } from './types';
import { api } from './services/api';
import { DEFAULT_ENABLED_MODULES, DEFAULT_PROFILE_SETTINGS } from './services/profileDefaults';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/sidebar/Sidebar';
import { Workspace } from './components/workspace/Workspace';
import { WikiView } from './components/wiki/WikiView';
import { CookbookView, CookbookSnapshot } from './components/recipes/CookbookView';
import { FinanceView } from './components/finance/FinanceView';
import { ShareModal } from './components/modals/ShareModal';
import { SystemLogsModal } from './components/modals/SystemLogsModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { BookOpen, CheckSquare, Network, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { printNoteA4, printWikiArticleA4, printMealPlanA4 } from './services/printService';

const mergeProfileSettings = (raw?: Partial<SuiteProfileSettings> | null): SuiteProfileSettings => {
  if (!raw) return DEFAULT_PROFILE_SETTINGS;
  return {
    enableSecondProfile: raw.enableSecondProfile ?? DEFAULT_PROFILE_SETTINGS.enableSecondProfile,
    activeProfileId: raw.activeProfileId === 'profile2' ? 'profile2' : 'profile1',
    profile1: {
      id: 'profile1',
      name: raw.profile1?.name ?? DEFAULT_PROFILE_SETTINGS.profile1.name,
      colors: {
        ...DEFAULT_PROFILE_SETTINGS.profile1.colors,
        ...(raw.profile1?.colors || {}),
      },
    },
    profile2: {
      id: 'profile2',
      name: raw.profile2?.name ?? DEFAULT_PROFILE_SETTINGS.profile2.name,
      colors: {
        ...DEFAULT_PROFILE_SETTINGS.profile2.colors,
        ...(raw.profile2?.colors || {}),
      },
    },
  };
};

export default function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('ochrenotes_theme') === 'dark';
  });

  // Ochre Suite Active Module: 'notes' | 'wiki' | 'recipes' | 'finance'
  const [activeSuiteModule, setActiveSuiteModule] = useState<SuiteModuleId>('notes');

  // Enabled Suite Modules State (persisted per device & server)
  const [enabledModules, setEnabledModules] = useState<EnabledModules>(() => {
    try {
      const saved = localStorage.getItem('ochre_enabled_modules');
      return saved ? { ...DEFAULT_ENABLED_MODULES, ...JSON.parse(saved) } : DEFAULT_ENABLED_MODULES;
    } catch {
      return DEFAULT_ENABLED_MODULES;
    }
  });

  // Dual-Profile Settings & Per-Profile Ochre Colors
  const [profileSettings, setProfileSettings] = useState<SuiteProfileSettings>(() => {
    try {
      const saved = localStorage.getItem('ochre_profile_settings');
      return saved ? mergeProfileSettings(JSON.parse(saved)) : DEFAULT_PROFILE_SETTINGS;
    } catch {
      return DEFAULT_PROFILE_SETTINGS;
    }
  });

  // User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Vault Notes & Folders State
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [sharedNotes, setSharedNotes] = useState<NoteMetadata[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeNotePath, setActiveNotePath] = useState<string | null>(null);
  const [activeNoteTitle, setActiveNoteTitle] = useState<string>('Willkommen');
  const [activeNoteContent, setActiveNoteContent] = useState<string>('');
  const [activeIsShared, setActiveIsShared] = useState<boolean>(false);
  const [activeSharedFrom, setActiveSharedFrom] = useState<string | undefined>(undefined);
  const [activePermission, setActivePermission] = useState<'read' | 'write'>('write');
  const [lastSaved, setLastSaved] = useState<number | undefined>(undefined);

  // Workspace View Mode: 'editor' (Notizen) | 'tasks' (Aufgaben) | 'graph' (Graph)
  const [viewMode, setViewMode] = useState<PaneType>('editor');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // App Title / Branding
  const [appTitle, setAppTitle] = useState<string>('Ochre Suite');
  // Mobile Floating Ellipse Navigation State
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);

  // Modals & Active Module Snapshots (Wiki, Cookbook)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSystemLogsModalOpen, setIsSystemLogsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeWikiArticle, setActiveWikiArticle] = useState<WikiArticle | null>(null);
  const [shareModalRecipe, setShareModalRecipe] = useState<Recipe | null>(null);
  const [cookbookRefreshKey, setCookbookRefreshKey] = useState<number>(0);
  const cookbookSnapshotRef = useRef<CookbookSnapshot | null>(null);

  // Online / Sync State
  const [isOnline, setIsOnline] = useState<boolean>(api.getOnlineStatus());
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(api.getPendingSyncCount());

  // PWA Install Prompt State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  // Mobile swipe gestures state
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Dark mode effect - accurately applying class to root & body
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('ochrenotes_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('ochrenotes_theme', 'light');
    }
  }, [isDarkMode]);

  // Online status listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setPendingSyncCount(api.getPendingSyncCount());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setPendingSyncCount(api.getPendingSyncCount());
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // PWA beforeinstallprompt listener
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPwa = () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(() => {
        setDeferredInstallPrompt(null);
      });
    } else {
      alert('PWA Installation: Tippe im Browser-Teilen-Menü auf "Zum Home-Bildschirm hinzufügen" (iOS/Android) oder installiere die App über die Adressleiste.');
    }
  };

  // Initial user loading
  useEffect(() => {
    const initApp = async () => {
      try {
        const [users, config] = await Promise.all([
          api.fetchUsers(),
          api.fetchAppConfig(),
        ]);
        setAllUsers(users);
        if (config.appTitle) {
          setAppTitle(config.appTitle);
          document.title = `${config.appTitle} - Notes`;
        }

        const savedUsername = localStorage.getItem('ochrenotes_current_user') || 'michael';
        const initialUser = users.find((u) => u.username === savedUsername) || users[0];
        if (initialUser) {
          setCurrentUser(initialUser);
        }
      } catch (e) {
        console.error('Failed to initialize app', e);
      }
    };
    initApp();
  }, []);

  const handleUpdateAppTitle = (newTitle: string) => {
    setAppTitle(newTitle);
    document.title = `${newTitle} - Notes`;
  };

  // Active Profile & Dynamic Ochre Color Computation
  const activeProfileId: NoteProfileId = profileSettings.enableSecondProfile
    ? profileSettings.activeProfileId
    : 'profile1';
  const activeProfile = profileSettings[activeProfileId] || profileSettings.profile1;
  const activeAccentColor =
    activeSuiteModule === 'notes'
      ? activeProfile.colors.notes
      : profileSettings.profile1.colors[activeSuiteModule] || activeProfile.colors.notes;

  const handleUpdateProfileSettings = (next: SuiteProfileSettings) => {
    setProfileSettings(next);
    localStorage.setItem('ochre_profile_settings', JSON.stringify(next));
    if (currentUser) {
      localStorage.setItem(`ochre_profile_settings_${currentUser.username}`, JSON.stringify(next));
      api.saveProfileSettings(currentUser.username, next, enabledModules).catch(console.error);
    }
  };

  const handleSwitchProfile = (pid: NoteProfileId) => {
    if (pid === activeProfileId) return;
    const next: SuiteProfileSettings = { ...profileSettings, activeProfileId: pid };
    handleUpdateProfileSettings(next);
    setActiveNotePath(null);
    setActiveNoteTitle(next[pid].name);
    setActiveNoteContent('');
    setActiveIsShared(false);
    setActiveSharedFrom(undefined);
    setActivePermission('write');
  };

  const handleToggleModule = (moduleId: SuiteModuleId) => {
    if (moduleId === 'notes') return; // Notes is always base
    setEnabledModules(prev => {
      const next = { ...prev, [moduleId]: !prev[moduleId] };
      localStorage.setItem('ochre_enabled_modules', JSON.stringify(next));
      if (currentUser) {
        api.saveProfileSettings(currentUser.username, profileSettings, next).catch(console.error);
      }
      if (activeSuiteModule === moduleId && !next[moduleId]) {
        setActiveSuiteModule('notes');
      }
      return next;
    });
  };

  // Load saved profile settings whenever currentUser changes
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    api.fetchProfileSettings(currentUser.username).then((data) => {
      if (cancelled) return;
      if (data?.profileSettings) {
        const merged = mergeProfileSettings(data.profileSettings);
        setProfileSettings(merged);
        localStorage.setItem('ochre_profile_settings', JSON.stringify(merged));
      }
      if (data?.enabledModules) {
        const mergedMods = { ...DEFAULT_ENABLED_MODULES, ...data.enabledModules };
        setEnabledModules(mergedMods);
        localStorage.setItem('ochre_enabled_modules', JSON.stringify(mergedMods));
      }
    }).catch((err) => console.error('Failed to load profile settings', err));
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Load vault notes when user or active profile changes
  const loadVaultData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [userNotes, shared, userFolders] = await Promise.all([
        api.fetchNotes(currentUser.username, activeProfileId),
        api.fetchSharedWithMe(currentUser.username),
        api.fetchFolders(currentUser.username, activeProfileId),
      ]);
      setNotes(userNotes);
      setSharedNotes(shared);
      setFolders(userFolders);

      // Open first note if none opened
      if (!activeNotePath && userNotes.length > 0) {
        openNote(userNotes[0].path, false);
      } else if (userNotes.length === 0 && !activeNotePath) {
        setActiveNoteTitle(`${activeProfile.name} (leer)`);
        setActiveNoteContent('');
      }
    } catch (e) {
      console.error('Error loading vault data', e);
    }
  }, [currentUser, activeNotePath, activeProfileId, activeProfile.name]);

  useEffect(() => {
    if (currentUser) {
      loadVaultData();
    }
  }, [currentUser, loadVaultData]);

  // Open note handler
  const openNote = async (notePath: string, isShared = false, sharedFrom = '') => {
    if (!currentUser) return;
    try {
      const data = await api.readNote(currentUser.username, notePath, isShared, sharedFrom, activeProfileId);
      setActiveNotePath(data.path);
      setActiveNoteTitle(data.title);
      setActiveNoteContent(data.content);
      setActiveIsShared(isShared);
      setActiveSharedFrom(sharedFrom || data.sharedFromUser);
      if (isShared) {
        const sharedMeta = sharedNotes.find((n) => n.path === notePath && n.sharedFromUser === sharedFrom);
        setActivePermission(sharedMeta?.permission || 'read');
      } else {
        setActivePermission('write');
      }
      setIsMobileSidebarOpen(false);
      setViewMode('editor');
    } catch (e) {
      console.error('Error opening note', e);
    }
  };

  // Open note by title (e.g. from Wikilinks, Search, Tasks or Graph)
  const openNoteByTitle = async (title: string) => {
    if (!currentUser) return;
    const cleanTitle = title.replace(/\.md$/, '').trim();
    const found = notes.find((n) => n.title.toLowerCase() === cleanTitle.toLowerCase()) ||
                  sharedNotes.find((n) => n.title.toLowerCase() === cleanTitle.toLowerCase());
    if (found) {
      await openNote(found.path, found.isShared, found.sharedFromUser);
    } else {
      // Create new note with this title if not found
      const newPath = `${cleanTitle}.md`;
      await api.createNote(currentUser.username, newPath, `# ${cleanTitle}\n\n`, activeProfileId);
      await loadVaultData();
      await openNote(newPath);
    }
    setViewMode('editor');
  };

  // Content change auto-save handler
  const handleContentChange = (newContent: string) => {
    setActiveNoteContent(newContent);
    if (!currentUser || !activeNotePath || activePermission === 'read') return;

    api.saveNote(
      currentUser.username,
      activeNotePath,
      newContent,
      activeIsShared,
      activeSharedFrom,
      activeProfileId
    ).then(() => {
      setLastSaved(Date.now());
      setPendingSyncCount(api.getPendingSyncCount());
    });
  };

  // Create new note
  const handleCreateNote = async (folder?: string) => {
    if (!currentUser) return;
    const title = 'Neue Notiz';
    let path = folder ? `${folder}/${title}.md` : `${title}.md`;
    let counter = 1;
    while (notes.some((n) => n.path === path)) {
      path = folder ? `${folder}/${title} ${counter}.md` : `${title} ${counter}.md`;
      counter++;
    }

    const defaultContent = `# ${title} ${counter > 1 ? counter : ''}\n\nSchreibe hier...`;
    await api.createNote(currentUser.username, path, defaultContent, activeProfileId);
    await loadVaultData();
    await openNote(path);
  };

  // Create folder in vault
  const handleCreateFolder = async (folderPath: string) => {
    if (!currentUser || !folderPath.trim()) return false;
    const clean = folderPath.trim().replace(/^\/+|\/+$/g, '');
    const ok = await api.createFolder(currentUser.username, clean, activeProfileId);
    if (ok) {
      await loadVaultData();
    }
    return ok;
  };

  // Delete folder in vault (safe: only empty)
  const handleDeleteFolder = async (folderPath: string) => {
    if (!currentUser || !folderPath) return false;
    const res = await api.deleteFolder(currentUser.username, folderPath, activeProfileId);
    if (res.success) {
      await loadVaultData();
      return true;
    } else {
      alert(res.error || 'Ordner konnte nicht gelöscht werden');
      return false;
    }
  };

  // Move note (Drag & Drop in Explorer)
  const handleMoveNote = async (oldPath: string, newPath: string) => {
    if (!currentUser) return;
    try {
      await api.moveNote(currentUser.username, oldPath, newPath, activeProfileId);
      await loadVaultData();
      if (activeNotePath === oldPath) {
        setActiveNotePath(newPath);
      }
    } catch (e) {
      console.error('Failed to move note', e);
    }
  };

  // Rename note
  const handleRenameNote = async (oldPath: string, newTitle: string) => {
    if (!currentUser || !oldPath || !newTitle.trim()) return;
    const cleanTitle = newTitle.replace(/\.md$/, '').trim();
    const parts = oldPath.split('/');
    parts.pop();
    const folder = parts.join('/');
    const newPath = folder ? `${folder}/${cleanTitle}.md` : `${cleanTitle}.md`;
    if (newPath === oldPath) return;

    try {
      await api.moveNote(currentUser.username, oldPath, newPath, activeProfileId);
      await loadVaultData();
      await openNote(newPath);
    } catch (e) {
      console.error('Failed to rename note', e);
    }
  };

  // Delete note
  const handleDeleteNote = async (notePath: string) => {
    if (!currentUser) return;
    await api.deleteNote(currentUser.username, notePath, activeProfileId);
    await loadVaultData();
    if (activeNotePath === notePath) {
      const remaining = notes.filter((n) => n.path !== notePath);
      if (remaining.length > 0) {
        openNote(remaining[0].path);
      } else {
        setActiveNotePath(null);
        setActiveNoteTitle('');
        setActiveNoteContent('');
      }
    }
  };

  // Task Toggle
  const handleToggleTask = async (lineIndex: number, completed: boolean) => {
    if (!currentUser || !activeNotePath) return;
    await api.toggleTask(
      currentUser.username,
      activeNotePath,
      lineIndex,
      completed,
      activeIsShared,
      activeSharedFrom,
      activeProfileId
    );
    loadVaultData();
  };

  // Switch User
  const handleSelectUser = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('ochrenotes_current_user', user.username);
    setIsLoginModalOpen(false);
    setActiveNotePath(null);
  };

  // A4 Print Handler (Module-aware: Notes, Wiki Article, Cookbook Weekly Plan)
  const handlePrintA4 = () => {
    if (activeSuiteModule === 'wiki') {
      if (activeWikiArticle) {
        printWikiArticleA4(activeWikiArticle, profileSettings.profile1.colors.wiki);
      }
      return;
    }
    if (activeSuiteModule === 'recipes') {
      if (cookbookSnapshotRef.current) {
        printMealPlanA4({
          cycle: cookbookSnapshotRef.current.cycle,
          recipes: cookbookSnapshotRef.current.recipes,
          overrides: cookbookSnapshotRef.current.overrides,
          weekOffset: cookbookSnapshotRef.current.weekOffset,
          ownerName: cookbookSnapshotRef.current.ownerName,
          accentColor: profileSettings.profile1.colors.recipes,
        });
      }
      return;
    }
    if (activeSuiteModule === 'finance') {
      return;
    }
    printNoteA4(activeNoteTitle, activeNoteContent, activeProfile.colors.notes);
  };

  // Document statistics computation
  const documentStats = useMemo(() => {
    const lines = activeNoteContent.split('\n');
    const words = activeNoteContent.trim() ? activeNoteContent.trim().split(/\s+/).length : 0;
    const chars = activeNoteContent.length;
    return { lines: lines.length, words, chars };
  }, [activeNoteContent]);

  // Window-level touch gesture listeners for mobile vault swipe anywhere
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      // Do not trigger Vault swipe gesture when interacting with tabs bar, toolbar, header or inputs
      if (
        target?.closest('[data-no-swipe]') ||
        target?.closest('header') ||
        target?.closest('button') ||
        target?.closest('input') ||
        target?.closest('select') ||
        target?.closest('textarea')
      ) {
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        return;
      }
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartXRef.current === null || touchStartYRef.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

      // Horizontal swipe recognition (swiping anywhere on mobile screen)
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        // Swipe right (left to right) -> open vault anywhere
        if (deltaX > 45 && !isMobileSidebarOpen) {
          setIsMobileSidebarOpen(true);
        }
        // Swipe left (right to left) when vault is open -> close vault
        else if (deltaX < -45 && isMobileSidebarOpen) {
          setIsMobileSidebarOpen(false);
        }
      }
      touchStartXRef.current = null;
      touchStartYRef.current = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobileSidebarOpen]);

  return (
    <div
      style={{ '--ochre-accent': activeAccentColor } as React.CSSProperties}
      className={`flex flex-col h-screen w-screen overflow-hidden ${isDarkMode ? 'dark' : ''} bg-[#FBFBFA] dark:bg-[#18191B] text-neutral-900 dark:text-neutral-100 font-sans`}
    >
      {/* Top Bar Header with Modular Ochre Suite Logo, Profile Slider & Consolidated Menus */}
      <Header
        currentUser={currentUser}
        activeNoteTitle={activeNoteTitle}
        isSharedNote={activeIsShared}
        sharedFrom={activeSharedFrom}
        activeView={viewMode}
        onChangeView={setViewMode}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        lastSaved={lastSaved}
        documentStats={documentStats}
        onOpenShareModal={() => {
          if (activeSuiteModule === 'recipes') {
            setShareModalRecipe(
              cookbookSnapshotRef.current?.selectedRecipe ||
                cookbookSnapshotRef.current?.recipes?.[0] ||
                null
            );
          }
          setIsShareModalOpen(true);
        }}
        onPrintA4={handlePrintA4}
        onOpenSystemLogs={() => setIsSystemLogsModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenUserSwitch={async () => {
          const fresh = await api.fetchUsers();
          setAllUsers(fresh);
          setIsLoginModalOpen(true);
        }}
        onLogout={async () => {
          const fresh = await api.fetchUsers();
          setAllUsers(fresh);
          setIsLoginModalOpen(true);
        }}
        canInstallPwa={true}
        onInstallPwa={handleInstallPwa}
        appTitle={appTitle}
        onToggleVaultMobile={() => setIsMobileSidebarOpen((prev) => !prev)}
        activeSuiteModule={activeSuiteModule}
        onSelectSuiteModule={setActiveSuiteModule}
        enabledModules={enabledModules}
        profileSettings={profileSettings}
        onSwitchProfile={handleSwitchProfile}
      />

      {/* Main Container: Renders active Suite Module (Notes, Wiki, Recipes, Finance) */}
      {activeSuiteModule === 'wiki' && (
        <div className="flex-1 flex overflow-hidden">
          <WikiView
            username={currentUser?.username || 'michael'}
            accentColor={profileSettings.profile1.colors.wiki}
            onActiveArticleChange={setActiveWikiArticle}
          />
        </div>
      )}

      {activeSuiteModule === 'recipes' && (
        <div className="flex-1 flex overflow-hidden">
          <CookbookView
            currentUser={
              currentUser || {
                id: 'user_michael',
                username: 'michael',
                displayName: 'Michael',
                avatar: '',
                role: 'admin',
              }
            }
            allUsers={allUsers}
            accentColor={profileSettings.profile1.colors.recipes}
            refreshKey={cookbookRefreshKey}
            onSnapshotChange={(snap) => {
              cookbookSnapshotRef.current = snap;
            }}
            onShareRecipe={(rec) => {
              setShareModalRecipe(rec);
              setIsShareModalOpen(true);
            }}
          />
        </div>
      )}

      {activeSuiteModule === 'finance' && (
        <div className="flex-1 flex overflow-hidden">
          <FinanceView accentColor={profileSettings.profile1.colors.finance} />
        </div>
      )}

      {activeSuiteModule === 'notes' && (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile Left Screen Edge Swipe Indicator & Vault Toggle Button */}
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            style={{ backgroundColor: activeProfile.colors.notes }}
            className={`lg:hidden fixed top-1/2 -translate-y-1/2 z-40 h-14 flex items-center justify-center transition-all duration-300 active:scale-95 cursor-pointer shadow-lg text-white ${
              isMobileSidebarOpen 
                ? 'left-[280px] w-7 rounded-r-xl' 
                : 'left-0 w-5 rounded-r-xl opacity-90 hover:opacity-100 hover:w-6.5'
            }`}
            title={isMobileSidebarOpen ? 'Vault schließen' : 'Vault Explorer (nach rechts wischen oder tippen)'}
            aria-label="Vault Explorer umschalten"
          >
            {isMobileSidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <div className="flex flex-col items-center gap-1 py-1">
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="w-1 h-3 rounded-full bg-white/70"></span>
              </div>
            )}
          </button>

          {/* Sidebar with Drag & Drop, Folders, and In-place Folder Creation */}
          <Sidebar
            notes={notes}
            sharedNotes={sharedNotes}
            folders={folders}
            activeNotePath={activeNotePath}
            activeIsShared={activeIsShared}
            onSelectNote={openNote}
            onCreateNote={handleCreateNote}
            onCreateFolder={handleCreateFolder}
            onDeleteNote={handleDeleteNote}
            onDeleteFolder={handleDeleteFolder}
            onMoveNote={handleMoveNote}
            isOpen={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            activeProfileName={profileSettings.enableSecondProfile ? activeProfile.name : undefined}
          />

          {/* Central Workspace Pane */}
          <Workspace
            viewMode={viewMode}
            content={activeNoteContent}
            onContentChange={handleContentChange}
            isReadOnly={activePermission === 'read'}
            onSave={() => {
              if (currentUser && activeNotePath) {
                api.saveNote(currentUser.username, activeNotePath, activeNoteContent, activeIsShared, activeSharedFrom, activeProfileId);
                setLastSaved(Date.now());
              }
            }}
            lastSaved={lastSaved}
            onToggleTask={handleToggleTask}
            onWikilinkClick={openNoteByTitle}
            onTagClick={() => {
              setViewMode('tasks');
            }}
            username={currentUser?.username || 'michael'}
            noteProfile={activeProfileId}
            accentColor={activeProfile.colors.notes}
            onOpenNoteByTitle={openNoteByTitle}
            allNotes={[...notes, ...sharedNotes]}
            activeNotePath={activeNotePath}
            activeNoteTitle={activeNoteTitle}
            onSelectPrimaryNote={openNote}
            onRenameNote={handleRenameNote}
            onCreateNote={handleCreateNote}
          />
        </div>
      )}

      {/* Mobile Floating Action Navigation (Only in Notes module): Positioned reliably on the right */}
      {activeSuiteModule === 'notes' && isMobileNavExpanded && (
        <div 
          onClick={() => setIsMobileNavExpanded(false)}
          className="fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-2xs z-40 lg:hidden animate-in fade-in duration-150"
        />
      )}

      {/* Floating Nav Button / Bottom-Right Expanded Capsule */}
      {activeSuiteModule === 'notes' && (
        <div className="lg:hidden select-none">
          {isMobileNavExpanded ? (
            <div
              style={{ borderColor: activeProfile.colors.notes }}
              className="fixed bottom-5 right-4 z-50 h-14 px-2.5 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-200"
            >
              <button
                onClick={() => {
                  setViewMode('editor');
                  setIsMobileNavExpanded(false);
                }}
                style={viewMode === 'editor' ? { backgroundColor: activeProfile.colors.notes } : undefined}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                  viewMode === 'editor'
                    ? 'text-white shadow-xs'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                }`}
                title="Notizen-Editor"
                aria-label="Notizen"
              >
                <BookOpen className="w-4.5 h-4.5" />
              </button>

              <button
                onClick={() => {
                  setViewMode('tasks');
                  setIsMobileNavExpanded(false);
                }}
                style={viewMode === 'tasks' ? { backgroundColor: activeProfile.colors.notes } : undefined}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                  viewMode === 'tasks'
                    ? 'text-white shadow-xs'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                }`}
                title="Aufgaben & Listen"
                aria-label="Aufgaben"
              >
                <CheckSquare className="w-4.5 h-4.5" />
              </button>

              <button
                onClick={() => {
                  setViewMode('graph');
                  setIsMobileNavExpanded(false);
                }}
                style={viewMode === 'graph' ? { backgroundColor: activeProfile.colors.notes } : undefined}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                  viewMode === 'graph'
                    ? 'text-white shadow-xs'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                }`}
                title="Wissensgraph"
                aria-label="Graph"
              >
                <Network className="w-4.5 h-4.5" />
              </button>

              <div className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5"></div>

              <button
                onClick={() => setIsMobileNavExpanded(false)}
                className="w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
                aria-label="Navigation schließen"
                title="Navigation schließen"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsMobileNavExpanded(true)}
              style={{ borderColor: activeProfile.colors.notes, color: activeProfile.colors.notes }}
              className="fixed bottom-5 right-4 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
              title="Navigation umschalten (Notizen, Aufgaben, Graph)"
              aria-label="Navigation umschalten"
            >
              {viewMode === 'editor' && <BookOpen className="w-5 h-5" />}
              {viewMode === 'tasks' && <CheckSquare className="w-5 h-5" />}
              {viewMode === 'graph' && <Network className="w-5 h-5" />}
              <span
                style={{ backgroundColor: activeProfile.colors.notes }}
                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1E1F23]"
              ></span>
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      {currentUser && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          mode={
            activeSuiteModule === 'wiki'
              ? 'wiki'
              : activeSuiteModule === 'recipes'
                ? 'recipe'
                : 'note'
          }
          accentColor={activeAccentColor}
          noteTitle={activeNoteTitle}
          notePath={activeNotePath || ''}
          noteContent={activeNoteContent}
          wikiArticle={activeWikiArticle}
          activeRecipe={shareModalRecipe || cookbookSnapshotRef.current?.selectedRecipe || null}
          recipesList={cookbookSnapshotRef.current?.recipes || []}
          currentUser={currentUser}
          allUsers={allUsers}
        />
      )}

      <SystemLogsModal
        isOpen={isSystemLogsModalOpen}
        onClose={() => setIsSystemLogsModalOpen(false)}
      />

      {currentUser && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          currentUser={currentUser}
          allUsers={allUsers}
          onRefreshVault={loadVaultData}
          onUpdateUser={(updatedUser) => {
            setCurrentUser(updatedUser);
            setAllUsers((prev) =>
              prev.map((u) => (u.username === updatedUser.username ? updatedUser : u))
            );
          }}
          appTitle={appTitle}
          onUpdateAppTitle={handleUpdateAppTitle}
          activeNoteTitle={activeNoteTitle}
          activeNoteContent={activeNoteContent}
          enabledModules={enabledModules}
          onToggleModule={handleToggleModule}
          profileSettings={profileSettings}
          onUpdateProfileSettings={handleUpdateProfileSettings}
          initialModuleContext={activeSuiteModule}
          onCookbookUpdated={() => setCookbookRefreshKey((k) => k + 1)}
        />
      )}

      {isLoginModalOpen && (
        <LoginScreen
          users={allUsers}
          onSelectUser={handleSelectUser}
          appTitle={appTitle}
          onManualLogin={(username, password) => {
            api.login(username, password).then((user) => {
              handleSelectUser(user);
            }).catch((err) => {
              console.error(err);
            });
          }}
        />
      )}
    </div>
  );
}
