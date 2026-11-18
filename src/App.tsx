import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User, NoteMetadata, PaneType, SuiteModuleId, EnabledModules, SuiteProfileSettings, NoteProfileId, WikiArticle, Recipe, CookbookTab, DashboardSettings, ProjectItem } from './types';
import { api } from './services/api';
import { DEFAULT_ENABLED_MODULES, DEFAULT_PROFILE_SETTINGS, DEFAULT_DASHBOARD_SETTINGS, MAX_DASHBOARD_WIDGETS, DASHBOARD_WIDGET_CATALOG, DEFAULT_MODULE_ORDER } from './services/profileDefaults';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/sidebar/Sidebar';
import { Workspace } from './components/workspace/Workspace';
import { DashboardView } from './components/dashboard/DashboardView';
import { WikiView } from './components/wiki/WikiView';
import { CookbookView, CookbookSnapshot } from './components/recipes/CookbookView';
import { FinanceView } from './components/finance/FinanceView';
import { SmarthomeView } from './components/smarthome/SmarthomeView';
import { ProjectsView } from './components/projects/ProjectsView';
import { ShareModal } from './components/modals/ShareModal';
import { SystemLogsModal } from './components/modals/SystemLogsModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { TourOverlay } from './components/modals/TourOverlay';
import { LoginScreen } from './components/auth/LoginScreen';
import { BookOpen, CheckSquare, Network, ChevronRight, ChevronLeft, X, Inbox, Plus, Folder, FolderPlus, FilePlus, Layers } from 'lucide-react';
import { printNoteA4, printWikiArticleA4, printMealPlanA4, printProjectA4 } from './services/printService';
import { checkAndNotifyDueTasks, querySyncedNotificationPermission } from './services/notificationService';

