import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User, NoteMetadata, NoteContent, PaneType } from './types';
import { api } from './services/api';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/sidebar/Sidebar';
import { Workspace } from './components/workspace/Workspace';
import { ShareModal } from './components/modals/ShareModal';
import { SystemLogsModal } from './components/modals/SystemLogsModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { BookOpen, CheckSquare, Network, ChevronRight, ChevronLeft, X } from 'lucide-react';

export default function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('ochrenotes_theme') === 'dark';
  });

  // User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Vault Notes State
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [sharedNotes, setSharedNotes] = useState<NoteMetadata[]>([]);
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

  // Modals
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSystemLogsModalOpen, setIsSystemLogsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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

  // Load vault notes when user changes
  const loadVaultData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [userNotes, shared] = await Promise.all([
        api.fetchNotes(currentUser.username),
        api.fetchSharedWithMe(currentUser.username),
      ]);
      setNotes(userNotes);
      setSharedNotes(shared);

      // Open first note if none opened
      if (!activeNotePath && userNotes.length > 0) {
        openNote(userNotes[0].path, false);
      }
    } catch (e) {
      console.error('Error loading vault data', e);
    }
  }, [currentUser, activeNotePath]);

  useEffect(() => {
    if (currentUser) {
      loadVaultData();
    }
  }, [currentUser, loadVaultData]);

  // Open note handler
  const openNote = async (notePath: string, isShared = false, sharedFrom = '') => {
    if (!currentUser) return;
    try {
      const data = await api.readNote(currentUser.username, notePath, isShared, sharedFrom);
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
      await api.createNote(currentUser.username, newPath, `# ${cleanTitle}\n\n`);
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
      activeSharedFrom
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
    await api.createNote(currentUser.username, path, defaultContent);
    await loadVaultData();
    await openNote(path);
  };

  // Create folder in vault
  const handleCreateFolder = async (folderPath: string) => {
    if (!currentUser || !folderPath.trim()) return false;
    const clean = folderPath.trim().replace(/^\/+|\/+$/g, '');
    const ok = await api.createFolder(currentUser.username, clean);
    if (ok) {
      await loadVaultData();
    }
    return ok;
  };

  // Delete folder in vault (safe: only empty)
  const handleDeleteFolder = async (folderPath: string) => {
    if (!currentUser || !folderPath) return false;
    const res = await api.deleteFolder(currentUser.username, folderPath);
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
      await api.moveNote(currentUser.username, oldPath, newPath);
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
      await api.moveNote(currentUser.username, oldPath, newPath);
      await loadVaultData();
      await openNote(newPath);
    } catch (e) {
      console.error('Failed to rename note', e);
    }
  };

  // Delete note
  const handleDeleteNote = async (notePath: string) => {
    if (!currentUser) return;
    await api.deleteNote(currentUser.username, notePath);
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
      activeSharedFrom
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

  // A4 Print Handler
  const handlePrintA4 = () => {
    window.print();
  };

  // Document statistics computation
  const documentStats = useMemo(() => {
    const lines = activeNoteContent.split('\n');
    const words = activeNoteContent.trim() ? activeNoteContent.trim().split(/\s+/).length : 0;
    const chars = activeNoteContent.length;
    return { lines: lines.length, words, chars };
  }, [activeNoteContent]);

  // Window-level touch gesture listeners for smooth mobile vault swipe
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      // Do not trigger Vault swipe gesture when interacting with tabs bar, toolbar, header or inputs
      if (target?.closest('[data-no-swipe]') || target?.closest('header') || target?.closest('button') || target?.closest('input') || target?.closest('select')) {
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

      // Horizontal swipe recognition (only when mostly horizontal)
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        // Swipe right (left to right) -> open vault
        if (deltaX > 45 && touchStartXRef.current < 120) {
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
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${isDarkMode ? 'dark' : ''} bg-[#FBFBFA] dark:bg-[#18191B] text-neutral-900 dark:text-neutral-100 font-sans`}>
      {/* Top Bar Header with Modular Ochre Suite Logo & Consolidated Menus */}
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
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onPrintA4={handlePrintA4}
        onOpenSystemLogs={() => setIsSystemLogsModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenUserSwitch={() => setIsLoginModalOpen(true)}
        onLogout={() => setIsLoginModalOpen(true)}
        canInstallPwa={true}
        onInstallPwa={handleInstallPwa}
        appTitle={appTitle}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Edge Pull-out Tab: Half-circle on left screen edge with alternating arrows */}
        <button
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className={`lg:hidden fixed top-1/2 -translate-y-1/2 z-40 h-16 w-6.5 flex items-center justify-center bg-[#C87D20] text-white shadow-xl transition-all duration-300 active:scale-95 cursor-pointer ${
            isMobileSidebarOpen 
              ? 'left-[280px] rounded-r-lg' 
              : 'left-0 rounded-r-full'
          }`}
          title={isMobileSidebarOpen ? 'Vault einklappen' : 'Vault Explorer ausfahren'}
          aria-label="Vault Explorer umschalten"
        >
          {isMobileSidebarOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Sidebar with Drag & Drop and Folder Plus */}
        <Sidebar
          notes={notes}
          sharedNotes={sharedNotes}
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
        />

        {/* Central Workspace Pane */}
        <Workspace
          viewMode={viewMode}
          content={activeNoteContent}
          onContentChange={handleContentChange}
          isReadOnly={activePermission === 'read'}
          onSave={() => {
            if (currentUser && activeNotePath) {
              api.saveNote(currentUser.username, activeNotePath, activeNoteContent, activeIsShared, activeSharedFrom);
              setLastSaved(Date.now());
            }
          }}
          lastSaved={lastSaved}
          onToggleTask={handleToggleTask}
          onWikilinkClick={openNoteByTitle}
          onTagClick={(tag) => {
            setViewMode('tasks');
          }}
          username={currentUser?.username || 'michael'}
          onOpenNoteByTitle={openNoteByTitle}
          allNotes={[...notes, ...sharedNotes]}
          activeNotePath={activeNotePath}
          activeNoteTitle={activeNoteTitle}
          onSelectPrimaryNote={openNote}
          onRenameNote={handleRenameNote}
          onCreateNote={handleCreateNote}
        />
      </div>

      {/* Mobile Floating Action Navigation: Backdrop when open, Centered Pill, Themed Warm Colors */}
      {isMobileNavExpanded && (
        <div 
          onClick={() => setIsMobileNavExpanded(false)}
          className="fixed inset-0 bg-[#C87D20]/10 dark:bg-black/50 backdrop-blur-2xs z-40 lg:hidden animate-in fade-in duration-150"
        />
      )}

      {/* Floating Nav Button / Bottom-Right Expanded Capsule (Icons only, no text) */}
      <div className="lg:hidden select-none">
        {isMobileNavExpanded ? (
          <div className="fixed bottom-6 right-5 z-50 h-14 px-2 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 border-[#D98B26] flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setViewMode('editor');
                setIsMobileNavExpanded(false);
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                viewMode === 'editor'
                  ? 'bg-[#D98B26] text-white shadow-xs'
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
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                viewMode === 'tasks'
                  ? 'bg-[#D98B26] text-white shadow-xs'
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
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                viewMode === 'graph'
                  ? 'bg-[#D98B26] text-white shadow-xs'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/15 dark:hover:bg-neutral-800'
              }`}
              title="Wissensgraph"
              aria-label="Graph"
            >
              <Network className="w-4.5 h-4.5" />
            </button>

            {/* Close button with subtle divider */}
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
            className="fixed bottom-6 right-5 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] text-[#D98B26] shadow-2xl border-2 border-[#D98B26] flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer relative"
            title="Navigation öffnen (Notizen, Aufgaben, Graph)"
            aria-label="Navigation öffnen"
          >
            {viewMode === 'editor' && <BookOpen className="w-5 h-5 text-[#D98B26]" />}
            {viewMode === 'tasks' && <CheckSquare className="w-5 h-5 text-[#D98B26]" />}
            {viewMode === 'graph' && <Network className="w-5 h-5 text-[#D98B26]" />}
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#D98B26] rounded-full border-2 border-white dark:border-[#1E1F23]"></span>
          </button>
        )}
      </div>

      {/* Modals */}
      {currentUser && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          noteTitle={activeNoteTitle}
          notePath={activeNotePath || ''}
          noteContent={activeNoteContent}
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
          onRefreshVault={loadVaultData}
          appTitle={appTitle}
          onUpdateAppTitle={handleUpdateAppTitle}
          activeNoteTitle={activeNoteTitle}
          activeNoteContent={activeNoteContent}
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
