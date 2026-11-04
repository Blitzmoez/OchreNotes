import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PaneType, NoteMetadata } from '../../types';
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
  onOpenNoteByTitle: (title: string) => void;
  // Multi-note snap / split support
  allNotes: NoteMetadata[];
  activeNotePath: string | null;
  activeNoteTitle: string;
  onSelectPrimaryNote: (path: string, isShared?: boolean, sharedFrom?: string) => void;
  onRenameNote?: (oldPath: string, newTitle: string) => void;
  onCreateNote?: (folder?: string) => void;
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
  onOpenNoteByTitle,
  allNotes,
  activeNotePath,
  activeNoteTitle,
  onSelectPrimaryNote,
  onRenameNote,
  onCreateNote,
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

  // Multi-tab support for mobile (can have >2 temporary active tabs)
  const [mobileTabs, setMobileTabs] = useState<NoteTab[]>([]);
  const [activeMobileTabPath, setActiveMobileTabPath] = useState<string | null>(activeNotePath);

  // Cache of tab contents for fast switching in temporary memory
  const [tabContents, setTabContents] = useState<Record<string, { content: string; title: string; lastSaved?: number }>>({});

  // Synchronize active note into mobileTabs
  useEffect(() => {
    if (activeNotePath && activeNoteTitle) {
      setMobileTabs((prev) => {
        if (prev.some((t) => t.path === activeNotePath)) return prev;
        return [...prev, { path: activeNotePath, title: activeNoteTitle }];
      });
      setActiveMobileTabPath(activeNotePath);
      setTabContents((prev) => ({
        ...prev,
        [activeNotePath]: { content, title: activeNoteTitle, lastSaved },
      }));
    }
  }, [activeNotePath, activeNoteTitle]);

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

  // Lite Vault modal state (used for mobile and desktop empty split)
  const [isLiteVaultOpen, setIsLiteVaultOpen] = useState(false);
  const [liteVaultSearch, setLiteVaultSearch] = useState('');
  const [liteVaultCollapsedFolders, setLiteVaultCollapsedFolders] = useState<Record<string, boolean>>({});

  // Toolbar visibility state (shared / moved to header bar)
  const [showToolbar, setShowToolbar] = useState(true);

  // Load note into secondary split (Desktop) or add tab (Mobile)
  const loadSecondaryNote = async (path: string, isShared = false, sharedFrom = '') => {
    try {
      const data = await api.readNote(username, path, isShared, sharedFrom);
      if (isMobile) {
        setMobileTabs((prev) => {
          if (prev.some((t) => t.path === path)) return prev;
          return [...prev, { path, title: data.title, isShared, sharedFrom }];
        });
        setActiveMobileTabPath(path);
        setTabContents((prev) => ({
          ...prev,
          [path]: { content: data.content, title: data.title, lastSaved: Date.now() },
        }));
        setIsLiteVaultOpen(false);
      } else {
        setSecondaryNotePath(path);
        setSecondaryTitle(data.title);
        setSecondaryContent(data.content);
        setSplitRatio(50);
      }
    } catch (e) {
      console.error('Failed to load note', e);
    }
  };

  const handleSecondaryContentChange = (newText: string) => {
    setSecondaryContent(newText);
    if (secondaryNotePath && secondaryNotePath !== '__empty__') {
      api.saveNote(username, secondaryNotePath, newText, false).then(() => {
        setSecondaryLastSaved(Date.now());
      });
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
      api.saveNote(username, path, newText, false).then(() => {
        setTabContents((prev) => ({
          ...prev,
          [path]: { ...prev[path], lastSaved: Date.now() },
        }));
      });
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

  // Group notes for the Lite Vault modal / split selector
  const groupedLiteVaultNotes = useMemo(() => {
    const groups: Record<string, NoteMetadata[]> = { '/': [] };
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
  }, [allNotes, liteVaultSearch]);

  if (viewMode === 'tasks') {
    return (
      <main className="flex-1 h-full overflow-hidden flex flex-col bg-[#FBFBFA] dark:bg-[#18191B]">
        <TasksDashboard
          username={username}
          onOpenNote={onOpenNoteByTitle}
          onTaskToggled={() => {}}
        />
      </main>
    );
  }

  if (viewMode === 'graph') {
    return (
      <main className="flex-1 h-full overflow-hidden flex flex-col bg-[#FBFBFA] dark:bg-[#18191B]">
        <GraphView
          username={username}
          onSelectNote={onOpenNoteByTitle}
        />
      </main>
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
      <main className="flex-1 h-full overflow-hidden flex flex-col relative select-none">
        {/* Mobile Slideable Tabs Bar (data-no-swipe ensures Vault gesture doesn't hijack tab scrolling) */}
        <div 
          data-no-swipe="true"
          className="h-11 px-2.5 bg-[#F4F3EF] dark:bg-[#1F2125] border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-1.5 shrink-0"
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
                    if (tab.path === activeNotePath) {
                      onSelectPrimaryNote(tab.path, tab.isShared, tab.sharedFrom);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-white dark:bg-[#2A2C31] text-[#C87D20] dark:text-[#E09228] border-[#C87D20] shadow-xs'
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

            {/* Add Tab Button with circular bubble */}
            <button
              onClick={handleOpenSplit}
              className="w-8 h-8 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[#C87D20] hover:border-[#C87D20] shadow-xs flex items-center justify-center shrink-0 cursor-pointer"
              title="Weitere Notiz als Tab hinzufügen"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Werkzeuge Bubble Button mit dynamischem Pfeil */}
          <button
            onClick={() => setShowToolbar(!showToolbar)}
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xs border transition-all shrink-0 cursor-pointer ${
              showToolbar
                ? 'bg-white dark:bg-[#25272C] border-[#C87D20] text-[#C87D20]'
                : 'bg-white dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-800'
            }`}
            title={showToolbar ? 'Werkzeugleiste ausblenden (▲)' : 'Werkzeugleiste einblenden (▼)'}
          >
            {showToolbar ? (
              <ChevronDown className="w-4 h-4 rotate-180 transition-transform" />
            ) : (
              <ChevronDown className="w-4 h-4 transition-transform text-[#C87D20]" />
            )}
          </button>
        </div>

        {/* Mobile Editor Surface */}
        <div className="flex-1 overflow-hidden select-text">
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
          />
        </div>

        {/* Mobile Lite Vault Modal */}
        {isLiteVaultOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#1E1F23] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] w-full max-w-lg h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
              <div className="p-3.5 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <Folder className="w-4 h-4 text-[#C87D20]" />
                    <span>Lite Vault: Notiz wählen</span>
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    Wähle oder erstelle eine Notiz für einen weiteren Tab
                  </span>
                </div>
                <button
                  onClick={() => setIsLiteVaultOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Notizen durchsuchen..."
                    value={liteVaultSearch}
                    onChange={(e) => setLiteVaultSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#151618] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[#C87D20]"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {Object.keys(groupedLiteVaultNotes).map((folderKey) => {
                  const folderNotes = groupedLiteVaultNotes[folderKey];
                  const isRoot = folderKey === '/';
                  const isCollapsed = liteVaultCollapsedFolders[folderKey];

                  return (
                    <div key={folderKey} className="space-y-1">
                      {!isRoot && (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                          <button
                            onClick={() =>
                              setLiteVaultCollapsedFolders((prev) => ({
                                ...prev,
                                [folderKey]: !prev[folderKey],
                              }))
                            }
                            className="flex items-center gap-1.5 flex-1 truncate text-left"
                          >
                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <Folder className="w-3.5 h-3.5 text-[#C87D20]" />
                            <span className="truncate">{folderKey}</span>
                          </button>

                          <button
                            onClick={() => {
                              if (onCreateNote) {
                                onCreateNote(folderKey);
                                setIsLiteVaultOpen(false);
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[#C87D20] shadow-xs"
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
                              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-amber-500/10 cursor-pointer border border-[#E5E3DC]/60 dark:border-[#2F3136]/60 hover:border-amber-500/40 transition-colors"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileText className="w-4 h-4 text-[#C87D20] shrink-0" />
                                <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                                  {note.title}
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-400">Öffnen</span>
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
        )}
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
      className={`flex-1 h-full overflow-hidden flex relative select-none ${isDragging ? 'cursor-col-resize' : ''}`}
    >
      {/* Primary Note Pane */}
      <div
        style={{ width: secondaryNotePath ? `${splitRatio}%` : '100%' }}
        className={`h-full flex flex-col overflow-hidden min-w-[280px] transition-all duration-150 ${
          secondaryNotePath ? 'border-r border-[#E5E3DC] dark:border-[#2F3136]' : ''
        }`}
      >
        {/* Pane Sub-Header */}
        <div className="h-8 px-3 bg-[#F4F3EF] dark:bg-[#1F2125] border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="w-3.5 h-3.5 text-[#C87D20] shrink-0" />
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

          {/* Action: Open Split Pane / Reset 50-50 / Toggle Toolbar */}
          <div className="flex items-center gap-1.5">
            {/* Toolbar Toggle button moved into header bar with circular bubble and arrow */}
            <button
              onClick={() => setShowToolbar(!showToolbar)}
              className={`w-7 h-7 rounded-full flex items-center justify-center border shadow-2xs transition-colors cursor-pointer ${
                showToolbar
                  ? 'bg-white dark:bg-[#25272C] border-[#C87D20] text-[#C87D20]'
                  : 'bg-white dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-800'
              }`}
              title={showToolbar ? 'Werkzeugleiste ausblenden (▲)' : 'Werkzeugleiste einblenden (▼)'}
            >
              {showToolbar ? (
                <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 transition-transform text-[#C87D20]" />
              )}
            </button>

            {secondaryNotePath ? (
              <button
                onClick={() => setSplitRatio(50)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-600 dark:text-neutral-400 hover:border-[#C87D20] transition-colors cursor-pointer shadow-2xs"
                title="Gleichmäßig aufteilen (50 / 50)"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">50/50</span>
              </button>
            ) : (
              <button
                onClick={handleOpenSplit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-700 dark:text-neutral-300 hover:border-[#C87D20] transition-colors cursor-pointer shadow-2xs"
                title="Geteilte Notiz öffnen (+ Split Pane)"
              >
                <Plus className="w-3.5 h-3.5 text-[#C87D20]" />
                <span className="hidden sm:inline">Split</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Editor Surface */}
        <div className="flex-1 overflow-hidden select-text">
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
          />
        </div>
      </div>

      {/* Drag Drop Overlay Hint if dragging a note */}
      {isDragOverSplit && !secondaryNotePath && (
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[#C87D20]/10 border-2 border-dashed border-[#C87D20] flex items-center justify-center pointer-events-none z-30 animate-in fade-in duration-100">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F23] shadow-xl flex items-center gap-2 text-xs font-semibold text-[#C87D20]">
            <Upload className="w-5 h-5" />
            <span>Hier ablegen für geteilte Ansicht (Split)</span>
          </div>
        </div>
      )}

      {/* Resizer Divider between Split Panes */}
      {secondaryNotePath && (
        <div
          onMouseDown={startDragging}
          className="w-1.5 hover:w-2 bg-[#E5E3DC] dark:bg-[#2F3136] hover:bg-[#C87D20] dark:hover:bg-[#E09228] transition-all cursor-col-resize z-10 flex items-center justify-center shrink-0 group select-none"
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
          className="h-full flex flex-col overflow-hidden min-w-[280px] relative"
        >
          {/* Secondary Header with Note Selector and Close [X] */}
          <div className="h-8 px-3 bg-[#F4F3EF] dark:bg-[#1F2125] border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setIsLiteVaultOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[#C87D20] text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-2xs transition-all cursor-pointer max-w-[220px] active:scale-95"
                title="Notiz über Lite Vault auswählen"
              >
                <FileText className="w-3.5 h-3.5 text-[#C87D20] shrink-0" />
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
            <div className="absolute inset-0 bg-[#C87D20]/15 border-2 border-dashed border-[#C87D20] flex items-center justify-center pointer-events-none z-50 backdrop-blur-2xs animate-in fade-in duration-100">
              <div className="p-3.5 px-5 rounded-2xl bg-white dark:bg-[#1E1F23] shadow-2xl border border-[#C87D20] flex items-center gap-2.5 text-xs font-bold text-[#C87D20]">
                <Upload className="w-5 h-5 animate-bounce" />
                <span>Hier ablegen für geteilte Ansicht (Split)</span>
              </div>
            </div>
          )}

          {/* Secondary Surface: Editor or Clean Lite Vault Card Menu */}
          <div className="flex-1 overflow-hidden select-text">
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
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-[#C87D20] flex items-center justify-center">
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
                        className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#151618] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[#C87D20]"
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
                                <Folder className="w-3.5 h-3.5 text-[#C87D20]" />
                                <span className="truncate">{folderKey}</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (onCreateNote) {
                                    onCreateNote(folderKey);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[#C87D20] shadow-2xs hover:bg-amber-500/10 transition-all active:scale-95 cursor-pointer"
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
                                  className="flex items-center justify-between p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50 dark:bg-neutral-800/40 hover:border-[#C87D20] hover:bg-amber-500/10 cursor-pointer transition-colors"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <FileText className="w-3.5 h-3.5 text-[#C87D20] shrink-0" />
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
              />
            )}
          </div>
        </div>
      )}

      {/* Desktop Lite Vault Modal (Triggered by subheader button or +) */}
      {isLiteVaultOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] w-full max-w-lg h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-3.5 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <Folder className="w-4 h-4 text-[#C87D20]" />
                  <span>Lite Vault: Notiz wählen</span>
                </h3>
                <span className="text-[11px] text-neutral-400">
                  Wähle oder erstelle eine Notiz für die geteilte Ansicht (Split)
                </span>
              </div>
              <button
                onClick={() => setIsLiteVaultOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Notizen durchsuchen..."
                  value={liteVaultSearch}
                  onChange={(e) => setLiteVaultSearch(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#151618] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[#C87D20]"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {Object.keys(groupedLiteVaultNotes).map((folderKey) => {
                const folderNotes = groupedLiteVaultNotes[folderKey];
                const isRoot = folderKey === '/';
                const isCollapsed = liteVaultCollapsedFolders[folderKey];

                return (
                  <div key={folderKey} className="space-y-1">
                    {!isRoot && (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        <button
                          onClick={() =>
                            setLiteVaultCollapsedFolders((prev) => ({
                              ...prev,
                              [folderKey]: !prev[folderKey],
                            }))
                          }
                          className="flex items-center gap-1.5 flex-1 truncate text-left cursor-pointer"
                        >
                          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <Folder className="w-3.5 h-3.5 text-[#C87D20]" />
                          <span className="truncate">{folderKey}</span>
                        </button>

                        <button
                          onClick={() => {
                            if (onCreateNote) {
                              onCreateNote(folderKey);
                              setIsLiteVaultOpen(false);
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[#C87D20] shadow-xs cursor-pointer active:scale-95"
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
                            onClick={() => {
                              loadSecondaryNote(note.path, note.isShared, note.sharedFromUser);
                              setIsLiteVaultOpen(false);
                            }}
                            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-amber-500/10 cursor-pointer border border-[#E5E3DC]/60 dark:border-[#2F3136]/60 hover:border-amber-500/40 transition-colors"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-[#C87D20] shrink-0" />
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
      )}
    </main>
  );
};