const mergeProfileSettings = (raw?: Partial<SuiteProfileSettings> | null): SuiteProfileSettings => {
  if (!raw) return DEFAULT_PROFILE_SETTINGS;
  const rawOrder = Array.isArray(raw.moduleOrder) ? raw.moduleOrder : [];
  const validSet = new Set<SuiteModuleId>(DEFAULT_MODULE_ORDER);
  const dedupedSaved = rawOrder.filter((id, idx): id is SuiteModuleId => validSet.has(id) && rawOrder.indexOf(id) === idx);
  const mergedOrder: SuiteModuleId[] = [
    ...dedupedSaved,
    ...DEFAULT_MODULE_ORDER.filter((id) => !dedupedSaved.includes(id)),
  ];
  return {
    enableSecondProfile: raw.enableSecondProfile ?? DEFAULT_PROFILE_SETTINGS.enableSecondProfile,
    activeProfileId: raw.activeProfileId === 'profile2' ? 'profile2' : 'profile1',
    mobileBarPosition: raw.mobileBarPosition === 'bottom' ? 'bottom' : 'top',
    moduleOrder: mergedOrder,
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

const mergeDashboardSettings = (raw?: Partial<DashboardSettings> | null): DashboardSettings => {
  if (!raw) return DEFAULT_DASHBOARD_SETTINGS;
  const maxWidgets =
    typeof raw.maxWidgets === 'number' && !Number.isNaN(raw.maxWidgets)
      ? Math.max(2, Math.min(8, Math.round(raw.maxWidgets)))
      : MAX_DASHBOARD_WIDGETS;
  const validIds = new Set(DASHBOARD_WIDGET_CATALOG.map((w) => w.id));
  const selectedWidgets = Array.isArray(raw.selectedWidgets)
    ? raw.selectedWidgets.filter((id) => validIds.has(id)).slice(0, maxWidgets)
    : DEFAULT_DASHBOARD_SETTINGS.selectedWidgets.slice(0, maxWidgets);
  return { maxWidgets, selectedWidgets };
};

export default function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('ochrenotes_theme') === 'dark';
  });

  // Ochre Suite Active Module: 'dashboard' | 'notes' | 'wiki' | 'recipes' | 'finance'
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

  // Dashboard Widget Configuration & Cookbook Shopping List Toggle
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(() => {
    try {
      const saved = localStorage.getItem('ochre_dashboard_settings');
      return saved ? mergeDashboardSettings(JSON.parse(saved)) : DEFAULT_DASHBOARD_SETTINGS;
    } catch {
      return DEFAULT_DASHBOARD_SETTINGS;
    }
  });
  const [enableCookbookShoppingList, setEnableCookbookShoppingList] = useState<boolean>(true);
  const [enableCookbookCycle, setEnableCookbookCycle] = useState<boolean>(true);
  const [settingsModalTarget, setSettingsModalTarget] = useState<{
    tab?: 'general' | 'modules' | 'moduleSettings' | 'users' | 'backup' | 'about';
    module?: SuiteModuleId;
  }>({});
  const [isTourOpen, setIsTourOpen] = useState(false);

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
  const [cookbookTab, setCookbookTab] = useState<CookbookTab>('calendar');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // App Title / Branding
  const [appTitle, setAppTitle] = useState<string>('Ochre Suite');
  // Mobile Floating Ellipse Navigation, Neu Slide-Out & Note Name Popup State
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);
  const [isNewNoteSlideOutOpen, setIsNewNoteSlideOutOpen] = useState(false);
  const [slideOutFolder, setSlideOutFolder] = useState<string>('/');
  const [slideOutNewFolderName, setSlideOutNewFolderName] = useState<string>('');
  const [isSlideOutCreatingFolder, setIsSlideOutCreatingFolder] = useState(false);
  const [openLiteVaultSignal, setOpenLiteVaultSignal] = useState<number>(0);
  const [newNoteModal, setNewNoteModal] = useState<{ isOpen: boolean; folder: string; name: string }>({
    isOpen: false,
    folder: '/',
    name: '',
  });

  // Modals & Active Module Snapshots (Wiki, Cookbook, Projects)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSystemLogsModalOpen, setIsSystemLogsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeWikiArticle, setActiveWikiArticle] = useState<WikiArticle | null>(null);
  const [wikiArticlesForLinks, setWikiArticlesForLinks] = useState<WikiArticle[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedWikiSlug, setSelectedWikiSlug] = useState<string | null>(null);
  const [shareModalRecipe, setShareModalRecipe] = useState<Recipe | null>(null);
  const [cookbookRefreshKey, setCookbookRefreshKey] = useState<number>(0);
  const cookbookSnapshotRef = useRef<CookbookSnapshot | null>(null);

  // Online / Sync State
  const [isOnline, setIsOnline] = useState<boolean>(api.getOnlineStatus());
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(api.getPendingSyncCount());

  // PWA Install Prompt State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  // Mobile swipe gestures state (Pixel-launcher 1:1 finger tracking) + live refs
  const [sidebarDragOffsetPx, setSidebarDragOffsetPx] = useState<number | null>(null);
  const sidebarOpenRef = useRef<boolean>(false);
  useEffect(() => {
    sidebarOpenRef.current = isMobileSidebarOpen;
  }, [isMobileSidebarOpen]);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchAxisLockedRef = useRef<'none' | 'x' | 'y'>('none');
  const touchDragOffsetRef = useRef<number | null>(null);
  const restoredForUserRef = useRef<string | null>(null);
  const pendingRestoreNoteRef = useRef<{ path: string; isShared?: boolean; sharedFrom?: string } | null>(null);
  const activeNoteContentRef = useRef<string>('');
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{
    username: string;
    path: string;
    content: string;
    isShared: boolean;
    sharedFrom?: string;
    profile: NoteProfileId;
  } | null>(null);

  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    setActiveNoteContent(pending.content);
    api
      .saveNote(
        pending.username,
        pending.path,
        pending.content,
        pending.isShared,
        pending.sharedFrom,
        pending.profile
      )
      .then(() => {
        setLastSaved(Date.now());
        setPendingSyncCount(api.getPendingSyncCount());
      });
  }, []);

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

  // Online status & live offline queue subscription
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setPendingSyncCount(api.getPendingSyncCount());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setPendingSyncCount(api.getPendingSyncCount());
    };
    const unsubscribeSync = api.subscribePendingSync(setPendingSyncCount);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsubscribeSync();
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

  // Handle deep-link (?view=tasks) & Service Worker notification clicks
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'tasks') {
        setActiveSuiteModule('notes');
        setViewMode('tasks');
      }
    } catch {}

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OCHRE_NOTIFICATION_CLICK') {
        setActiveSuiteModule('notes');
        setViewMode('tasks');
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
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
      api.saveProfileSettings(currentUser.username, next, enabledModules, dashboardSettings).catch(console.error);
    }
  };

  const handleUpdateDashboardSettings = (next: DashboardSettings) => {
    const normalized = mergeDashboardSettings(next);
    setDashboardSettings(normalized);
    localStorage.setItem('ochre_dashboard_settings', JSON.stringify(normalized));
    if (currentUser) {
      api.saveProfileSettings(currentUser.username, profileSettings, enabledModules, normalized).catch(console.error);
    }
  };

  const handleSwitchProfile = (pid: NoteProfileId) => {
    if (pid === activeProfileId) return;
    flushPendingSave();
    const next: SuiteProfileSettings = { ...profileSettings, activeProfileId: pid };
    handleUpdateProfileSettings(next);
    setActiveNotePath(null);
    setActiveNoteTitle(next[pid].name);
    activeNoteContentRef.current = '';
    setActiveNoteContent('');
    setActiveIsShared(false);
    setActiveSharedFrom(undefined);
    setActivePermission('write');
  };

  const handleToggleModule = (moduleId: SuiteModuleId) => {
    setEnabledModules((prev) => {
      const enabledKeys = (Object.keys(prev) as SuiteModuleId[]).filter((k) => prev[k]);
      // Ensure at least 1 module remains enabled across the entire suite
      if (prev[moduleId] && enabledKeys.length <= 1) {
        return prev;
      }
      const next = { ...prev, [moduleId]: !prev[moduleId] };
      localStorage.setItem('ochre_enabled_modules', JSON.stringify(next));
      if (currentUser) {
        api.saveProfileSettings(currentUser.username, profileSettings, next, dashboardSettings).catch(console.error);
      }
      if (activeSuiteModule === moduleId && !next[moduleId]) {
        const fallback = (Object.keys(next) as SuiteModuleId[]).find((k) => next[k]) || 'dashboard';
        setActiveSuiteModule(fallback);
      }
      return next;
    });
  };

  // Restore last active route/module/tab/note for current user so reload keeps current screen
  useEffect(() => {
    if (!currentUser) return;
    let hasDeepLink = false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'tasks') {
        hasDeepLink = true;
      }
    } catch {}

    if (!hasDeepLink) {
      try {
        const raw = localStorage.getItem(`ochre_last_route_${currentUser.username}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const restoredMod = parsed.module as SuiteModuleId | undefined;
          if (restoredMod && enabledModules[restoredMod]) {
            setActiveSuiteModule(restoredMod);
          }
          if (parsed.viewMode === 'editor' || parsed.viewMode === 'tasks' || parsed.viewMode === 'graph') {
            setViewMode(parsed.viewMode);
          }
          if (
            parsed.cookbookTab === 'calendar' ||
            parsed.cookbookTab === 'cycle' ||
            parsed.cookbookTab === 'recipes' ||
            parsed.cookbookTab === 'shopping' ||
            parsed.cookbookTab === 'presentation'
          ) {
            setCookbookTab(parsed.cookbookTab);
          }
          if (parsed.projectId) {
            setSelectedProjectId(parsed.projectId);
          }
          if (parsed.wikiSlug) {
            setSelectedWikiSlug(parsed.wikiSlug);
          }
          if (parsed.notePath) {
            pendingRestoreNoteRef.current = {
              path: parsed.notePath,
              isShared: !!parsed.isShared,
              sharedFrom: parsed.sharedFrom,
            };
          }
        }
      } catch {}
    }
    restoredForUserRef.current = currentUser.username;
  }, [currentUser?.username]);

  // Persist current route/module/tab/note per user so mobile & desktop reloads resume cleanly
  useEffect(() => {
    if (!currentUser || restoredForUserRef.current !== currentUser.username) return;
    try {
      localStorage.setItem(
        `ochre_last_route_${currentUser.username}`,
        JSON.stringify({
          module: activeSuiteModule,
          viewMode,
          cookbookTab,
          notePath: activeNotePath,
          isShared: activeIsShared,
          sharedFrom: activeSharedFrom,
          projectId: selectedProjectId,
          wikiSlug: selectedWikiSlug,
        })
      );
    } catch {}
  }, [
    currentUser?.username,
    activeSuiteModule,
    viewMode,
    cookbookTab,
    activeNotePath,
    activeIsShared,
    activeSharedFrom,
    selectedProjectId,
    selectedWikiSlug,
  ]);

  // Load saved profile settings, cookbook feature flags, projects & wiki index whenever currentUser changes
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
      if (data?.dashboardSettings) {
        const mergedDash = mergeDashboardSettings(data.dashboardSettings);
        setDashboardSettings(mergedDash);
        localStorage.setItem('ochre_dashboard_settings', JSON.stringify(mergedDash));
      }
    }).catch((err) => console.error('Failed to load profile settings', err));

    api.fetchCookbook(currentUser.username).then((cb) => {
      if (cancelled) return;
      const shoppingEnabled = cb?.settings?.enableShoppingList !== false;
      const cycleEnabled = cb?.settings?.enableCycle !== false;
      setEnableCookbookShoppingList(shoppingEnabled);
      setEnableCookbookCycle(cycleEnabled);
      if (!shoppingEnabled && cookbookTab === 'shopping') {
        setCookbookTab('calendar');
      } else if (!cycleEnabled && cookbookTab === 'cycle') {
        setCookbookTab('calendar');
      }
    }).catch(() => {});

    api.fetchProjects(currentUser.username).then((list) => {
      if (!cancelled) setProjects(list);
    }).catch(() => {});

    api.fetchWikiArticles(currentUser.username).then((arts) => {
      if (!cancelled) setWikiArticlesForLinks(arts);
    }).catch(() => {});

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

      if (!activeNotePath) {
        const pending = pendingRestoreNoteRef.current;
        if (pending) {
          pendingRestoreNoteRef.current = null;
          const exists = pending.isShared
            ? shared.some((n) => n.path === pending.path)
            : userNotes.some((n) => n.path === pending.path);
          if (exists) {
            await openNote(pending.path, !!pending.isShared, pending.sharedFrom || '', true);
            return;
          }
        }
        if (userNotes.length > 0) {
          openNote(userNotes[0].path, false, '', true);
        } else {
          setActiveNoteTitle(`${activeProfile.name} (leer)`);
          setActiveNoteContent('');
        }
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

  // Live Vault SSE Sync + Window Focus / Visibility Refresh
  const vaultSyncStateRef = useRef({
    activeNotePath,
    activeIsShared,
    activeSharedFrom,
    activeProfileId,
    loadVaultData,
  });
  useEffect(() => {
    vaultSyncStateRef.current = {
      activeNotePath,
      activeIsShared,
      activeSharedFrom,
      activeProfileId,
      loadVaultData,
    };
  }, [activeNotePath, activeIsShared, activeSharedFrom, activeProfileId, loadVaultData]);

  useEffect(() => {
    if (!currentUser) return;
    let es: EventSource | null = null;

    const refreshFromRemote = async (changedPath?: string) => {
      const {
        activeNotePath: currPath,
        activeIsShared: currIsShared,
        activeSharedFrom: currSharedFrom,
        activeProfileId: currProfile,
        loadVaultData: reloadVault,
      } = vaultSyncStateRef.current;

      try {
        await reloadVault();
        if (
          currPath &&
          !pendingSaveRef.current &&
          (!changedPath || changedPath === currPath || changedPath.endsWith(`/${currPath}`))
        ) {
          const data = await api.readNote(
            currentUser.username,
            currPath,
            currIsShared,
            currSharedFrom || '',
            currProfile
          );
          if (data && typeof data.content === 'string' && data.content !== activeNoteContentRef.current) {
            activeNoteContentRef.current = data.content;
            setActiveNoteContent(data.content);
            if (data.title) setActiveNoteTitle(data.title);
          }
        }
      } catch {
        // ignore transient network errors during live sync
      }
    };

    try {
      es = new EventSource(`/api/vault/stream?username=${encodeURIComponent(currentUser.username)}`);
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload?.type === 'vault_changed' ||
            payload?.type === 'note_saved' ||
            payload?.type === 'note_deleted' ||
            payload?.type === 'note_moved' ||
            payload?.type === 'tasks_toggled'
          ) {
            const matchesUser =
              !payload.username ||
              payload.username === currentUser.username ||
              vaultSyncStateRef.current.activeIsShared;
            if (matchesUser) {
              refreshFromRemote(typeof payload.path === 'string' ? payload.path : undefined);
            }
          }
        } catch {}
      };
    } catch {}

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshFromRemote();
      }
    };
    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      if (es) es.close();
      window.removeEventListener('focus', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [currentUser?.username]);

  // Periodic push notification check for tasks with due dates (Mobile PWA & Desktop)
  useEffect(() => {
    if (!currentUser) return;
    const runCheck = async () => {
      const perm = await querySyncedNotificationPermission();
      if (perm !== 'granted') return;
      checkAndNotifyDueTasks({
        username: currentUser.username,
        activeProfile: activeProfileId,
        enableSecondProfile: profileSettings.enableSecondProfile,
      }).catch(() => {});
    };

    runCheck();
    window.addEventListener('focus', runCheck);
    const intervalId = window.setInterval(runCheck, 60000);
    return () => {
      window.removeEventListener('focus', runCheck);
      window.clearInterval(intervalId);
    };
  }, [currentUser, activeProfileId, profileSettings.enableSecondProfile]);

  // Open note handler
  const openNote = async (
    notePath: string,
    isShared = false,
    sharedFrom = '',
    preserveViewMode = false
  ) => {
    if (!currentUser) return;
    flushPendingSave();
    try {
      const data = await api.readNote(currentUser.username, notePath, isShared, sharedFrom, activeProfileId);
      setActiveNotePath(data.path);
      setActiveNoteTitle(data.title);
      activeNoteContentRef.current = data.content;
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
      if (!preserveViewMode) {
        setViewMode('editor');
      }
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

  // Content change auto-save handler: updates ref synchronously (0 parent re-renders on keystroke) and syncs state + network on 320ms debounce
  const handleContentChange = useCallback(
    (newContent: string) => {
      activeNoteContentRef.current = newContent;
      if (!currentUser || !activeNotePath || activePermission === 'read') return;

      pendingSaveRef.current = {
        username: currentUser.username,
        path: activeNotePath,
        content: newContent,
        isShared: activeIsShared,
        sharedFrom: activeSharedFrom,
        profile: activeProfileId,
      };

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        flushPendingSave();
      }, 320);
    },
    [currentUser, activeNotePath, activePermission, activeIsShared, activeSharedFrom, activeProfileId, flushPendingSave]
  );

  // Open Note Name Popup before creating a new note (across all screen sizes)
  const openNewNoteDialog = (folder?: string) => {
    setIsNewNoteSlideOutOpen(false);
    setIsMobileNavExpanded(false);
    setIsMobileSidebarOpen(false);
    setNewNoteModal({
      isOpen: true,
      folder: folder && folder.trim() ? folder.trim().replace(/^\/+|\/+$/g, '') : '/',
      name: '',
    });
  };

  const confirmCreateNamedNote = async () => {
    if (!currentUser) return;
    const rawName = newNoteModal.name.trim().replace(/\.md$/i, '');
    const safeTitle = (rawName || 'Neue Notiz').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Neue Notiz';
    const targetFolder = newNoteModal.folder === '/' ? '' : newNoteModal.folder.replace(/^\/+|\/+$/g, '');

    let path = targetFolder ? `${targetFolder}/${safeTitle}.md` : `${safeTitle}.md`;
    let counter = 2;
    while (notes.some((n) => n.path.toLowerCase() === path.toLowerCase())) {
      path = targetFolder ? `${targetFolder}/${safeTitle} (${counter}).md` : `${safeTitle} (${counter}).md`;
      counter++;
    }

    const finalTitle = counter > 2 ? `${safeTitle} (${counter - 1})` : safeTitle;
    const defaultContent = `# ${finalTitle}\n\n`;
    setNewNoteModal({ isOpen: false, folder: '/', name: '' });
    await api.createNote(currentUser.username, path, defaultContent, activeProfileId);
    await loadVaultData();
    await openNote(path);
  };

  // Create unsorted quick note directly into Vault Root Inbox (Quick Write)
  const handleCreateQuickNote = async () => {
    if (!currentUser) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}. ${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const baseTitle = `Schnelle Notiz ${stamp}`;
    let path = `${baseTitle}.md`;
    let counter = 2;
    while (notes.some((n) => n.path.toLowerCase() === path.toLowerCase())) {
      path = `${baseTitle} (${counter}).md`;
      counter++;
    }

    const content = `---\ninbox: true\ncreatedAt: "${now.toISOString()}"\n---\n\n# Schnelle Notiz\n\n`;
    await api.createNote(currentUser.username, path, content, activeProfileId);
    await loadVaultData();
    await openNote(path);
    setIsMobileNavExpanded(false);
    setIsNewNoteSlideOutOpen(false);
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
        activeNoteContentRef.current = '';
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
    flushPendingSave();
    setCurrentUser(user);
    localStorage.setItem('ochrenotes_current_user', user.username);
    setIsLoginModalOpen(false);
    setActiveNotePath(null);
  };

  // A4 Print Handler (Module-aware: Notes, Wiki Article, Cookbook Weekly Plan, Projects)
  const handlePrintA4 = () => {
    flushPendingSave();
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
    if (activeSuiteModule === 'projects') {
      const targetProj = projects.find((p) => p.id === selectedProjectId) || projects[0];
      if (targetProj) {
        printProjectA4(targetProj, targetProj.color || profileSettings.profile1.colors.projects);
      }
      return;
    }
    if (activeSuiteModule === 'finance' || activeSuiteModule === 'smarthome' || activeSuiteModule === 'dashboard') {
      return;
    }
    printNoteA4(activeNoteTitle, activeNoteContentRef.current || activeNoteContent, activeProfile.colors.notes);
  };

  // Document statistics computation (kept updated cleanly for Diagnostics modal)
  const documentStats = useMemo(() => {
    const text = activeNoteContent;
    const lines = text.split('\n');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    return { lines: lines.length, words, chars };
  }, [activeNoteContent]);

  // Pixel-launcher 1:1 finger-tracked swipe gesture listeners for Notes mobile Vault drawer
  useEffect(() => {
    const DRAWER_WIDTH = 288;
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024 || activeSuiteModule !== 'notes') {
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-no-swipe]') ||
        target?.closest('header') ||
        target?.closest('button') ||
        target?.closest('input') ||
        target?.closest('select') ||
        target?.closest('textarea') ||
        target?.closest('[draggable="true"]')
      ) {
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        return;
      }
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchAxisLockedRef.current = 'none';
      touchDragOffsetRef.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartXRef.current === null || touchStartYRef.current === null) return;
      const dx = e.touches[0].clientX - touchStartXRef.current;
      const dy = e.touches[0].clientY - touchStartYRef.current;

      if (touchAxisLockedRef.current === 'none') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.25) {
          if ((!sidebarOpenRef.current && dx > 0) || (sidebarOpenRef.current && dx < 0)) {
            touchAxisLockedRef.current = 'x';
          } else {
            touchAxisLockedRef.current = 'y';
            return;
          }
        } else {
          touchAxisLockedRef.current = 'y';
          return;
        }
      }

      if (touchAxisLockedRef.current === 'x') {
        const baseOffset = sidebarOpenRef.current ? 0 : -DRAWER_WIDTH;
        const clamped = Math.max(-DRAWER_WIDTH, Math.min(0, baseOffset + dx));
        touchDragOffsetRef.current = clamped;
        setSidebarDragOffsetPx(clamped);
      }
    };

    const finishTouch = () => {
      if (touchAxisLockedRef.current === 'x' && touchDragOffsetRef.current !== null) {
        const offset = touchDragOffsetRef.current;
        if (!sidebarOpenRef.current) {
          setIsMobileSidebarOpen(offset > -DRAWER_WIDTH + 90);
        } else {
          setIsMobileSidebarOpen(offset >= -90);
        }
      }
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      touchAxisLockedRef.current = 'none';
      touchDragOffsetRef.current = null;
      setSidebarDragOffsetPx(null);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', finishTouch, { passive: true });
    window.addEventListener('touchcancel', finishTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishTouch);
      window.removeEventListener('touchcancel', finishTouch);
    };
  }, [activeSuiteModule]);

  const floatingNavBottomClass =
    (profileSettings.mobileBarPosition || 'top') === 'bottom'
      ? 'bottom-[4.75rem] lg:bottom-5'
      : 'bottom-5';

  return (
    <div
      style={{ '--ochre-accent': activeAccentColor } as React.CSSProperties}
      className={`flex flex-col h-[100dvh] w-screen overflow-hidden ${isDarkMode ? 'dark' : ''} bg-[#FBFBFA] dark:bg-[#18191B] text-neutral-900 dark:text-neutral-100 font-sans`}
    >
      {/* Top/Bottom Header with Modular Ochre Suite Drawer, Desktop Mode Switcher & Profile Menu */}
      <Header
        currentUser={currentUser}
        activeView={viewMode}
        onChangeView={setViewMode}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onOpenShareModal={() => {
          flushPendingSave();
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
        onOpenSystemLogs={() => {
          flushPendingSave();
          setIsSystemLogsModalOpen(true);
        }}
        onOpenSettings={() => {
          flushPendingSave();
          setSettingsModalTarget({});
          setIsSettingsModalOpen(true);
        }}
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
        activeSuiteModule={activeSuiteModule}
        onSelectSuiteModule={setActiveSuiteModule}
        enabledModules={enabledModules}
        profileSettings={profileSettings}
        onSwitchProfile={handleSwitchProfile}
        activeCookbookTab={cookbookTab}
        onChangeCookbookTab={setCookbookTab}
        enableCookbookShoppingList={enableCookbookShoppingList}
        enableCookbookCycle={enableCookbookCycle}
        mobileBarPosition={profileSettings.mobileBarPosition || 'top'}
        onStartTour={() => setIsTourOpen(true)}
      />

      {/* Main Container: Renders active Suite Module */}
      <div data-tour="main-workspace" className="flex-1 flex overflow-hidden relative">
      {activeSuiteModule === 'dashboard' && enabledModules.dashboard && (
        <div className="flex-1 flex overflow-hidden">
          <DashboardView
            currentUser={
              currentUser || {
                id: 'user_michael',
                username: 'michael',
                displayName: 'Michael',
                avatar: '',
                role: 'admin',
              }
            }
            activeProfileId={activeProfileId}
            activeProfileName={activeProfile.name}
            accentColors={{
              ...profileSettings.profile1.colors,
              notes: activeProfile.colors.notes,
            }}
            enabledModules={enabledModules}
            enableCookbookShoppingList={enableCookbookShoppingList}
            dashboardSettings={dashboardSettings}
            onNavigateToModule={(mod, options) => {
              if (!enabledModules[mod]) return;
              flushPendingSave();
              setActiveSuiteModule(mod);
              if (options?.notesView) {
                setViewMode(options.notesView);
              }
              if (options?.notePath) {
                openNote(options.notePath, false);
              }
              if (options?.wikiSlug) {
                setSelectedWikiSlug(options.wikiSlug);
              }
              if (options?.projectId) {
                setSelectedProjectId(options.projectId);
              }
              if (options?.cookbookTab) {
                setCookbookTab(
                  options.cookbookTab === 'shopping' && !enableCookbookShoppingList
                    ? 'calendar'
                    : options.cookbookTab
                );
              }
            }}
            onOpenDashboardSettings={() => {
              flushPendingSave();
              setSettingsModalTarget({ tab: 'moduleSettings', module: 'dashboard' });
              setIsSettingsModalOpen(true);
            }}
            onTasksMutated={loadVaultData}
          />
        </div>
      )}

      {activeSuiteModule === 'wiki' && enabledModules.wiki && (
        <div className="flex-1 flex overflow-hidden">
          <WikiView
            username={currentUser?.username || 'michael'}
            accentColor={profileSettings.profile1.colors.wiki}
            mobileBarPosition={profileSettings.mobileBarPosition || 'top'}
            notes={notes}
            projects={projects}
            initialSelectedSlug={selectedWikiSlug}
            onActiveArticleChange={(art) => {
              setActiveWikiArticle(art);
              if (art?.slug) setSelectedWikiSlug(art.slug);
            }}
            onNavigateToNote={(noteTitle) => {
              setActiveSuiteModule('notes');
              openNoteByTitle(noteTitle);
            }}
            onNavigateToProject={(pid) => {
              setSelectedProjectId(pid);
              setActiveSuiteModule('projects');
            }}
          />
        </div>
      )}

      {activeSuiteModule === 'recipes' && enabledModules.recipes && (
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
            activeTab={cookbookTab}
            onChangeTab={setCookbookTab}
            enableShoppingList={enableCookbookShoppingList}
            mobileBarPosition={profileSettings.mobileBarPosition || 'top'}
            onShoppingListSettingLoaded={(enabled) => setEnableCookbookShoppingList(enabled)}
            onCycleSettingLoaded={(enabled) => {
              setEnableCookbookCycle(enabled);
              if (!enabled && cookbookTab === 'cycle') {
                setCookbookTab('calendar');
              }
            }}
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

      {activeSuiteModule === 'finance' && enabledModules.finance && (
        <div className="flex-1 flex overflow-hidden">
          <FinanceView
            accentColor={profileSettings.profile1.colors.finance}
            mobileBarPosition={profileSettings.mobileBarPosition || 'top'}
          />
        </div>
      )}

      {activeSuiteModule === 'smarthome' && enabledModules.smarthome && (
        <div className="flex-1 flex overflow-hidden">
          <SmarthomeView
            currentUser={
              currentUser || {
                id: 'user_michael',
                username: 'michael',
                displayName: 'Michael',
                avatar: '',
                role: 'admin',
              }
            }
            accentColor={profileSettings.profile1.colors.smarthome}
            mobileBarPosition={profileSettings.mobileBarPosition || 'top'}
          />
        </div>
      )}

      {activeSuiteModule === 'projects' && enabledModules.projects && (
        <div className="flex-1 flex overflow-hidden">
          <ProjectsView
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
            notes={notes}
            wikiArticles={wikiArticlesForLinks}
            projects={projects}
            onProjectsChange={setProjects}
            initialProjectId={selectedProjectId}
            accentColor={profileSettings.profile1.colors.projects}
            mobileBarPosition={profileSettings.mobileBarPosition || 'top'}
            enableSecondProfile={profileSettings.enableSecondProfile}
            activeProfileId={activeProfileId}
            profileNames={{
              profile1: profileSettings.profile1.name,
              profile2: profileSettings.profile2.name,
            }}
            onSwitchProfile={handleSwitchProfile}
            onNavigateToNote={(notePath) => {
              setActiveSuiteModule('notes');
              openNote(notePath, false);
            }}
            onNavigateToWiki={(slug) => {
              setSelectedWikiSlug(slug);
              setActiveSuiteModule('wiki');
            }}
          />
        </div>
      )}

      {activeSuiteModule === 'notes' && enabledModules.notes && (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile Left Screen Edge Swipe Indicator & Vault Toggle Button */}
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            style={{
              backgroundColor: activeProfile.colors.notes,
              ...(sidebarDragOffsetPx !== null
                ? { left: `${Math.max(0, 280 + sidebarDragOffsetPx)}px`, transition: 'none' }
                : {}),
            }}
            className={`lg:hidden fixed top-1/2 -translate-y-1/2 z-40 h-14 flex items-center justify-center ${
              sidebarDragOffsetPx !== null ? 'transition-none' : 'transition-all duration-200'
            } active:scale-95 cursor-pointer shadow-lg text-white ${
              sidebarDragOffsetPx !== null
                ? 'w-6 rounded-r-xl'
                : isMobileSidebarOpen
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
            onCreateNote={openNewNoteDialog}
            onCreateQuickNote={handleCreateQuickNote}
            onOpenUnifiedCreate={() => {
              setIsSlideOutCreatingFolder(false);
              setSlideOutNewFolderName('');
              setIsNewNoteSlideOutOpen(true);
            }}
            onCreateFolder={handleCreateFolder}
            onDeleteNote={handleDeleteNote}
            onDeleteFolder={handleDeleteFolder}
            onMoveNote={handleMoveNote}
            isOpen={isMobileSidebarOpen}
            dragOffsetPx={sidebarDragOffsetPx}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            activeProfileName={profileSettings.enableSecondProfile ? activeProfile.name : undefined}
          />

          {/* Central Workspace Pane */}
          <Workspace
            viewMode={viewMode}
            content={activeNoteContent}
            onContentChange={handleContentChange}
            isReadOnly={activePermission === 'read'}
            onSave={flushPendingSave}
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
            folders={folders}
            activeNotePath={activeNotePath}
            activeNoteTitle={activeNoteTitle}
            isShared={activeIsShared}
            sharedFrom={activeSharedFrom}
            onSelectPrimaryNote={openNote}
            onRenameNote={handleRenameNote}
            onCreateNote={openNewNoteDialog}
            onCreateFolder={handleCreateFolder}
            onSwitchToEditor={() => setViewMode('editor')}
            openLiteVaultSignal={openLiteVaultSignal}
            projects={projects}
            onNavigateToProject={(pid) => {
              setSelectedProjectId(pid);
              setActiveSuiteModule('projects');
            }}
          />
        </div>
      )}
      </div>

      {/* Floating Action Navigation (ONLY Mobile & Tablet - hidden on Desktop) */}
      {activeSuiteModule === 'notes' && isMobileNavExpanded && (
        <div
          onClick={() => setIsMobileNavExpanded(false)}
          className="lg:hidden fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-2xs z-40 animate-in fade-in duration-150"
        />
      )}

      {/* Mobile & Tablet Floating Nav Button / Expanded Capsule + "Neu" Slide-Out */}
      {activeSuiteModule === 'notes' && (
        <div className="lg:hidden select-none">
          {isMobileNavExpanded ? (
            <div
              style={{ borderColor: activeProfile.colors.notes }}
              className={`fixed ${floatingNavBottomClass} left-3 right-3 sm:left-auto sm:right-4 sm:min-w-[360px] sm:max-w-[calc(100vw-2rem)] z-50 h-14 px-2 sm:px-3 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-between gap-1 sm:gap-1.5 text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-200`}
            >
              <div className="flex items-center gap-1 sm:gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('editor');
                    setIsMobileNavExpanded(false);
                  }}
                  style={viewMode === 'editor' ? { backgroundColor: activeProfile.colors.notes } : undefined}
                  className={`flex-1 sm:flex-initial h-9.5 px-2.5 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 min-w-0 ${
                    viewMode === 'editor'
                      ? 'text-white shadow-xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                  }`}
                  title="Notizen-Editor"
                  aria-label="Notizen"
                >
                  <BookOpen className="w-4.5 h-4.5 shrink-0" />
                  <span className="hidden sm:inline text-xs font-semibold truncate">Notizen</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('tasks');
                    setIsMobileNavExpanded(false);
                  }}
                  style={viewMode === 'tasks' ? { backgroundColor: activeProfile.colors.notes } : undefined}
                  className={`flex-1 sm:flex-initial h-9.5 px-2.5 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 min-w-0 ${
                    viewMode === 'tasks'
                      ? 'text-white shadow-xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                  }`}
                  title="Aufgaben & Listen"
                  aria-label="Aufgaben"
                >
                  <CheckSquare className="w-4.5 h-4.5 shrink-0" />
                  <span className="hidden sm:inline text-xs font-semibold truncate">Aufgaben</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('graph');
                    setIsMobileNavExpanded(false);
                  }}
                  style={viewMode === 'graph' ? { backgroundColor: activeProfile.colors.notes } : undefined}
                  className={`flex-1 sm:flex-initial h-9.5 px-2.5 sm:px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 min-w-0 ${
                    viewMode === 'graph'
                      ? 'text-white shadow-xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
                  }`}
                  title="Wissensgraph"
                  aria-label="Graph"
                >
                  <Network className="w-4.5 h-4.5 shrink-0" />
                  <span className="hidden sm:inline text-xs font-semibold truncate">Graph</span>
                </button>
              </div>

              <div className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5 shrink-0"></div>

              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileNavExpanded(false);
                    setIsSlideOutCreatingFolder(false);
                    setSlideOutNewFolderName('');
                    setIsNewNoteSlideOutOpen(true);
                  }}
                  style={{ backgroundColor: activeProfile.colors.notes }}
                  className="flex items-center gap-1 h-9.5 px-3 sm:px-3.5 rounded-full text-xs font-semibold text-white transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs hover:opacity-95"
                  title="Neue Notiz, Ordner oder Quick Write"
                  aria-label="Neu"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Neu</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMobileNavExpanded(false)}
                  className="w-9.5 h-9.5 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 shrink-0"
                  aria-label="Navigation schließen"
                  title="Navigation schließen"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsMobileNavExpanded(true)}
              style={{ borderColor: activeProfile.colors.notes, color: activeProfile.colors.notes }}
              className={`fixed ${floatingNavBottomClass} right-4 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer`}
              title="Navigation öffnen (Notizen, Aufgaben, Graph, Neu)"
              aria-label="Navigation öffnen"
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

      {/* Unified "Neu" Slide-Out (Lite Vault, Ordnerwahl + Ordner erstellen, Quick Write) for Mobile & Desktop */}
      {activeSuiteModule === 'notes' && isNewNoteSlideOutOpen && (
        <div
          onClick={() => setIsNewNoteSlideOutOpen(false)}
          className="fixed inset-0 z-[105] bg-black/45 backdrop-blur-xs flex items-start justify-end px-3 pt-16 pb-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200 max-h-[calc(100dvh-5rem)] flex flex-col"
          >
            <div className="p-3.5 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  style={{ backgroundColor: activeProfile.colors.notes }}
                  className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    Neue Notiz erstellen
                  </h3>
                  <span className="text-[11px] text-neutral-400 block truncate">
                    Quick Write, Ordnerwahl oder Lite Vault
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewNoteSlideOutOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer shrink-0"
                aria-label="Slide-Out schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 space-y-3 overflow-y-auto">
              {/* 1. Quick Write -> Schnelle Notiz in Inbox */}
              <button
                type="button"
                onClick={handleCreateQuickNote}
                style={{ backgroundColor: activeProfile.colors.notes }}
                className="w-full flex items-center justify-between p-3 rounded-xl text-white font-semibold shadow-sm cursor-pointer active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <Inbox className="w-4.5 h-4.5 shrink-0" />
                  <div>
                    <span className="text-xs font-bold block">Quick Write (Schnelle Notiz)</span>
                    <span className="text-[11px] text-white/85 block font-normal">
                      Direkt in Inbox ohne Ordner ablegen
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>

              {/* 2. Ordnerwahl + inline Ordner erstellen */}
              <div className="p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/70 dark:bg-[#23252A] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                    <span>Ordner auswählen</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSlideOutCreatingFolder((prev) => !prev);
                      setSlideOutNewFolderName('');
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[var(--ochre-accent)] hover:underline cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Ordner erstellen</span>
                  </button>
                </div>

                {isSlideOutCreatingFolder && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder={
                        slideOutFolder === '/'
                          ? 'Neuer Ordnername...'
                          : `Unterordner in '${slideOutFolder}'...`
                      }
                      value={slideOutNewFolderName}
                      onChange={(e) => setSlideOutNewFolderName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && slideOutNewFolderName.trim()) {
                          const target =
                            slideOutFolder === '/'
                              ? slideOutNewFolderName.trim()
                              : `${slideOutFolder}/${slideOutNewFolderName.trim()}`;
                          const ok = await handleCreateFolder(target);
                          if (ok) {
                            setSlideOutFolder(target.replace(/^\/+|\/+$/g, ''));
                            setIsSlideOutCreatingFolder(false);
                            setSlideOutNewFolderName('');
                          }
                        }
                      }}
                      className="flex-1 text-xs px-2.5 py-2 rounded-lg bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={!slideOutNewFolderName.trim()}
                      onClick={async () => {
                        if (!slideOutNewFolderName.trim()) return;
                        const target =
                          slideOutFolder === '/'
                            ? slideOutNewFolderName.trim()
                            : `${slideOutFolder}/${slideOutNewFolderName.trim()}`;
                        const ok = await handleCreateFolder(target);
                        if (ok) {
                          setSlideOutFolder(target.replace(/^\/+|\/+$/g, ''));
                          setIsSlideOutCreatingFolder(false);
                          setSlideOutNewFolderName('');
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-[var(--ochre-accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                )}

                <select
                  value={slideOutFolder}
                  onChange={(e) => setSlideOutFolder(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 rounded-lg bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden focus:border-[var(--ochre-accent)]"
                >
                  <option value="/">/ (Hauptverzeichnis / Allgemein)</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      📁 {f}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => openNewNoteDialog(slideOutFolder)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white dark:bg-[#2A2C31] border border-[var(--ochre-accent)] text-[var(--ochre-accent)] text-xs font-bold shadow-2xs hover:bg-[var(--ochre-accent)] hover:text-white transition-all cursor-pointer active:scale-95"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                  <span>
                    {slideOutFolder === '/' ? 'Allgemeine Notiz erstellen' : `Notiz in "${slideOutFolder}"`}
                  </span>
                </button>
              </div>

              {/* 3. Mit Lite Vault wählen / öffnen */}
              <button
                type="button"
                onClick={() => {
                  setIsNewNoteSlideOutOpen(false);
                  setOpenLiteVaultSignal((n) => n + 1);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] hover:border-[var(--ochre-accent)] transition-all cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-[var(--ochre-accent)] flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 block">
                      Mit Lite Vault öffnen
                    </span>
                    <span className="text-[11px] text-neutral-400 block">
                      Ordner & Notizen als kompakte Übersicht
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Note Name Popup Modal (Top-anchored on Mobile/Tablet above Keyboard, compact centered overlay on Desktop) */}
      {newNoteModal.isOpen && (
        <div
          onClick={() => setNewNoteModal({ isOpen: false, folder: '/', name: '' })}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-16 lg:pt-4 pb-3 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-4 sm:p-5 space-y-3.5 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  style={{ backgroundColor: activeProfile.colors.notes }}
                  className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0"
                >
                  <FilePlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    Neue Notiz benennen
                  </h3>
                  <span className="text-[11px] text-neutral-400 block truncate">
                    Speicherort: {newNoteModal.folder === '/' ? 'Hauptverzeichnis (/)' : newNoteModal.folder}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewNoteModal({ isOpen: false, folder: '/', name: '' })}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                aria-label="Abbrechen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300 block">
                Notizname:
              </label>
              <input
                type="text"
                placeholder="z.B. Projektideen, Einkaufsliste..."
                value={newNoteModal.name}
                onChange={(e) => setNewNoteModal((prev) => ({ ...prev, name: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmCreateNamedNote();
                  } else if (e.key === 'Escape') {
                    setNewNoteModal({ isOpen: false, folder: '/', name: '' });
                  }
                }}
                className="w-full text-sm px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 outline-hidden focus:border-[var(--ochre-accent)]"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNewNoteModal({ isOpen: false, folder: '/', name: '' })}
                className="px-3 py-1.5 text-xs rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmCreateNamedNote}
                style={{ backgroundColor: activeProfile.colors.notes }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white shadow-xs hover:opacity-95 cursor-pointer active:scale-95"
              >
                Notiz erstellen
              </button>
            </div>
          </div>
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
          noteContent={activeNoteContentRef.current || activeNoteContent}
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
        documentStats={documentStats}
        lastSaved={lastSaved}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        activeNoteTitle={activeNoteTitle}
      />

      {currentUser && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => {
            setIsSettingsModalOpen(false);
            setSettingsModalTarget({});
          }}
          currentUser={currentUser}
          allUsers={allUsers}
          onRefreshVault={loadVaultData}
          onUpdateUser={(updatedUser) => {
            setCurrentUser(updatedUser);
            setAllUsers((prev) =>
              prev.map((u) => (u.username === updatedUser.username ? updatedUser : u))
            );
          }}
          onUpdateAllUsers={setAllUsers}
          onSwitchUser={(user) => {
            handleSelectUser(user);
            setIsSettingsModalOpen(false);
            setSettingsModalTarget({});
          }}
          appTitle={appTitle}
          onUpdateAppTitle={handleUpdateAppTitle}
          activeNoteTitle={activeNoteTitle}
          activeNoteContent={activeNoteContent}
          enabledModules={enabledModules}
          onToggleModule={handleToggleModule}
          profileSettings={profileSettings}
          onUpdateProfileSettings={handleUpdateProfileSettings}
          initialModuleContext={settingsModalTarget.module || activeSuiteModule}
          initialSettingsTab={settingsModalTarget.tab}
          dashboardSettings={dashboardSettings}
          onUpdateDashboardSettings={handleUpdateDashboardSettings}
          onCookbookUpdated={() => setCookbookRefreshKey((k) => k + 1)}
          onCookbookSettingsChange={(s) => {
            const shoppingEnabled = s.enableShoppingList !== false;
            const cycleEnabled = s.enableCycle !== false;
            setEnableCookbookShoppingList(shoppingEnabled);
            setEnableCookbookCycle(cycleEnabled);
            if (!shoppingEnabled && cookbookTab === 'shopping') {
              setCookbookTab('calendar');
            } else if (!cycleEnabled && cookbookTab === 'cycle') {
              setCookbookTab('calendar');
            }
          }}
        />
      )}

      {isLoginModalOpen && (
        <LoginScreen
          users={allUsers}
          onSelectUser={handleSelectUser}
          onUserCreated={(newUser) => {
            setAllUsers((prev) => [...prev, newUser]);
            handleSelectUser(newUser);
          }}
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

      <TourOverlay
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        activeModule={activeSuiteModule}
        enabledModules={enabledModules}
        onSwitchModule={setActiveSuiteModule}
        accentColor={activeAccentColor}
      />
    </div>
  );
}
