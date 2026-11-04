import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TaskItem } from '../../types';
import { api } from '../../services/api';
import { useTranslation } from '../../services/i18n';
import { 
  CheckSquare, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  Hash, 
  FileText, 
  ExternalLink,
  ListTodo,
  Plus,
  Trash2,
  X,
  Filter,
  Folder,
  RotateCcw,
  Check
} from 'lucide-react';

interface TasksDashboardProps {
  username: string;
  onOpenNote: (noteTitle: string) => void;
  onTaskToggled?: () => void;
}

type TaskFilterTab = 'all' | 'overdue' | 'today' | 'week' | 'completed';

interface CustomTaskList {
  id: string;
  name: string;
  icon?: string;
  filterType: 'all' | 'tag' | 'folder' | 'mixed';
  tagFilter?: string;
  folderFilter?: string;
}

export const TasksDashboard: React.FC<TasksDashboardProps> = ({
  username,
  onOpenNote,
  onTaskToggled,
}) => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const statusTabsRef = useRef<HTMLDivElement>(null);

  // Wheel and mouse drag support on status categories bar
  useEffect(() => {
    const el = statusTabsRef.current;
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
      const walk = (x - startX) * 1.4;
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
  }, []);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TaskFilterTab>('all');
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Tag search popover state
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  // Create Custom List Modal state
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListTag, setNewListTag] = useState('');
  const [newListFolder, setNewListFolder] = useState('');

  // Custom task lists persisted in localStorage
  const [customLists, setCustomLists] = useState<CustomTaskList[]>(() => {
    try {
      const saved = localStorage.getItem(`ochre_task_lists_${username}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    // Default initial lists
    return [
      { id: 'einkauf', name: 'Einkauf & Vorrat', icon: '🛒', filterType: 'tag', tagFilter: 'einkauf' },
      { id: 'arbeit', name: 'Arbeit & Dev', icon: '💻', filterType: 'tag', tagFilter: 'arbeit' },
      { id: 'urlaub', name: 'Urlaub & Familie', icon: '🌴', filterType: 'tag', tagFilter: 'urlaub' },
      { id: 'dringend', name: 'Dringend / Prio', icon: '🔥', filterType: 'mixed', tagFilter: 'wichtig' },
    ];
  });

  // Save custom lists
  useEffect(() => {
    localStorage.setItem(`ochre_task_lists_${username}`, JSON.stringify(customLists));
  }, [customLists, username]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api.fetchTasks(username);
      setTasks(data);
    } catch (e) {
      console.error('Failed to load tasks', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [username]);

  const handleToggle = async (task: TaskItem) => {
    const newStatus = !task.completed;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: newStatus } : t))
    );

    await api.toggleTask(
      username,
      task.notePath,
      task.lineIndex,
      newStatus,
      task.isShared,
      task.sharedFrom
    );

    if (onTaskToggled) onTaskToggled();
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // Distinct tags and their counts
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      t.tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return counts;
  }, [tasks]);

  const allTags = useMemo(() => {
    return Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
  }, [tagCounts]);

  const filteredTagsForSearch = useMemo(() => {
    if (!tagSearchQuery.trim()) return allTags;
    return allTags.filter((t) => t.toLowerCase().includes(tagSearchQuery.toLowerCase()));
  }, [allTags, tagSearchQuery]);

  // Compute count for each custom list
  const getListTaskCount = (list: CustomTaskList) => {
    return tasks.filter((t) => {
      if (t.completed) return false;
      if (list.filterType === 'tag' && list.tagFilter) {
        return t.tags.includes(list.tagFilter) || t.noteTitle.toLowerCase().includes(list.tagFilter.toLowerCase());
      }
      if (list.filterType === 'folder' && list.folderFilter) {
        return t.notePath.toLowerCase().includes(list.folderFilter.toLowerCase());
      }
      if (list.filterType === 'mixed') {
        const matchesTag = list.tagFilter ? (t.tags.includes(list.tagFilter) || t.noteTitle.toLowerCase().includes(list.tagFilter.toLowerCase())) : true;
        const matchesFolder = list.folderFilter ? t.notePath.toLowerCase().includes(list.folderFilter.toLowerCase()) : true;
        return matchesTag && matchesFolder;
      }
      return true;
    }).length;
  };

  // Filter tasks for rendering
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // 1. Tab filter
      if (activeTab === 'overdue' && (t.completed || !t.isOverdue)) return false;
      if (activeTab === 'today' && (t.completed || !t.isDueToday)) return false;
      if (activeTab === 'week') {
        if (t.completed || !t.dueDate) return false;
        if (t.dueDate < todayStr || t.dueDate > nextWeekStr) return false;
      }
      if (activeTab === 'completed' && !t.completed) return false;
      if (activeTab === 'all' && t.completed) return false;

      // 2. Custom list filter
      if (selectedListId !== 'all') {
        const custom = customLists.find((l) => l.id === selectedListId);
        if (custom) {
          if (custom.filterType === 'tag' && custom.tagFilter) {
            if (!(t.tags.includes(custom.tagFilter) || t.noteTitle.toLowerCase().includes(custom.tagFilter.toLowerCase()))) return false;
          } else if (custom.filterType === 'folder' && custom.folderFilter) {
            if (!t.notePath.toLowerCase().includes(custom.folderFilter.toLowerCase())) return false;
          } else if (custom.filterType === 'mixed') {
            if (custom.tagFilter && !(t.tags.includes(custom.tagFilter) || t.noteTitle.toLowerCase().includes(custom.tagFilter.toLowerCase()))) return false;
            if (custom.folderFilter && !t.notePath.toLowerCase().includes(custom.folderFilter.toLowerCase())) return false;
          }
        }
      }

      // 3. Search query
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // 4. Tag filter
      if (selectedTag && !t.tags.includes(selectedTag)) return false;

      return true;
    });
  }, [tasks, activeTab, selectedListId, customLists, searchQuery, selectedTag, todayStr, nextWeekStr]);

  const overdueCount = tasks.filter((t) => !t.completed && t.isOverdue).length;
  const todayCount = tasks.filter((t) => !t.completed && t.isDueToday).length;
  const openCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const newList: CustomTaskList = {
      id: `list_${Date.now()}`,
      name: newListName.trim(),
      icon: '📌',
      filterType: newListTag && newListFolder ? 'mixed' : newListFolder ? 'folder' : 'tag',
      tagFilter: newListTag.trim() || undefined,
      folderFilter: newListFolder.trim() || undefined,
    };
    setCustomLists([...customLists, newList]);
    setSelectedListId(newList.id);
    setNewListName('');
    setNewListTag('');
    setNewListFolder('');
    setIsCreateListOpen(false);
  };

  const handleDeleteList = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomLists((prev) => prev.filter((l) => l.id !== id));
    if (selectedListId === id) setSelectedListId('all');
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 md:p-6 bg-[#FBFBFA] dark:bg-[#18191B] select-text">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E3DC] dark:border-[#2F3136]">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-[#C87D20]" />
              <span>Aufgaben & Eigene Listen</span>
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Erstelle eigene Aufgabenlisten nach Tags & Ordnern und springe direkt zur Ursprungsnotiz.
            </p>
          </div>

          <button
            onClick={loadTasks}
            className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-md bg-[#F4F3EF] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[#C87D20] text-neutral-700 dark:text-neutral-300 font-medium transition-colors"
          >
            Aktualisieren
          </button>
        </div>

        {/* 1. EIGENE AUFGABEN-LISTEN (Benutzerdefiniert erstellbar & filterbar) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
              Aufgaben-Listen
            </span>
            <button
              onClick={() => setIsCreateListOpen(true)}
              className="flex items-center gap-1 text-xs text-[#C87D20] hover:text-[#b06c19] font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Neue Liste erstellen</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {/* Alle Listen */}
            <button
              onClick={() => setSelectedListId('all')}
              className={`p-2.5 rounded-lg border text-left transition-all relative ${
                selectedListId === 'all'
                  ? 'border-[#C87D20] bg-amber-50/50 dark:bg-amber-950/20 text-[#C87D20] shadow-xs'
                  : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1A1B1E] text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <ListTodo className="w-4 h-4 text-[#C87D20]" />
                <span className="text-xs font-bold tabular-nums">{openCount}</span>
              </div>
              <span className="text-xs font-semibold block mt-1 truncate">Alle Listen</span>
            </button>

            {/* Custom Lists */}
            {customLists.map((list) => (
              <div
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer relative group ${
                  selectedListId === list.id
                    ? 'border-[#C87D20] bg-amber-50/50 dark:bg-amber-950/20 text-[#C87D20] shadow-xs'
                    : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1A1B1E] text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm">{list.icon || '📌'}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold tabular-nums">{getListTaskCount(list)}</span>
                    <button
                      onClick={(e) => handleDeleteList(list.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-neutral-400 hover:text-red-500 transition-opacity"
                      title="Liste löschen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <span className="text-xs font-semibold block mt-1 truncate">{list.name}</span>
                <span className="text-[10px] text-neutral-400 truncate block">
                  {list.tagFilter ? `#${list.tagFilter}` : ''} {list.folderFilter ? `📁 ${list.folderFilter}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal: Neue Liste erstellen */}
        {isCreateListOpen && (
          <div className="p-4 bg-white dark:bg-[#1E1F23] rounded-xl border border-[#C87D20]/40 shadow-xl space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-[#C87D20]" />
                <span>Eigene Aufgabenliste definieren</span>
              </h3>
              <button onClick={() => setIsCreateListOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Name der Liste</label>
                <input
                  type="text"
                  placeholder="z.B. Projekt OchreNotes, Fitness..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-md bg-[#FBFBFA] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden focus:border-[#C87D20]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Nach Tag filtern (optional)</label>
                <input
                  type="text"
                  placeholder="z.B. dev, sport, privat..."
                  value={newListTag}
                  onChange={(e) => setNewListTag(e.target.value.replace(/^#/, ''))}
                  className="w-full text-xs px-2.5 py-1.5 rounded-md bg-[#FBFBFA] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden focus:border-[#C87D20]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Nach Ordner filtern (optional)</label>
                <input
                  type="text"
                  placeholder="z.B. 01 - Privat, Arbeit..."
                  value={newListFolder}
                  onChange={(e) => setNewListFolder(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-md bg-[#FBFBFA] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden focus:border-[#C87D20]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setIsCreateListOpen(false)}
                className="px-3 py-1 rounded text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-3 py-1 rounded text-xs bg-[#C87D20] text-white font-medium hover:bg-[#b06c19] disabled:opacity-50"
              >
                Liste anlegen
              </button>
            </div>
          </div>
        )}

        {/* 2. Statusfilter-Tabs (Scrollbar & Swipeable with mouse drag & touch) */}
        <div 
          ref={statusTabsRef}
          data-no-swipe="true"
          className="flex items-center gap-1.5 p-1 bg-[#F4F3EF] dark:bg-[#202225] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto no-scrollbar scroll-smooth touch-pan-x cursor-grab active:cursor-grabbing select-none"
        >
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white dark:bg-[#2C2E33] text-[#C87D20] shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
            }`}
          >
            <span>{t.openTasks} ({openCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('overdue')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overdue'
                ? 'bg-white dark:bg-[#2C2E33] text-red-600 dark:text-red-400 shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span>{t.overdue} ({overdueCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('today')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'today'
                ? 'bg-white dark:bg-[#2C2E33] text-[#C87D20] shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
            }`}
          >
            <span>{t.dueToday} ({todayCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('week')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'week'
                ? 'bg-white dark:bg-[#2C2E33] text-[#C87D20] shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{t.thisWeek}</span>
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-white dark:bg-[#2C2E33] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t.completed} ({completedCount})</span>
          </button>
        </div>

        {/* 3. Search & Scalable Searchable Tags Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Aufgaben durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-1.5 rounded-md bg-white dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-hidden focus:border-[#C87D20]"
            />
          </div>

          {/* Searchable Tag Filter Button & Popover */}
          <div className="relative">
            <button
              onClick={() => setIsTagFilterOpen(!isTagFilterOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap ${
                selectedTag
                  ? 'bg-[#C87D20] text-white border-[#C87D20]'
                  : 'bg-white dark:bg-[#161719] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-700 dark:text-neutral-300 hover:border-[#C87D20]'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>{selectedTag ? `#${selectedTag}` : 'Tags filtern'}</span>
              {selectedTag && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTag(null);
                  }}
                  className="p-0.5 rounded-full hover:bg-black/20"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </button>

            {/* Tag Search Popover */}
            {isTagFilterOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 p-2 bg-white dark:bg-[#1E1F23] rounded-xl shadow-xl border border-[#E5E3DC] dark:border-[#2F3136] z-40">
                <div className="relative mb-2">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Tag suchen..."
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    className="w-full text-xs pl-7 pr-2 py-1 rounded bg-[#FBFBFA] dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                    autoFocus
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  <button
                    onClick={() => {
                      setSelectedTag(null);
                      setIsTagFilterOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium"
                  >
                    Alle Tags zurücksetzen
                  </button>

                  {filteredTagsForSearch.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setSelectedTag(selectedTag === tag ? null : tag);
                        setIsTagFilterOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded transition-colors ${
                        selectedTag === tag
                          ? 'bg-[#C87D20] text-white'
                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      <span className="truncate">#{tag}</span>
                      <span className="text-[10px] opacity-75">{tagCounts[tag]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Horizontal Quick Tags Scrollbar - Desktop only to save mobile screen real estate */}
        {allTags.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setSelectedTag(null)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                selectedTag === null ? 'bg-[#C87D20] text-white font-medium' : 'text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              Alle ({allTags.length})
            </button>
            {allTags.slice(0, 15).map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`text-[11px] px-2 py-0.5 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                  selectedTag === tag
                    ? 'bg-[#C87D20] text-white font-medium'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                }`}
              >
                <span>#{tag}</span>
                <span className="text-[9px] opacity-60">({tagCounts[tag]})</span>
              </button>
            ))}
          </div>
        )}

        {/* Task Items List with Prominent "Zur Notiz springen" Button */}
        <div className="space-y-2">
          {loading ? (
            <div className="p-8 text-center text-xs text-neutral-400">Aufgaben werden indexiert...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-8 text-center rounded-lg border border-dashed border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#161719]">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block">
                Keine Aufgaben in dieser Ansicht
              </span>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <SwipeableTaskCard
                key={task.id}
                task={task}
                onToggle={() => handleToggle(task)}
                onOpenNote={() => onOpenNote(task.noteTitle)}
                onSelectTag={(tag) => setSelectedTag(tag)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// SWIPEABLE TASK CARD (Mobile gestures: Slide Right to Complete/Undo, Slide Left to Open)
// -------------------------------------------------------------
interface SwipeableTaskCardProps {
  task: TaskItem;
  onToggle: () => void;
  onOpenNote: () => void;
  onSelectTag: (tag: string) => void;
}

const SwipeableTaskCard: React.FC<SwipeableTaskCardProps> = ({
  task,
  onToggle,
  onOpenNote,
  onSelectTag,
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;

    // Only respond if horizontal motion is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      const clamped = Math.max(-130, Math.min(130, deltaX * 0.85));
      setSwipeOffset(clamped);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (swipeOffset > 60) {
      // Swiped Right: Complete / Undo
      onToggle();
    } else if (swipeOffset < -60) {
      // Swiped Left: Open note
      onOpenNote();
    }

    setSwipeOffset(0);
  };

  // Mouse drag support for easy testing on desktop / mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    touchStartXRef.current = e.clientX;
    touchStartYRef.current = e.clientY;
    setIsSwiping(true);

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (touchStartXRef.current === null) return;
      const deltaX = moveEvt.clientX - touchStartXRef.current;
      const clamped = Math.max(-130, Math.min(130, deltaX * 0.85));
      setSwipeOffset(clamped);
    };

    const onMouseUp = (upEvt: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setIsSwiping(false);

      if (touchStartXRef.current !== null) {
        const finalDeltaX = upEvt.clientX - touchStartXRef.current;
        if (finalDeltaX > 60) {
          onToggle();
        } else if (finalDeltaX < -60) {
          onOpenNote();
        }
      }
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      setSwipeOffset(0);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="relative overflow-hidden rounded-xl select-none touch-pan-y">
      {/* Background Action Reveal Layers */}
      <div className="absolute inset-0 flex items-center justify-between px-4 rounded-xl font-bold text-xs pointer-events-none">
        {/* Right Swipe Preview: Complete / Undo */}
        <div
          className={`flex items-center gap-2 text-white h-full px-4 absolute inset-y-0 left-0 transition-opacity duration-150 ${
            swipeOffset > 0 ? 'opacity-100' : 'opacity-0'
          } ${
            task.completed
              ? 'bg-amber-600/95 dark:bg-amber-600'
              : 'bg-emerald-600 dark:bg-emerald-600'
          }`}
          style={{ width: `${Math.max(0, swipeOffset + 15)}px` }}
        >
          {task.completed ? (
            <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Wiederherstellen (Undo)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
              <Check className="w-4 h-4 shrink-0" />
              <span>Abhaken</span>
            </div>
          )}
        </div>

        {/* Left Swipe Preview: Open Note */}
        <div
          className={`flex items-center justify-end gap-2 text-white h-full px-4 absolute inset-y-0 right-0 bg-[#C87D20] dark:bg-[#D98B26] transition-opacity duration-150 ${
            swipeOffset < 0 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ width: `${Math.max(0, -swipeOffset + 15)}px` }}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
            <span>Notiz öffnen</span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </div>
        </div>
      </div>

      {/* Foreground Task Card with animated touch & mouse slide */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`relative z-10 flex items-start justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-300 dark:hover:border-neutral-700 shadow-2xs group select-none transition-colors ${
          isSwiping ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Left side: Checkbox & Title */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={onToggle}
            className="mt-0.5 w-4.5 h-4.5 rounded border-neutral-300 text-[#C87D20] accent-[#C87D20] cursor-pointer shrink-0"
          />
          <div className="min-w-0 flex-1">
            <span
              className={`text-xs md:text-sm block transition-all ${
                task.completed
                  ? 'line-through text-neutral-400 dark:text-neutral-500'
                  : 'text-neutral-800 dark:text-neutral-200'
              }`}
            >
              {task.title}
            </span>

            {/* Metadata chips */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                <FileText className="w-3 h-3 text-[#C87D20]" />
                <span className="truncate max-w-[140px]">{task.noteTitle}</span>
              </span>

              {task.dueDate && (
                <span
                  className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    task.isOverdue
                      ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 font-semibold'
                      : task.isDueToday
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-semibold'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                  }`}
                >
                  <Calendar className="w-2.5 h-2.5" />
                  <span>{task.dueDate}</span>
                </span>
              )}

              {task.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onSelectTag(tag)}
                  className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/30 text-[#C87D20] hover:bg-amber-100"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right side: Button to jump directly to Note */}
        <button
          onClick={onOpenNote}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-[#F4F3EF] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] text-[#C87D20] font-medium hover:bg-[#C87D20] hover:text-white transition-colors shrink-0 cursor-pointer shadow-2xs active:scale-95"
          title="Zur Ursprungsnotiz springen"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Zur Notiz springen</span>
        </button>
      </div>
    </div>
  );
};
