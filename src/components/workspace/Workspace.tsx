import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PaneType, NoteMetadata, NoteProfileId, ProjectItem } from '../../types';
import { LiveEditorPane } from '../editor/LiveEditorPane';
import { TasksDashboard } from '../tasks/TasksDashboard';
import { GraphView } from '../graph/GraphView';
import { 
  GripVertical, 
  FileText, 
  Plus, 
  Columns2, 
  X, 
  Upload, 
  Layers, 
  Folder, 
  FolderPlus,
  ChevronRight, 
  ChevronDown, 
  Search,
  Check
} from 'lucide-react';
import { api } from '../../services/api';

interface WorkspaceProps {
  viewMode: PaneType;
  content: string;
  onContentChange: (newContent: string) => void;
  isReadOnly?: boolean;
  onSave?: () => void;
  lastSaved?: number;
  onToggleTask: (lineIndex: number, completed: boolean) => void;
  onWikilinkClick: (target: string) => void;
  onTagClick: (tag: string) => void;
  username: string;
  noteProfile?: NoteProfileId;
  accentColor?: string;
  onOpenNoteByTitle: (title: string) => void;
  // Multi-note snap / split support
  allNotes: NoteMetadata[];
  folders?: string[];
  activeNotePath: string | null;
  activeNoteTitle: string;
  isShared?: boolean;
  sharedFrom?: string;
  onSelectPrimaryNote: (path: string, isShared?: boolean, sharedFrom?: string) => void;
  onRenameNote?: (oldPath: string, newTitle: string) => void;
  onCreateNote?: (folder?: string) => void;
  onCreateFolder?: (folderPath: string) => Promise<boolean | void> | void;
  onSwitchToEditor?: () => void;
  openLiteVaultSignal?: number;
  projects?: ProjectItem[];
  onNavigateToProject?: (projectId: string) => void;
}

