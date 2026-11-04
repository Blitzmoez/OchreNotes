import React, { useState, useMemo } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  Plus, 
  Search, 
  Users, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Hash, 
  CheckCircle2, 
  Share2,
  X,
  FilePlus,
  FolderPlus,
  Settings
} from 'lucide-react';
import { NoteMetadata } from '../../types';
import { useTranslation } from '../../services/i18n';

interface SidebarProps {
  notes: NoteMetadata[];
  sharedNotes: NoteMetadata[];
  folders?: string[];
  activeNotePath: string | null;
  activeIsShared?: boolean;
  onSelectNote: (path: string, isShared?: boolean, sharedFrom?: string) => void;
  onCreateNote: (folder?: string) => void;
  onCreateFolder?: (folderPath: string) => Promise<boolean | void> | void;
  onDeleteNote: (path: string) => void;
  onDeleteFolder?: (folderPath: string) => Promise<boolean | void> | void;
  onMoveNote?: (oldPath: string, newPath: string) => Promise<void>;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  sharedNotes,
  folders = [],
  activeNotePath,
  activeIsShared,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeleteNote,
  onDeleteFolder,
  onMoveNote,
  isOpen,
  onCloseMobile,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isSharedSectionCollapsed, setIsSharedSectionCollapsed] = useState(false);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);

  // Unified creation overlay (Triggered by "+" on Header, Root, or any Folder)
  const [createMenuTargetFolder, setCreateMenuTargetFolder] = useState<string | null>(null);
  const [isSubfolderMode, setIsSubfolderMode] = useState(false);
  const [subfolderInput, setSubfolderInput] = useState('');

  const renderCreationBox = (targetFolder: string) => {
    if (createMenuTargetFolder !== targetFolder) return null;
    return (
      <div 
        onClick={(e) => e.stopPropagation()}
        className="my-1.5 p-2 rounded-xl bg-amber-50/95 dark:bg-amber-950/60 border border-[#C87D20]/50 shadow-md animate-in fade-in duration-100 space-y-1.5 z-20"
      >
        <div className="flex items-center justify-between pb-1 border-b border-amber-200/60 dark:border-amber-900/40 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
          <span>{targetFolder === '/' ? t.newNote : `Neu in '${targetFolder}'`}:</span>
          <button
            onClick={() => {
              setCreateMenuTargetFolder(null);
              setIsSubfolderMode(false);
            }}
            className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {!isSubfolderMode ? (
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              onClick={() => {
                onCreateNote(targetFolder === '/' ? undefined : targetFolder);
                setCreateMenuTargetFolder(null);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-white dark:bg-[#25272C] border border-[#C87D20] text-[#C87D20] text-xs font-semibold shadow-2xs hover:bg-[#C87D20] hover:text-white transition-all cursor-pointer active:scale-95"
              title={t.newNote}
            >
              <FilePlus className="w-3.5 h-3.5 shrink-0" />
              <span>{t.newNote}</span>
            </button>
            <button
              onClick={() => {
                setIsSubfolderMode(true);
                setSubfolderInput('');
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-white dark:bg-[#25272C] border border-amber-300 dark:border-neutral-700 hover:border-[#C87D20] text-neutral-800 dark:text-neutral-200 text-xs font-semibold shadow-2xs hover:bg-amber-500/10 transition-all cursor-pointer active:scale-95"
              title={t.newFolder}
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#C87D20] shrink-0" />
              <span>{t.newFolder}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 pt-0.5">
            <input
              type="text"
              placeholder={t.folderName}
              value={subfolderInput}
              onChange={(e) => setSubfolderInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && subfolderInput.trim()) {
                  const full = targetFolder === '/'
                    ? subfolderInput.trim()
                    : `${targetFolder}/${subfolderInput.trim()}`;
                  if (onCreateFolder) await onCreateFolder(full);
                  setCreateMenuTargetFolder(null);
                  setIsSubfolderMode(false);
                  setSubfolderInput('');
                } else if (e.key === 'Escape') {
                  setIsSubfolderMode(false);
                }
              }}
              className="flex-1 text-xs px-2 py-1 rounded-lg bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[#C87D20]"
              autoFocus
            />
            <button
              onClick={async () => {
                if (subfolderInput.trim()) {
                  const full = targetFolder === '/'
                    ? subfolderInput.trim()
                    : `${targetFolder}/${subfolderInput.trim()}`;
                  if (onCreateFolder) await onCreateFolder(full);
                  setCreateMenuTargetFolder(null);
                  setIsSubfolderMode(false);
                  setSubfolderInput('');
                }
              }}
              disabled={!subfolderInput.trim()}
              className="text-xs px-2.5 py-1 rounded-lg bg-[#C87D20] text-white hover:bg-[#b06c19] disabled:opacity-40 font-medium cursor-pointer"
            >
              OK
            </button>
            <button
              onClick={() => setIsSubfolderMode(false)}
              className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Drag and drop state
  const [draggedNotePath, setDraggedNotePath] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  // Searchable tag filter popover
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  // Vault Explorer scaling (persisted)
  const [isScaleOpen, setIsScaleOpen] = useState(false);
  const [vaultScale, setVaultScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ochre_vault_scale');
      return saved ? Number(saved) : 100;
    } catch {
      return 100;
    }
  });

  const handleScaleChange = (val: number) => {
    setVaultScale(val);
    try {
      localStorage.setItem('ochre_vault_scale', String(val));
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle folder collapse
  const toggleFolder = (folderName: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet);
  }, [notes]);

  // Filter personal notes
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const matchesSearch = searchQuery === '' || 
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        n.path.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = !selectedTag || n.tags?.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [notes, searchQuery, selectedTag]);

  // Group personal notes by folder (including empty folders from folders prop)
  const groupedPersonalNotes = useMemo(() => {
    const groups: Record<string, NoteMetadata[]> = { '/': [] };
    folders.forEach((f) => {
      const cleanF = f.replace(/^\/+|\/+$/g, '');
      if (cleanF && !groups[cleanF]) groups[cleanF] = [];
    });
    filteredNotes.forEach((note) => {
      const folder = (note.folder || '/').replace(/^\/+|\/+$/g, '') || '/';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(note);
    });
    return groups;
  }, [filteredNotes, folders]);

  // Group shared notes by owner (e.g. "Von Michael", "Von Sarah")
  const groupedSharedNotes = useMemo(() => {
    const groups: Record<string, NoteMetadata[]> = {};
    sharedNotes.forEach((note) => {
      const owner = note.sharedFromDisplayName || note.sharedFromUser || 'Unbekannt';
      if (!groups[owner]) groups[owner] = [];
      groups[owner].push(note);
    });
    return groups;
  }, [sharedNotes]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-xs"
        />
      )}

      <aside className={`
        fixed lg:static top-0 bottom-0 left-0 z-40
        w-72 bg-[#F4F3EF] dark:bg-[#1D1F23] border-r border-[#E5E3DC] dark:border-[#2F3136]
        flex flex-col transition-transform duration-200 ease-in-out select-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header Actions */}
        <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 relative">
          <span className="text-xs font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400">
            {t.vaultExplorer}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setCreateMenuTargetFolder('/');
                setIsSubfolderMode(false);
                setSubfolderInput('');
              }}
              className="w-8 h-8 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[#C87D20] hover:border-[#C87D20] shadow-xs flex items-center justify-center transition-all cursor-pointer"
              title={`${t.newNote} / ${t.newFolder}`}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onCloseMobile}
              className="w-8 h-8 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-900 dark:hover:text-white shadow-xs flex items-center justify-center lg:hidden cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Render Root Creation Box when target is '/' */}
        {renderCreationBox('/')}

        {/* Search Input & Tag Filter */}
        <div className="p-3 pb-1 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder={t.searchNotes}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-7 py-1.5 rounded-md bg-white dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-hidden focus:border-[#C87D20] dark:focus:border-[#E09228]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Searchable Tag Popover Button */}
          <div className="relative">
            <button
              onClick={() => setIsTagFilterOpen(!isTagFilterOpen)}
              className={`p-1.5 rounded-md border text-xs transition-colors ${
                selectedTag
                  ? 'bg-[#C87D20] text-white border-[#C87D20]'
                  : 'bg-white dark:bg-[#161719] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300 hover:border-[#C87D20]'
              }`}
              title="Tags suchen & filtern"
            >
              <Hash className="w-3.5 h-3.5" />
            </button>

            {isTagFilterOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-52 p-2 bg-white dark:bg-[#1E1F23] rounded-xl shadow-xl border border-[#E5E3DC] dark:border-[#2F3136] z-50">
                <input
                  type="text"
                  placeholder="Tag suchen..."
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  className="w-full text-xs px-2 py-1 mb-1.5 rounded bg-[#FBFBFA] dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  <button
                    onClick={() => {
                      setSelectedTag(null);
                      setIsTagFilterOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 font-medium"
                  >
                    Alle Notizen (Filter aus)
                  </button>
                  {allTags
                    .filter((t) => t.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                    .map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setSelectedTag(selectedTag === tag ? null : tag);
                          setIsTagFilterOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1 text-xs rounded truncate transition-colors ${
                          selectedTag === tag
                            ? 'bg-[#C87D20] text-white'
                            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Tree View with physically scaled font, icon dimensions, and touch targets */}
        <div 
          className="flex-1 overflow-y-auto px-2 py-1 space-y-4 transition-all duration-150"
        >
          {/* SECTION 1: Eigene Notizen */}
          <div>
            <div 
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverFolder('/');
              }}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(e) => {
                e.preventDefault();
                const notePath = e.dataTransfer.getData('text/note-path') || e.dataTransfer.getData('text/plain') || draggedNotePath;
                if (notePath && onMoveNote) {
                  const fileName = notePath.split('/').pop() || notePath;
                  if (notePath !== fileName) {
                    onMoveNote(notePath, fileName);
                  }
                }
                setDragOverFolder(null);
                setDraggedNotePath(null);
              }}
              className={`px-2 py-1.5 flex items-center justify-between font-semibold text-neutral-400 uppercase tracking-wider rounded transition-colors ${
                dragOverFolder === '/' ? 'bg-amber-100 dark:bg-amber-950/60 text-[#C87D20]' : ''
              }`}
              style={{ fontSize: `${Math.max(10, Math.round((11 * vaultScale) / 100))}px` }}
            >
              <span>{t.myNotes}</span>
            </div>

            {Object.keys(groupedPersonalNotes).map((folderKey) => {
              const folderNotes = groupedPersonalNotes[folderKey];
              const isRoot = folderKey === '/';
              const isCollapsed = collapsedFolders[folderKey];
              const isFolderDragTarget = dragOverFolder === folderKey;

              const dynamicFontSize = `${(13 * vaultScale) / 100}px`;
              const dynamicIconSize = `${Math.max(13, Math.round((15 * vaultScale) / 100))}px`;
              const dynamicPadY = `${Math.max(4, Math.round((7 * vaultScale) / 100))}px`;
              const dynamicPadX = `${Math.max(6, Math.round((9 * vaultScale) / 100))}px`;

              return (
                <div key={folderKey} className="mb-1">
                  {!isRoot && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverFolder(folderKey);
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setDragOverFolder(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const notePath = e.dataTransfer.getData('text/note-path') || e.dataTransfer.getData('text/plain') || draggedNotePath;
                        if (notePath && onMoveNote) {
                          const fileName = notePath.split('/').pop() || notePath;
                          const newPath = `${folderKey}/${fileName}`;
                          if (notePath !== newPath) {
                            onMoveNote(notePath, newPath);
                          }
                        }
                        setDragOverFolder(null);
                        setDraggedNotePath(null);
                      }}
                      onClick={() => toggleFolder(folderKey)}
                      className={`group/folder flex items-center justify-between font-medium rounded-xl cursor-pointer transition-colors ${
                        isFolderDragTarget
                          ? 'bg-amber-100 dark:bg-amber-950/60 border border-[#C87D20] text-[#C87D20]'
                          : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800'
                      }`}
                      style={{
                        fontSize: dynamicFontSize,
                        paddingTop: dynamicPadY,
                        paddingBottom: dynamicPadY,
                        paddingLeft: dynamicPadX,
                        paddingRight: dynamicPadX,
                      }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isCollapsed ? (
                          <ChevronRight 
                            className="text-neutral-400 shrink-0" 
                            style={{ width: dynamicIconSize, height: dynamicIconSize }} 
                          />
                        ) : (
                          <ChevronDown 
                            className="text-neutral-400 shrink-0" 
                            style={{ width: dynamicIconSize, height: dynamicIconSize }} 
                          />
                        )}
                        <Folder 
                          className="text-[#C87D20] shrink-0" 
                          style={{ width: dynamicIconSize, height: dynamicIconSize }} 
                        />
                        <span className="truncate">{folderKey}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Folder Delete Button (Safety: only if 0 notes inside) */}
                        {folderNotes.length === 0 ? (
                          confirmDeleteFolder === folderKey ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onDeleteFolder) onDeleteFolder(folderKey);
                                setConfirmDeleteFolder(null);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-medium hover:bg-red-700 active:scale-95 cursor-pointer shadow-xs"
                              title="Bestätigen: Leeren Ordner löschen"
                            >
                              Löschen?
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteFolder(folderKey);
                                setTimeout(() => setConfirmDeleteFolder(null), 3500);
                              }}
                              className="w-7 h-7 rounded-full bg-white dark:bg-[#25272C] border border-red-300 dark:border-red-900/50 text-neutral-400 hover:text-red-600 hover:border-red-400 shadow-xs flex items-center justify-center transition-all cursor-pointer active:scale-95"
                              title="Leeren Ordner löschen"
                              aria-label="Ordner löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        ) : (
                          <div
                            className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-600 flex items-center justify-center cursor-not-allowed"
                            title="Ordner enthält noch Notizen (Safety: erst Notizen löschen)"
                          >
                            <Trash2 className="w-3 h-3 opacity-40" />
                          </div>
                        )}

                        {/* Plus button directly behind folder triggering Note/Unterordner creation */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreateMenuTargetFolder(folderKey);
                            setIsSubfolderMode(false);
                            setSubfolderInput('');
                          }}
                          className="w-7.5 h-7.5 rounded-full bg-white dark:bg-[#25272C] border border-[#C87D20]/50 text-[#C87D20] hover:bg-amber-500/10 shadow-xs flex items-center justify-center transition-all cursor-pointer active:scale-95"
                          title={`Neu in '${folderKey}' (Notiz oder Unterordner)`}
                          aria-label={`Neu in ${folderKey}`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <span 
                          className="text-neutral-400 tabular-nums"
                          style={{ fontSize: `${Math.max(9, Math.round((10 * vaultScale) / 100))}px` }}
                        >
                          {folderNotes.length}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Inline creation popover directly under this folder */}
                  {renderCreationBox(folderKey)}

                  {(!isCollapsed || isRoot) && (
                    <div className={!isRoot ? 'pl-4 space-y-0.5' : 'space-y-0.5'}>
                      {folderNotes.length === 0 && !isRoot && (
                        <div className="py-1 px-2.5 text-[11px] text-neutral-400 dark:text-neutral-500 italic flex items-center justify-between">
                          <span>{t.folderEmpty}</span>
                        </div>
                      )}
                      {folderNotes.map((note) => {
                        const isActive = activeNotePath === note.path && !activeIsShared;
                        const isBeingDragged = draggedNotePath === note.path;

                        return (
                          <div
                            key={note.path}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', note.path);
                              e.dataTransfer.setData('text/note-path', note.path);
                              e.dataTransfer.setData('application/json', JSON.stringify({ path: note.path, isShared: false }));
                              e.dataTransfer.effectAllowed = 'all';
                              setDraggedNotePath(note.path);
                            }}
                            onDragEnd={() => {
                              setDraggedNotePath(null);
                              setDragOverFolder(null);
                            }}
                            onClick={() => onSelectNote(note.path, false)}
                            className={`group flex items-center justify-between rounded-xl transition-all cursor-pointer ${
                              isBeingDragged ? 'opacity-40 scale-95 border-dashed border border-[#C87D20]' : ''
                            } ${
                              isActive
                                ? 'bg-[#EAE8E1] dark:bg-[#2A2C31] text-[#C87D20] dark:text-[#E09228] font-medium shadow-2xs'
                                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800'
                            }`}
                            style={{
                              fontSize: dynamicFontSize,
                              paddingTop: dynamicPadY,
                              paddingBottom: dynamicPadY,
                              paddingLeft: dynamicPadX,
                              paddingRight: dynamicPadX,
                            }}
                            title="Ziehen (Drag & Drop), um die Notiz in Split oder Ordner zu ziehen"
                          >
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              <FileText 
                                className="shrink-0 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300" 
                                style={{ width: dynamicIconSize, height: dynamicIconSize }} 
                              />
                              <span className="truncate">{note.title}</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {note.tasksCount > 0 && (
                                <span 
                                  className={`px-1.5 py-0.5 rounded tabular-nums font-mono ${
                                    note.completedTasksCount === note.tasksCount
                                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                                      : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                                  }`}
                                  style={{ fontSize: `${Math.max(9, Math.round((10 * vaultScale) / 100))}px` }}
                                  title={`${note.completedTasksCount} von ${note.tasksCount} Aufgaben erledigt`}
                                >
                                  {note.completedTasksCount}/{note.tasksCount}
                                </span>
                              )}
                              {confirmDeletePath === note.path ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteNote(note.path);
                                    setConfirmDeletePath(null);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-medium hover:bg-red-700"
                                  title="Klick zum endgültigen Löschen"
                                >
                                  Löschen?
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeletePath(note.path);
                                    setTimeout(() => setConfirmDeletePath(null), 3500);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-neutral-400 hover:text-red-600 transition-opacity"
                                  title="Notiz löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredNotes.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-neutral-400">
                Keine Notizen gefunden
              </div>
            )}
          </div>

          {/* SECTION 2: DEDICATED IN-APP SHARED SECTION ("👥 Für mich freigegeben") */}
          <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136]">
            <div
              onClick={() => setIsSharedSectionCollapsed(!isSharedSectionCollapsed)}
              className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-700"
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{t.sharedWithMe}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] tabular-nums text-neutral-400">
                  {sharedNotes.length}
                </span>
                {isSharedSectionCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                )}
              </div>
            </div>

            {!isSharedSectionCollapsed && (
              <div className="mt-1 space-y-2">
                {Object.keys(groupedSharedNotes).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-400 italic">
                    Keine freigegebenen Notizen vorhanden.
                  </div>
                ) : (
                  Object.keys(groupedSharedNotes).map((ownerName) => {
                    const ownerNotes = groupedSharedNotes[ownerName];
                    return (
                      <div key={ownerName} className="pl-2 space-y-0.5">
                        <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 px-2 py-0.5 flex items-center gap-1">
                          <span>Von {ownerName}</span>
                        </div>
                        {ownerNotes.map((note) => {
                          const isActive = activeNotePath === note.path && activeIsShared;
                          const dynamicFontSize = `${(13 * vaultScale) / 100}px`;
                          const dynamicIconSize = `${Math.max(13, Math.round((15 * vaultScale) / 100))}px`;
                          const dynamicPadY = `${Math.max(4, Math.round((7 * vaultScale) / 100))}px`;
                          const dynamicPadX = `${Math.max(6, Math.round((9 * vaultScale) / 100))}px`;

                          return (
                            <div
                              key={note.id}
                              onClick={() => onSelectNote(note.path, true, note.sharedFromUser)}
                              className={`group flex items-center justify-between rounded-xl transition-colors cursor-pointer ${
                                isActive
                                  ? 'bg-[#EAE8E1] dark:bg-[#2A2C31] text-[#C87D20] dark:text-[#E09228] font-medium'
                                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800'
                              }`}
                              style={{
                                fontSize: dynamicFontSize,
                                paddingTop: dynamicPadY,
                                paddingBottom: dynamicPadY,
                                paddingLeft: dynamicPadX,
                                paddingRight: dynamicPadX,
                              }}
                            >
                              <div className="flex items-center gap-1.5 truncate min-w-0">
                                <Share2 
                                  className="shrink-0 text-amber-600 dark:text-amber-400" 
                                  style={{ width: dynamicIconSize, height: dynamicIconSize }} 
                                />
                                <span className="truncate">{note.title}</span>
                              </div>

                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-500 whitespace-nowrap">
                                {note.permission === 'write' ? 'Bearbeitbar' : 'Lesen'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Vault Explorer Scale Slider Popup (full width) */}
        {isScaleOpen && (
          <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800/90 border-t border-[#E5E3DC] dark:border-[#2F3136] flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center justify-between text-[11px] text-neutral-600 dark:text-neutral-300 font-medium">
              <span>Explorer Skalierung</span>
              <span className="font-bold text-[#C87D20]">{vaultScale}%</span>
            </div>
            <input
              type="range"
              min="80"
              max="140"
              step="5"
              value={vaultScale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="w-full accent-[#C87D20] cursor-pointer h-1.5 bg-neutral-300 dark:bg-neutral-700 rounded-lg"
            />
          </div>
        )}

        {/* Footer info & Settings Toggle */}
        <div className="p-2.5 px-3 border-t border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsScaleOpen(!isScaleOpen)}
              className={`p-1.5 rounded-full transition-colors ${
                isScaleOpen
                  ? 'bg-[#C87D20] text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
              title="Vault Explorer Skalierung anpassen"
              aria-label="Einstellungen Skalierung"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <span className="tabular-nums">{notes.length} Notizen</span>
          </div>

          <span className="tabular-nums">
            {notes.reduce((acc, n) => acc + (n.tasksCount || 0), 0)} Aufgaben
          </span>
        </div>
      </aside>
    </>
  );
};
