import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  ProjectMilestone,
  ProjectProtocolEntry,
  NoteProfileId,
} from '../../types';
import { api } from '../../services/api';
import { DEFAULT_PROJECT_COLUMNS } from '../../services/profileDefaults';
import { useSwipeDrawer } from '../../hooks/useSwipeDrawer';
import {
  FolderKanban,
  Plus,
  Columns3,
  GanttChartSquare,
  List,
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
  Milestone,
  ArrowRightLeft,
  Search,
  AlertTriangle,
  UserPlus,
  Archive,
  ArchiveRestore,
  ClipboardList,
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
  onActiveContextChange?: (ctx: { project: ProjectItem | null; task: ProjectTask | null }) => void;
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

const daysUntilIso = (targetIso: string): number => {
  const today = new Date(`${todayIso()}T00:00:00`).getTime();
  const target = new Date(`${targetIso}T00:00:00`).getTime();
  return Math.round((target - today) / 86400000);
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
  onActiveContextChange,
  onNavigateToNote,
  onNavigateToWiki,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId || projects.find((p) => !p.archived)?.id || projects[0]?.id || null
  );
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'timeline'>('kanban');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'private' | 'shared'>('all');

  // Unified Pixel-Launcher 1:1 Swipe Project Drawer
  const projectDrawer = useSwipeDrawer({
    direction: 'left',
    width: 288,
    edgeThreshold: 96,
    globalWindow: true,
    enabled: true,
  });

  // Mobile auto-minimizing header state
  const [isMobileHeaderCollapsed, setIsMobileHeaderCollapsed] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const headerManualExpandTsRef = useRef(0);

  // Timeline interactive milestone bubble popover
  const [activeTimelineMilestoneId, setActiveTimelineMilestoneId] = useState<string | null>(null);

  // Protocol overlay (Project-level or Task-level)
  const [protocolTarget, setProtocolTarget] = useState<
    | { scope: 'project' }
    | { scope: 'task'; taskId: string }
    | null
  >(null);
  const [protocolDraftText, setProtocolDraftText] = useState('');
  const protocolInputRef = useRef<HTMLTextAreaElement>(null);

  // Archive inside Vault
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveSort, setArchiveSort] = useState<'recent' | 'title'>('recent');

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
  const [projStartDate, setProjStartDate] = useState('');
  const [projDueDate, setProjDueDate] = useState('');
  const [projProfile, setProjProfile] = useState<NoteProfileId>(activeProfileId || 'profile1');
  const [projExternalMembers, setProjExternalMembers] = useState<string[]>([]);
  const [newProjExtInput, setNewProjExtInput] = useState('');

  // Task Create/Edit Modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskStatus, setTaskStatus] = useState<ProjectTaskStatus>('todo');
  const [taskPriority, setTaskPriority] = useState<ProjectTask['priority']>('medium');
  const [taskAssignees, setTaskAssignees] = useState<string[]>([currentUser.displayName]);
  const [customAssigneeInput, setCustomAssigneeInput] = useState('');
  const [taskStartDate, setTaskStartDate] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskMilestoneId, setTaskMilestoneId] = useState('');

  // Milestones Modal
  const [milestonesModalOpen, setMilestonesModalOpen] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msTargetDate, setMsTargetDate] = useState('');
  const [msDesc, setMsDesc] = useState('');
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);

  // List View Multi-Filter & Sorting
  const [listSearch, setListSearch] = useState('');
  const [listFilterStatus, setListFilterStatus] = useState<string>('all');
  const [listFilterPriority, setListFilterPriority] = useState<string>('all');
  const [listFilterAssignee, setListFilterAssignee] = useState<string>('all');
  const [listFilterMilestone, setListFilterMilestone] = useState<string>('all');
  const [listSortKey, setListSortKey] = useState<
    'title' | 'status' | 'priority' | 'startDate' | 'dueDate' | 'milestone' | 'assignees'
  >('dueDate');
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc');

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

  const activeProjectsList = useMemo(
    () => profileFilteredProjects.filter((p) => !p.archived),
    [profileFilteredProjects]
  );

  const archivedProjectsList = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    return profileFilteredProjects
      .filter((p) => !!p.archived)
      .filter((p) => {
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (archiveSort === 'title') return a.title.localeCompare(b.title, 'de');
        return (b.archivedAt || b.updatedAt || 0) - (a.archivedAt || a.updatedAt || 0);
      });
  }, [profileFilteredProjects, archiveSearch, archiveSort]);

  useEffect(() => {
    if (initialProjectId && profileFilteredProjects.some((p) => p.id === initialProjectId)) {
      setSelectedProjectId(initialProjectId);
    } else if (!selectedProjectId || !profileFilteredProjects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(activeProjectsList[0]?.id || profileFilteredProjects[0]?.id || null);
    }
  }, [initialProjectId, profileFilteredProjects, activeProjectsList, selectedProjectId]);

  const filteredProjects = useMemo(() => {
    if (scopeFilter === 'all') return activeProjectsList;
    return activeProjectsList.filter((p) => p.visibility === scopeFilter);
  }, [activeProjectsList, scopeFilter]);

  const activeProject = useMemo(
    () =>
      profileFilteredProjects.find((p) => p.id === selectedProjectId) ||
      filteredProjects[0] ||
      activeProjectsList[0] ||
      null,
    [profileFilteredProjects, filteredProjects, activeProjectsList, selectedProjectId]
  );

  const projectColumns: ProjectColumnConfig[] = useMemo(
    () => (activeProject?.columns && activeProject.columns.length > 0 ? activeProject.columns : DEFAULT_PROJECT_COLUMNS),
    [activeProject]
  );

  // Report current project / open task context to App/Header ShareModal
  useEffect(() => {
    if (!onActiveContextChange) return;
    let activeTask: ProjectTask | null = null;
    if (activeProject) {
      if (taskModalOpen && editingTask) {
        activeTask =
          activeProject.tasks.find((t) => t.id === editingTask.id) || editingTask;
      } else if (protocolTarget?.scope === 'task') {
        activeTask =
          activeProject.tasks.find((t) => t.id === protocolTarget.taskId) || null;
      }
    }
    onActiveContextChange({ project: activeProject, task: activeTask });
  }, [onActiveContextChange, activeProject, taskModalOpen, editingTask, protocolTarget]);

  const persistProject = async (updated: ProjectItem) => {
    const saved = await api.saveProject(currentUser.username, updated);
    const exists = projects.some((p) => p.id === saved.id);
    const next = exists
      ? projects.map((p) => (p.id === saved.id ? saved : p))
      : [saved, ...projects];
    onProjectsChange(next);
    setSelectedProjectId(saved.id);
  };

  const handleToggleArchiveProject = async (proj: ProjectItem) => {
    const nextArchived = !proj.archived;
    const saved = await api.saveProject(currentUser.username, {
      ...proj,
      archived: nextArchived,
      archivedAt: nextArchived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    const next = projects.map((p) => (p.id === saved.id ? saved : p));
    onProjectsChange(next);
    if (nextArchived && selectedProjectId === proj.id) {
      const nextActive = next.find(
        (p) => !p.archived && (!enableSecondProfile || (p.profile || 'profile1') === activeProfileId)
      );
      setSelectedProjectId(nextActive?.id || null);
    } else if (!nextArchived) {
      setSelectedProjectId(saved.id);
      setIsArchiveExpanded(false);
    }
  };

  const handleAddProtocolEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !protocolTarget || !protocolDraftText.trim()) return;
    const newEntry: ProjectProtocolEntry = {
      id: `proto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: protocolDraftText.trim(),
      author: currentUser.displayName,
      createdAt: Date.now(),
    };
    if (protocolTarget.scope === 'project') {
      await persistProject({
        ...activeProject,
        protocols: [newEntry, ...(activeProject.protocols || [])],
        updatedAt: Date.now(),
      });
    } else {
      const nextTasks = activeProject.tasks.map((t) =>
        t.id === protocolTarget.taskId
          ? { ...t, protocols: [newEntry, ...(t.protocols || [])] }
          : t
      );
      await persistProject({
        ...activeProject,
        tasks: nextTasks,
        updatedAt: Date.now(),
      });
    }
    setProtocolDraftText('');
  };

  const handleDeleteProtocolEntry = async (entryId: string) => {
    if (!activeProject || !protocolTarget) return;
    if (protocolTarget.scope === 'project') {
      await persistProject({
        ...activeProject,
        protocols: (activeProject.protocols || []).filter((p) => p.id !== entryId),
        updatedAt: Date.now(),
      });
    } else {
      const nextTasks = activeProject.tasks.map((t) =>
        t.id === protocolTarget.taskId
          ? { ...t, protocols: (t.protocols || []).filter((p) => p.id !== entryId) }
          : t
      );
      await persistProject({
        ...activeProject,
        tasks: nextTasks,
        updatedAt: Date.now(),
      });
    }
  };

  const handleMobileCollapseOnTaskFocus = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      if (Date.now() - headerManualExpandTsRef.current > 350) {
        setIsMobileHeaderCollapsed(true);
      }
    }
  }, []);

  const handleMainContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (activeTimelineMilestoneId) {
      setActiveTimelineMilestoneId(null);
    }
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) return;
    const st = e.currentTarget.scrollTop;
    const delta = st - lastScrollTopRef.current;
    lastScrollTopRef.current = st;
    if (st > 36 && delta > 3 && Date.now() - headerManualExpandTsRef.current > 450) {
      setIsMobileHeaderCollapsed(true);
    } else if (st <= 6) {
      setIsMobileHeaderCollapsed(false);
    }
  }, [activeTimelineMilestoneId]);

  useEffect(() => {
    if (protocolTarget) {
      window.setTimeout(() => protocolInputRef.current?.focus(), 60);
    }
  }, [protocolTarget]);

  const openCreateProjectModal = () => {
    setEditingProject(null);
    setProjTitle('');
    setProjDesc('');
    setProjStatus('active');
    setProjVisibility('private');
    setProjSharedWith([]);
    setProjColor(accentColor);
    setProjStartDate('');
    setProjDueDate('');
    setProjProfile(activeProfileId || 'profile1');
    setProjExternalMembers([]);
    setNewProjExtInput('');
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
    setProjStartDate(proj.startDate || '');
    setProjDueDate(proj.dueDate || '');
    setProjProfile(proj.profile || 'profile1');
    setProjExternalMembers(proj.externalMembers || []);
    setNewProjExtInput('');
    setProjectModalOpen(true);
  };

  const handleSaveProjectForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim()) return;
    const now = Date.now();
    const cleanExt = Array.from(
      new Set(projExternalMembers.map((s) => s.trim()).filter(Boolean))
    );
    const payload: ProjectItem = editingProject
      ? {
          ...editingProject,
          title: projTitle.trim(),
          description: projDesc.trim(),
          status: projStatus,
          profile: projProfile,
          visibility: projVisibility,
          sharedWithUsers: projVisibility === 'shared' ? projSharedWith : [],
          externalMembers: cleanExt,
          color: projColor,
          startDate: projStartDate.trim() || undefined,
          dueDate: projDueDate.trim() || undefined,
          updatedAt: now,
        }
      : {
          id: `proj_${now}_${Math.random().toString(36).slice(2, 6)}`,
          title: projTitle.trim(),
          description: projDesc.trim(),
          ownerUsername: currentUser.username,
          ownerDisplayName: currentUser.displayName,
          profile: projProfile || activeProfileId || 'profile1',
          visibility: projVisibility,
          sharedWithUsers: projVisibility === 'shared' ? projSharedWith : [],
          externalMembers: cleanExt,
          milestones: [],
          status: projStatus,
          color: projColor,
          startDate: projStartDate.trim() || undefined,
          dueDate: projDueDate.trim() || undefined,
          columns: DEFAULT_PROJECT_COLUMNS.map((c) => ({ ...c })),
          linkedNotePaths: [],
          linkedWikiSlugs: [],
          tasks: [],
          createdAt: now,
          updatedAt: now,
        };
    await persistProject(payload);
    setProjectModalOpen(false);
    projectDrawer.close();
  };

  const handleMoveProjectToProfile = async (proj: ProjectItem, targetProfile: NoteProfileId) => {
    await persistProject({
      ...proj,
      profile: targetProfile,
      updatedAt: Date.now(),
    });
    if (onSwitchProfile && enableSecondProfile) {
      onSwitchProfile(targetProfile);
    }
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
    setTaskStartDate('');
    setTaskDueDate('');
    setTaskMilestoneId('');
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
    setTaskStartDate(task.startDate || '');
    setTaskDueDate(task.dueDate || '');
    setTaskMilestoneId(task.milestoneId || '');
    setTaskModalOpen(true);
  };

  const handleSaveTaskForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !taskTitle.trim()) return;
    const sDate = taskStartDate.trim() || undefined;
    let dDate = taskDueDate.trim() || undefined;
    if (sDate && dDate && dDate < sDate) dDate = sDate;
    const combinedAssignees = Array.from(
      new Set(
        [...taskAssignees, customAssigneeInput]
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s !== 'Nicht zugewiesen')
      )
    );
    // Automatically remember new external assignees in project.externalMembers
    const suiteNames = new Set(allUsers.map((u) => u.displayName.toLowerCase()));
    const newExternal = combinedAssignees.filter((a) => !suiteNames.has(a.toLowerCase()));
    const mergedExternalMembers = Array.from(
      new Set([...(activeProject.externalMembers || []), ...newExternal])
    );

    const taskPayload: ProjectTask = {
      id: editingTask?.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: taskTitle.trim(),
      description: taskDesc.trim() || undefined,
      status: taskStatus,
      priority: taskPriority,
      assignee: combinedAssignees[0] || 'Nicht zugewiesen',
      assignees: combinedAssignees,
      startDate: sDate,
      dueDate: dDate,
      milestoneId: taskMilestoneId || undefined,
      protocols: editingTask?.protocols,
      createdAt: editingTask?.createdAt || Date.now(),
    };

    const nextTasks = editingTask
      ? activeProject.tasks.map((t) => (t.id === taskPayload.id ? taskPayload : t))
      : [...activeProject.tasks, taskPayload];

    await persistProject({
      ...activeProject,
      externalMembers: mergedExternalMembers,
      tasks: nextTasks,
      updatedAt: Date.now(),
    });
    setTaskModalOpen(false);
  };

  // Milestone CRUD handlers
  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !msTitle.trim() || !msTargetDate.trim()) return;
    const existing = activeProject.milestones || [];
    const nextMilestones: ProjectMilestone[] = editingMilestoneId
      ? existing.map((m) =>
          m.id === editingMilestoneId
            ? {
                ...m,
                title: msTitle.trim(),
                targetDate: msTargetDate.trim(),
                description: msDesc.trim() || undefined,
              }
            : m
        )
      : [
          ...existing,
          {
            id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            title: msTitle.trim(),
            targetDate: msTargetDate.trim(),
            description: msDesc.trim() || undefined,
            completed: false,
          },
        ];
    await persistProject({
      ...activeProject,
      milestones: nextMilestones,
      updatedAt: Date.now(),
    });
    setMsTitle('');
    setMsTargetDate('');
    setMsDesc('');
    setEditingMilestoneId(null);
  };

  const handleToggleMilestoneDone = async (msId: string) => {
    if (!activeProject) return;
    const nextMilestones = (activeProject.milestones || []).map((m) =>
      m.id === msId ? { ...m, completed: !m.completed } : m
    );
    await persistProject({
      ...activeProject,
      milestones: nextMilestones,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteMilestone = async (msId: string) => {
    if (!activeProject) return;
    const nextMilestones = (activeProject.milestones || []).filter((m) => m.id !== msId);
    const nextTasks = activeProject.tasks.map((t) =>
      t.milestoneId === msId ? { ...t, milestoneId: undefined } : t
    );
    await persistProject({
      ...activeProject,
      milestones: nextMilestones,
      tasks: nextTasks,
      updatedAt: Date.now(),
    });
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
      {isArchiveExpanded ? (
        /* Maximized Archive inside Vault */
        <>
          <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsArchiveExpanded(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#22242A] border border-[#E5E3DC] dark:border-[#343740] text-xs font-bold text-neutral-700 dark:text-neutral-200 cursor-pointer hover:bg-neutral-100"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Zurück</span>
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Archive className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
              <span className="text-xs font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                Archiv ({archivedProjectsList.length})
              </span>
            </div>
          </div>

          <div className="p-2.5 space-y-2 border-b border-[#E5E3DC] dark:border-[#2F3136] shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Archiv durchsuchen..."
                className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-xl bg-white dark:bg-[#22242A] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Sortierung:
              </span>
              <select
                value={archiveSort}
                onChange={(e) => setArchiveSort(e.target.value as 'recent' | 'title')}
                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white dark:bg-[#22242A] border border-[#E5E3DC] dark:border-[#343740] outline-hidden cursor-pointer"
              >
                <option value="recent">Zuletzt archiviert</option>
                <option value="title">Name A–Z</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {archivedProjectsList.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400">
                {archiveSearch.trim()
                  ? 'Keine archivierten Projekte gefunden.'
                  : 'Das Projekt-Archiv ist leer.'}
              </div>
            ) : (
              archivedProjectsList.map((proj) => {
                const isSelected = activeProject?.id === proj.id;
                const doneCount = (proj.tasks || []).filter((t) => t.status === 'done').length;
                const totalCount = (proj.tasks || []).length;
                return (
                  <div
                    key={proj.id}
                    className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                      isSelected
                        ? 'border-2 bg-white dark:bg-[#24262D]'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#22242A]'
                    }`}
                    style={isSelected ? { borderColor: proj.color || accentColor } : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        projectDrawer.close();
                      }}
                      className="w-full text-left cursor-pointer space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                          {proj.title}
                        </span>
                        <span className="text-[10px] text-neutral-400 tabular-nums shrink-0">
                          {doneCount}/{totalCount}
                        </span>
                      </div>
                      {proj.archivedAt && (
                        <div className="text-[10px] text-neutral-400 tabular-nums">
                          Archiviert am {new Date(proj.archivedAt).toLocaleDateString('de-DE')}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleArchiveProject(proj)}
                      style={{ color: accentColor, borderColor: `${accentColor}40` }}
                      className="w-full py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-amber-500/10 cursor-pointer"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>Wiederherstellen</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* Normal Active Projects Vault */
        <>
          <div className="p-3.5 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div
                style={{ backgroundColor: accentColor }}
                className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0"
              >
                <FolderKanban className="w-4 h-4" />
              </div>
              <span className="text-xs font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                Projekte ({activeProjectsList.length})
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

          <div className="p-2 grid grid-cols-3 gap-1 border-b border-[#E5E3DC] dark:border-[#2F3136] shrink-0">
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
                Keine aktiven Projekte in dieser Ansicht.
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
                      projectDrawer.close();
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

          {/* Bottom Archive Maximizer Trigger */}
          <div className="p-2.5 border-t border-[#E5E3DC] dark:border-[#2F3136] shrink-0">
            <button
              type="button"
              onClick={() => setIsArchiveExpanded(true)}
              className="w-full py-2 px-3 rounded-xl bg-white dark:bg-[#22242A] border border-[#E5E3DC] dark:border-[#343740] hover:border-neutral-400 text-xs font-bold text-neutral-700 dark:text-neutral-200 flex items-center justify-between cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2">
                <Archive className="w-3.5 h-3.5 text-neutral-500" />
                <span>Archiv</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#1A1B1E] text-[10px] font-extrabold tabular-nums text-neutral-600 dark:text-neutral-300">
                {profileFilteredProjects.filter((p) => !!p.archived).length}
              </span>
            </button>
          </div>
        </>
      )}
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
        onClick={projectDrawer.toggle}
        style={{
          backgroundColor: projectAccent,
          ...(projectDrawer.dragOffset !== null
            ? { left: `${Math.max(0, 288 + projectDrawer.dragOffset)}px`, transition: 'none' }
            : {}),
        }}
        className={`lg:hidden fixed top-1/2 -translate-y-1/2 z-40 h-14 flex items-center justify-center text-white shadow-lg cursor-pointer ${
          projectDrawer.isDragging ? 'transition-none' : 'transition-all duration-200'
        } ${
          projectDrawer.dragOffset !== null
            ? 'w-6 rounded-r-xl'
            : projectDrawer.isOpen
            ? 'left-72 w-7 rounded-r-xl'
            : 'left-0 w-5 rounded-r-xl opacity-90'
        }`}
        aria-label="Projekt-Vault umschalten"
      >
        {projectDrawer.isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Mobile Swipeable Project Vault Drawer */}
      {(projectDrawer.isOpen || projectDrawer.dragOffset !== null) && (
        <div
          onClick={projectDrawer.close}
          className="lg:hidden fixed inset-0 z-50 bg-black/35 backdrop-blur-2xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform:
                projectDrawer.dragOffset !== null
                  ? `translateX(${projectDrawer.dragOffset}px)`
                  : projectDrawer.isOpen
                  ? 'translateX(0)'
                  : 'translateX(-100%)',
              transition: projectDrawer.isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            className="w-72 h-full border-r border-[#E5E3DC] dark:border-[#2F3136] shadow-2xl"
          >
            {projectListPanel}
          </div>
        </div>
      )}

      {/* Right Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
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
            {/* Active Project Header — Auto-minimizes on mobile scroll / task focus with left expand arrow */}
            {isMobileHeaderCollapsed ? (
              <div className="lg:hidden px-3 py-2 bg-[#FFFDF9] dark:bg-[#1B1D21] border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0 transition-all">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      headerManualExpandTsRef.current = Date.now();
                      setIsMobileHeaderCollapsed(false);
                    }}
                    style={{ backgroundColor: `${projectAccent}18`, color: projectAccent }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
                    title="Projekt-Header einblenden"
                    aria-label="Projekt-Header einblenden"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span
                    style={{ backgroundColor: projectAccent }}
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                  />
                  <h2 className="text-xs font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                    {activeProject.title}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setProtocolDraftText('');
                      setProtocolTarget({ scope: 'project' });
                    }}
                    className="h-8 px-2.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1 cursor-pointer"
                  >
                    <ClipboardList className="w-3.5 h-3.5" style={{ color: projectAccent }} />
                    <span>Protokoll</span>
                    {(activeProject.protocols || []).length > 0 && (
                      <span className="text-[10px] font-bold opacity-75 tabular-nums">
                        ({(activeProject.protocols || []).length})
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateTaskModal()}
                    style={{ backgroundColor: projectAccent }}
                    className="h-8 px-2.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Neu</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div
              className={`${
                isMobileHeaderCollapsed ? 'hidden lg:block' : 'block'
              } px-4 sm:px-6 py-3 bg-[#FFFDF9] dark:bg-[#1B1D21] border-b border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5 shrink-0`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => projectDrawer.open()}
                      className="lg:hidden p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#23252A] text-neutral-700 dark:text-neutral-200 cursor-pointer"
                      title="Projekt-Vault öffnen"
                      aria-label="Projekt-Vault öffnen"
                    >
                      <FolderKanban className="w-3.5 h-3.5" style={{ color: projectAccent }} />
                    </button>
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
                    {activeProject.archived && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">
                        Archiviert
                      </span>
                    )}
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
                    {(activeProject.startDate || activeProject.dueDate) && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#25272D] text-neutral-500 tabular-nums">
                        <Calendar className="w-3 h-3" />
                        {activeProject.startDate || '…'} – {activeProject.dueDate || '…'}
                      </span>
                    )}
                    {enableSecondProfile && profileNames && (
                      <button
                        type="button"
                        onClick={() =>
                          handleMoveProjectToProfile(
                            activeProject,
                            (activeProject.profile || 'profile1') === 'profile1' ? 'profile2' : 'profile1'
                          )
                        }
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#25272D] text-neutral-600 dark:text-neutral-300 hover:border-neutral-400 border border-[#E5E3DC] dark:border-[#32353D] font-semibold cursor-pointer"
                        title="Projekt in das andere Profil verschieben"
                      >
                        <ArrowRightLeft className="w-2.5 h-2.5" />
                        <span>
                          →{' '}
                          {(activeProject.profile || 'profile1') === 'profile1'
                            ? profileNames.profile2 || 'Profil 2'
                            : profileNames.profile1 || 'Profil 1'}
                        </span>
                      </button>
                    )}
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
                    onClick={() => {
                      setProtocolDraftText('');
                      setProtocolTarget({ scope: 'project' });
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 cursor-pointer"
                    title="Projekt-Protokoll öffnen"
                  >
                    <ClipboardList className="w-3.5 h-3.5" style={{ color: projectAccent }} />
                    <span>Protokoll</span>
                    {(activeProject.protocols || []).length > 0 && (
                      <span className="text-[10px] font-extrabold opacity-75 tabular-nums">
                        ({(activeProject.protocols || []).length})
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMsTitle('');
                      setMsTargetDate('');
                      setMsDesc('');
                      setEditingMilestoneId(null);
                      setMilestonesModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 cursor-pointer"
                    title="Meilensteine & ETAs verwalten"
                  >
                    <Milestone className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Meilensteine</span>
                    {(activeProject.milestones || []).length > 0 && (
                      <span className="text-[10px] font-extrabold opacity-75 tabular-nums">
                        ({(activeProject.milestones || []).length})
                      </span>
                    )}
                  </button>

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
                    onClick={() => handleToggleArchiveProject(activeProject)}
                    className="p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 cursor-pointer"
                    title={activeProject.archived ? 'Aus Archiv wiederherstellen' : 'Projekt archivieren'}
                  >
                    {activeProject.archived ? (
                      <ArchiveRestore className="w-3.5 h-3.5" />
                    ) : (
                      <Archive className="w-3.5 h-3.5" />
                    )}
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

              {/* Milestones Strip with ETA Countdown & Warnings */}
              {(activeProject.milestones || []).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {(activeProject.milestones || [])
                    .slice()
                    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
                    .map((ms) => {
                      const diff = daysUntilIso(ms.targetDate);
                      const isOverdue = !ms.completed && diff < 0;
                      const isWarning = !ms.completed && diff >= 0 && diff <= 3;
                      return (
                        <button
                          key={ms.id}
                          type="button"
                          onClick={() => setMilestonesModalOpen(true)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border cursor-pointer transition-colors ${
                            ms.completed
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 line-through opacity-75'
                              : isOverdue
                              ? 'bg-red-500/12 border-red-500/40 text-red-700 dark:text-red-300'
                              : isWarning
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-200'
                              : 'bg-[#F4F3EF] dark:bg-[#25272D] border-[#E5E3DC] dark:border-[#343740] text-neutral-700 dark:text-neutral-200'
                          }`}
                          title={ms.description || `Meilenstein bis ${ms.targetDate}`}
                        >
                          {isOverdue || isWarning ? (
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                          ) : (
                            <Milestone className="w-3 h-3 shrink-0" />
                          )}
                          <span className="max-w-[140px] truncate">{ms.title}</span>
                          <span className="text-[10px] opacity-80 tabular-nums">
                            {ms.completed
                              ? '✓'
                              : diff < 0
                              ? `${Math.abs(diff)}T überfällig`
                              : diff === 0
                              ? 'Heute'
                              : `in ${diff}T`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Content Area: Kanban, List or Gantt Timeline */}
            <div
              ref={contentScrollRef}
              onScroll={handleMainContentScroll}
              onPointerDown={(e) => {
                const target = e.target as HTMLElement | null;
                if (target?.closest('[data-task-area="true"]')) {
                  handleMobileCollapseOnTaskFocus();
                }
              }}
              className="flex-1 overflow-y-auto p-4 sm:p-5 pb-24 lg:pb-8"
            >
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
                        style={{
                          backgroundColor: `${colColor}12`,
                          borderColor: `${colColor}35`,
                        }}
                        className="rounded-2xl border p-3 space-y-2.5"
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
                              const linkedMs = task.milestoneId
                                ? (activeProject.milestones || []).find((m) => m.id === task.milestoneId)
                                : undefined;
                              return (
                                <div
                                  key={task.id}
                                  data-task-area="true"
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
                                        onClick={() => {
                                          setProtocolDraftText('');
                                          setProtocolTarget({ scope: 'task', taskId: task.id });
                                        }}
                                        className="p-1 rounded-md text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer relative"
                                        title="Aufgaben-Protokoll öffnen"
                                      >
                                        <ClipboardList className="w-3.5 h-3.5" />
                                        {(task.protocols || []).length > 0 && (
                                          <span
                                            style={{ backgroundColor: projectAccent }}
                                            className="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center tabular-nums"
                                          >
                                            {(task.protocols || []).length}
                                          </span>
                                        )}
                                      </button>
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
                                    {linkedMs && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300">
                                        <Milestone className="w-2.5 h-2.5" />
                                        <span className="max-w-[100px] truncate">{linkedMs.title}</span>
                                      </span>
                                    )}
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
                                      {(task.startDate || task.dueDate) ? (
                                        <>
                                          <Calendar className="w-3 h-3" />
                                          {task.startDate ? task.startDate.slice(5) : '…'} – {task.dueDate ? task.dueDate.slice(5) : '…'}
                                        </>
                                      ) : (
                                        <span>Ohne Termin</span>
                                      )}
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
                /* SORTABLE & FILTERABLE LIST VIEW */
                <div data-task-area="true" className="space-y-3">
                  {/* Multi-Filter Toolbar */}
                  <div className="p-3 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                        placeholder="Aufgabe, Notiz, Person suchen..."
                        className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                      />
                    </div>
                    <select
                      value={listFilterStatus}
                      onChange={(e) => setListFilterStatus(e.target.value)}
                      className="text-xs px-2.5 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] outline-hidden cursor-pointer"
                    >
                      <option value="all">Alle Status</option>
                      {projectColumns.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <select
                      value={listFilterPriority}
                      onChange={(e) => setListFilterPriority(e.target.value)}
                      className="text-xs px-2.5 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] outline-hidden cursor-pointer"
                    >
                      <option value="all">Alle Prioritäten</option>
                      <option value="high">Hoch</option>
                      <option value="medium">Mittel</option>
                      <option value="low">Niedrig</option>
                    </select>
                    <select
                      value={listFilterAssignee}
                      onChange={(e) => setListFilterAssignee(e.target.value)}
                      className="text-xs px-2.5 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] outline-hidden cursor-pointer"
                    >
                      <option value="all">Alle Personen</option>
                      {Array.from(
                        new Set([
                          ...allUsers.map((u) => u.displayName),
                          ...(activeProject.externalMembers || []),
                          ...(activeProject.tasks || []).flatMap((t) => getTaskAssignees(t)),
                        ])
                      ).map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    {(activeProject.milestones || []).length > 0 && (
                      <select
                        value={listFilterMilestone}
                        onChange={(e) => setListFilterMilestone(e.target.value)}
                        className="text-xs px-2.5 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] outline-hidden cursor-pointer"
                      >
                        <option value="all">Alle Meilensteine</option>
                        {(activeProject.milestones || []).map((m) => (
                          <option key={m.id} value={m.id}>{m.title}</option>
                        ))}
                      </select>
                    )}
                    {(listSearch ||
                      listFilterStatus !== 'all' ||
                      listFilterPriority !== 'all' ||
                      listFilterAssignee !== 'all' ||
                      listFilterMilestone !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setListSearch('');
                          setListFilterStatus('all');
                          setListFilterPriority('all');
                          setListFilterAssignee('all');
                          setListFilterMilestone('all');
                        }}
                        className="text-[11px] px-2.5 py-1.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold cursor-pointer"
                      >
                        Zurücksetzen
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden">
                    {(() => {
                      const q = listSearch.trim().toLowerCase();
                      const prioRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
                      const toggleSort = (key: typeof listSortKey) => {
                        if (listSortKey === key) setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setListSortKey(key);
                          setListSortDir('asc');
                        }
                      };
                      const rows = (activeProject.tasks || [])
                        .filter((t) => {
                          if (listFilterStatus !== 'all' && t.status !== listFilterStatus) return false;
                          if (listFilterPriority !== 'all' && t.priority !== listFilterPriority) return false;
                          if (listFilterMilestone !== 'all' && t.milestoneId !== listFilterMilestone) return false;
                          const assignees = getTaskAssignees(t);
                          if (listFilterAssignee !== 'all' && !assignees.includes(listFilterAssignee)) return false;
                          if (q) {
                            const hay = `${t.title} ${t.description || ''} ${assignees.join(' ')}`.toLowerCase();
                            if (!hay.includes(q)) return false;
                          }
                          return true;
                        })
                        .sort((a, b) => {
                          let cmp = 0;
                          if (listSortKey === 'title') cmp = a.title.localeCompare(b.title, 'de');
                          else if (listSortKey === 'status') cmp = a.status.localeCompare(b.status, 'de');
                          else if (listSortKey === 'priority')
                            cmp = (prioRank[a.priority] || 0) - (prioRank[b.priority] || 0);
                          else if (listSortKey === 'startDate')
                            cmp = (a.startDate || '9999-99-99').localeCompare(b.startDate || '9999-99-99');
                          else if (listSortKey === 'dueDate')
                            cmp = (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
                          else if (listSortKey === 'milestone') {
                            const ma = (activeProject.milestones || []).find((m) => m.id === a.milestoneId)?.title || 'zzz';
                            const mb = (activeProject.milestones || []).find((m) => m.id === b.milestoneId)?.title || 'zzz';
                            cmp = ma.localeCompare(mb, 'de');
                          } else if (listSortKey === 'assignees') {
                            cmp = getTaskAssignees(a).join(',').localeCompare(getTaskAssignees(b).join(','), 'de');
                          }
                          return listSortDir === 'asc' ? cmp : -cmp;
                        });

                      if (rows.length === 0) {
                        return (
                          <div className="py-12 text-center text-xs text-neutral-400">
                            Keine passenden Aufgaben in dieser Auswahl.
                          </div>
                        );
                      }

                      const SortBtn: React.FC<{ k: typeof listSortKey; label: string }> = ({ k, label }) => (
                        <button
                          type="button"
                          onClick={() => toggleSort(k)}
                          className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                        >
                          <span>{label}</span>
                          {listSortKey === k && (listSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </button>
                      );

                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/70 dark:bg-[#23252A] text-[11px] font-bold text-neutral-500">
                                <th className="py-2.5 px-3.5"><SortBtn k="title" label="Titel" /></th>
                                <th className="py-2.5 px-3"><SortBtn k="status" label="Status" /></th>
                                <th className="py-2.5 px-3"><SortBtn k="priority" label="Priorität" /></th>
                                <th className="py-2.5 px-3"><SortBtn k="startDate" label="Start" /></th>
                                <th className="py-2.5 px-3"><SortBtn k="dueDate" label="Fällig" /></th>
                                <th className="py-2.5 px-3"><SortBtn k="milestone" label="Meilenstein" /></th>
                                <th className="py-2.5 px-3"><SortBtn k="assignees" label="Personen" /></th>
                                <th className="py-2.5 px-3.5 text-right">Aktionen</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E5E3DC]/70 dark:divide-[#2F3136]">
                              {rows.map((task) => {
                                const prio = PRIORITY_META[task.priority] || PRIORITY_META.medium;
                                const assignees = getTaskAssignees(task);
                                const colObj = projectColumns.find((c) => c.id === task.status);
                                const statusColor = colObj?.color || projectAccent;
                                const msObj = (activeProject.milestones || []).find((m) => m.id === task.milestoneId);
                                return (
                                  <tr
                                    key={task.id}
                                    className="hover:bg-[#FAF9F5] dark:hover:bg-[#24262C] transition-colors"
                                  >
                                    <td className="py-2.5 px-3.5 min-w-[190px]">
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
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${prio.cls}`}>
                                        <Flag className="w-2.5 h-2.5" />
                                        {prio.label}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-[11px] text-neutral-500">
                                      {task.startDate || '–'}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-[11px] text-neutral-500">
                                      {task.dueDate || '–'}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                                      {msObj ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 font-semibold">
                                          <Milestone className="w-3 h-3" />
                                          {msObj.title}
                                        </span>
                                      ) : (
                                        <span className="text-neutral-400">–</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="flex flex-wrap gap-1 max-w-[200px]">
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
                                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setProtocolDraftText('');
                                            setProtocolTarget({ scope: 'task', taskId: task.id });
                                          }}
                                          className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer relative"
                                          title="Aufgaben-Protokoll öffnen"
                                        >
                                          <ClipboardList className="w-3.5 h-3.5" />
                                          {(task.protocols || []).length > 0 && (
                                            <span
                                              style={{ backgroundColor: projectAccent }}
                                              className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-0.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center tabular-nums"
                                            >
                                              {(task.protocols || []).length}
                                            </span>
                                          )}
                                        </button>
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
                      );
                    })()}
                  </div>
                </div>
              ) : (
                /* TIMELINE (GANTT) VIEW WITH INTERACTIVE MILESTONE BUBBLES */
                <div
                  data-task-area="true"
                  onScroll={() => {
                    if (activeTimelineMilestoneId) setActiveTimelineMilestoneId(null);
                  }}
                  className="rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto"
                >
                  {timelineData && (
                    <div className="min-w-[760px] p-4 space-y-2 relative">
                      {/* Interactive Milestone Bubbles Strip aligned to Timeline Columns */}
                      {(activeProject.milestones || []).length > 0 && (
                        <div className="flex items-center pt-1 pb-2 relative">
                          <div className="w-52 shrink-0 text-[11px] font-bold text-neutral-500 pr-3 flex items-center gap-1">
                            <Milestone className="w-3.5 h-3.5" style={{ color: projectAccent }} />
                            <span>Meilensteine</span>
                          </div>
                          <div className="flex-1 h-9 relative">
                            {(activeProject.milestones || []).map((ms) => {
                              const diffDays = Math.round(
                                (new Date(`${ms.targetDate}T00:00:00`).getTime() -
                                  new Date(`${timelineData.minDate}T00:00:00`).getTime()) /
                                  86400000
                              );
                              const clampedIdx = Math.max(0, Math.min(timelineData.totalDays - 1, diffDays));
                              const leftPct = ((clampedIdx + 0.5) / timelineData.totalDays) * 100;
                              const diff = daysUntilIso(ms.targetDate);
                              const isOverdue = !ms.completed && diff < 0;
                              const isSelected = activeTimelineMilestoneId === ms.id;
                              const bubbleColor = ms.completed
                                ? '#10B981'
                                : isOverdue
                                ? '#EF4444'
                                : projectAccent;
                              return (
                                <div
                                  key={`bubble_${ms.id}`}
                                  style={{ left: `${leftPct}%` }}
                                  className="absolute top-0.5 -translate-x-1/2 z-20"
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTimelineMilestoneId((prev) => (prev === ms.id ? null : ms.id));
                                    }}
                                    style={{
                                      backgroundColor: bubbleColor,
                                      borderColor: isSelected ? '#171717' : '#ffffff',
                                    }}
                                    className={`h-7 px-2.5 rounded-full text-white text-[10px] font-extrabold shadow-md border-2 flex items-center gap-1 whitespace-nowrap cursor-pointer transition-transform ${
                                      isSelected ? 'scale-110 ring-2 ring-amber-400/60' : 'hover:scale-105'
                                    }`}
                                    title={`${ms.title} (${ms.targetDate})`}
                                  >
                                    <Milestone className="w-3 h-3 shrink-0" />
                                    <span className="max-w-[92px] truncate">{ms.title}</span>
                                  </button>

                                  {isSelected && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-1.5 w-64 p-3 rounded-2xl bg-white dark:bg-[#23252C] border border-[#E5E3DC] dark:border-[#343740] shadow-2xl space-y-2 text-left relative z-30"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="text-xs font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                                            {ms.title}
                                          </div>
                                          <div className="text-[10px] text-neutral-500 tabular-nums">
                                            Ziel: {ms.targetDate} ·{' '}
                                            {ms.completed
                                              ? 'Erreicht ✓'
                                              : diff < 0
                                              ? `${Math.abs(diff)}T überfällig`
                                              : diff === 0
                                              ? 'Heute fällig'
                                              : `in ${diff} Tagen`}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setActiveTimelineMilestoneId(null)}
                                          className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      {ms.description && (
                                        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                                          {ms.description}
                                        </p>
                                      )}
                                      {(() => {
                                        const linkedTasks = (activeProject.tasks || []).filter(
                                          (t) => t.milestoneId === ms.id
                                        );
                                        return (
                                          <div className="pt-1 border-t border-[#E5E3DC] dark:border-[#343740] space-y-1">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                              Verknüpfte Aufgaben ({linkedTasks.length})
                                            </div>
                                            {linkedTasks.length === 0 ? (
                                              <div className="text-[11px] text-neutral-400">
                                                Keine Aufgaben zugewiesen.
                                              </div>
                                            ) : (
                                              linkedTasks.slice(0, 4).map((lt) => (
                                                <button
                                                  key={lt.id}
                                                  type="button"
                                                  onClick={() => {
                                                    setActiveTimelineMilestoneId(null);
                                                    openEditTaskModal(lt);
                                                  }}
                                                  className="w-full text-left text-[11px] font-semibold px-2 py-1 rounded-lg bg-[#F4F3EF] dark:bg-[#1B1D21] hover:bg-neutral-200 dark:hover:bg-neutral-700 truncate cursor-pointer"
                                                >
                                                  • {lt.title}
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

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
                      {(activeProject.tasks || []).filter((t) => t.startDate || t.dueDate).length === 0 ? (
                        <div className="py-10 text-center text-xs text-neutral-400">
                          Füge Aufgaben mit Start- oder Fälligkeitsdatum hinzu, um die Timeline anzuzeigen.
                        </div>
                      ) : (
                        (activeProject.tasks || [])
                          .filter((t) => t.startDate || t.dueDate)
                          .sort((a, b) => (a.startDate || a.dueDate || '').localeCompare(b.startDate || b.dueDate || ''))
                          .map((task) => {
                            const effStart = task.startDate || task.dueDate || todayIso();
                            const effEnd = task.dueDate || task.startDate || effStart;
                            const startDiff = Math.max(
                              0,
                              Math.round(
                                (new Date(`${effStart}T00:00:00`).getTime() -
                                  new Date(`${timelineData.minDate}T00:00:00`).getTime()) /
                                  86400000
                              )
                            );
                            const spanDays = Math.max(
                              1,
                              Math.round(
                                (new Date(`${effEnd}T00:00:00`).getTime() -
                                  new Date(`${effStart}T00:00:00`).getTime()) /
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

            {enableSecondProfile && profileNames && (
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Profil zuweisen
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['profile1', 'profile2'] as NoteProfileId[]).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => setProjProfile(pid)}
                      style={projProfile === pid ? { backgroundColor: projColor, color: '#fff' } : undefined}
                      className={`py-2 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        projProfile === pid
                          ? 'shadow-xs'
                          : 'bg-[#F4F3EF] dark:bg-[#282A30] text-neutral-700 dark:text-neutral-300 border border-[#E5E3DC] dark:border-[#343740]'
                      }`}
                    >
                      {profileNames[pid] || (pid === 'profile1' ? 'Profil 1' : 'Profil 2')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* External Members Management per Project */}
            <div className="p-3 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] space-y-2">
              <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                <span>Externe Personen / Firmen (wiederverwendbar als Zuweisung)</span>
              </span>
              {projExternalMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {projExternalMembers.map((ext) => (
                    <span
                      key={ext}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740]"
                    >
                      <span>{ext}</span>
                      <button
                        type="button"
                        onClick={() => setProjExternalMembers((prev) => prev.filter((x) => x !== ext))}
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
                  value={newProjExtInput}
                  onChange={(e) => setNewProjExtInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newProjExtInput.trim()) {
                      e.preventDefault();
                      const v = newProjExtInput.trim();
                      setProjExternalMembers((prev) => (prev.includes(v) ? prev : [...prev, v]));
                      setNewProjExtInput('');
                    }
                  }}
                  placeholder="Name (z.B. Architekt, Handwerker...)"
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = newProjExtInput.trim();
                    if (!v) return;
                    setProjExternalMembers((prev) => (prev.includes(v) ? prev : [...prev, v]));
                    setNewProjExtInput('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740] text-xs font-bold cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Startdatum (optional)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={projStartDate}
                    onChange={(e) => setProjStartDate(e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                  {projStartDate && (
                    <button
                      type="button"
                      onClick={() => setProjStartDate('')}
                      className="p-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] text-neutral-500 hover:text-red-500 cursor-pointer"
                      title="Datum leeren"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Zieldatum (optional)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={projDueDate}
                    onChange={(e) => setProjDueDate(e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                  {projDueDate && (
                    <button
                      type="button"
                      onClick={() => setProjDueDate('')}
                      className="p-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] text-neutral-500 hover:text-red-500 cursor-pointer"
                      title="Datum leeren"
                    >
                      ×
                    </button>
                  )}
                </div>
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

            <div className="flex items-center justify-between pt-2 gap-2">
              {editingProject ? (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleArchiveProject(editingProject);
                    setProjectModalOpen(false);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-[#E5E3DC] dark:border-[#343740] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#282A30] flex items-center gap-1.5 cursor-pointer"
                >
                  {editingProject.archived ? (
                    <>
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>Wiederherstellen</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archivieren</span>
                    </>
                  )}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
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
            </div>
          </form>
        </div>
      )}

      {/* Task Create/Edit Modal (with Suite Users + Custom External Assignee + Protokoll Button) */}
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
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                {editingTask ? 'Aufgabe bearbeiten' : 'Neue Projektaufgabe'}
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                {editingTask && (
                  <button
                    type="button"
                    onClick={() => {
                      setProtocolDraftText('');
                      setProtocolTarget({ scope: 'task', taskId: editingTask.id });
                    }}
                    className="px-2.5 py-1 rounded-xl border border-[#E5E3DC] dark:border-[#343740] bg-[#F4F3EF] dark:bg-[#25272D] text-[11px] font-bold text-neutral-700 dark:text-neutral-200 flex items-center gap-1 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  >
                    <ClipboardList className="w-3.5 h-3.5" style={{ color: projectAccent }} />
                    <span>Protokoll</span>
                    {(editingTask.protocols || []).length > 0 && (
                      <span className="text-[10px] opacity-75 tabular-nums">
                        ({(editingTask.protocols || []).length})
                      </span>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
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

            {/* Multi-Assignees: Suite User Chips + Project External Members + Custom Names */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block">
                Zuständig (Mehrfachauswahl · Suite-Nutzer &amp; externe Personen)
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
                {(activeProject?.externalMembers || []).map((ext) => {
                  const isSelected = taskAssignees.includes(ext);
                  return (
                    <button
                      key={`ext_${ext}`}
                      type="button"
                      onClick={() =>
                        setTaskAssignees((prev) =>
                          isSelected ? prev.filter((x) => x !== ext) : [...prev, ext]
                        )
                      }
                      style={isSelected ? { backgroundColor: projectAccent } : undefined}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer border border-dashed ${
                        isSelected
                          ? 'text-white border-transparent shadow-2xs'
                          : 'bg-[#FAF9F5] dark:bg-[#25272D] border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {ext} {isSelected ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>

              {taskAssignees.filter(
                (a) =>
                  !allUsers.some((u) => u.displayName === a) &&
                  !(activeProject?.externalMembers || []).includes(a)
              ).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {taskAssignees
                    .filter(
                      (a) =>
                        !allUsers.some((u) => u.displayName === a) &&
                        !(activeProject?.externalMembers || []).includes(a)
                    )
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

            {(activeProject?.milestones || []).length > 0 && (
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Meilenstein (optional)
                </label>
                <select
                  value={taskMilestoneId}
                  onChange={(e) => setTaskMilestoneId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden cursor-pointer"
                >
                  <option value="">Kein Meilenstein</option>
                  {(activeProject?.milestones || []).map((ms) => (
                    <option key={ms.id} value={ms.id}>
                      {ms.title} (bis {ms.targetDate})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Startdatum (optional)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={taskStartDate}
                    onChange={(e) => setTaskStartDate(e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                  {taskStartDate && (
                    <button
                      type="button"
                      onClick={() => setTaskStartDate('')}
                      className="p-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] text-neutral-500 hover:text-red-500 cursor-pointer"
                      title="Datum leeren"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Fälligkeitsdatum (optional)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                  {taskDueDate && (
                    <button
                      type="button"
                      onClick={() => setTaskDueDate('')}
                      className="p-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] text-neutral-500 hover:text-red-500 cursor-pointer"
                      title="Datum leeren"
                    >
                      ×
                    </button>
                  )}
                </div>
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

      {/* Milestones CRUD Modal */}
      {milestonesModalOpen && activeProject && (
        <div
          onClick={() => setMilestonesModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-10 lg:pt-4 pb-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-4 max-h-[84dvh] flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Milestone className="w-4 h-4" style={{ color: projectAccent }} />
                <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                  Meilensteine für „{activeProject.title}“
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMilestonesModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMilestone} className="p-3 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] space-y-2 shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Meilenstein-Titel (z.B. Richtfest)"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
                <input
                  type="date"
                  required
                  value={msTargetDate}
                  onChange={(e) => setMsTargetDate(e.target.value)}
                  className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Beschreibung (optional)"
                  value={msDesc}
                  onChange={(e) => setMsDesc(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 rounded-xl bg-white dark:bg-[#1B1D21] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
                <button
                  type="submit"
                  style={{ backgroundColor: projectAccent }}
                  className="px-3.5 py-2 rounded-xl text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  {editingMilestoneId ? 'Aktualisieren' : '+ Hinzufügen'}
                </button>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {(activeProject.milestones || []).length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-6">
                  Noch keine Meilensteine definiert.
                </p>
              ) : (
                (activeProject.milestones || [])
                  .slice()
                  .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
                  .map((ms) => {
                    const diff = daysUntilIso(ms.targetDate);
                    const isOverdue = !ms.completed && diff < 0;
                    const isWarning = !ms.completed && diff >= 0 && diff <= 3;
                    return (
                      <div
                        key={ms.id}
                        className="p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#23252A] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleMilestoneDone(ms.id)}
                            style={ms.completed ? { backgroundColor: '#10B981', borderColor: '#10B981' } : undefined}
                            className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer ${
                              ms.completed ? 'text-white' : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-[#1B1D21]'
                            }`}
                          >
                            {ms.completed && <Check className="w-3 h-3" />}
                          </button>
                          <div className="min-w-0">
                            <div className={`text-xs font-bold truncate ${ms.completed ? 'line-through text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
                              {ms.title}
                            </div>
                            <div className="text-[11px] text-neutral-500 flex items-center gap-2 flex-wrap">
                              <span className="tabular-nums">Ziel: {ms.targetDate}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                                  ms.completed
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : isOverdue
                                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                    : isWarning
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                                }`}
                              >
                                {ms.completed
                                  ? 'Erreicht'
                                  : diff < 0
                                  ? `${Math.abs(diff)} Tage überfällig`
                                  : diff === 0
                                  ? 'Heute fällig'
                                  : `noch ${diff} Tage`}
                              </span>
                            </div>
                            {ms.description && (
                              <p className="text-[11px] text-neutral-400 truncate mt-0.5">{ms.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMilestoneId(ms.id);
                              setMsTitle(ms.title);
                              setMsTargetDate(ms.targetDate);
                              setMsDesc(ms.description || '');
                            }}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer"
                            title="Bearbeiten"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMilestone(ms.id)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
      {/* Top-Anchored Protokoll Overlay (Projekt- oder Aufgaben-Protokoll) */}
      {protocolTarget && activeProject && (() => {
        const targetTask =
          protocolTarget.scope === 'task'
            ? activeProject.tasks.find((t) => t.id === protocolTarget.taskId) || null
            : null;
        const entries =
          protocolTarget.scope === 'project'
            ? activeProject.protocols || []
            : targetTask?.protocols || [];
        return (
          <div
            onClick={() => setProtocolTarget(null)}
            className="fixed inset-0 z-[135] bg-black/55 backdrop-blur-xs flex items-start justify-center px-3 pt-10 pb-4 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-4 space-y-3 max-h-[68dvh] flex flex-col"
            >
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ClipboardList className="w-4 h-4 shrink-0" style={{ color: projectAccent }} />
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                      {protocolTarget.scope === 'project'
                        ? `Projekt-Protokoll · ${activeProject.title}`
                        : `Aufgaben-Protokoll · ${targetTask?.title || 'Aufgabe'}`}
                    </h3>
                    <span className="text-[10px] text-neutral-400 tabular-nums">
                      {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProtocolTarget(null)}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddProtocolEntry} className="space-y-2 shrink-0">
                <textarea
                  ref={protocolInputRef}
                  rows={2}
                  value={protocolDraftText}
                  onChange={(e) => setProtocolDraftText(e.target.value)}
                  placeholder="Protokoll-Notiz, Entscheidung oder Statusupdate eingeben..."
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!protocolDraftText.trim()}
                    style={{ backgroundColor: projectAccent }}
                    className="px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs disabled:opacity-45 cursor-pointer"
                  >
                    Eintrag speichern
                  </button>
                </div>
              </form>

              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {entries.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-5">
                    Noch keine Protokolleinträge vorhanden.
                  </p>
                ) : (
                  entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#23252A] border border-[#E5E3DC] dark:border-[#32353D] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
                        <span className="font-bold text-neutral-600 dark:text-neutral-300">
                          {entry.author} ·{' '}
                          <span className="tabular-nums font-normal">
                            {new Date(entry.createdAt).toLocaleString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteProtocolEntry(entry.id)}
                          className="p-1 text-neutral-400 hover:text-red-500 cursor-pointer"
                          title="Eintrag löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed">
                        {entry.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
