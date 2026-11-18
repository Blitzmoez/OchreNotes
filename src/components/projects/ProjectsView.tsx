import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  NoteMetadata,
  WikiArticle,
  ProjectItem,
  ProjectTask,
  ProjectTaskStatus,
  ProjectVisibility,
  ProjectStatus,
  ProjectColumnConfig,
  NoteProfileId,
} from '../../types';
import { api } from '../../services/api';
import { DEFAULT_PROJECT_COLUMNS } from '../../services/profileDefaults';
import { printProjectA4 } from '../../services/printService';
import {
  FolderKanban,
  Plus,
  Columns3,
  GanttChartSquare,
  List,
  Printer,
  Settings,
  Trash2,
  Edit3,
  Users,
  Lock,
  FileText,
  BookMarked,
  Link2,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Flag,
  UserCheck,
  Check,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react';

interface ProjectsViewProps {
  currentUser: User;
  allUsers: User[];
  notes: NoteMetadata[];
  wikiArticles: WikiArticle[];
  projects: ProjectItem[];
  onProjectsChange: (next: ProjectItem[]) => void;
  initialProjectId?: string | null;
  accentColor?: string;
  mobileBarPosition?: 'top' | 'bottom';
  enableSecondProfile?: boolean;
  activeProfileId?: NoteProfileId;
  profileNames?: Record<NoteProfileId, string>;
  onSwitchProfile?: (id: NoteProfileId) => void;
  onNavigateToNote: (path: string) => void;
  onNavigateToWiki: (slug: string) => void;
}

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planung',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
};