interface NoteTab {
  path: string;
  title: string;
  isShared?: boolean;
  sharedFrom?: string;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  viewMode,
  content,
  onContentChange,
  isReadOnly,
  onSave,
  lastSaved,
  onToggleTask,
  onWikilinkClick,
  onTagClick,
  username,
  noteProfile = 'profile1',
  accentColor = '#C87D20',
  onOpenNoteByTitle,
  // Multi-note snap / split support
  allNotes,
  folders = [],
  activeNotePath,
  activeNoteTitle,
  isShared = false,
  sharedFrom,
  onSelectPrimaryNote,
  onRenameNote,
  onCreateNote,
  onCreateFolder,
  onSwitchToEditor,
  openLiteVaultSignal,
  projects = [],
  onNavigateToProject,
}) => {
  // Screen width detection for mobile lite vault & tab mode
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Split ratio: 50% by default for desktop
  const [splitRatio, setSplitRatio] = useState<number>(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  // Multi-tab support for mobile (switches active tab on Vault/Lite Vault click; opens new tab via + button)
  const [mobileTabs, setMobileTabs] = useState<NoteTab[]>([]);
  const [activeMobileTabPath, setActiveMobileTabPath] = useState<string | null>(activeNotePath);
  const nextOpenIsNewTabRef = useRef<boolean>(false);
  const activeMobileTabPathRef = useRef<string | null>(activeNotePath);
  useEffect(() => {
    activeMobileTabPathRef.current = activeMobileTabPath;
  }, [activeMobileTabPath]);

  // Cache of tab contents for fast switching in temporary memory
  const [tabContents, setTabContents] = useState<Record<string, { content: string; title: string; lastSaved?: number }>>({});

  // Reset mobile tabs & split pane when switching between Profile 1 and Profile 2 or users
  useEffect(() => {
    setMobileTabs([]);
    setActiveMobileTabPath(null);
    activeMobileTabPathRef.current = null;
    setTabContents({});
    setSecondaryNotePath(null);
  }, [username, noteProfile]);

  // Synchronize active note into mobileTabs (replace active tab on switch unless + triggered new tab)
  useEffect(() => {
    if (activeNotePath && activeNoteTitle) {
      const openAsNew = nextOpenIsNewTabRef.current;
      nextOpenIsNewTabRef.current = false;
      const currentActive = activeMobileTabPathRef.current;

      setMobileTabs((prev) => {
        if (prev.some((t) => t.path === activeNotePath)) return prev;
        const entry: NoteTab = { path: activeNotePath, title: activeNoteTitle, isShared, sharedFrom };
        if (prev.length === 0 || openAsNew) {
          return [...prev, entry];
        }
        const replaceIdx = currentActive ? prev.findIndex((t) => t.path === currentActive) : 0;
        if (replaceIdx >= 0) {
          const next = [...prev];
          next[replaceIdx] = entry;
          return next;
        }
        return [entry, ...prev.slice(1)];
      });
      setActiveMobileTabPath(activeNotePath);
      activeMobileTabPathRef.current = activeNotePath;
      setTabContents((prev) => ({
        ...prev,
        [activeNotePath]: { content, title: activeNoteTitle, lastSaved },
      }));
    }
  }, [activeNotePath, activeNoteTitle, isShared, sharedFrom]);

  useEffect(() => {
    if (!activeNotePath) return;
    setTabContents((prev) => {
      const existing = prev[activeNotePath];
      if (existing && existing.content === content && existing.title === activeNoteTitle) {
        return prev;
      }
      return {
        ...prev,
        [activeNotePath]: { content, title: activeNoteTitle, lastSaved },
      };
    });
  }, [activeNotePath, activeNoteTitle, content, lastSaved]);

  // Translate vertical mouse wheel into horizontal scroll & support mouse drag-to-swipe on tabs
  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 1.2;
      } else if (e.deltaX !== 0) {
        el.scrollLeft += e.deltaX;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.scrollLeft = scrollLeft - walk;
    };

    const handleMouseUp = () => {
      isDown = false;
    };

    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mobileTabs.length, isMobile]);

  // Secondary Note in Right Pane for Desktop
  const [secondaryNotePath, setSecondaryNotePath] = useState<string | null>(null);
  const [secondaryContent, setSecondaryContent] = useState<string>('');
  const [secondaryTitle, setSecondaryTitle] = useState<string>('');
  const [secondaryLastSaved, setSecondaryLastSaved] = useState<number | undefined>(undefined);
  const [isDragOverSplit, setIsDragOverSplit] = useState(false);

  // Lite Vault modal state (used across editor, tasks, graph and desktop empty split)
  const [isLiteVaultOpen, setIsLiteVaultOpen] = useState(false);
  const [liteVaultMode, setLiteVaultMode] = useState<'switch' | 'newTab'>('switch');
  const [liteVaultSearch, setLiteVaultSearch] = useState('');
  const [liteVaultCollapsedFolders, setLiteVaultCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isLiteVaultNewFolderOpen, setIsLiteVaultNewFolderOpen] = useState(false);
  const [liteVaultNewFolderParent, setLiteVaultNewFolderParent] = useState<string>('/');
  const [liteVaultNewFolderName, setLiteVaultNewFolderName] = useState('');
  const [isCreatingLiteVaultFolder, setIsCreatingLiteVaultFolder] = useState(false);

  // 1:1 finger-tracked swipe-to-dismiss state for Lite Vault drawer/card with velocity fling & haptics
  const [liteVaultDragY, setLiteVaultDragY] = useState<number | null>(null);
  const liteVaultTouchStartRef = useRef<{
    x: number;
    y: number;
    lastY: number;
    lastTs: number;
    vy: number;
    hapticFired: boolean;
  } | null>(null);
  const liteVaultListScrollRef = useRef<HTMLDivElement>(null);

  const handleCreateFolderFromLiteVault = async () => {
    if (!onCreateFolder || !liteVaultNewFolderName.trim() || isCreatingLiteVaultFolder) return;
    const cleanName = liteVaultNewFolderName.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanName) return;
    const parentClean = liteVaultNewFolderParent === '/' ? '' : liteVaultNewFolderParent.replace(/^\/+|\/+$/g, '');
    const fullPath = parentClean ? `${parentClean}/${cleanName}` : cleanName;
    setIsCreatingLiteVaultFolder(true);
    try {
      const ok = await onCreateFolder(fullPath);
      if (ok !== false) {
        setLiteVaultCollapsedFolders((prev) => ({ ...prev, [fullPath]: false }));
        setLiteVaultNewFolderName('');
        setIsLiteVaultNewFolderOpen(false);
        setLiteVaultNewFolderParent('/');
      }
    } finally {
      setIsCreatingLiteVaultFolder(false);
    }
  };

  useEffect(() => {
    if (openLiteVaultSignal && openLiteVaultSignal > 0) {
      setLiteVaultMode('switch');
      setIsLiteVaultNewFolderOpen(false);
      setLiteVaultNewFolderName('');
      setLiteVaultDragY(null);
      setIsLiteVaultOpen(true);
    }
  }, [openLiteVaultSignal]);

  // Toolbar visibility state (shared / moved to header bar)
  const [showToolbar, setShowToolbar] = useState(true);

  // Load note into secondary split (Desktop) or switch/add tab (Mobile)
  const loadSecondaryNote = async (path: string, noteIsShared = false, noteSharedFrom = '') => {
    try {
      if (isMobile) {
        if (liteVaultMode === 'newTab') {
          nextOpenIsNewTabRef.current = true;
        } else {
          nextOpenIsNewTabRef.current = false;
        }
        setIsLiteVaultOpen(false);
        setLiteVaultDragY(null);
        onSelectPrimaryNote(path, noteIsShared, noteSharedFrom);
        if (viewMode !== 'editor') {
          onSwitchToEditor?.();
        }
      } else {
        const data = await api.readNote(username, path, noteIsShared, noteSharedFrom, noteProfile);
        if (viewMode !== 'editor') {
          onSelectPrimaryNote(path, noteIsShared, noteSharedFrom);
          onSwitchToEditor?.();
        } else {
          setSecondaryNotePath(path);
          setSecondaryTitle(data.title);
          setSecondaryContent(data.content);
          setSplitRatio(50);
        }
        setIsLiteVaultOpen(false);
      }
    } catch (e) {
      console.error('Failed to load note', e);
    }
  };

  const secondarySaveTimerRef = useRef<number | null>(null);
  const mobileTabSaveTimerRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      if (secondarySaveTimerRef.current !== null) window.clearTimeout(secondarySaveTimerRef.current);
      Object.values(mobileTabSaveTimerRef.current).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handleSecondaryContentChange = (newText: string) => {
    setSecondaryContent(newText);
    if (secondaryNotePath && secondaryNotePath !== '__empty__') {
      if (secondarySaveTimerRef.current !== null) {
        window.clearTimeout(secondarySaveTimerRef.current);
      }
      const targetPath = secondaryNotePath;
      secondarySaveTimerRef.current = window.setTimeout(() => {
        api.saveNote(username, targetPath, newText, false, undefined, noteProfile).then(() => {
          setSecondaryLastSaved(Date.now());
        });
      }, 420);
    }
  };

  const handleMobileTabContentChange = (path: string, newText: string) => {
    setTabContents((prev) => ({
      ...prev,
      [path]: { ...prev[path], content: newText },
    }));

    if (path === activeNotePath) {
      onContentChange(newText);
    } else {
      if (mobileTabSaveTimerRef.current[path]) {
        window.clearTimeout(mobileTabSaveTimerRef.current[path]);
      }
      mobileTabSaveTimerRef.current[path] = window.setTimeout(() => {
        api.saveNote(username, path, newText, false, undefined, noteProfile).then(() => {
          setTabContents((prev) => ({
            ...prev,
            [path]: { ...prev[path], lastSaved: Date.now() },
          }));
        });
      }, 420);
    }
  };

  // Resizer dragging
  const startDragging = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      if (newRatio >= 20 && newRatio <= 80) {
        setSplitRatio(newRatio);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Open empty split / Lite Vault
  const handleOpenSplit = () => {
    if (isMobile) {
      setIsLiteVaultOpen(true);
    } else {
      setSecondaryNotePath('__empty__');
      setSecondaryTitle('Geteilte Notiz auswählen');
      setSecondaryContent('');
      setSplitRatio(50);
    }
  };

  // Handle Drop from Vault Explorer
  const handleDropOnSplit = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverSplit(false);

    let droppedPath = e.dataTransfer.getData('text/note-path') || e.dataTransfer.getData('text/plain');
    if (!droppedPath) {
      try {
        const jsonStr = e.dataTransfer.getData('application/json');
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (parsed?.path) droppedPath = parsed.path;
        }
      } catch {}
    }

    if (droppedPath) {
      const cleanPath = droppedPath.trim();
      const targetNote = allNotes.find((n) => n.path === cleanPath || n.title === cleanPath || n.path.endsWith(cleanPath));
      if (targetNote) {
        loadSecondaryNote(targetNote.path, targetNote.isShared, targetNote.sharedFromUser);
      } else {
        loadSecondaryNote(cleanPath, false);
      }
    }
  };

  // Group notes (and all known folders, including newly created empty folders) for Lite Vault
  const groupedLiteVaultNotes = useMemo(() => {
    const groups: Record<string, NoteMetadata[]> = { '/': [] };
    if (!liteVaultSearch.trim()) {
      folders.forEach((f) => {
        const cleanF = f.replace(/^\/+|\/+$/g, '');
        if (cleanF && !groups[cleanF]) groups[cleanF] = [];
      });
    }
    const filtered = allNotes.filter((n) => {
      if (!liteVaultSearch.trim()) return true;
      return n.title.toLowerCase().includes(liteVaultSearch.toLowerCase()) || n.path.toLowerCase().includes(liteVaultSearch.toLowerCase());
    });

    filtered.forEach((note) => {
      const parts = note.path.split('/');
      if (parts.length === 1) {
        groups['/'].push(note);
      } else {
        const folder = parts.slice(0, -1).join('/');
        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(note);
      }
    });

    return groups;
  }, [allNotes, folders, liteVaultSearch]);

  const renderLiteVaultModal = () => {
    if (!isLiteVaultOpen) return null;
    const isActivelyDragging = liteVaultDragY !== null;
    const dragOffset = liteVaultDragY ?? 0;
    const backdropOpacity = Math.max(0.1, 0.5 * (1 - Math.min(1, Math.abs(dragOffset) / 220)));

    return (
      <div
        data-no-swipe="true"
        onClick={() => {
          setLiteVaultDragY(null);
          setIsLiteVaultOpen(false);
        }}
        style={{
          backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
          transition: isActivelyDragging ? 'none' : 'background-color 180ms ease-out',
        }}
        className="fixed inset-0 z-[110] flex items-start lg:items-center justify-center px-2.5 pt-16 pb-3 sm:px-4 lg:pt-4 backdrop-blur-xs"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('input')) {
              liteVaultTouchStartRef.current = null;
              return;
            }
            const listEl = liteVaultListScrollRef.current;
            const inList = listEl && target ? listEl.contains(target) : false;
            if (inList && listEl && listEl.scrollTop > 4) {
              liteVaultTouchStartRef.current = null;
              return;
            }
            const touch = e.touches[0];
            liteVaultTouchStartRef.current = {
              x: touch.clientX,
              y: touch.clientY,
              lastY: touch.clientY,
              lastTs: performance.now(),
              vy: 0,
              hapticFired: false,
            };
          }}
          onTouchMove={(e) => {
            const ref = liteVaultTouchStartRef.current;
            if (!ref) return;
            const touch = e.touches[0];
            const now = performance.now();
            const dt = Math.max(1, now - ref.lastTs);
            const dyStep = touch.clientY - ref.lastY;
            ref.vy = ref.vy * 0.45 + (dyStep / dt) * 0.55;
            ref.lastY = touch.clientY;
            ref.lastTs = now;

            const dy = touch.clientY - ref.y;
            const dx = touch.clientX - ref.x;
            if (Math.abs(dy) < 6 && liteVaultDragY === null) return;
            const listEl = liteVaultListScrollRef.current;
            if (dy > 0 && listEl && listEl.scrollTop > 4 && liteVaultDragY === null) {
              liteVaultTouchStartRef.current = null;
              return;
            }
            if (Math.abs(dy) > Math.abs(dx) * 0.85 || liteVaultDragY !== null) {
              const clamped = Math.max(-260, Math.min(260, dy));
              if (!ref.hapticFired && Math.abs(clamped) >= 72) {
                ref.hapticFired = true;
                try { navigator.vibrate?.(10); } catch {}
              }
              setLiteVaultDragY(clamped);
            }
          }}
          onTouchEnd={() => {
            const ref = liteVaultTouchStartRef.current;
            const currentDrag = liteVaultDragY ?? 0;
            const idleMs = ref ? performance.now() - ref.lastTs : 999;
            const vy = ref ? ref.vy : 0;
            const isFlingDismiss = Math.abs(vy) >= 0.3 && Math.abs(currentDrag) > 20;
            const isPastThreshold = Math.abs(currentDrag) > 78 && !(idleMs > 140 && Math.abs(vy) < 0.05 && Math.abs(currentDrag) < 150);
            if (liteVaultDragY !== null && (isFlingDismiss || isPastThreshold)) {
              try { navigator.vibrate?.(12); } catch {}
              setLiteVaultDragY(null);
              setIsLiteVaultOpen(false);
            } else {
              setLiteVaultDragY(null);
            }
            liteVaultTouchStartRef.current = null;
          }}
          onTouchCancel={() => {
            setLiteVaultDragY(null);
            liteVaultTouchStartRef.current = null;
          }}
          style={{
            transform: `translateY(${dragOffset}px)`,
            transition: isActivelyDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className="bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] w-full max-w-lg max-h-[62dvh] sm:max-h-[76dvh] lg:h-[75dvh] flex flex-col overflow-hidden"
        >
          <div className="p-3 sm:p-3.5 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0 touch-none">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-[var(--ochre-accent)] shrink-0" />
                <span className="truncate">
                  {liteVaultMode === 'newTab' ? 'Lite Vault: Neuen Tab öffnen' : 'Lite Vault: Notiz & Ordner'}
                </span>
              </h3>
              <span className="text-[11px] text-neutral-400 block truncate">
                {liteVaultMode === 'newTab'
                  ? 'Notiz wählen, um sie als neuen Tab hinzuzufügen'
                  : isMobile
                  ? 'Notiz wechseln, Ordner anlegen oder wischen zum Schließen'
                  : 'Notiz oder Ordner wählen bzw. neu anlegen'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onCreateFolder && (
                <button
                  type="button"
                  onClick={() => {
                    setLiteVaultNewFolderParent('/');
                    setLiteVaultNewFolderName('');
                    setIsLiteVaultNewFolderOpen((prev) => !prev);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-semibold shadow-2xs cursor-pointer active:scale-95 touch-manipulation shrink-0 transition-colors ${
                    isLiteVaultNewFolderOpen && liteVaultNewFolderParent === '/'
                      ? 'bg-amber-500/15 border-[var(--ochre-accent)] text-[var(--ochre-accent)]'
                      : 'bg-[#F4F3EF] dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#3A3D44] text-neutral-700 dark:text-neutral-200 hover:border-[var(--ochre-accent)]'
                  }`}
                  title="Neuen Ordner im Lite Vault erstellen"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                  <span>Ordner</span>
                </button>
              )}
              {onCreateNote && (
                <button
                  type="button"
                  onClick={() => {
                    if (liteVaultMode === 'newTab') {
                      nextOpenIsNewTabRef.current = true;
                    }
                    onCreateNote();
                    setIsLiteVaultOpen(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[var(--ochre-accent)] text-white text-xs font-semibold shadow-xs cursor-pointer active:scale-95 touch-manipulation shrink-0"
                  title="Neue Notiz erstellen"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Neu</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsLiteVaultOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white shrink-0 cursor-pointer touch-manipulation"
                aria-label="Lite Vault schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-2.5 border-b border-[#E5E3DC] dark:border-[#2F3136] space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Notizen durchsuchen..."
                value={liteVaultSearch}
                onChange={(e) => setLiteVaultSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#151618] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
              />
            </div>

            {isLiteVaultNewFolderOpen && onCreateFolder && (
              <div className="p-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-[var(--ochre-accent)]/40 space-y-1.5 animate-in fade-in duration-100">
                <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                  <span className="truncate">
                    {liteVaultNewFolderParent === '/'
                      ? 'Neuen Ordner im Hauptverzeichnis erstellen:'
                      : `Unterordner in "${liteVaultNewFolderParent}" erstellen:`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsLiteVaultNewFolderOpen(false)}
                    className="p-0.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Ordnername..."
                    value={liteVaultNewFolderName}
                    onChange={(e) => setLiteVaultNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateFolderFromLiteVault();
                      } else if (e.key === 'Escape') {
                        setIsLiteVaultNewFolderOpen(false);
                      }
                    }}
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={!liteVaultNewFolderName.trim() || isCreatingLiteVaultFolder}
                    onClick={handleCreateFolderFromLiteVault}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ochre-accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer active:scale-95 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>OK</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div ref={liteVaultListScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3">
            {Object.keys(groupedLiteVaultNotes).map((folderKey) => {
              const folderNotes = groupedLiteVaultNotes[folderKey];
              const isRoot = folderKey === '/';
              const isCollapsed = liteVaultCollapsedFolders[folderKey];

              return (
                <div key={folderKey} className="space-y-1">
                  {!isRoot && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <button
                        type="button"
                        onClick={() =>
                          setLiteVaultCollapsedFolders((prev) => ({
                            ...prev,
                            [folderKey]: !prev[folderKey],
                          }))
                        }
                        className="flex items-center gap-1.5 flex-1 min-w-0 truncate text-left cursor-pointer"
                      >
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                        <Folder className="w-3.5 h-3.5 text-[var(--ochre-accent)] shrink-0" />
                        <span className="truncate">{folderKey}</span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {onCreateFolder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLiteVaultNewFolderParent(folderKey);
                              setLiteVaultNewFolderName('');
                              setIsLiteVaultNewFolderOpen(true);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#3A3D44] text-neutral-600 dark:text-neutral-300 hover:border-[var(--ochre-accent)] hover:text-[var(--ochre-accent)] shadow-xs shrink-0 cursor-pointer active:scale-95 touch-manipulation"
                            title={`Unterordner in '${folderKey}' erstellen`}
                            aria-label={`Unterordner in ${folderKey}`}
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onCreateNote && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCreateNote(folderKey);
                              setIsLiteVaultOpen(false);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white dark:bg-[#25272C] border border-[var(--ochre-accent)]/50 text-[var(--ochre-accent)] shadow-xs shrink-0 cursor-pointer active:scale-95 touch-manipulation"
                            title={`Neue Notiz in '${folderKey}' erstellen`}
                            aria-label={`Neue Notiz in ${folderKey}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {(!isCollapsed || isRoot) && (
                    <div className={!isRoot ? 'pl-3 space-y-1' : 'space-y-1'}>
                      {folderNotes.length === 0 && !isRoot && (
                        <div className="px-2.5 py-1.5 text-[11px] text-neutral-400 italic">
                          Ordner ist noch leer
                        </div>
                      )}
                      {folderNotes.map((note) => (
                        <div
                          key={note.path}
                          onClick={() => loadSecondaryNote(note.path, note.isShared, note.sharedFromUser)}
                          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-amber-500/10 cursor-pointer border border-[#E5E3DC]/60 dark:border-[#2F3136]/60 hover:border-amber-500/40 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-[var(--ochre-accent)] shrink-0" />
                            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                              {note.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 shrink-0">Öffnen</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (viewMode === 'tasks') {
    return (
      <>
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-[#FBFBFA] dark:bg-[#18191B]">
          <TasksDashboard
            username={username}
            noteProfile={noteProfile}
            onOpenNote={onOpenNoteByTitle}
            onTaskToggled={() => {}}
          />
        </main>
        {renderLiteVaultModal()}
      </>
    );
  }

  if (viewMode === 'graph') {
    return (
      <>
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-[#FBFBFA] dark:bg-[#18191B]">
          <GraphView
            username={username}
            noteProfile={noteProfile}
            accentColor={accentColor}
            onSelectNote={onOpenNoteByTitle}
          />
        </main>
        {renderLiteVaultModal()}
      </>
    );
  }

  // -------------------------------------------------------------
  // MOBILE MODE: Multi-Tab Slidebar at top with generous bubbles
  // -------------------------------------------------------------
  if (isMobile) {
    const activeTab = mobileTabs.find((t) => t.path === activeMobileTabPath) || mobileTabs[0];
    const currentTabContent = activeTab ? (tabContents[activeTab.path]?.content ?? (activeTab.path === activeNotePath ? content : '')) : content;
    const currentTabTitle = activeTab ? activeTab.title : activeNoteTitle;
    const currentTabLastSaved = activeTab ? (tabContents[activeTab.path]?.lastSaved ?? lastSaved) : lastSaved;

    return (
      <main className="flex-1 min-h-0 h-full overflow-hidden flex flex-col relative">
        {/* Mobile Sticky Slideable Tabs Bar (data-no-swipe ensures Vault gesture doesn't hijack tab scrolling) */}
        <div 
          data-no-swipe="true"
          className="sticky top-0 z-30 h-11 px-2.5 bg-[#F4F3EF]/95 dark:bg-[#1F2125]/95 backdrop-blur-md border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-1.5 shrink-0 select-none"
        >
          {/* Scrollable / Slideable Tabs Container with mouse wheel support */}
          <div 
            ref={tabsScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x min-w-0 flex-1 py-1"
          >
            {mobileTabs.map((tab) => {
              const isActive = tab.path === activeMobileTabPath;
              return (
                <div
                  key={tab.path}
                  onClick={() => {
                    setActiveMobileTabPath(tab.path);
                    activeMobileTabPathRef.current = tab.path;
                    if (tab.path !== activeNotePath) {
                      onSelectPrimaryNote(tab.path, tab.isShared, tab.sharedFrom);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-white dark:bg-[#2A2C31] text-[var(--ochre-accent)] dark:text-[#E09228] border-[var(--ochre-accent)] shadow-xs'
                      : 'bg-white/60 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 border-[#E5E3DC] dark:border-[#2F3136] hover:bg-neutral-200/60'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[130px]">{tab.title}</span>
                  {mobileTabs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextTabs = mobileTabs.filter((t) => t.path !== tab.path);
                        setMobileTabs(nextTabs);
                        if (activeMobileTabPath === tab.path) {
                          const fallback = nextTabs[0];
                          if (fallback) {
                            setActiveMobileTabPath(fallback.path);
                            onSelectPrimaryNote(fallback.path, fallback.isShared, fallback.sharedFrom);
                          }
                        }
                      }}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 ml-0.5"
                      title="Tab schließen"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pinned + (New Tab via Lite Vault) & Toolbar Toggle Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLiteVaultMode('newTab');
                setIsLiteVaultNewFolderOpen(false);
                setLiteVaultNewFolderName('');
                setLiteVaultDragY(null);
                setIsLiteVaultOpen(true);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[var(--ochre-accent)] hover:border-[var(--ochre-accent)] shadow-xs transition-all shrink-0 cursor-pointer touch-manipulation active:scale-95"
              title="Neuen Tab mit Lite Vault öffnen"
              aria-label="Neuen Tab öffnen"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowToolbar(!showToolbar)}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xs border transition-all shrink-0 cursor-pointer touch-manipulation ${
                showToolbar
                  ? 'bg-white dark:bg-[#25272C] border-[var(--ochre-accent)] text-[var(--ochre-accent)]'
                  : 'bg-white dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-800'
              }`}
              title={showToolbar ? 'Werkzeugleiste ausblenden (▲)' : 'Werkzeugleiste einblenden (▼)'}
            >
              {showToolbar ? (
                <ChevronDown className="w-4 h-4 rotate-180 transition-transform" />
              ) : (
                <ChevronDown className="w-4 h-4 transition-transform text-[var(--ochre-accent)]" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Editor Surface */}
        <div className="flex-1 min-h-0 overflow-hidden select-text flex flex-col">
          <LiveEditorPane
            content={currentTabContent}
            onChange={(newContent) => {
              if (activeTab) handleMobileTabContentChange(activeTab.path, newContent);
              else onContentChange(newContent);
            }}
            isReadOnly={isReadOnly}
            onSave={onSave}
            lastSaved={currentTabLastSaved}
            onToggleTask={onToggleTask}
            onWikilinkClick={onWikilinkClick}
            onTagClick={onTagClick}
            noteTitle={currentTabTitle}
            onRenameNote={(newTitle) => {
              if (onRenameNote && activeTab) {
                onRenameNote(activeTab.path, newTitle);
                setMobileTabs((prev) =>
                  prev.map((t) => (t.path === activeTab.path ? { ...t, title: newTitle } : t))
                );
              }
            }}
            showToolbar={showToolbar}
            onToggleToolbar={() => setShowToolbar(!showToolbar)}
            linkedProjects={projects.filter((p) =>
              p.linkedNotePaths.includes(activeTab?.path || activeNotePath || '')
            )}
            onNavigateToProject={onNavigateToProject}
            noteContext={{
              username,
              notePath: activeTab?.path || activeNotePath,
              noteProfile,
              isShared: activeTab ? activeTab.isShared : isShared,
              sharedFrom: activeTab ? activeTab.sharedFrom : sharedFrom,
            }}
          />
        </div>

        {/* Shared Lite Vault Modal (Top-anchored above virtual keyboard) */}
        {renderLiteVaultModal()}
      </main>
    );
  }

  // -------------------------------------------------------------
  // DESKTOP FULL-SIZE: Side-by-Side Split Panes with Drag & Drop
  // -------------------------------------------------------------
  return (
    <main
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!secondaryNotePath) {
          setIsDragOverSplit(true);
        }
      }}
      onDragLeave={() => setIsDragOverSplit(false)}
      onDrop={(e) => {
        e.preventDefault();
        handleDropOnSplit(e);
      }}
      className={`flex-1 min-h-0 h-full overflow-hidden flex relative ${isDragging ? 'cursor-col-resize select-none' : ''}`}
    >
      {/* Primary Note Pane */}
      <div
        style={{ width: secondaryNotePath ? `${splitRatio}%` : '100%' }}
        className={`h-full min-h-0 flex flex-col overflow-hidden min-w-[280px] transition-all duration-150 ${
          secondaryNotePath ? 'border-r border-[#E5E3DC] dark:border-[#2F3136]' : ''
        }`}
      >
        {/* Pane Sub-Header */}
        <div className="h-8 px-3 bg-[#F4F3EF] dark:bg-[#1F2125] border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300 shrink-0 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="w-3.5 h-3.5 text-[var(--ochre-accent)] shrink-0" />
            <select
              value={activeNotePath || ''}
              onChange={(e) => {
                const note = allNotes.find((n) => n.path === e.target.value);
                if (note) onSelectPrimaryNote(note.path, note.isShared, note.sharedFromUser);
              }}
              className="text-xs bg-transparent border-0 outline-hidden font-semibold truncate cursor-pointer text-neutral-800 dark:text-neutral-200"
            >
              {allNotes.map((n) => (
                <option key={n.path} value={n.path} className="bg-white dark:bg-neutral-900">
                  {n.title} {n.isShared ? `(von ${n.sharedFromDisplayName})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Action: Reset 50-50 when secondary split is open & toggle toolbar */}
          <div className="flex items-center gap-1.5">
            {secondaryNotePath && (
              <button
                onClick={() => setSplitRatio(50)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-600 dark:text-neutral-400 hover:border-[var(--ochre-accent)] transition-colors cursor-pointer shadow-2xs"
                title="Gleichmäßig aufteilen (50 / 50)"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">50/50</span>
              </button>
            )}
            <button
              onClick={() => setShowToolbar(!showToolbar)}
              className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-2xs ${
                showToolbar
                  ? 'bg-white dark:bg-[#2A2C31] border-[var(--ochre-accent)] text-[var(--ochre-accent)]'
                  : 'bg-white dark:bg-[#2A2C31] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-800'
              }`}
              title={showToolbar ? 'Werkzeugleiste ausblenden (▲)' : 'Werkzeugleiste einblenden (▼)'}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showToolbar ? 'rotate-180 text-[var(--ochre-accent)]' : 'text-neutral-400'}`} />
            </button>
          </div>
        </div>

        {/* Primary Editor Surface */}
        <div className="flex-1 min-h-0 overflow-hidden select-text flex flex-col">
          <LiveEditorPane
            content={content}
            onChange={onContentChange}
            isReadOnly={isReadOnly}
            onSave={onSave}
            lastSaved={lastSaved}
            onToggleTask={onToggleTask}
            onWikilinkClick={onWikilinkClick}
            onTagClick={onTagClick}
            noteTitle={activeNoteTitle}
            onRenameNote={(newTitle) => {
              if (onRenameNote && activeNotePath) {
                onRenameNote(activeNotePath, newTitle);
              }
            }}
            showToolbar={showToolbar}
            onToggleToolbar={() => setShowToolbar(!showToolbar)}
            linkedProjects={projects.filter((p) =>
              activeNotePath ? p.linkedNotePaths.includes(activeNotePath) : false
            )}
            onNavigateToProject={onNavigateToProject}
            noteContext={{
              username,
              notePath: activeNotePath,
              noteProfile,
              isShared,
              sharedFrom,
            }}
          />
        </div>
      </div>

      {/* Drag Drop Overlay Hint if dragging a note */}
      {isDragOverSplit && !secondaryNotePath && (
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[var(--ochre-accent)]/10 border-2 border-dashed border-[var(--ochre-accent)] flex items-center justify-center pointer-events-none z-30 animate-in fade-in duration-100">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F23] shadow-xl flex items-center gap-2 text-xs font-semibold text-[var(--ochre-accent)]">
            <Upload className="w-5 h-5" />
            <span>Hier ablegen für geteilte Ansicht (Split)</span>
          </div>
        </div>
      )}

      {/* Resizer Divider between Split Panes */}
      {secondaryNotePath && (
        <div
          onMouseDown={startDragging}
          className="w-1.5 hover:w-2 bg-[#E5E3DC] dark:bg-[#2F3136] hover:bg-[var(--ochre-accent)] dark:hover:bg-[#E09228] transition-all cursor-col-resize z-10 flex items-center justify-center shrink-0 group select-none"
          title="Ziehen zum Anpassen der Spaltenbreite"
        >
          <GripVertical className="w-3 h-3 text-neutral-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      {/* Secondary Note Split Pane */}
      {secondaryNotePath && (
        <div
          style={{ width: `${100 - splitRatio}%` }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOverSplit(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDragOverSplit(false);
            }
          }}
          onDrop={handleDropOnSplit}
          className="h-full min-h-0 flex flex-col overflow-hidden min-w-[280px] relative"
        >
          {/* Secondary Header with Note Selector and Close [X] */}
          <div className="h-8 px-3 bg-[#F4F3EF] dark:bg-[#1F2125] border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setIsLiteVaultOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[var(--ochre-accent)] text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-2xs transition-all cursor-pointer max-w-[220px] active:scale-95"
                title="Notiz über Lite Vault auswählen"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--ochre-accent)] shrink-0" />
                <span className="truncate">{secondaryNotePath === '__empty__' ? 'Notiz wählen...' : secondaryTitle}</span>
                <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setSecondaryNotePath(null)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Geteilte Ansicht schließen"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Secondary Drag & Drop Overlay */}
          {isDragOverSplit && (
            <div className="absolute inset-0 bg-[var(--ochre-accent)]/15 border-2 border-dashed border-[var(--ochre-accent)] flex items-center justify-center pointer-events-none z-50 backdrop-blur-2xs animate-in fade-in duration-100">
              <div className="p-3.5 px-5 rounded-2xl bg-white dark:bg-[#1E1F23] shadow-2xl border border-[var(--ochre-accent)] flex items-center gap-2.5 text-xs font-bold text-[var(--ochre-accent)]">
                <Upload className="w-5 h-5 animate-bounce" />
                <span>Hier ablegen für geteilte Ansicht (Split)</span>
              </div>
            </div>
          )}

          {/* Secondary Surface: Editor or Clean Lite Vault Card Menu */}
          <div className="flex-1 min-h-0 overflow-hidden select-text flex flex-col">
            {secondaryNotePath === '__empty__' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setIsDragOverSplit(true);
                }}
                onDrop={handleDropOnSplit}
                className="h-full flex flex-col p-4 overflow-hidden bg-neutral-50/50 dark:bg-neutral-900/30"
              >
                <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F23] shadow-lg border border-[#E5E3DC] dark:border-[#2F3136] flex flex-col flex-1 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DC] dark:border-[#2F3136]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-[var(--ochre-accent)] flex items-center justify-center">
                        <Upload className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                          Zweite Notiz im Split öffnen
                        </h4>
                        <span className="text-[10px] text-neutral-400">
                          Notiz aus Vault hierher ziehen oder auswählen
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Search Filter */}
                  <div className="py-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Notizen filtern..."
                        value={liteVaultSearch}
                        onChange={(e) => setLiteVaultSearch(e.target.value)}
                        className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#151618] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                      />
                    </div>
                  </div>

                  {/* Scrollable Note Tree with Collapsible Folders & Plus Button */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {Object.keys(groupedLiteVaultNotes).map((folderKey) => {
                      const folderNotes = groupedLiteVaultNotes[folderKey];
                      const isRoot = folderKey === '/';
                      const isCollapsed = liteVaultCollapsedFolders[folderKey];

                      return (
                        <div key={folderKey} className="space-y-1">
                          {!isRoot && (
                            <div className="flex items-center justify-between p-1.5 px-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                              <button
                                onClick={() =>
                                  setLiteVaultCollapsedFolders((prev) => ({
                                    ...prev,
                                    [folderKey]: !prev[folderKey],
                                  }))
                                }
                                className="flex items-center gap-1.5 flex-1 truncate text-left cursor-pointer"
                              >
                                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-neutral-400" /> : <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />}
                                <Folder className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                                <span className="truncate">{folderKey}</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (onCreateNote) {
                                    onCreateNote(folderKey);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[var(--ochre-accent)] shadow-2xs hover:bg-amber-500/10 transition-all active:scale-95 cursor-pointer"
                                title={`Neue Notiz in '${folderKey}' erstellen`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {(!isCollapsed || isRoot) && (
                            <div className={!isRoot ? 'pl-3 space-y-1' : 'space-y-1'}>
                              {folderNotes.map((note) => (
                                <div
                                  key={note.path}
                                  onClick={() => loadSecondaryNote(note.path, note.isShared, note.sharedFromUser)}
                                  className="flex items-center justify-between p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50 dark:bg-neutral-800/40 hover:border-[var(--ochre-accent)] hover:bg-amber-500/10 cursor-pointer transition-colors"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <FileText className="w-3.5 h-3.5 text-[var(--ochre-accent)] shrink-0" />
                                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                                      {note.title}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-neutral-400">Im Split öffnen</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <LiveEditorPane
                content={secondaryContent}
                onChange={handleSecondaryContentChange}
                onSave={() => {}}
                lastSaved={secondaryLastSaved}
                onToggleTask={onToggleTask}
                onWikilinkClick={onWikilinkClick}
                onTagClick={onTagClick}
                noteTitle={secondaryTitle}
                onRenameNote={(newTitle) => {
                  if (onRenameNote && secondaryNotePath) {
                    onRenameNote(secondaryNotePath, newTitle);
                    setSecondaryTitle(newTitle);
                  }
                }}
                showToolbar={showToolbar}
                onToggleToolbar={() => setShowToolbar(!showToolbar)}
                noteContext={{
                  username,
                  notePath: secondaryNotePath,
                  noteProfile,
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Shared Lite Vault Modal */}
      {renderLiteVaultModal()}
    </main>
  );
};