const PRIORITY_META: Record<ProjectTask['priority'], { label: string; cls: string }> = {
  high: { label: 'Hoch', cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  medium: { label: 'Mittel', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  low: { label: 'Niedrig', cls: 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400' },
};

const PROJECT_COLORS = ['#B45309', '#C87D20', '#0F766E', '#1D4ED8', '#7C3AED', '#BE123C', '#6B7280', '#10B981'];

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const getTaskAssignees = (task: ProjectTask): string[] => {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.filter((s) => s && s.trim() && s !== 'Nicht zugewiesen');
  }
  if (task.assignee && task.assignee.trim() && task.assignee !== 'Nicht zugewiesen') {
    return [task.assignee.trim()];
  }
  return [];
};

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  currentUser,
  allUsers,
  notes,
  wikiArticles,
  projects,
  onProjectsChange,
  initialProjectId,
  accentColor = '#B45309',
  mobileBarPosition = 'top',
  enableSecondProfile = false,
  activeProfileId = 'profile1',
  profileNames,
  onSwitchProfile,
  onNavigateToNote,
  onNavigateToWiki,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId || projects[0]?.id || null
  );
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'timeline'>('kanban');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'private' | 'shared'>('all');

  // Mobile Left-Edge Pixel-Launcher 1:1 Swipe Project Drawer
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [drawerDragX, setDrawerDragX] = useState<number | null>(null);
  const drawerSwipeRef = useRef<{
    startX: number;
    startY: number;
    wasOpen: boolean;
    locked: 'none' | 'x' | 'y';
    currentDragX: number | null;
  } | null>(null);

  // Mobile thumb nav
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);

  // Drag & Drop task on desktop
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Project Create/Edit Modal
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [projTitle, setProjTitle] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projStatus, setProjStatus] = useState<ProjectStatus>('active');
  const [projVisibility, setProjVisibility] = useState<ProjectVisibility>('private');
  const [projSharedWith, setProjSharedWith] = useState<string[]>([]);
  const [projColor, setProjColor] = useState(accentColor);
  const [projStartDate, setProjStartDate] = useState(todayIso());
  const [projDueDate, setProjDueDate] = useState(addDaysIso(todayIso(), 14));

  // Task Create/Edit Modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskStatus, setTaskStatus] = useState<ProjectTaskStatus>('todo');
  const [taskPriority, setTaskPriority] = useState<ProjectTask['priority']>('medium');
  const [taskAssignees, setTaskAssignees] = useState<string[]>([currentUser.displayName]);
  const [customAssigneeInput, setCustomAssigneeInput] = useState('');
  const [taskStartDate, setTaskStartDate] = useState(todayIso());
  const [taskDueDate, setTaskDueDate] = useState(addDaysIso(todayIso(), 5));

  // Column Configuration Modal
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<ProjectColumnConfig[]>(DEFAULT_PROJECT_COLUMNS);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#2563EB');

  // Link Notes / Wiki Modal
  const [linksModalOpen, setLinksModalOpen] = useState(false);

  const profileFilteredProjects = useMemo(() => {
    if (!enableSecondProfile) return projects;
    return projects.filter((p) => (p.profile || 'profile1') === activeProfileId);
  }, [projects, enableSecondProfile, activeProfileId]);

  useEffect(() => {
    if (initialProjectId && profileFilteredProjects.some((p) => p.id === initialProjectId)) {
      setSelectedProjectId(initialProjectId);
    } else if (!selectedProjectId || !profileFilteredProjects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(profileFilteredProjects[0]?.id || null);
    }
  }, [initialProjectId, profileFilteredProjects, selectedProjectId]);

  const filteredProjects = useMemo(() => {
    if (scopeFilter === 'all') return profileFilteredProjects;
    return profileFilteredProjects.filter((p) => p.visibility === scopeFilter);
  }, [profileFilteredProjects, scopeFilter]);

  const activeProject = useMemo(
    () => profileFilteredProjects.find((p) => p.id === selectedProjectId) || filteredProjects[0] || null,
    [profileFilteredProjects, filteredProjects, selectedProjectId]
  );

  const projectColumns: ProjectColumnConfig[] = useMemo(
    () => (activeProject?.columns && activeProject.columns.length > 0 ? activeProject.columns : DEFAULT_PROJECT_COLUMNS),
    [activeProject]
  );

  // Pixel-launcher 1:1 edge swipe listener (< 1024px)
  useEffect(() => {
    const DRAWER_WIDTH = 288;
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-no-swipe]') ||
        target?.closest('button') ||
        target?.closest('input') ||
        target?.closest('select') ||
        target?.closest('textarea')
      ) {
        return;
      }
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (!isMobileDrawerOpen && x > Math.min(72, window.innerWidth * 0.25)) return;
      drawerSwipeRef.current = {
        startX: x,
        startY: y,
        wasOpen: isMobileDrawerOpen,
        locked: 'none',
        currentDragX: null,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const ref = drawerSwipeRef.current;
      if (!ref) return;
      const dx = e.touches[0].clientX - ref.startX;
      const dy = e.touches[0].clientY - ref.startY;
      if (ref.locked === 'none') {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 0.85) {
          if ((!ref.wasOpen && dx > 0) || (ref.wasOpen && dx < 0)) {
            ref.locked = 'x';
          } else {
            drawerSwipeRef.current = null;
            return;
          }
        } else {
          drawerSwipeRef.current = null;
          return;
        }
      }
      if (ref.locked === 'x') {
        const base = ref.wasOpen ? 0 : -DRAWER_WIDTH;
        const clamped = Math.max(-DRAWER_WIDTH, Math.min(0, base + dx));
        ref.currentDragX = clamped;
        setDrawerDragX(clamped);
      }
    };

    const onTouchEnd = () => {
      const ref = drawerSwipeRef.current;
      if (ref?.locked === 'x' && ref.currentDragX !== null) {
        if (!ref.wasOpen) {
          setIsMobileDrawerOpen(ref.currentDragX > -DRAWER_WIDTH + 85);
        } else {
          setIsMobileDrawerOpen(ref.currentDragX >= -85);
        }
      }
      drawerSwipeRef.current = null;
      setDrawerDragX(null);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isMobileDrawerOpen]);

  const persistProject = async (updated: ProjectItem) => {
    const saved = await api.saveProject(currentUser.username, updated);
    const exists = projects.some((p) => p.id === saved.id);
    const next = exists
      ? projects.map((p) => (p.id === saved.id ? saved : p))
      : [saved, ...projects];
    onProjectsChange(next);
    setSelectedProjectId(saved.id);
  };

  const openCreateProjectModal = () => {
    setEditingProject(null);
    setProjTitle('');
    setProjDesc('');
    setProjStatus('active');
    setProjVisibility('private');
    setProjSharedWith([]);
    setProjColor(accentColor);
    setProjStartDate(todayIso());
    setProjDueDate(addDaysIso(todayIso(), 14));
    setProjectModalOpen(true);
  };

  const openEditProjectModal = (proj: ProjectItem) => {
    setEditingProject(proj);
    setProjTitle(proj.title);
    setProjDesc(proj.description || '');
    setProjStatus(proj.status);
    setProjVisibility(proj.visibility);
    setProjSharedWith(proj.sharedWithUsers || []);
    setProjColor(proj.color || accentColor);
    setProjStartDate(proj.startDate || todayIso());
    setProjDueDate(proj.dueDate || addDaysIso(todayIso(), 14));
    setProjectModalOpen(true);
  };

  const handleSaveProjectForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim()) return;
    const now = Date.now();
    const payload: ProjectItem = editingProject
      ? {
          ...editingProject,
          title: projTitle.trim(),
          description: projDesc.trim(),
          status: projStatus,
          visibility: projVisibility,
          sharedWithUsers: projVisibility === 'shared' ? projSharedWith : [],
          color: projColor,
          startDate: projStartDate,
          dueDate: projDueDate,
          updatedAt: now,
        }
      : {
          id: `proj_${now}_${Math.random().toString(36).slice(2, 6)}`,
          title: projTitle.trim(),
          description: projDesc.trim(),
          ownerUsername: currentUser.username,
          ownerDisplayName: currentUser.displayName,
          profile: activeProfileId || 'profile1',
          visibility: projVisibility,
          sharedWithUsers: projVisibility === 'shared' ? projSharedWith : [],
          status: projStatus,
          color: projColor,
          startDate: projStartDate,
          dueDate: projDueDate,
          columns: DEFAULT_PROJECT_COLUMNS.map((c) => ({ ...c })),
          linkedNotePaths: [],
          linkedWikiSlugs: [],
          tasks: [],
          createdAt: now,
          updatedAt: now,
        };
    await persistProject(payload);
    setProjectModalOpen(false);
    setIsMobileDrawerOpen(false);
  };

  const handleDeleteProject = async (proj: ProjectItem) => {
    const ok = await api.deleteProject(currentUser.username, proj.id);
    if (ok) {
      const next = projects.filter((p) => p.id !== proj.id);
      onProjectsChange(next);
      setSelectedProjectId(next[0]?.id || null);
    }
  };

  const openColumnsModal = () => {
    setDraftColumns(projectColumns.map((c) => ({ ...c })));
    setNewColumnLabel('');
    setNewColumnColor('#2563EB');
    setColumnsModalOpen(true);
  };

  const handleSaveColumns = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || draftColumns.length === 0) return;
    const validCols = draftColumns
      .map((c) => ({ ...c, label: c.label.trim() || c.id }))
      .filter((c) => c.label.trim().length > 0);
    if (validCols.length === 0) return;
    const validIds = new Set(validCols.map((c) => c.id));
    const fallbackStatus = validCols[0].id;
    const remappedTasks = (activeProject.tasks || []).map((t) =>
      validIds.has(t.status) ? t : { ...t, status: fallbackStatus }
    );
    await persistProject({
      ...activeProject,
      columns: validCols,
      tasks: remappedTasks,
      updatedAt: Date.now(),
    });
    setColumnsModalOpen(false);
  };

  const openCreateTaskModal = (defaultStatus?: ProjectTaskStatus) => {
    setEditingTask(null);
    setTaskTitle('');
    setTaskDesc('');
    setTaskStatus(defaultStatus || projectColumns[0]?.id || 'todo');
    setTaskPriority('medium');
    setTaskAssignees([currentUser.displayName]);
    setCustomAssigneeInput('');
    setTaskStartDate(todayIso());
    setTaskDueDate(addDaysIso(todayIso(), 5));
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: ProjectTask) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDesc(task.description || '');
    setTaskStatus(task.status);
    setTaskPriority(task.priority);
    setTaskAssignees(getTaskAssignees(task));
    setCustomAssigneeInput('');
    setTaskStartDate(task.startDate || todayIso());
    setTaskDueDate(task.dueDate || addDaysIso(todayIso(), 5));
    setTaskModalOpen(true);
  };

  const handleSaveTaskForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !taskTitle.trim()) return;
    const cleanDue = taskDueDate < taskStartDate ? taskStartDate : taskDueDate;
    const combinedAssignees = Array.from(
      new Set(
        [...taskAssignees, customAssigneeInput]
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s !== 'Nicht zugewiesen')
      )
    );
    const taskPayload: ProjectTask = {
      id: editingTask?.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: taskTitle.trim(),
      description: taskDesc.trim() || undefined,
      status: taskStatus,
      priority: taskPriority,
      assignee: combinedAssignees[0] || 'Nicht zugewiesen',
      assignees: combinedAssignees,
      startDate: taskStartDate,
      dueDate: cleanDue,
      createdAt: editingTask?.createdAt || Date.now(),
    };

    const nextTasks = editingTask
      ? activeProject.tasks.map((t) => (t.id === taskPayload.id ? taskPayload : t))
      : [...activeProject.tasks, taskPayload];

    await persistProject({
      ...activeProject,
      tasks: nextTasks,
      updatedAt: Date.now(),
    });
    setTaskModalOpen(false);
  };

  const handleMoveTaskStatus = async (taskId: string, nextStatus: ProjectTaskStatus) => {
    if (!activeProject) return;
    const nextTasks = activeProject.tasks.map((t) =>
      t.id === taskId ? { ...t, status: nextStatus } : t
    );
    await persistProject({
      ...activeProject,
      tasks: nextTasks,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeProject) return;
    await persistProject({
      ...activeProject,
      tasks: activeProject.tasks.filter((t) => t.id !== taskId),
      updatedAt: Date.now(),
    });
  };

  const handleToggleLinkedNote = async (notePath: string) => {
    if (!activeProject) return;
    const current = activeProject.linkedNotePaths || [];
    const exists = current.includes(notePath);
    const next = exists ? current.filter((p) => p !== notePath) : [...current, notePath];
    await persistProject({
      ...activeProject,
      linkedNotePaths: next,
      updatedAt: Date.now(),
    });
  };

  const handleToggleLinkedWiki = async (slug: string) => {
    if (!activeProject) return;
    const current = activeProject.linkedWikiSlugs || [];
    const exists = current.includes(slug);
    const next = exists ? current.filter((s) => s !== slug) : [...current, slug];
    await persistProject({
      ...activeProject,
      linkedWikiSlugs: next,
      updatedAt: Date.now(),
    });
  };

  // Timeline computation
  const timelineData = useMemo(() => {
    if (!activeProject) return null;
    const allDates: string[] = [];
    if (activeProject.startDate) allDates.push(activeProject.startDate);
    if (activeProject.dueDate) allDates.push(activeProject.dueDate);
    activeProject.tasks.forEach((t) => {
      if (t.startDate) allDates.push(t.startDate);
      if (t.dueDate) allDates.push(t.dueDate);
    });
    const today = todayIso();
    allDates.push(today);
    allDates.sort();

    const minDate = addDaysIso(allDates[0], -1);
    const rawMax = allDates[allDates.length - 1];
    const minMs = new Date(`${minDate}T00:00:00`).getTime();
    const maxMs = Math.max(
      new Date(`${rawMax}T00:00:00`).getTime(),
      minMs + 13 * 86400000
    );
    const totalDays = Math.min(90, Math.max(14, Math.ceil((maxMs - minMs) / 86400000) + 2));

    const days = Array.from({ length: totalDays }, (_, i) => {
      const iso = addDaysIso(minDate, i);
      const d = new Date(`${iso}T00:00:00`);
      return {
        iso,
        label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        isToday: iso === today,
      };
    });

    const todayIdx = days.findIndex((d) => d.isToday);
    return { minDate, totalDays, days, todayIdx };
  }, [activeProject]);

  const floatingNavBottomClass =
    mobileBarPosition === 'bottom' ? 'bottom-[4.75rem] lg:bottom-5' : 'bottom-5';

  const projectAccent = activeProject?.color || accentColor;

  const projectListPanel = (
    <div className="flex flex-col h-full bg-[#FAF9F5] dark:bg-[#1B1D21]">
      <div className="p-3.5 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            style={{ backgroundColor: accentColor }}
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0"
          >
            <FolderKanban className="w-4 h-4" />
          </div>
          <span className="text-xs font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
            Projekte ({profileFilteredProjects.length})
          </span>
        </div>
        <button
          type="button"
          onClick={openCreateProjectModal}
          style={{ backgroundColor: accentColor }}
          className="px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Neu</span>
        </button>
      </div>

      {enableSecondProfile && profileNames && onSwitchProfile && (
        <div className="px-2 pt-2 grid grid-cols-2 gap-1">
          {(['profile1', 'profile2'] as NoteProfileId[]).map((pid) => {
            const active = activeProfileId === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => onSwitchProfile(pid)}
                style={active ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                className={`py-1 px-2 rounded-lg text-[11px] font-bold truncate cursor-pointer transition-colors ${
                  active
                    ? 'shadow-2xs'
                    : 'bg-white dark:bg-[#22242A] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {profileNames[pid] || (pid === 'profile1' ? 'Profil 1' : 'Profil 2')}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-2 grid grid-cols-3 gap-1 border-b border-[#E5E3DC] dark:border-[#2F3136]">
        {(
          [
            { id: 'all', label: 'Alle' },
            { id: 'private', label: 'Privat' },
            { id: 'shared', label: 'Geteilt' },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setScopeFilter(f.id)}
            className={`py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
              scopeFilter === f.id
                ? 'bg-white dark:bg-[#2A2D34] text-neutral-900 dark:text-white shadow-2xs font-bold'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredProjects.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            Keine Projekte in dieser Ansicht.
          </div>
        ) : (
          filteredProjects.map((proj) => {
            const isSelected = activeProject?.id === proj.id;
            const doneCount = (proj.tasks || []).filter((t) => t.status === 'done').length;
            const totalCount = (proj.tasks || []).length;
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => {
                  setSelectedProjectId(proj.id);
                  setIsMobileDrawerOpen(false);
                }}
                style={
                  isSelected
                    ? {
                        borderColor: proj.color || accentColor,
                        backgroundColor: `${proj.color || accentColor}14`,
                      }
                    : undefined
                }
                className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer space-y-1 ${
                  isSelected
                    ? 'border-2 shadow-2xs'
                    : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#22242A] hover:border-neutral-400'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    {proj.title}
                  </span>
                  {proj.visibility === 'shared' ? (
                    <Users className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-neutral-500">
                  <span>{PROJECT_STATUS_LABELS[proj.status]}</span>
                  <span className="tabular-nums">
                    {doneCount}/{totalCount} Aufgaben
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{ '--project-accent': projectAccent } as React.CSSProperties}
      className="flex-1 flex h-full overflow-hidden relative bg-[#F8F7F4] dark:bg-[#16171A]"
    >
      {/* Desktop Left Project Vault */}
      <aside className="hidden lg:flex w-72 border-r border-[#E5E3DC] dark:border-[#2F3136] shrink-0 flex-col">
        {projectListPanel}
      </aside>

      {/* Mobile Left-Edge Pull Tab */}
      <button
        type="button"
        onClick={() => setIsMobileDrawerOpen((v) => !v)}
        style={{
          backgroundColor: projectAccent,
          ...(drawerDragX !== null
            ? { left: `${Math.max(0, 288 + drawerDragX)}px`, transition: 'none' }
            : {}),
        }}
        className={`lg:hidden fixed top-1/2 -translate-y-1/2 z-40 h-14 flex items-center justify-center text-white shadow-lg cursor-pointer ${
          drawerDragX !== null ? 'transition-none' : 'transition-all duration-200'
        } ${
          drawerDragX !== null
            ? 'w-6 rounded-r-xl'
            : isMobileDrawerOpen
            ? 'left-72 w-7 rounded-r-xl'
            : 'left-0 w-5 rounded-r-xl opacity-90'
        }`}
        aria-label="Projekt-Vault umschalten"
      >
        {isMobileDrawerOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Mobile Swipeable Project Vault Drawer */}
      {(isMobileDrawerOpen || drawerDragX !== null) && (
        <div
          onClick={() => setIsMobileDrawerOpen(false)}
          className="lg:hidden fixed inset-0 z-50 bg-black/35 backdrop-blur-2xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform:
                drawerDragX !== null
                  ? `translateX(${drawerDragX}px)`
                  : isMobileDrawerOpen
                  ? 'translateX(0)'
                  : 'translateX(-100%)',
              transition: drawerDragX !== null ? 'none' : 'transform 220ms ease-out',
            }}
            className="w-72 h-full border-r border-[#E5E3DC] dark:border-[#2F3136] shadow-2xl"
          >
            {projectListPanel}
          </div>
        </div>
      )}

      {/* Right Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeProject ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full p-7 rounded-3xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-dashed border-[#D6D3C9] dark:border-[#32353D] text-center space-y-3">
              <div
                style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
              >
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                Kein Projekt ausgewählt
              </h3>
              <p className="text-xs text-neutral-500">
                Erstelle ein privates oder gemeinsames Projekt mit Kanban-Board, Zeitachse und direkten Verknüpfungen zu deinen Notizen &amp; Wiki-Seiten.
              </p>
              <button
                type="button"
                onClick={openCreateProjectModal}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95"
              >
                Erstes Projekt erstellen
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Active Project Header */}
            <div className="px-4 sm:px-6 py-3 bg-[#FFFDF9] dark:bg-[#1B1D21] border-b border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      style={{ backgroundColor: projectAccent }}
                      className="w-3 h-3 rounded-full shrink-0"
                    />
                    <h2 className="text-sm sm:text-base font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                      {activeProject.title}
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold">
                      {PROJECT_STATUS_LABELS[activeProject.status]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#25272D] text-neutral-600 dark:text-neutral-300 font-semibold">
                      {activeProject.visibility === 'shared' ? (
                        <>
                          <Users className="w-3 h-3" /> Geteilt
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" /> Privat
                        </>
                      )}
                    </span>
                  </div>
                  {activeProject.description && (
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {activeProject.description}
                    </p>
                  )}
                </div>

                {/* Desktop View Switch + Project Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="hidden lg:flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#23252A] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] mr-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('kanban')}
                      style={viewMode === 'kanban' ? { color: projectAccent } : undefined}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        viewMode === 'kanban'
                          ? 'bg-white dark:bg-[#2C2F36] shadow-xs font-bold'
                          : 'text-neutral-500'
                      }`}
                    >
                      <Columns3 className="w-3.5 h-3.5" />
                      <span>Kanban</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      style={viewMode === 'list' ? { color: projectAccent } : undefined}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        viewMode === 'list'
                          ? 'bg-white dark:bg-[#2C2F36] shadow-xs font-bold'
                          : 'text-neutral-500'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Liste</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('timeline')}
                      style={viewMode === 'timeline' ? { color: projectAccent } : undefined}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        viewMode === 'timeline'
                          ? 'bg-white dark:bg-[#2C2F36] shadow-xs font-bold'
                          : 'text-neutral-500'
                      }`}
                    >
                      <GanttChartSquare className="w-3.5 h-3.5" />
                      <span>Timeline</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={openColumnsModal}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 cursor-pointer"
                    title="Kanban-Spalten / Status anpassen"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Spalten</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => printProjectA4(activeProject, projectAccent)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 cursor-pointer"
                    title="Als A4 PDF drucken"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Als A4 PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditProjectModal(activeProject)}
                    className="p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 cursor-pointer"
                    title="Projekteinstellungen"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  {(activeProject.ownerUsername === currentUser.username ||
                    currentUser.role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(activeProject)}
                      className="p-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 cursor-pointer"
                      title="Projekt löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openCreateTaskModal()}
                    style={{ backgroundColor: projectAccent }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Aufgabe</span>
                  </button>
                </div>
              </div>

              {/* Bidirectional Document Links Bar */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => setLinksModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[#D6D3C9] dark:border-[#3A3D47] text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 hover:border-neutral-400 cursor-pointer"
                >
                  <Link2 className="w-3 h-3" />
                  <span>Notiz / Wiki verknüpfen</span>
                </button>

                {(activeProject.linkedNotePaths || []).map((notePath) => (
                  <button
                    key={`note:${notePath}`}
                    type="button"
                    onClick={() => onNavigateToNote(notePath)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] font-semibold hover:bg-amber-500/20 cursor-pointer"
                  >
                    <FileText className="w-3 h-3" />
                    <span className="max-w-[160px] truncate">{notePath.replace(/\.md$/i, '')}</span>
                  </button>
                ))}

                {(activeProject.linkedWikiSlugs || []).map((slug) => {
                  const art = wikiArticles.find((a) => a.slug === slug);
                  return (
                    <button
                      key={`wiki:${slug}`}
                      type="button"
                      onClick={() => onNavigateToWiki(slug)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-800 dark:text-teal-300 text-[11px] font-semibold hover:bg-teal-500/20 cursor-pointer"
                    >
                      <BookMarked className="w-3 h-3" />
                      <span className="max-w-[160px] truncate">{art?.title || slug}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Area: Kanban, List or Gantt Timeline */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 pb-24 lg:pb-8">
              {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5 items-start">
                  {projectColumns.map((col, colIdx) => {
                    const colColor = col.color || projectAccent;
                    const colTasks = (activeProject.tasks || []).filter(
                      (t) =>
                        t.status === col.id ||
                        (colIdx === 0 && !projectColumns.some((c) => c.id === t.status))
                    );
                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedTaskId) {
                            handleMoveTaskStatus(draggedTaskId, col.id);
                            setDraggedTaskId(null);
                          }
                        }}
                        className="rounded-2xl bg-[#F4F3EF]/85 dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              style={{ backgroundColor: `${colColor}20`, color: colColor }}
                              className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full truncate"
                            >
                              {col.label}
                            </span>
                            <span className="text-xs font-bold text-neutral-400 tabular-nums shrink-0">
                              {colTasks.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openCreateTaskModal(col.id)}
                            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer shrink-0"
                            title={`Aufgabe in "${col.label}" erstellen`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          {colTasks.length === 0 ? (
                            <div className="py-5 text-center text-[11px] text-neutral-400 border border-dashed border-[#DFDDD5] dark:border-[#2E3038] rounded-xl">
                              Keine Aufgaben
                            </div>
                          ) : (
                            colTasks.map((task) => {
                              const prio = PRIORITY_META[task.priority] || PRIORITY_META.medium;
                              const assignees = getTaskAssignees(task);
                              return (
                                <div
                                  key={task.id}
                                  draggable
                                  onDragStart={() => setDraggedTaskId(task.id)}
                                  onDragEnd={() => setDraggedTaskId(null)}
                                  className="p-3 rounded-xl bg-white dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#32353D] shadow-2xs space-y-2 group"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                                      {task.title}
                                    </h4>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => openEditTaskModal(task)}
                                        className="p-1 rounded-md text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer"
                                        title="Bearbeiten"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="p-1 rounded-md text-neutral-400 hover:text-red-500 cursor-pointer"
                                        title="Löschen"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {task.description && (
                                    <p className="text-[11px] text-neutral-500 line-clamp-2">
                                      {task.description}
                                    </p>
                                  )}

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${prio.cls}`}>
                                      <Flag className="w-2.5 h-2.5" />
                                      {prio.label}
                                    </span>
                                    {assignees.length === 0 ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#1B1D21] text-neutral-500">
                                        <UserCheck className="w-2.5 h-2.5" />
                                        <span>Nicht zugewiesen</span>
                                      </span>
                                    ) : (
                                      assignees.map((name) => (
                                        <span
                                          key={name}
                                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#1B1D21] text-neutral-700 dark:text-neutral-300"
                                        >
                                          <UserCheck className="w-2.5 h-2.5" />
                                          <span className="max-w-[110px] truncate">{name}</span>
                                        </span>
                                      ))
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between pt-1.5 border-t border-[#F1F0EA] dark:border-[#2F3139] text-[10px] text-neutral-400">
                                    <span className="inline-flex items-center gap-1 tabular-nums">
                                      <Calendar className="w-3 h-3" />
                                      {task.startDate.slice(5)} – {task.dueDate.slice(5)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {colIdx > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleMoveTaskStatus(task.id, projectColumns[colIdx - 1].id)
                                          }
                                          className="p-1 rounded-md bg-[#F4F3EF] dark:bg-[#1B1D21] hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                                          title={`Nach "${projectColumns[colIdx - 1].label}" verschieben`}
                                        >
                                          <ChevronLeft className="w-3 h-3" />
                                        </button>
                                      )}
                                      {colIdx < projectColumns.length - 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleMoveTaskStatus(task.id, projectColumns[colIdx + 1].id)
                                          }
                                          className="p-1 rounded-md bg-[#F4F3EF] dark:bg-[#1B1D21] hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                                          title={`Nach "${projectColumns[colIdx + 1].label}" verschieben`}
                                        >
                                          <ChevronRight className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'list' ? (
                /* LIST VIEW */
                <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden">
                  {(activeProject.tasks || []).length === 0 ? (
                    <div className="py-12 text-center text-xs text-neutral-400">
                      Noch keine Aufgaben in diesem Projekt.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/70 dark:bg-[#23252A] text-[11px] font-bold text-neutral-500">
                            <th className="py-2.5 px-3.5">Aufgabe</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Zuständig</th>
                            <th className="py-2.5 px-3">Priorität</th>
                            <th className="py-2.5 px-3">Zeitraum</th>
                            <th className="py-2.5 px-3.5 text-right">Aktionen</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E3DC]/70 dark:divide-[#2F3136]">
                          {[...(activeProject.tasks || [])]
                            .sort((a, b) => a.startDate.localeCompare(b.startDate))
                            .map((task) => {
                              const prio = PRIORITY_META[task.priority] || PRIORITY_META.medium;
                              const assignees = getTaskAssignees(task);
                              const colObj = projectColumns.find((c) => c.id === task.status);
                              const statusColor = colObj?.color || projectAccent;
                              return (
                                <tr
                                  key={task.id}
                                  className="hover:bg-[#FAF9F5] dark:hover:bg-[#24262C] transition-colors"
                                >
                                  <td className="py-2.5 px-3.5 min-w-[200px]">
                                    <div className="font-bold text-neutral-900 dark:text-neutral-100">
                                      {task.title}
                                    </div>
                                    {task.description && (
                                      <div className="text-[11px] text-neutral-500 line-clamp-1">
                                        {task.description}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <select
                                      value={task.status}
                                      onChange={(e) => handleMoveTaskStatus(task.id, e.target.value)}
                                      style={{
                                        borderColor: `${statusColor}55`,
                                        color: statusColor,
                                        backgroundColor: `${statusColor}12`,
                                      }}
                                      className="text-[11px] font-bold px-2.5 py-1 rounded-full border outline-hidden cursor-pointer"
                                    >
                                      {projectColumns.map((col) => (
                                        <option key={col.id} value={col.id}>
                                          {col.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                                      {assignees.length === 0 ? (
                                        <span className="text-[11px] text-neutral-400">Nicht zugewiesen</span>
                                      ) : (
                                        assignees.map((name) => (
                                          <span
                                            key={name}
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#1B1D21] text-neutral-700 dark:text-neutral-300"
                                          >
                                            {name}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${prio.cls}`}>
                                      <Flag className="w-2.5 h-2.5" />
                                      {prio.label}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-[11px] text-neutral-500">
                                    {task.startDate} – {task.dueDate}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => openEditTaskModal(task)}
                                        className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                                        title="Bearbeiten"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
                                        title="Löschen"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* TIMELINE (GANTT) VIEW */
                <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto">
                  {timelineData && (
                    <div className="min-w-[760px] p-4 space-y-2 relative">
                      {/* Header Day Columns */}
                      <div className="flex items-center border-b border-[#E5E3DC] dark:border-[#2F3136] pb-2">
                        <div className="w-52 shrink-0 text-xs font-extrabold text-neutral-700 dark:text-neutral-300 pr-3">
                          Aufgabe &amp; Zuständigkeit
                        </div>
                        <div
                          className="flex-1 grid gap-0.5"
                          style={{
                            gridTemplateColumns: `repeat(${timelineData.totalDays}, minmax(36px, 1fr))`,
                          }}
                        >
                          {timelineData.days.map((d) => (
                            <div
                              key={d.iso}
                              style={d.isToday ? { color: projectAccent } : undefined}
                              className={`text-center text-[10px] tabular-nums ${
                                d.isToday ? 'font-black underline' : 'text-neutral-400'
                              }`}
                            >
                              {d.label}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Task Rows */}
                      {(activeProject.tasks || []).length === 0 ? (
                        <div className="py-10 text-center text-xs text-neutral-400">
                          Füge Aufgaben mit Start- und Enddatum hinzu, um die Timeline anzuzeigen.
                        </div>
                      ) : (
                        [...(activeProject.tasks || [])]
                          .sort((a, b) => a.startDate.localeCompare(b.startDate))
                          .map((task) => {
                            const startDiff = Math.max(
                              0,
                              Math.round(
                                (new Date(`${task.startDate}T00:00:00`).getTime() -
                                  new Date(`${timelineData.minDate}T00:00:00`).getTime()) /
                                  86400000
                              )
                            );
                            const spanDays = Math.max(
                              1,
                              Math.round(
                                (new Date(`${task.dueDate}T00:00:00`).getTime() -
                                  new Date(`${task.startDate}T00:00:00`).getTime()) /
                                  86400000
                              ) + 1
                            );
                            const leftPct = (startDiff / timelineData.totalDays) * 100;
                            const widthPct = Math.min(
                              100 - leftPct,
                              (spanDays / timelineData.totalDays) * 100
                            );
                            const matchedCol = projectColumns.find((c) => c.id === task.status);
                            const barColor = matchedCol?.color || projectAccent;
                            const assignees = getTaskAssignees(task);

                            return (
                              <div
                                key={task.id}
                                onClick={() => openEditTaskModal(task)}
                                className="flex items-center py-1.5 hover:bg-[#F4F3EF]/70 dark:hover:bg-[#25272D] rounded-xl px-1 cursor-pointer transition-colors"
                              >
                                <div className="w-52 shrink-0 pr-3 min-w-0">
                                  <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                                    {task.title}
                                  </div>
                                  <div className="text-[10px] text-neutral-500 truncate">
                                    {assignees.length > 0 ? assignees.join(', ') : 'Nicht zugewiesen'}
                                  </div>
                                </div>
                                <div className="flex-1 h-7 relative bg-[#F4F3EF]/60 dark:bg-[#17181C] rounded-lg overflow-hidden">
                                  {timelineData.todayIdx >= 0 && (
                                    <div
                                      style={{
                                        left: `${
                                          ((timelineData.todayIdx + 0.5) /
                                            timelineData.totalDays) *
                                          100
                                        }%`,
                                        backgroundColor: projectAccent,
                                      }}
                                      className="absolute inset-y-0 w-0.5 opacity-60 z-10"
                                    />
                                  )}
                                  <div
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${Math.max(4, widthPct)}%`,
                                      backgroundColor: barColor,
                                    }}
                                    className="absolute top-1 bottom-1 rounded-md px-2 flex items-center text-[10px] font-bold text-white shadow-2xs truncate"
                                  >
                                    {task.title}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mobile & Tablet Thumb-Zone Floating Navigation */}
      <div className="lg:hidden select-none">
        {isMobileNavExpanded && (
          <div
            onClick={() => setIsMobileNavExpanded(false)}
            className="fixed inset-0 bg-black/25 backdrop-blur-2xs z-40"
          />
        )}
        {isMobileNavExpanded ? (
          <div
            style={{ borderColor: projectAccent }}
            className={`fixed ${floatingNavBottomClass} left-3 right-3 sm:left-auto sm:right-4 z-50 h-14 px-2.5 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-between gap-1.5`}
          >
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setViewMode('kanban');
                  setIsMobileNavExpanded(false);
                }}
                style={viewMode === 'kanban' ? { backgroundColor: projectAccent } : undefined}
                className={`flex-1 h-9.5 px-2 rounded-full flex items-center justify-center gap-1 text-xs font-semibold cursor-pointer ${
                  viewMode === 'kanban' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <Columns3 className="w-4 h-4 shrink-0" />
                <span>Kanban</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('list');
                  setIsMobileNavExpanded(false);
                }}
                style={viewMode === 'list' ? { backgroundColor: projectAccent } : undefined}
                className={`flex-1 h-9.5 px-2 rounded-full flex items-center justify-center gap-1 text-xs font-semibold cursor-pointer ${
                  viewMode === 'list' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <List className="w-4 h-4 shrink-0" />
                <span>Liste</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('timeline');
                  setIsMobileNavExpanded(false);
                }}
                style={viewMode === 'timeline' ? { backgroundColor: projectAccent } : undefined}
                className={`flex-1 h-9.5 px-2 rounded-full flex items-center justify-center gap-1 text-xs font-semibold cursor-pointer ${
                  viewMode === 'timeline' ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <GanttChartSquare className="w-4 h-4 shrink-0" />
                <span>Timeline</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileNavExpanded(false);
                  openCreateTaskModal();
                }}
                style={{ backgroundColor: projectAccent }}
                className="h-9.5 px-3 rounded-full text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Neu</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileNavExpanded(false)}
              className="w-9.5 h-9.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsMobileNavExpanded(true)}
            style={{ borderColor: projectAccent, color: projectAccent }}
            className={`fixed ${floatingNavBottomClass} right-4 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-center cursor-pointer active:scale-95 transition-transform`}
            aria-label="Projekt-Navigation öffnen"
          >
            {viewMode === 'kanban' ? (
              <Columns3 className="w-5 h-5" />
            ) : viewMode === 'list' ? (
              <List className="w-5 h-5" />
            ) : (
              <GanttChartSquare className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* Project Create/Edit Modal */}
      {projectModalOpen && (
        <div
          onClick={() => setProjectModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-10 lg:pt-4 pb-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveProjectForm}
            className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                {editingProject ? 'Projekt bearbeiten' : 'Neues Projekt anlegen'}
              </h3>
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                Projektname *
              </label>
              <input
                type="text"
                required
                placeholder="z.B. Terrasse Umbau 2026"
                value={projTitle}
                onChange={(e) => setProjTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                Beschreibung
              </label>
              <textarea
                rows={2}
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Status
                </label>
                <select
                  value={projStatus}
                  onChange={(e) => setProjStatus(e.target.value as ProjectStatus)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="planning">Planung</option>
                  <option value="active">Aktiv</option>
                  <option value="completed">Abgeschlossen</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Sichtbarkeit
                </label>
                <select
                  value={projVisibility}
                  onChange={(e) => setProjVisibility(e.target.value as ProjectVisibility)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="private">Privat</option>
                  <option value="shared">Geteilt im Team</option>
                </select>
              </div>
            </div>

            {projVisibility === 'shared' && (
              <div className="p-3 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] space-y-1.5">
                <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block">
                  Mit Suite-Benutzern teilen:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {allUsers
                    .filter((u) => u.username !== currentUser.username)
                    .map((u) => {
                      const checked = projSharedWith.includes(u.username);
                      return (
                        <button
                          key={u.username}
                          type="button"
                          onClick={() =>
                            setProjSharedWith((prev) =>
                              checked
                                ? prev.filter((x) => x !== u.username)
                                : [...prev, u.username]
                            )
                          }
                          style={checked ? { backgroundColor: projColor } : undefined}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                            checked
                              ? 'text-white'
                              : 'bg-white dark:bg-[#1B1D21] text-neutral-700 dark:text-neutral-300 border border-[#E5E3DC] dark:border-[#343740]'
                          }`}
                        >
                          {u.displayName}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Startdatum
                </label>
                <input
                  type="date"
                  value={projStartDate}
                  onChange={(e) => setProjStartDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Zieldatum
                </label>
                <input
                  type="date"
                  value={projDueDate}
                  onChange={(e) => setProjDueDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
                Akzentfarbe:
              </span>
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setProjColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                    projColor === c ? 'scale-115 ring-2 ring-offset-2 ring-neutral-400' : ''
                  }`}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                style={{ backgroundColor: projColor }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                Projekt speichern
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task Create/Edit Modal (with Suite Users + Custom External Assignee) */}
      {taskModalOpen && (
        <div
          onClick={() => setTaskModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-10 lg:pt-4 pb-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveTaskForm}
            className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                {editingTask ? 'Aufgabe bearbeiten' : 'Neue Projektaufgabe'}
              </h3>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                Aufgabentitel *
              </label>
              <input
                type="text"
                required
                placeholder="z.B. Material bestellen"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                Notiz / Details
              </label>
              <textarea
                rows={2}
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Spalte / Status
                </label>
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value as ProjectTaskStatus)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  {projectColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Priorität
                </label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as ProjectTask['priority'])}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="low">Niedrig</option>
                  <option value="medium">Mittel</option>
                  <option value="high">Hoch</option>
                </select>
              </div>
            </div>

            {/* Multi-Assignees: Suite User Chips + Custom External Names */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block">
                Zuständig (Mehrfachauswahl · Suite-Nutzer oder externe Namen)
              </label>
              <div className="flex flex-wrap gap-1">
                {allUsers.map((u) => {
                  const isSelected = taskAssignees.includes(u.displayName);
                  return (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() =>
                        setTaskAssignees((prev) =>
                          isSelected ? prev.filter((x) => x !== u.displayName) : [...prev, u.displayName]
                        )
                      }
                      style={isSelected ? { backgroundColor: projectAccent } : undefined}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                        isSelected
                          ? 'text-white shadow-2xs'
                          : 'bg-[#F4F3EF] dark:bg-[#282A30] text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {u.displayName} {isSelected ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>

              {taskAssignees.filter((a) => !allUsers.some((u) => u.displayName === a)).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {taskAssignees
                    .filter((a) => !allUsers.some((u) => u.displayName === a))
                    .map((ext) => (
                      <span
                        key={ext}
                        style={{ borderColor: projectAccent }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-[#FAF9F5] dark:bg-[#25272D]"
                      >
                        <span>{ext}</span>
                        <button
                          type="button"
                          onClick={() => setTaskAssignees((prev) => prev.filter((x) => x !== ext))}
                          className="text-neutral-400 hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Externen Namen hinzufügen (z.B. Elektro Meier)..."
                  value={customAssigneeInput}
                  onChange={(e) => setCustomAssigneeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customAssigneeInput.trim()) {
                      e.preventDefault();
                      const val = customAssigneeInput.trim();
                      setTaskAssignees((prev) => (prev.includes(val) ? prev : [...prev, val]));
                      setCustomAssigneeInput('');
                    }
                  }}
                  className="flex-1 text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = customAssigneeInput.trim();
                    if (!val) return;
                    setTaskAssignees((prev) => (prev.includes(val) ? prev : [...prev, val]));
                    setCustomAssigneeInput('');
                  }}
                  className="px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] text-xs font-semibold cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Startdatum
                </label>
                <input
                  type="date"
                  value={taskStartDate}
                  onChange={(e) => setTaskStartDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Fälligkeitsdatum
                </label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                style={{ backgroundColor: projectAccent }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                Aufgabe speichern
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Link Notes & Wiki Modal */}
      {linksModalOpen && activeProject && (
        <div
          onClick={() => setLinksModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-10 lg:pt-4 pb-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-4 max-h-[82dvh] flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                Notizen &amp; Wiki mit „{activeProject.title}“ verknüpfen
              </h3>
              <button
                type="button"
                onClick={() => setLinksModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
                  Notizen ({notes.length})
                </h4>
                {notes.length === 0 ? (
                  <p className="text-xs text-neutral-400">Keine Notizen vorhanden.</p>
                ) : (
                  <div className="space-y-1">
                    {notes.map((n) => {
                      const linked = (activeProject.linkedNotePaths || []).includes(n.path);
                      return (
                        <button
                          key={n.path}
                          type="button"
                          onClick={() => handleToggleLinkedNote(n.path)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs border cursor-pointer ${
                            linked
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-bold'
                              : 'border-[#E5E3DC] dark:border-[#2F3136] text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          <span className="truncate">{n.title || n.path}</span>
                          {linked && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
                  Wiki-Artikel ({wikiArticles.length})
                </h4>
                {wikiArticles.length === 0 ? (
                  <p className="text-xs text-neutral-400">Keine Wiki-Artikel vorhanden.</p>
                ) : (
                  <div className="space-y-1">
                    {wikiArticles.map((art) => {
                      const linked = (activeProject.linkedWikiSlugs || []).includes(art.slug);
                      return (
                        <button
                          key={art.slug}
                          type="button"
                          onClick={() => handleToggleLinkedWiki(art.slug)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs border cursor-pointer ${
                            linked
                              ? 'border-teal-500/50 bg-teal-500/10 text-teal-900 dark:text-teal-200 font-bold'
                              : 'border-[#E5E3DC] dark:border-[#2F3136] text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          <span className="truncate">{art.title}</span>
                          {linked && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configurable Kanban Columns / Status Modal */}
      {columnsModalOpen && activeProject && (
        <div
          onClick={() => setColumnsModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-10 lg:pt-4 pb-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveColumns}
            className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                Kanban-Spalten / Status verwalten
              </h3>
              <button
                type="button"
                onClick={() => setColumnsModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {draftColumns.map((col, idx) => (
                <div
                  key={col.id}
                  className="p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] flex items-center gap-2"
                >
                  <input
                    type="color"
                    value={col.color || '#B45309'}
                    onChange={(e) =>
                      setDraftColumns((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, color: e.target.value } : c))
                      )
                    }
                    className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer shrink-0"
                    title="Spaltenfarbe"
                  />
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) =>
                      setDraftColumns((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, label: e.target.value } : c))
                      )
                    }
                    className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() =>
                        setDraftColumns((prev) => {
                          const next = [...prev];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          return next;
                        })
                      }
                      className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 disabled:opacity-30 cursor-pointer"
                      title="Nach oben"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draftColumns.length - 1}
                      onClick={() =>
                        setDraftColumns((prev) => {
                          const next = [...prev];
                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                          return next;
                        })
                      }
                      className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 disabled:opacity-30 cursor-pointer"
                      title="Nach unten"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={draftColumns.length <= 1}
                      onClick={() =>
                        setDraftColumns((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 rounded-md text-neutral-400 hover:text-red-500 disabled:opacity-30 cursor-pointer"
                      title="Spalte entfernen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new column */}
            <div className="flex items-center gap-2 pt-1 border-t border-[#E5E3DC] dark:border-[#2F3136]">
              <input
                type="color"
                value={newColumnColor}
                onChange={(e) => setNewColumnColor(e.target.value)}
                className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer shrink-0"
              />
              <input
                type="text"
                placeholder="Neue Spalte (z.B. Blockiert, Warten)..."
                value={newColumnLabel}
                onChange={(e) => setNewColumnLabel(e.target.value)}
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
              <button
                type="button"
                onClick={() => {
                  const label = newColumnLabel.trim();
                  if (!label) return;
                  const id = `col_${label
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '')}_${Date.now().toString(36).slice(-3)}`;
                  setDraftColumns((prev) => [...prev, { id, label, color: newColumnColor }]);
                  setNewColumnLabel('');
                }}
                style={{ backgroundColor: projectAccent }}
                className="px-3 py-1.5 rounded-lg text-white text-xs font-bold cursor-pointer shrink-0"
              >
                + Hinzufügen
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setColumnsModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                style={{ backgroundColor: projectAccent }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                Spalten speichern
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
