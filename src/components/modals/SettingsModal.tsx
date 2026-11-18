import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Download,
  Upload,
  Database,
  Check,
  AlertCircle,
  Lock,
  Edit2,
  Languages,
  Server,
  Copy,
  Layers,
  Utensils,
  DollarSign,
  BookOpen,
  BookMarked,
  Palette,
  RotateCcw,
  Users,
  SlidersHorizontal,
  Plus,
  Trash2,
  Share2,
  Bell,
  BellRing,
  Send,
  Camera,
  UserPlus,
  UserCheck,
  Shield,
  LayoutDashboard,
  ShoppingCart,
  Repeat,
  CalendarDays,
  Smartphone,
  Mail,
  Globe,
  Cpu,
  FolderKanban,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from 'lucide-react';
import {
  User,
  EnabledModules,
  SuiteModuleId,
  SuiteProfileSettings,
  NoteProfileId,
  CookbookSharingSettings,
  CookbookSettings,
  TaskNotificationSettings,
  DashboardSettings,
  DashboardWidgetId,
  MealPlanLibrary,
  MealPlanInvitation,
  MealSectionConfig,
  ChangelogResponse,
} from '../../types';
import { api } from '../../services/api';
import { useTranslation, Language } from '../../services/i18n';
import {
  OCHRE_COLOR_PRESETS,
  DEFAULT_PROFILE_SETTINGS,
  DEFAULT_MODULE_ORDER,
  DASHBOARD_WIDGET_CATALOG,
  DEFAULT_DASHBOARD_SETTINGS,
  MAX_DASHBOARD_WIDGETS,
  DEFAULT_MEAL_SECTIONS,
  DEFAULT_WEEKDAY_COLORS,
  DEFAULT_MEAL_UNITS,
} from '../../services/profileDefaults';
import {
  getNotificationPermission,
  querySyncedNotificationPermission,
  isEmbeddedInIframe,
  loadNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  sendPushNotification,
} from '../../services/notificationService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onRefreshVault: () => void;
  appTitle: string;
  onUpdateAppTitle: (newTitle: string) => void;
  activeNoteTitle?: string;
  activeNoteContent?: string;
  onUpdateUser?: (user: User) => void;
  onUpdateAllUsers?: (users: User[]) => void;
  onSwitchUser?: (user: User) => void;
  enabledModules: EnabledModules;
  onToggleModule: (moduleId: SuiteModuleId) => void;
  profileSettings: SuiteProfileSettings;
  onUpdateProfileSettings: (next: SuiteProfileSettings) => void;
  initialModuleContext?: SuiteModuleId;
  initialSettingsTab?: 'general' | 'modules' | 'moduleSettings' | 'users' | 'backup' | 'about';
  dashboardSettings: DashboardSettings;
  onUpdateDashboardSettings: (next: DashboardSettings) => void;
  onCookbookUpdated?: () => void;
  onCookbookSettingsChange?: (settings: CookbookSettings) => void;
}

const AVATAR_PRESETS = [
  'https://api.dicebear.com/9.x/thumbs/svg?seed=Felix&backgroundColor=c87d20',
  'https://api.dicebear.com/9.x/thumbs/svg?seed=Emma&backgroundColor=a66316',
  'https://api.dicebear.com/9.x/thumbs/svg?seed=Max&backgroundColor=d98b26',
  'https://api.dicebear.com/9.x/thumbs/svg?seed=Lena&backgroundColor=7b5e34',
];

async function resizeAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ungültige Bilddatei'));
      img.onload = () => {
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onRefreshVault,
  appTitle,
  onUpdateAppTitle,
  onUpdateUser,
  onUpdateAllUsers,
  onSwitchUser,
  enabledModules,
  onToggleModule,
  profileSettings,
  onUpdateProfileSettings,
  initialModuleContext = 'notes',
  initialSettingsTab,
  dashboardSettings,
  onUpdateDashboardSettings,
  onCookbookUpdated,
  onCookbookSettingsChange,
}) => {
  const { language, setLanguage, t } = useTranslation();
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'modules' | 'moduleSettings' | 'users' | 'backup' | 'about'>(
    initialSettingsTab || 'general'
  );
  const [selectedModuleSettingsTab, setSelectedModuleSettingsTab] = useState<SuiteModuleId>(initialModuleContext);
  const [editingProfileTab, setEditingProfileTab] = useState<NoteProfileId>('profile1');
  const mainTabBarRef = React.useRef<HTMLDivElement>(null);
  const modTabBarRef = React.useRef<HTMLDivElement>(null);
  const settingsSwipeStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  // App Name state
  const [nameInput, setNameInput] = useState(appTitle);
  const [titleSaved, setTitleSaved] = useState(false);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  // User Management & Avatar Editing state
  const [editingUsername, setEditingUsername] = useState<string>(currentUser.username);
  const [editDisplayName, setEditDisplayName] = useState<string>(currentUser.displayName);
  const [editDescription, setEditDescription] = useState<string>(currentUser.description || '');
  const [editRole, setEditRole] = useState<'admin' | 'user' | 'family'>(currentUser.role || 'user');
  const [userEditStatus, setUserEditStatus] = useState<string | null>(null);
  const [userSaving, setUserSaving] = useState(false);

  // New User Form state
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserHandle, setNewUserHandle] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user' | 'family'>('user');
  const [newUserDesc, setNewUserDesc] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserAvatarDataUrl, setNewUserAvatarDataUrl] = useState<string>('');
  const [newUserStatus, setNewUserStatus] = useState<string | null>(null);

  // Docker copy state
  const [copiedDocker, setCopiedDocker] = useState(false);

  // Essensplan module settings (library, cycle, sections, weekday colors, portions, sharing & food categories)
  const [cookbookCategories, setCookbookCategories] = useState<string[]>([]);
  const [cookbookSharing, setCookbookSharing] = useState<CookbookSharingSettings>({
    shareCatalog: false,
    catalogSharedWith: ['*'],
    shareCycleAndCalendar: false,
    cycleSharedWith: ['*'],
  });
  const [cookbookDefaultPortions, setCookbookDefaultPortions] = useState<number>(2);
  const [cookbookEnableShoppingList, setCookbookEnableShoppingList] = useState<boolean>(true);
  const [cookbookEnableCycle, setCookbookEnableCycle] = useState<boolean>(true);
  const [cookbookMealSections, setCookbookMealSections] = useState<MealSectionConfig[]>(DEFAULT_MEAL_SECTIONS);
  const [cookbookWeekdayColors, setCookbookWeekdayColors] = useState<Record<string, string>>(DEFAULT_WEEKDAY_COLORS);
  const [cookbookUnits, setCookbookUnits] = useState<string[]>(DEFAULT_MEAL_UNITS);
  const [newUnitInput, setNewUnitInput] = useState('');
  const [mealLibrary, setMealLibrary] = useState<MealPlanLibrary | null>(null);
  const [mealLibraries, setMealLibraries] = useState<MealPlanLibrary[]>([]);
  const [creatingNewMealLib, setCreatingNewMealLib] = useState<boolean>(false);
  const [confirmDeleteMealLibId, setConfirmDeleteMealLibId] = useState<string | null>(null);
  const [mealInvitations, setMealInvitations] = useState<MealPlanInvitation[]>([]);
  const [libNameInput, setLibNameInput] = useState<string>('');
  const [libVisibilityInput, setLibVisibilityInput] = useState<'private' | 'shared'>('private');
  const [libInvitedInput, setLibInvitedInput] = useState<string[]>([]);
  const [librarySaving, setLibrarySaving] = useState<boolean>(false);
  const [libraryStatus, setLibraryStatus] = useState<string | null>(null);
  const [newSectionInput, setNewSectionInput] = useState('');
  const [newCatInput, setNewCatInput] = useState('');
  const [cookbookLoaded, setCookbookLoaded] = useState(false);

  // Task Push Notifications state
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    getNotificationPermission()
  );
  const [notifSettings, setNotifSettings] = useState<TaskNotificationSettings>(() =>
    loadNotificationSettings(currentUser.username)
  );
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<ChangelogResponse | null>(null);
  const [loadingChangelog, setLoadingChangelog] = useState<boolean>(false);

  useEffect(() => {
    setNameInput(appTitle);
  }, [appTitle]);

  useEffect(() => {
    const target = allUsers.find((u) => u.username === editingUsername) || currentUser;
    setEditDisplayName(target.displayName);
    setEditDescription(target.description || '');
    setEditRole(target.role || 'user');
  }, [editingUsername, allUsers, currentUser]);

  useEffect(() => {
    if (isOpen) {
      setSelectedModuleSettingsTab(initialModuleContext || 'notes');
      if (initialSettingsTab) {
        setActiveSettingsTab(initialSettingsTab);
      }
      setNotifPerm(getNotificationPermission());
      querySyncedNotificationPermission().then(setNotifPerm).catch(() => {});
      setNotifSettings(loadNotificationSettings(currentUser.username));
      setLibraryStatus(null);
    }
  }, [isOpen, initialModuleContext, initialSettingsTab, currentUser.username]);

  // Sync notification permissions live via Permissions API and window focus
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let statusObj: PermissionStatus | null = null;
    const refreshPerm = () => {
      querySyncedNotificationPermission().then((p) => {
        if (!cancelled) setNotifPerm(p);
      });
    };
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((res) => {
          if (cancelled) return;
          statusObj = res;
          refreshPerm();
          res.onchange = refreshPerm;
        })
        .catch(() => {});
    }
    window.addEventListener('focus', refreshPerm);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshPerm);
      if (statusObj) statusObj.onchange = null;
    };
  }, [isOpen]);

  useEffect(() => {
    const activeBtn = mainTabBarRef.current?.querySelector('[data-active-tab="true"]') as HTMLElement | null;
    activeBtn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeSettingsTab, isOpen]);

  useEffect(() => {
    const activeBtn = modTabBarRef.current?.querySelector('[data-active-subtab="true"]') as HTMLElement | null;
    activeBtn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedModuleSettingsTab, activeSettingsTab, isOpen]);

  const loadChangelogData = async () => {
    setLoadingChangelog(true);
    try {
      const data = await api.fetchChangelog();
      setChangelog(data);
    } catch {
      // ignore transient errors
    } finally {
      setLoadingChangelog(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeSettingsTab === 'about' && !changelog && !loadingChangelog) {
      loadChangelogData();
    }
  }, [isOpen, activeSettingsTab]);

  const reloadCookbookSettings = () => {
    return api
      .fetchCookbook(currentUser.username)
      .then((data) => {
        setCookbookCategories(data.categories || []);
        if (data.sharing) setCookbookSharing(data.sharing);
        setCookbookDefaultPortions(data.settings?.defaultCyclePortions || 2);
        setCookbookEnableShoppingList(data.settings?.enableShoppingList !== false);
        setCookbookEnableCycle(data.settings?.enableCycle !== false);
        setCookbookMealSections(
          data.settings?.mealSections && data.settings.mealSections.length > 0
            ? data.settings.mealSections
            : DEFAULT_MEAL_SECTIONS
        );
        setCookbookWeekdayColors({
          ...DEFAULT_WEEKDAY_COLORS,
          ...(data.settings?.weekdayColors || {}),
        });
        setCookbookUnits(
          data.settings?.units && data.settings.units.length > 0
            ? data.settings.units
            : DEFAULT_MEAL_UNITS
        );
        setMealLibrary(data.library || null);
        setMealLibraries(data.libraries || (data.library ? [data.library] : []));
        setCreatingNewMealLib(false);
        setConfirmDeleteMealLibId(null);
        setMealInvitations(data.invitations || []);
        if (data.library) {
          setLibNameInput(data.library.name);
          setLibVisibilityInput(data.library.visibility);
          setLibInvitedInput(data.library.invitedUsers || []);
        } else {
          setLibNameInput(`Essensplan von ${currentUser.displayName}`);
          setLibVisibilityInput('private');
          setLibInvitedInput([]);
        }
        setCookbookLoaded(true);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api
      .fetchCookbook(currentUser.username)
      .then((data) => {
        if (cancelled) return;
        setCookbookCategories(data.categories || []);
        if (data.sharing) setCookbookSharing(data.sharing);
        setCookbookDefaultPortions(data.settings?.defaultCyclePortions || 2);
        setCookbookEnableShoppingList(data.settings?.enableShoppingList !== false);
        setCookbookEnableCycle(data.settings?.enableCycle !== false);
        setCookbookMealSections(
          data.settings?.mealSections && data.settings.mealSections.length > 0
            ? data.settings.mealSections
            : DEFAULT_MEAL_SECTIONS
        );
        setCookbookWeekdayColors({
          ...DEFAULT_WEEKDAY_COLORS,
          ...(data.settings?.weekdayColors || {}),
        });
        setCookbookUnits(
          data.settings?.units && data.settings.units.length > 0
            ? data.settings.units
            : DEFAULT_MEAL_UNITS
        );
        setMealLibrary(data.library || null);
        setMealLibraries(data.libraries || (data.library ? [data.library] : []));
        setCreatingNewMealLib(false);
        setConfirmDeleteMealLibId(null);
        setMealInvitations(data.invitations || []);
        if (data.library) {
          setLibNameInput(data.library.name);
          setLibVisibilityInput(data.library.visibility);
          setLibInvitedInput(data.library.invitedUsers || []);
        } else {
          setLibNameInput(`Essensplan von ${currentUser.displayName}`);
          setLibVisibilityInput('private');
          setLibInvitedInput([]);
        }
        setCookbookLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser.username, currentUser.displayName]);

  if (!isOpen) return null;

  const handleSaveAppTitle = async () => {
    if (!nameInput.trim()) return;
    await api.saveAppConfig(nameInput.trim());
    onUpdateAppTitle(nameInput.trim());
    setTitleSaved(true);
    setTimeout(() => setTitleSaved(false), 2000);
  };

  const handleSetPassword = async () => {
    try {
      const res = await api.setPassword(currentUser.username, passwordInput);
      const updatedUser: User = res.user || {
        ...currentUser,
        hasPassword: !!passwordInput.trim(),
      };
      if (onUpdateUser) {
        onUpdateUser(updatedUser);
      }
      setPasswordStatus(passwordInput.trim() ? t.passwordSaved : t.passwordRemoved);
      setPasswordInput('');
      onRefreshVault();
      setTimeout(() => setPasswordStatus(null), 3500);
    } catch (e: any) {
      setPasswordStatus(`Fehler: ${e.message}`);
    }
  };

  const handleDownloadBackup = async () => {
    setExportLoading(true);
    try {
      const activeProfId = profileSettings.activeProfileId;
      const blob = await api.exportBackup(currentUser.username, activeProfId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appTitle.toLowerCase().replace(/\s+/g, '_')}_backup_${currentUser.username}_${activeProfId}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreLoading(true);
    setRestoreStatus(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const result = await api.restoreBackup(currentUser.username, json, profileSettings.activeProfileId);
        setRestoreStatus(`Erfolg: ${result.restoredCount} Notizen erfolgreich wiederhergestellt!`);
        onRefreshVault();
      } catch (err: any) {
        setRestoreStatus(`Fehler: ${err.message || 'Ungültige Backup-Datei'}`);
      } finally {
        setRestoreLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const activeProfile = profileSettings[profileSettings.activeProfileId] || profileSettings.profile1;
  const activeColors: Record<SuiteModuleId, string> = {
    dashboard: profileSettings.profile1.colors.dashboard || '#A67C21',
    notes: activeProfile.colors.notes,
    wiki: profileSettings.profile1.colors.wiki,
    recipes: profileSettings.profile1.colors.recipes,
    finance: profileSettings.profile1.colors.finance,
    smarthome: profileSettings.profile1.colors.smarthome || '#78716C',
    projects: profileSettings.profile1.colors.projects || '#8E6126',
  };
  const editedProfile = profileSettings[editingProfileTab] || profileSettings.profile1;

  const updateEditedProfileName = (name: string) => {
    onUpdateProfileSettings({
      ...profileSettings,
      [editingProfileTab]: {
        ...editedProfile,
        name,
      },
    });
  };

  const updateNoteProfileColor = (hex: string) => {
    onUpdateProfileSettings({
      ...profileSettings,
      [editingProfileTab]: {
        ...editedProfile,
        colors: {
          ...editedProfile.colors,
          notes: hex,
        },
      },
    });
  };

  const updateSuiteModuleColor = (
    mod: 'dashboard' | 'wiki' | 'recipes' | 'finance' | 'smarthome' | 'projects',
    hex: string
  ) => {
    onUpdateProfileSettings({
      ...profileSettings,
      profile1: {
        ...profileSettings.profile1,
        colors: {
          ...profileSettings.profile1.colors,
          [mod]: hex,
        },
      },
      profile2: {
        ...profileSettings.profile2,
        colors: {
          ...profileSettings.profile2.colors,
          [mod]: hex,
        },
      },
    });
  };

  const resetModuleColorsToOchre = (mod: SuiteModuleId) => {
    if (mod === 'notes') {
      updateNoteProfileColor(DEFAULT_PROFILE_SETTINGS[editingProfileTab].colors.notes);
    } else {
      updateSuiteModuleColor(mod, DEFAULT_PROFILE_SETTINGS.profile1.colors[mod] || '#A67C21');
    }
  };

  const saveCookbookChanges = async (partial: {
    categories?: string[];
    sharing?: CookbookSharingSettings;
    settings?: Partial<CookbookSettings>;
  }) => {
    if (partial.categories !== undefined) setCookbookCategories(partial.categories);
    if (partial.sharing !== undefined) setCookbookSharing(partial.sharing);
    if (partial.settings !== undefined) {
      if (partial.settings.defaultCyclePortions !== undefined) {
        setCookbookDefaultPortions(partial.settings.defaultCyclePortions);
      }
      if (partial.settings.enableShoppingList !== undefined) {
        setCookbookEnableShoppingList(partial.settings.enableShoppingList);
      }
      if (partial.settings.enableCycle !== undefined) {
        setCookbookEnableCycle(partial.settings.enableCycle);
      }
      if (partial.settings.mealSections !== undefined) {
        setCookbookMealSections(partial.settings.mealSections);
      }
      if (partial.settings.weekdayColors !== undefined) {
        setCookbookWeekdayColors(partial.settings.weekdayColors);
      }
      if (partial.settings.units !== undefined) {
        setCookbookUnits(partial.settings.units);
      }
      if (onCookbookSettingsChange) {
        onCookbookSettingsChange({
          defaultCyclePortions: partial.settings.defaultCyclePortions ?? cookbookDefaultPortions,
          enableShoppingList: partial.settings.enableShoppingList ?? cookbookEnableShoppingList,
          enableCycle: partial.settings.enableCycle ?? cookbookEnableCycle,
          mealSections: partial.settings.mealSections ?? cookbookMealSections,
          weekdayColors: partial.settings.weekdayColors ?? cookbookWeekdayColors,
          units: partial.settings.units ?? cookbookUnits,
        });
      }
    }
    await api.saveCookbook(currentUser.username, partial);
    if (onCookbookUpdated) onCookbookUpdated();
  };

  const otherUsers = allUsers.filter((u) => u.username !== currentUser.username);

  const toggleRecipient = (field: 'catalogSharedWith' | 'cycleSharedWith', targetUsername: string) => {
    const list = cookbookSharing[field];
    let next: string[];
    if (list.includes('*')) next = [targetUsername];
    else if (list.includes(targetUsername)) next = list.filter((u) => u !== targetUsername);
    else next = [...list, targetUsername];
    saveCookbookChanges({ sharing: { ...cookbookSharing, [field]: next } });
  };

  const renderColorPickerBlock = (
    currentHex: string,
    onSelect: (hex: string) => void,
    onReset: () => void,
    label: string
  ) => (
    <div className="p-3 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5" style={{ color: currentHex }} />
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">{label}</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Ocker-Standard</span>
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {OCHRE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => onSelect(preset.hex)}
            title={preset.name}
            className={`w-5.5 h-5.5 rounded-full border transition-transform cursor-pointer hover:scale-110 ${
              currentHex.toLowerCase() === preset.hex.toLowerCase()
                ? 'ring-2 ring-offset-1 ring-neutral-800 dark:ring-white scale-110'
                : 'border-black/15'
            }`}
            style={{ backgroundColor: preset.hex }}
          />
        ))}
        <label
          className="w-7 h-5.5 rounded-md border border-[#E5E3DC] dark:border-neutral-700 overflow-hidden cursor-pointer flex items-center justify-center ml-1"
          title="Eigene Farbe wählen"
        >
          <input
            type="color"
            value={currentHex}
            onChange={(e) => onSelect(e.target.value)}
            className="w-9 h-9 -m-1 cursor-pointer border-0 p-0 bg-transparent"
          />
        </label>
      </div>
    </div>
  );

  const editedTargetUser = allUsers.find((u) => u.username === editingUsername) || currentUser;

  const syncUsersList = async (updatedSingle?: User) => {
    if (updatedSingle && updatedSingle.username === currentUser.username && onUpdateUser) {
      onUpdateUser(updatedSingle);
    }
    try {
      const fresh = await api.fetchUsers();
      if (onUpdateAllUsers) onUpdateAllUsers(fresh);
      return fresh;
    } catch {
      return allUsers;
    }
  };

  const handleSaveUserProfile = async () => {
    if (!editDisplayName.trim()) return;
    setUserSaving(true);
    setUserEditStatus(null);
    try {
      const updated = await api.updateUser(editedTargetUser.username, {
        displayName: editDisplayName.trim(),
        description: editDescription.trim(),
        role: editRole,
      });
      await syncUsersList(updated);
      setUserEditStatus('Profil gespeichert.');
      setTimeout(() => setUserEditStatus(null), 3000);
    } catch (e: any) {
      setUserEditStatus(`Fehler: ${e.message}`);
    } finally {
      setUserSaving(false);
    }
  };

  const handleAvatarUploadForEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUserSaving(true);
    setUserEditStatus(null);
    try {
      const dataUrl = await resizeAvatarFile(file);
      const updated = await api.updateUser(editedTargetUser.username, { avatarDataUrl: dataUrl });
      await syncUsersList(updated);
      setUserEditStatus('Profilbild aktualisiert!');
      setTimeout(() => setUserEditStatus(null), 3000);
    } catch (err: any) {
      setUserEditStatus(`Fehler: ${err.message}`);
    } finally {
      setUserSaving(false);
      e.target.value = '';
    }
  };

  const handleSelectPresetAvatar = async (url: string) => {
    setUserSaving(true);
    setUserEditStatus(null);
    try {
      const updated = await api.updateUser(editedTargetUser.username, { avatarUrl: url });
      await syncUsersList(updated);
      setUserEditStatus('Profilbild übernommen.');
      setTimeout(() => setUserEditStatus(null), 2500);
    } catch (err: any) {
      setUserEditStatus(`Fehler: ${err.message}`);
    } finally {
      setUserSaving(false);
    }
  };

  const handleCreateNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserDisplayName.trim() && !newUserHandle.trim()) return;
    setUserSaving(true);
    setNewUserStatus(null);
    try {
      const created = await api.createUser({
        username: (newUserHandle || newUserDisplayName).toLowerCase().trim(),
        displayName: (newUserDisplayName || newUserHandle).trim(),
        role: newUserRole,
        description: newUserDesc.trim() || undefined,
        password: newUserPassword.trim() || undefined,
        avatarDataUrl: newUserAvatarDataUrl || undefined,
      });
      await syncUsersList();
      setEditingUsername(created.username);
      setNewUserDisplayName('');
      setNewUserHandle('');
      setNewUserDesc('');
      setNewUserPassword('');
      setNewUserAvatarDataUrl('');
      setShowNewUserForm(false);
      setUserEditStatus(`Benutzer „${created.displayName}“ (@${created.username}) wurde erstellt.`);
      setTimeout(() => setUserEditStatus(null), 4000);
    } catch (err: any) {
      setNewUserStatus(`Fehler: ${err.message}`);
    } finally {
      setUserSaving(false);
    }
  };

  const handleDeleteUser = async (target: User) => {
    if (allUsers.length <= 1) return;
    setUserSaving(true);
    setUserEditStatus(null);
    try {
      await api.deleteUser(target.username);
      const fresh = await syncUsersList();
      if (editingUsername === target.username && fresh.length > 0) {
        setEditingUsername(fresh[0].username);
      }
      if (target.username === currentUser.username && fresh.length > 0 && onSwitchUser) {
        onSwitchUser(fresh[0]);
      }
      setUserEditStatus(`Benutzer @${target.username} entfernt.`);
    } catch (err: any) {
      setUserEditStatus(`Fehler: ${err.message}`);
    } finally {
      setUserSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-start justify-center px-2.5 pt-16 pb-3 sm:px-4 sm:pt-16 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col max-h-[calc(100dvh-5rem)] sm:max-h-[82dvh] animate-in slide-in-from-top-3 duration-200"
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Settings className="w-4 h-4 text-[var(--ochre-accent)] shrink-0" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              Einstellungen &amp; Suite-Verwaltung
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer shrink-0"
            aria-label="Einstellungen schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5 Tabs with Small Icons: Allgemein | Module | Modul-Einstellungen | Benutzer | Backup & Docker */}
        <div
          ref={mainTabBarRef}
          className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#1A1C1F] overflow-x-auto no-scrollbar shrink-0 touch-pan-x overscroll-x-contain snap-x"
        >
          <button
            data-active-tab={activeSettingsTab === 'general' ? 'true' : undefined}
            onClick={() => setActiveSettingsTab('general')}
            className={`snap-center flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'general'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Allgemein</span>
          </button>

          <button
            data-active-tab={activeSettingsTab === 'modules' ? 'true' : undefined}
            onClick={() => setActiveSettingsTab('modules')}
            className={`snap-center flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'modules'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Module</span>
          </button>

          <button
            data-active-tab={activeSettingsTab === 'moduleSettings' ? 'true' : undefined}
            onClick={() => setActiveSettingsTab('moduleSettings')}
            className={`snap-center flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'moduleSettings'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Modul-Einstellungen</span>
          </button>

          <button
            data-active-tab={activeSettingsTab === 'users' ? 'true' : undefined}
            onClick={() => setActiveSettingsTab('users')}
            className={`snap-center flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'users'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Benutzer</span>
          </button>

          <button
            data-active-tab={activeSettingsTab === 'backup' ? 'true' : undefined}
            onClick={() => setActiveSettingsTab('backup')}
            className={`snap-center flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'backup'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup &amp; Docker</span>
          </button>

          <button
            data-active-tab={activeSettingsTab === 'about' ? 'true' : undefined}
            onClick={() => setActiveSettingsTab('about')}
            className={`snap-center flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'about'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Über / Updates</span>
          </button>
        </div>

        {/* Tab Content (supports horizontal swipe left/right between tabs on mobile) */}
        <div
          onTouchStart={(e) => {
            const target = e.target as HTMLElement | null;
            if (
              target?.closest('input') ||
              target?.closest('textarea') ||
              target?.closest('select') ||
              target?.closest('.overflow-x-auto')
            ) {
              settingsSwipeStartRef.current = null;
              return;
            }
            settingsSwipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            if (!settingsSwipeStartRef.current) return;
            const dx = e.changedTouches[0].clientX - settingsSwipeStartRef.current.x;
            const dy = e.changedTouches[0].clientY - settingsSwipeStartRef.current.y;
            settingsSwipeStartRef.current = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
              const order: Array<'general' | 'modules' | 'moduleSettings' | 'users' | 'backup' | 'about'> = [
                'general',
                'modules',
                'moduleSettings',
                'users',
                'backup',
                'about',
              ];
              const idx = order.indexOf(activeSettingsTab);
              if (dx < 0 && idx < order.length - 1) setActiveSettingsTab(order[idx + 1]);
              else if (dx > 0 && idx > 0) setActiveSettingsTab(order[idx - 1]);
            }
          }}
          className="p-4 space-y-5 text-xs text-neutral-700 dark:text-neutral-300 overflow-y-auto"
        >
          {/* ============================================================== */}
          {/* TAB 1: ALLGEMEIN                                               */}
          {/* ============================================================== */}
          {activeSettingsTab === 'general' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <Edit2 className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                  <span>Anwendungs-Name &amp; Branding</span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Passe den angezeigten Namen (z. B. "Ochre Suite", "HomeNotes") an:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Name der App..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
                  />
                  <button
                    onClick={handleSaveAppTitle}
                    className="px-3 py-1.5 rounded-md bg-[var(--ochre-accent)] text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer"
                  >
                    {titleSaved ? <Check className="w-3.5 h-3.5" /> : null}
                    <span>{titleSaved ? 'Gespeichert' : 'Speichern'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                    <Lock className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                    <span>Passwort-Schutz für @{currentUser.username}</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      currentUser.hasPassword
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                    }`}
                  >
                    {currentUser.hasPassword ? 'Geschützt' : 'Kein Passwort'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Sichere diesen Benutzer mit einem Passwort oder PIN beim Startbildschirm ab:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={
                      currentUser.hasPassword
                        ? 'Neues Passwort (leer lassen zum Entfernen)...'
                        : 'Passwort festlegen...'
                    }
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
                  />
                  <button
                    onClick={handleSetPassword}
                    className="px-3 py-1.5 rounded-md bg-[var(--ochre-accent)] text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Festlegen
                  </button>
                </div>
                {passwordStatus && (
                  <span className="text-[11px] text-[var(--ochre-accent)] font-medium block">
                    {passwordStatus}
                  </span>
                )}
              </div>

              <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                    <Languages className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                    <span>{t.languageSelect}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-semibold">
                    {language === 'de' ? 'Deutsch' : 'English'}
                  </span>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden cursor-pointer shadow-2xs font-medium"
                >
                  <option value="de">Deutsch (Standard)</option>
                  <option value="en">English (International)</option>
                </select>
              </div>

              <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                    <Smartphone className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                    <span>Mobile Hauptleiste Position</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-semibold">
                    {(profileSettings.mobileBarPosition || 'top') === 'bottom' ? 'Unten' : 'Oben'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Lege fest, ob die obere Navigationsleiste auf Smartphone &amp; Tablet oben oder bequem erreichbar am unteren Bildschirmrand sitzt.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'top' as const, label: 'Oben (Standard)' },
                      { id: 'bottom' as const, label: 'Unten (Daumen-Zone)' },
                    ]
                  ).map((opt) => {
                    const isActive = (profileSettings.mobileBarPosition || 'top') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateProfileSettings({
                            ...profileSettings,
                            mobileBarPosition: opt.id,
                          })
                        }
                        style={
                          isActive
                            ? { backgroundColor: 'var(--ochre-accent)', borderColor: 'var(--ochre-accent)' }
                            : undefined
                        }
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'text-white shadow-xs'
                            : 'bg-white dark:bg-[#202225] border-[#E5E3DC] dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MODULE AN- & ABSCHALTEN                                */}
          {/* ============================================================== */}
          {activeSettingsTab === 'modules' && (() => {
            const activeModCount = (Object.values(enabledModules) as boolean[]).filter(Boolean).length;
            const rawModuleCards: Array<{
              id: SuiteModuleId;
              title: string;
              desc: string;
              color: string;
              icon: React.ComponentType<{ className?: string }>;
            }> = [
              {
                id: 'dashboard',
                title: 'Dashboard (Übersicht, Suche & Kacheln)',
                desc: 'Globale Suche über alle Module, Aufgaben, Einkaufs-Forecast & Finanzen',
                color: activeColors.dashboard,
                icon: LayoutDashboard,
              },
              {
                id: 'notes',
                title: 'Notes (Obsidian Markdown & Aufgaben)',
                desc: 'Wissens-Hub mit Privat/Business-Profilen, OpenGraph-Links & Wissensgraph',
                color: activeColors.notes,
                icon: BookOpen,
              },
              {
                id: 'wiki',
                title: 'Wiki (Open-Standard Markdown)',
                desc: 'Öffentliches & privates Wissen mit Bausteinen, Medien & A4-Export',
                color: activeColors.wiki,
                icon: BookMarked,
              },
              {
                id: 'recipes',
                title: 'Essensplan & Rezepte',
                desc: 'Eigener Rezeptkatalog, Kalender, Zyklus & gemeinsame Bibliotheken',
                color: activeColors.recipes,
                icon: Utensils,
              },
              {
                id: 'finance',
                title: 'Finanzen & Kreditoren',
                desc: 'Bank CSV-Upload, Kreditorenverwaltung, Barzahlungen & Statistiken',
                color: activeColors.finance,
                icon: DollarSign,
              },
              {
                id: 'projects',
                title: 'Projekte (Kanban & Timeline)',
                desc: 'Aufgabenboards, Gantt-Timeline, externe Zuständige & Notiz/Wiki-Links',
                color: activeColors.projects,
                icon: FolderKanban,
              },
              {
                id: 'smarthome',
                title: 'Smarthome Viewer (MQTT & Sensoren)',
                desc: 'Echtzeit MQTT-Streams, Broker-Erkennung, HTTP/DB-Quellen & Admin-Vorlagen',
                color: activeColors.smarthome,
                icon: Cpu,
              },
            ];

            const cardMap = new Map(rawModuleCards.map((c) => [c.id, c]));
            const savedOrder =
              profileSettings.moduleOrder && profileSettings.moduleOrder.length > 0
                ? profileSettings.moduleOrder
                : DEFAULT_MODULE_ORDER;
            const currentOrder: SuiteModuleId[] = [
              ...savedOrder.filter((id, idx) => cardMap.has(id) && savedOrder.indexOf(id) === idx),
              ...DEFAULT_MODULE_ORDER.filter((id) => !savedOrder.includes(id)),
            ];
            const moduleCards = currentOrder
              .map((id) => cardMap.get(id))
              .filter((c): c is NonNullable<typeof c> => Boolean(c));

            const isDefaultOrder =
              currentOrder.length === DEFAULT_MODULE_ORDER.length &&
              currentOrder.every((id, idx) => id === DEFAULT_MODULE_ORDER[idx]);

            const moveModule = (index: number, delta: -1 | 1) => {
              const targetIdx = index + delta;
              if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
              const nextOrder = [...currentOrder];
              const [moved] = nextOrder.splice(index, 1);
              nextOrder.splice(targetIdx, 0, moved);
              onUpdateProfileSettings({
                ...profileSettings,
                moduleOrder: nextOrder,
              });
            };

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      Module an- &amp; abschalten sowie sortieren
                    </h3>
                    <p className="text-[11px] text-neutral-500">
                      Reihenfolge gilt direkt im Modul-Menü (mindestens 1 Modul bleibt aktiv).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isDefaultOrder && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateProfileSettings({
                            ...profileSettings,
                            moduleOrder: [...DEFAULT_MODULE_ORDER],
                          })
                        }
                        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300 hover:border-[var(--ochre-accent)] cursor-pointer"
                        title="Standard-Reihenfolge wiederherstellen"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reihenfolge zurücksetzen</span>
                      </button>
                    )}
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-600 dark:text-neutral-300 tabular-nums">
                      {activeModCount} / {moduleCards.length} aktiv
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {moduleCards.map((mod, idx) => {
                    const Icon = mod.icon;
                    const isEnabled = !!enabledModules[mod.id];
                    const isLastActive = isEnabled && activeModCount <= 1;
                    return (
                      <div
                        key={mod.id}
                        className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            style={{ backgroundColor: mod.color }}
                            className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs"
                          >
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                              {mod.title}
                            </span>
                            <span className="text-[11px] text-neutral-500 block leading-snug">
                              {mod.desc}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center gap-0.5 bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] rounded-lg p-0.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveModule(idx, -1)}
                              className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                              title="Nach oben"
                              aria-label={`${mod.title} nach oben`}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === moduleCards.length - 1}
                              onClick={() => moveModule(idx, 1)}
                              className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                              title="Nach unten"
                              aria-label={`${mod.title} nach unten`}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isLastActive && (
                            <span className="text-[10px] text-neutral-400 font-semibold hidden sm:inline">
                              Mind. 1 Modul
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={isLastActive}
                            onClick={() => onToggleModule(mod.id)}
                            style={isEnabled ? { backgroundColor: mod.color } : undefined}
                            title={
                              isLastActive
                                ? 'Mindestens ein Modul muss aktiv bleiben'
                                : isEnabled
                                ? 'Modul deaktivieren'
                                : 'Modul aktivieren'
                            }
                            className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                              isLastActive ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'
                            } ${isEnabled ? 'justify-end' : 'bg-neutral-300 dark:bg-neutral-700 justify-start'}`}
                          >
                            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveSettingsTab('moduleSettings')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ochre-accent)] hover:underline cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Zu den Modul-Einstellungen wechseln →</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ============================================================== */}
          {/* TAB 3: MODUL-EINSTELLUNGEN (Per-Module Organized Settings)     */}
          {/* ============================================================== */}
          {activeSettingsTab === 'moduleSettings' && (
            <div className="space-y-4">
              {/* Sub-navigation per module (skalierbar horizontal swipebar) */}
              <div
                ref={modTabBarRef}
                className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F4F3EF] dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto no-scrollbar touch-pan-x overscroll-x-contain snap-x"
              >
                {(
                  [
                    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: activeColors.dashboard },
                    { id: 'notes', label: 'Notes', icon: BookOpen, color: activeColors.notes },
                    { id: 'wiki', label: 'Wiki', icon: BookMarked, color: activeColors.wiki },
                    { id: 'recipes', label: 'Essensplan', icon: Utensils, color: activeColors.recipes },
                    { id: 'finance', label: 'Finanzen', icon: DollarSign, color: activeColors.finance },
                    { id: 'projects', label: 'Projekte', icon: FolderKanban, color: activeColors.projects },
                    { id: 'smarthome', label: 'Smarthome', icon: Cpu, color: activeColors.smarthome },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const isSelected = selectedModuleSettingsTab === item.id;
                  return (
                    <button
                      key={item.id}
                      data-active-subtab={isSelected ? 'true' : undefined}
                      type="button"
                      onClick={() => setSelectedModuleSettingsTab(item.id)}
                      style={isSelected ? { backgroundColor: item.color } : undefined}
                      className={`snap-center shrink-0 min-w-[88px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'text-white shadow-xs'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* --- MODULE: DASHBOARD --- */}
              {selectedModuleSettingsTab === 'dashboard' && (
                <div className="space-y-4">
                  {/* Counter & Max Limit Banner */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                        <LayoutDashboard className="w-4 h-4" style={{ color: activeColors.dashboard }} />
                        <span>Dashboard-Kacheln auswählen</span>
                      </div>
                      <span
                        style={{ color: activeColors.dashboard }}
                        className="text-xs font-extrabold tabular-nums"
                      >
                        {dashboardSettings.selectedWidgets.length} / {dashboardSettings.maxWidgets || MAX_DASHBOARD_WIDGETS} aktiv
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Wähle gezielt aus, welche Stats-Kacheln auf deinem Dashboard (Mobil als vertikaler Swipe-Feed, Desktop als Kachel-Grid) erscheinen. Das Maximal-Limit verhindert Überladung.
                    </p>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E5E3DC] dark:border-[#2F3136] flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                          Maximal-Limit (Total):
                        </span>
                        <div className="flex items-center gap-1 bg-white dark:bg-[#202225] p-0.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136]">
                          <button
                            type="button"
                            onClick={() => {
                              const nextMax = Math.max(2, (dashboardSettings.maxWidgets || MAX_DASHBOARD_WIDGETS) - 1);
                              onUpdateDashboardSettings({
                                maxWidgets: nextMax,
                                selectedWidgets: dashboardSettings.selectedWidgets.slice(0, nextMax),
                              });
                            }}
                            className="w-6 h-6 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 font-bold cursor-pointer"
                          >
                            −
                          </button>
                          <span className="px-2 font-bold text-xs tabular-nums">
                            {dashboardSettings.maxWidgets || MAX_DASHBOARD_WIDGETS}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const nextMax = Math.min(8, (dashboardSettings.maxWidgets || MAX_DASHBOARD_WIDGETS) + 1);
                              onUpdateDashboardSettings({
                                ...dashboardSettings,
                                maxWidgets: nextMax,
                              });
                            }}
                            className="w-6 h-6 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onUpdateDashboardSettings(DEFAULT_DASHBOARD_SETTINGS)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Standard-Auswahl</span>
                      </button>
                    </div>
                  </div>

                  {/* Widget Selection List */}
                  <div className="space-y-2">
                    {DASHBOARD_WIDGET_CATALOG.map((widget) => {
                      const isSelected = dashboardSettings.selectedWidgets.includes(widget.id);
                      const maxW = dashboardSettings.maxWidgets || MAX_DASHBOARD_WIDGETS;
                      const limitReached = dashboardSettings.selectedWidgets.length >= maxW;
                      const isBlocked = !isSelected && limitReached;
                      const modBadgeColor =
                        widget.module === 'notes'
                          ? activeColors.notes
                          : widget.module === 'recipes'
                          ? activeColors.recipes
                          : widget.module === 'wiki'
                          ? activeColors.wiki
                          : widget.module === 'finance'
                          ? activeColors.finance
                          : widget.module === 'smarthome'
                          ? activeColors.smarthome
                          : widget.module === 'projects'
                          ? activeColors.projects
                          : activeColors.dashboard;

                      return (
                        <div
                          key={widget.id}
                          className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-[#C87D20]/45 bg-[#FAF9F5] dark:bg-[#1C1E22]'
                              : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024]'
                          } ${isBlocked ? 'opacity-65' : ''}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: modBadgeColor }}
                              />
                              <span className="font-bold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                                {widget.title}
                              </span>
                            </div>
                            <span className="text-[11px] text-neutral-500 block mt-0.5 leading-snug">
                              {widget.description}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={isBlocked}
                            onClick={() => {
                              const current = dashboardSettings.selectedWidgets;
                              const nextWidgets: DashboardWidgetId[] = isSelected
                                ? current.filter((w) => w !== widget.id)
                                : current.length < maxW
                                ? [...current, widget.id]
                                : current;
                              onUpdateDashboardSettings({
                                ...dashboardSettings,
                                selectedWidgets: nextWidgets,
                              });
                            }}
                            style={isSelected ? { backgroundColor: activeColors.dashboard } : undefined}
                            className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${
                              isBlocked ? 'cursor-not-allowed' : 'cursor-pointer'
                            } ${
                              isSelected ? 'justify-end' : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                            }`}
                            title={
                              isBlocked
                                ? `Maximal ${maxW} Kacheln möglich — zuerst eine andere Kachel abschalten`
                                : isSelected
                                ? 'Kachel ausblenden'
                                : 'Kachel anzeigen'
                            }
                          >
                            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {renderColorPickerBlock(
                    activeColors.dashboard,
                    (hex) => updateSuiteModuleColor('dashboard', hex),
                    () => resetModuleColorsToOchre('dashboard'),
                    'Dashboard Akzentfarbe (Ocker-Palette)'
                  )}
                </div>
              )}

              {/* --- MODULE: NOTES --- */}
              {selectedModuleSettingsTab === 'notes' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                        Zweites Notiz-Profil aktivieren (Privat / Business)
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Zeigt den Profil-Slider nur im Notes-Modul an und trennt Profil_1 und Profil_2 sauber auf der Festplatte.
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const nextEnabled = !profileSettings.enableSecondProfile;
                        onUpdateProfileSettings({
                          ...profileSettings,
                          enableSecondProfile: nextEnabled,
                          activeProfileId: nextEnabled ? profileSettings.activeProfileId : 'profile1',
                        });
                        if (!nextEnabled) setEditingProfileTab('profile1');
                      }}
                      style={profileSettings.enableSecondProfile ? { backgroundColor: activeColors.notes } : undefined}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                        profileSettings.enableSecondProfile
                          ? 'justify-end'
                          : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 p-0.5 rounded-full bg-[#EFECE4] dark:bg-[#23252A]">
                        <button
                          type="button"
                          onClick={() => setEditingProfileTab('profile1')}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                            editingProfileTab === 'profile1'
                              ? 'bg-white dark:bg-[#2E3138] text-neutral-900 dark:text-white shadow-xs'
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          Profil 1 ({profileSettings.profile1.name})
                        </button>
                        {profileSettings.enableSecondProfile && (
                          <button
                            type="button"
                            onClick={() => setEditingProfileTab('profile2')}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                              editingProfileTab === 'profile2'
                                ? 'bg-white dark:bg-[#2E3138] text-neutral-900 dark:text-white shadow-xs'
                                : 'text-neutral-500 hover:text-neutral-800'
                            }`}
                          >
                            Profil 2 ({profileSettings.profile2.name})
                          </button>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-neutral-400">
                        Ordner: {editingProfileTab === 'profile1' ? 'Profil_1' : 'Profil_2'}
                      </span>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                        Profilname
                      </label>
                      <input
                        type="text"
                        value={editedProfile.name}
                        onChange={(e) => updateEditedProfileName(e.target.value)}
                        placeholder={editingProfileTab === 'profile1' ? 'z. B. Privat' : 'z. B. Business'}
                        className="w-full text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-900 dark:text-neutral-100 outline-hidden"
                      />
                    </div>

                    {renderColorPickerBlock(
                      editedProfile.colors.notes,
                      updateNoteProfileColor,
                      () => resetModuleColorsToOchre('notes'),
                      `Notes-Farbe für „${editedProfile.name}“`
                    )}
                  </div>

                  {/* Push Notifications for Tasks with Dates (Mobile & Desktop) */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-2xs"
                          style={{ backgroundColor: activeColors.notes }}
                        >
                          {notifSettings.enabled && notifPerm === 'granted' ? (
                            <BellRing className="w-4 h-4" />
                          ) : (
                            <Bell className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                            Aufgaben-Push-Benachrichtigungen (Mobile &amp; Desktop)
                          </span>
                          <span className="text-[11px] text-neutral-500 block">
                            Sendet Erinnerungen für Aufgaben mit Datum (<span className="font-mono">📅 YYYY-MM-DD</span>).
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!notifSettings.enabled || notifPerm !== 'granted') {
                            const perm = await requestNotificationPermission();
                            setNotifPerm(perm);
                            if (perm === 'granted') {
                              const next = { ...notifSettings, enabled: true };
                              setNotifSettings(next);
                              saveNotificationSettings(currentUser.username, next);
                              setNotifFeedback('Push-Benachrichtigungen aktiviert.');
                            } else {
                              setNotifFeedback(
                                perm === 'denied'
                                  ? 'Im Browser blockiert – bitte in den Website-Einstellungen erlauben.'
                                  : 'Berechtigung nicht erteilt.'
                              );
                            }
                          } else {
                            const next = { ...notifSettings, enabled: false };
                            setNotifSettings(next);
                            saveNotificationSettings(currentUser.username, next);
                            setNotifFeedback('Push-Benachrichtigungen deaktiviert.');
                          }
                        }}
                        style={
                          notifSettings.enabled && notifPerm === 'granted'
                            ? { backgroundColor: activeColors.notes }
                            : undefined
                        }
                        className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                          notifSettings.enabled && notifPerm === 'granted'
                            ? 'justify-end'
                            : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifSettings.notifyToday}
                            onChange={(e) => {
                              const next = { ...notifSettings, notifyToday: e.target.checked };
                              setNotifSettings(next);
                              saveNotificationSettings(currentUser.username, next);
                            }}
                            className="accent-[var(--ochre-accent)]"
                          />
                          <span>Heute fällige Aufgaben</span>
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifSettings.notifyOverdue}
                            onChange={(e) => {
                              const next = { ...notifSettings, notifyOverdue: e.target.checked };
                              setNotifSettings(next);
                              saveNotificationSettings(currentUser.username, next);
                            }}
                            className="accent-[var(--ochre-accent)]"
                          />
                          <span>Überfällige Aufgaben</span>
                        </label>
                      </div>

                      <label className="flex items-center gap-1.5">
                        <span className="text-neutral-500">Ab Uhrzeit:</span>
                        <input
                          type="time"
                          value={notifSettings.reminderTime}
                          onChange={(e) => {
                            const next = { ...notifSettings, reminderTime: e.target.value };
                            setNotifSettings(next);
                            saveNotificationSettings(currentUser.username, next);
                          }}
                          className="px-2 py-1 rounded bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] text-xs"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                        <span>Browser-Status:</span>
                        <strong className="text-neutral-800 dark:text-neutral-200">
                          {notifPerm === 'granted'
                            ? 'Erlaubt'
                            : notifPerm === 'denied'
                            ? 'Blockiert'
                            : notifPerm === 'unsupported'
                            ? 'Nicht unterstützt'
                            : 'Noch nicht angefragt'}
                        </strong>
                        <button
                          type="button"
                          onClick={() => {
                            querySyncedNotificationPermission().then((p) => {
                              setNotifPerm(p);
                              setNotifFeedback(`Browser-Status aktualisiert: ${p === 'granted' ? 'Erlaubt' : p}`);
                            });
                          }}
                          className="p-1 rounded hover:bg-neutral-200/70 dark:hover:bg-neutral-700/70 text-neutral-500 cursor-pointer"
                          title="Browser-Status neu prüfen"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </span>

                      <button
                        type="button"
                        onClick={async () => {
                          let perm = await querySyncedNotificationPermission();
                          setNotifPerm(perm);
                          if (perm === 'default') {
                            perm = await requestNotificationPermission();
                            setNotifPerm(perm);
                          }
                          if (perm !== 'granted') {
                            setNotifFeedback(
                              isEmbeddedInIframe()
                                ? 'Browser-Berechtigung fehlt oder iFrame blockiert – bitte App direkt / im Vollbild öffnen.'
                                : 'Bitte zuerst Browser-Benachrichtigungen erlauben.'
                            );
                            return;
                          }
                          const res = await sendPushNotification(
                            'Ochre Suite Test-Push',
                            'Mobile & Desktop Push-Erinnerungen funktionieren einwandfrei!'
                          );
                          setNotifFeedback(
                            res.ok
                              ? `Test-Push erfolgreich gesendet (${res.via === 'sw' ? 'Service Worker' : 'Browser'}).`
                              : res.reason || 'Test-Push konnte nicht zugestellt werden.'
                          );
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[var(--ochre-accent)] text-[11px] font-semibold cursor-pointer"
                      >
                        <Send className="w-3 h-3 text-[var(--ochre-accent)]" />
                        <span>Test-Push senden</span>
                      </button>
                    </div>

                    {isEmbeddedInIframe() && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Hinweis: In einer eingebetteten Vorschau (iFrame) unterdrücken manche Browser native Notifications – installiere die App als PWA oder öffne sie im eigenen Tab.
                      </p>
                    )}

                    {notifFeedback && (
                      <p className="text-[11px] text-[var(--ochre-accent)] font-medium">
                        {notifFeedback}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* --- MODULE: WIKI --- */}
              {selectedModuleSettingsTab === 'wiki' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-1">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <BookMarked className="w-4 h-4" style={{ color: activeColors.wiki }} />
                      <span>Open-Standard Wiki-Speicherung</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Öffentliche Wiki-Artikel (Standard) werden zentral in <span className="font-mono">Wiki/Public/</span> gespeichert, private Artikel in <span className="font-mono">Wiki/{currentUser.username}/</span> – offen im Markdown-Standard direkt neben den Notizen.
                    </p>
                  </div>

                  {renderColorPickerBlock(
                    activeColors.wiki,
                    (hex) => updateSuiteModuleColor('wiki', hex),
                    () => resetModuleColorsToOchre('wiki'),
                    'Wiki Akzentfarbe (Ocker-Palette)'
                  )}
                </div>
              )}

              {/* --- MODULE: ESSENSPLAN --- */}
              {selectedModuleSettingsTab === 'recipes' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-1">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <Utensils className="w-4 h-4" style={{ color: activeColors.recipes }} />
                      <span>Open-Standard Essensplan &amp; Medien</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Rezepte werden im offenen Markdown-Standard in <span className="font-mono">Cookbook/Rezepte/</span> und Gerichtsfotos je Rezept in <span className="font-mono">Cookbook/Media/</span> gespeichert.
                    </p>
                  </div>

                  {/* Pending Library Invitations */}
                  {mealInvitations.length > 0 && (
                    <div className="p-3.5 rounded-2xl border-2 border-[var(--ochre-accent)]/40 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                        <Mail className="w-4 h-4" style={{ color: activeColors.recipes }} />
                        <span>Einladungen zu Essensplan-Bibliotheken ({mealInvitations.length})</span>
                      </div>
                      <div className="space-y-2">
                        {mealInvitations.map((inv) => (
                          <div
                            key={inv.libraryId}
                            className="p-2.5 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 flex-wrap"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-xs block truncate">{inv.name}</span>
                              <span className="text-[11px] text-neutral-500">
                                Eingeladen von {inv.ownerDisplayName} (@{inv.ownerUsername})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={librarySaving}
                                onClick={async () => {
                                  setLibrarySaving(true);
                                  try {
                                    await api.declineMealLibrary(currentUser.username, inv.libraryId);
                                    await reloadCookbookSettings();
                                    onCookbookUpdated?.();
                                  } finally {
                                    setLibrarySaving(false);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] font-semibold hover:text-red-500 cursor-pointer"
                              >
                                Ablehnen
                              </button>
                              <button
                                type="button"
                                disabled={librarySaving}
                                onClick={async () => {
                                  setLibrarySaving(true);
                                  try {
                                    await api.joinMealLibrary(currentUser.username, inv.libraryId);
                                    await reloadCookbookSettings();
                                    onCookbookUpdated?.();
                                    setLibraryStatus(`Bibliothek „${inv.name}“ beigetreten.`);
                                  } finally {
                                    setLibrarySaving(false);
                                  }
                                }}
                                style={{ backgroundColor: activeColors.recipes }}
                                className="px-3 py-1 rounded-lg text-white text-[11px] font-bold cursor-pointer"
                              >
                                Beitreten
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Essensplan Library Management (Switch / Create / Delete / Private vs Shared / Invite) */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                        {mealLibrary?.visibility === 'shared' ? (
                          <Globe className="w-4 h-4" style={{ color: activeColors.recipes }} />
                        ) : (
                          <Lock className="w-4 h-4" style={{ color: activeColors.recipes }} />
                        )}
                        <span>
                          {creatingNewMealLib
                            ? 'Neue Essensplan-Bibliothek erstellen'
                            : mealLibrary
                            ? 'Essensplan-Bibliotheken'
                            : 'Essensplan-Bibliothek erstellen'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {mealLibrary && !creatingNewMealLib && (
                          <span
                            style={{ backgroundColor: `${activeColors.recipes}1A`, color: activeColors.recipes }}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          >
                            {mealLibrary.visibility === 'shared' ? 'Freigegeben' : 'Privat'}
                          </span>
                        )}
                        {mealLibrary && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!creatingNewMealLib) {
                                setCreatingNewMealLib(true);
                                setLibNameInput('');
                                setLibVisibilityInput('private');
                                setLibInvitedInput([]);
                                setLibraryStatus(null);
                              } else {
                                setCreatingNewMealLib(false);
                                setLibNameInput(mealLibrary.name);
                                setLibVisibilityInput(mealLibrary.visibility);
                                setLibInvitedInput(mealLibrary.invitedUsers || []);
                              }
                            }}
                            style={!creatingNewMealLib ? { color: activeColors.recipes, borderColor: `${activeColors.recipes}55` } : undefined}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#E5E3DC] dark:border-neutral-700 bg-white dark:bg-[#202225] cursor-pointer hover:opacity-90"
                          >
                            {creatingNewMealLib ? 'Abbrechen' : '+ Neue Bibliothek'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Multi-Library Switcher list */}
                    {mealLibraries.length > 0 && !creatingNewMealLib && (
                      <div className="space-y-1.5">
                        {mealLibraries.map((lib) => {
                          const isCurrent = mealLibrary?.id === lib.id;
                          const isOwner = lib.ownerUsername === currentUser.username;
                          const isConfirmDel = confirmDeleteMealLibId === lib.id;
                          return (
                            <div
                              key={lib.id}
                              style={isCurrent ? { borderColor: activeColors.recipes, backgroundColor: `${activeColors.recipes}0F` } : undefined}
                              className={`px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                                isCurrent
                                  ? 'border-2'
                                  : 'border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225]'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
                                    {lib.name}
                                  </span>
                                  {isCurrent && (
                                    <span
                                      style={{ backgroundColor: activeColors.recipes }}
                                      className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full shrink-0"
                                    >
                                      Aktiv
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-neutral-500 block truncate">
                                  {lib.visibility === 'shared' ? 'Freigegeben' : 'Privat'} · Eigentümer: {lib.ownerDisplayName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!isCurrent && (
                                  <button
                                    type="button"
                                    disabled={librarySaving}
                                    onClick={async () => {
                                      setLibrarySaving(true);
                                      setLibraryStatus(null);
                                      try {
                                        await api.selectMealLibrary(currentUser.username, lib.id);
                                        await reloadCookbookSettings();
                                        onCookbookUpdated?.();
                                        setLibraryStatus(`Bibliothek „${lib.name}“ aktiviert.`);
                                      } catch (err: any) {
                                        setLibraryStatus(`Fehler: ${err.message}`);
                                      } finally {
                                        setLibrarySaving(false);
                                      }
                                    }}
                                    style={{ backgroundColor: activeColors.recipes }}
                                    className="px-2.5 py-1 rounded-lg text-white text-[11px] font-bold cursor-pointer hover:opacity-90"
                                  >
                                    Auswählen
                                  </button>
                                )}
                                {isOwner ? (
                                  <button
                                    type="button"
                                    disabled={librarySaving}
                                    onClick={async () => {
                                      if (!isConfirmDel) {
                                        setConfirmDeleteMealLibId(lib.id);
                                        return;
                                      }
                                      setLibrarySaving(true);
                                      setLibraryStatus(null);
                                      try {
                                        await api.deleteMealLibrary(currentUser.username, lib.id);
                                        await reloadCookbookSettings();
                                        onCookbookUpdated?.();
                                        setLibraryStatus(`Bibliothek „${lib.name}“ gelöscht.`);
                                      } catch (err: any) {
                                        setLibraryStatus(`Fehler: ${err.message}`);
                                      } finally {
                                        setLibrarySaving(false);
                                      }
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                                      isConfirmDel
                                        ? 'bg-red-500 border-red-500 text-white'
                                        : 'border-[#E5E3DC] dark:border-neutral-700 text-neutral-500 hover:text-red-500 bg-white dark:bg-[#1E2024]'
                                    }`}
                                    title={isConfirmDel ? 'Klick bestätigen zum Löschen' : 'Bibliothek löschen'}
                                  >
                                    {isConfirmDel ? 'Löschen bestätigen' : 'Löschen'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={librarySaving}
                                    onClick={async () => {
                                      setLibrarySaving(true);
                                      try {
                                        await api.leaveMealLibrary(currentUser.username, lib.id);
                                        await reloadCookbookSettings();
                                        onCookbookUpdated?.();
                                        setLibraryStatus('Bibliothek verlassen.');
                                      } finally {
                                        setLibrarySaving(false);
                                      }
                                    }}
                                    className="text-[11px] font-semibold text-red-500 hover:underline cursor-pointer px-1.5"
                                  >
                                    Verlassen
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!mealLibrary && !creatingNewMealLib && (
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-neutral-500">
                          Für @{currentUser.username} ist noch keine Essensplan-Bibliothek angelegt. Erstelle eine private Bibliothek oder gib sie direkt für andere Benutzer frei.
                        </p>
                      </div>
                    )}

                    {(creatingNewMealLib || !mealLibrary || mealLibrary.ownerUsername === currentUser.username) && (
                      <div className="space-y-2.5 pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                              {creatingNewMealLib ? 'Name der neuen Bibliothek' : 'Name der aktiven Bibliothek'}
                            </label>
                            <input
                              type="text"
                              value={libNameInput}
                              onChange={(e) => setLibNameInput(e.target.value)}
                              placeholder="z. B. Familien-Essensplan"
                              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                              Sichtbarkeit
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(
                                [
                                  { id: 'private' as const, label: 'Privat' },
                                  { id: 'shared' as const, label: 'Freigegeben' },
                                ]
                              ).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setLibVisibilityInput(opt.id)}
                                  style={
                                    libVisibilityInput === opt.id
                                      ? { backgroundColor: activeColors.recipes, borderColor: activeColors.recipes }
                                      : undefined
                                  }
                                  className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                                    libVisibilityInput === opt.id
                                      ? 'text-white'
                                      : 'bg-white dark:bg-[#202225] border-[#E5E3DC] dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {libVisibilityInput === 'shared' && otherUsers.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-neutral-500 block">
                              Benutzer einladen:
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {otherUsers.map((u) => {
                                const alreadyMember = !creatingNewMealLib && mealLibrary?.members.includes(u.username);
                                const isInvited = libInvitedInput.includes(u.username);
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    disabled={!!alreadyMember}
                                    onClick={() =>
                                      setLibInvitedInput((prev) =>
                                        prev.includes(u.username)
                                          ? prev.filter((x) => x !== u.username)
                                          : [...prev, u.username]
                                      )
                                    }
                                    style={
                                      isInvited || alreadyMember
                                        ? { backgroundColor: activeColors.recipes, borderColor: activeColors.recipes }
                                        : undefined
                                    }
                                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                                      isInvited || alreadyMember
                                        ? 'text-white'
                                        : 'bg-white dark:bg-[#202225] border-[#E5E3DC] dark:border-neutral-700'
                                    }`}
                                  >
                                    {u.displayName} {alreadyMember ? '(Mitglied)' : isInvited ? '✓' : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          {libraryStatus ? (
                            <span className="text-[11px] font-semibold" style={{ color: activeColors.recipes }}>
                              {libraryStatus}
                            </span>
                          ) : (
                            <span />
                          )}
                          <button
                            type="button"
                            disabled={librarySaving || !libNameInput.trim()}
                            onClick={async () => {
                              setLibrarySaving(true);
                              setLibraryStatus(null);
                              try {
                                await api.createOrUpdateMealLibrary({
                                  username: currentUser.username,
                                  libraryId: creatingNewMealLib ? undefined : mealLibrary?.id,
                                  name: libNameInput.trim(),
                                  visibility: libVisibilityInput,
                                  invitedUsers: libVisibilityInput === 'shared' ? libInvitedInput : [],
                                  createNew: creatingNewMealLib,
                                });
                                await reloadCookbookSettings();
                                onCookbookUpdated?.();
                                setLibraryStatus(
                                  creatingNewMealLib
                                    ? 'Neue Bibliothek erstellt & aktiviert!'
                                    : mealLibrary
                                    ? 'Bibliothek aktualisiert.'
                                    : 'Bibliothek erstellt!'
                                );
                              } catch (err: any) {
                                setLibraryStatus(`Fehler: ${err.message}`);
                              } finally {
                                setLibrarySaving(false);
                              }
                            }}
                            style={{ backgroundColor: activeColors.recipes }}
                            className="px-3.5 py-1.5 rounded-lg text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                          >
                            {creatingNewMealLib
                              ? 'Neue Bibliothek anlegen'
                              : mealLibrary
                              ? 'Bibliothek speichern'
                              : 'Bibliothek erstellen'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Enable / Disable Essenszyklus */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-2xs"
                        style={{ backgroundColor: activeColors.recipes }}
                      >
                        <Repeat className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                          Wiederkehrenden Essenszyklus aktivieren
                        </span>
                        <span className="text-[11px] text-neutral-500 block">
                          Schaltet den Tab „Zyklus“ ein oder aus. Ohne Zyklus planst du direkt per Drag &amp; Drop im Kalender.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !cookbookEnableCycle;
                        saveCookbookChanges({ settings: { enableCycle: nextVal } });
                      }}
                      style={cookbookEnableCycle ? { backgroundColor: activeColors.recipes } : undefined}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                        cookbookEnableCycle
                          ? 'justify-end'
                          : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                    </button>
                  </div>

                  {/* Configurable Kalender & Zyklus Meal Sections (Mittag, Abend, Custom...) */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                          Tages-Abschnitte (Kalender &amp; Zyklus)
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          Erstelle oder benenne Abschnitte pro Tag (Standard: Mittag, Abend).
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveCookbookChanges({ settings: { mealSections: DEFAULT_MEAL_SECTIONS } })}
                        className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Standard</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {cookbookMealSections.map((sec) => (
                        <div
                          key={sec.id}
                          className="flex items-center gap-2 bg-white dark:bg-[#202225] p-1.5 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]"
                        >
                          <input
                            type="text"
                            value={sec.label}
                            onChange={(e) => {
                              const next = cookbookMealSections.map((s) =>
                                s.id === sec.id ? { ...s, label: e.target.value } : s
                              );
                              setCookbookMealSections(next);
                            }}
                            onBlur={() => {
                              const cleaned = cookbookMealSections.map((s) => ({
                                ...s,
                                label: s.label.trim() || 'Abschnitt',
                              }));
                              saveCookbookChanges({ settings: { mealSections: cleaned } });
                            }}
                            className="flex-1 text-xs px-2 py-1 rounded-lg bg-transparent outline-hidden font-semibold text-neutral-900 dark:text-neutral-100"
                          />
                          {cookbookMealSections.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = cookbookMealSections.filter((s) => s.id !== sec.id);
                                saveCookbookChanges({ settings: { mealSections: next } });
                              }}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
                              title="Abschnitt entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newSectionInput}
                        onChange={(e) => setNewSectionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newSectionInput.trim()) {
                            const label = newSectionInput.trim();
                            const id =
                              label
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '_')
                                .replace(/^_+|_+$/g, '') || `sec_${Date.now()}`;
                            const uniqueId = cookbookMealSections.some((s) => s.id === id)
                              ? `${id}_${Date.now().toString().slice(-4)}`
                              : id;
                            saveCookbookChanges({
                              settings: { mealSections: [...cookbookMealSections, { id: uniqueId, label }] },
                            });
                            setNewSectionInput('');
                          }
                        }}
                        placeholder="Neuer Abschnitt (z. B. Frühstück, Snack)..."
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const label = newSectionInput.trim();
                          if (!label) return;
                          const id =
                            label
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '_')
                              .replace(/^_+|_+$/g, '') || `sec_${Date.now()}`;
                          const uniqueId = cookbookMealSections.some((s) => s.id === id)
                            ? `${id}_${Date.now().toString().slice(-4)}`
                            : id;
                          saveCookbookChanges({
                            settings: { mealSections: [...cookbookMealSections, { id: uniqueId, label }] },
                          });
                          setNewSectionInput('');
                        }}
                        style={{ backgroundColor: activeColors.recipes }}
                        className="px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Abschnitt</span>
                      </button>
                    </div>
                  </div>

                  {/* Weekday Colors (Mo - So) */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                        <CalendarDays className="w-4 h-4" style={{ color: activeColors.recipes }} />
                        <span>Wochentags-Farben im Essenskalender</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveCookbookChanges({ settings: { weekdayColors: DEFAULT_WEEKDAY_COLORS } })}
                        className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Zurücksetzen</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {(
                        [
                          { key: '1', label: 'Mo' },
                          { key: '2', label: 'Di' },
                          { key: '3', label: 'Mi' },
                          { key: '4', label: 'Do' },
                          { key: '5', label: 'Fr' },
                          { key: '6', label: 'Sa' },
                          { key: '0', label: 'So' },
                        ] as const
                      ).map((wd) => {
                        const hex = cookbookWeekdayColors[wd.key] || DEFAULT_WEEKDAY_COLORS[wd.key];
                        return (
                          <label
                            key={wd.key}
                            className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] cursor-pointer hover:border-neutral-400"
                          >
                            <span className="text-[11px] font-bold">{wd.label}</span>
                            <input
                              type="color"
                              value={hex}
                              onChange={(e) => {
                                const nextColors = { ...cookbookWeekdayColors, [wd.key]: e.target.value };
                                setCookbookWeekdayColors(nextColors);
                                saveCookbookChanges({ settings: { weekdayColors: nextColors } });
                              }}
                              className="w-7 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Configurable Ingredient Units (Gramm, KG, Liter, Päckchen, ...) */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                          Mengen-Einheiten für Zutaten
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          Stehen beim Anlegen von Gerichten &amp; Zutaten zur schnellen Auswahl bereit (z. B. Gramm, KG, Liter, Päckchen).
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveCookbookChanges({ settings: { units: DEFAULT_MEAL_UNITS } })}
                        className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Standard</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {cookbookUnits.map((u) => (
                        <span
                          key={u}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                        >
                          <span>{u}</span>
                          {cookbookUnits.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = cookbookUnits.filter((x) => x !== u);
                                saveCookbookChanges({ settings: { units: next } });
                              }}
                              className="text-neutral-400 hover:text-red-500 cursor-pointer"
                              title="Einheit entfernen"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newUnitInput}
                        onChange={(e) => setNewUnitInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newUnitInput.trim()) {
                            e.preventDefault();
                            const clean = newUnitInput.trim();
                            if (!cookbookUnits.some((u) => u.toLowerCase() === clean.toLowerCase())) {
                              saveCookbookChanges({ settings: { units: [...cookbookUnits, clean] } });
                            }
                            setNewUnitInput('');
                          }
                        }}
                        placeholder="Neue Einheit (z. B. Tasse, Flasche, Handvoll)..."
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = newUnitInput.trim();
                          if (!clean) return;
                          if (!cookbookUnits.some((u) => u.toLowerCase() === clean.toLowerCase())) {
                            saveCookbookChanges({ settings: { units: [...cookbookUnits, clean] } });
                          }
                          setNewUnitInput('');
                        }}
                        style={{ backgroundColor: activeColors.recipes }}
                        className="px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Einheit</span>
                      </button>
                    </div>
                  </div>

                  {/* Default Cycle Portions Setting */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                        Standard-Portionen im Essensplan
                      </span>
                      <span className="text-[11px] text-neutral-500 block">
                        Vorgabewert für neue Tage. Zutatenmengen werden entsprechend automatisch skaliert.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white dark:bg-[#202225] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = Math.max(1, cookbookDefaultPortions - 1);
                          saveCookbookChanges({ settings: { defaultCyclePortions: nextVal } });
                        }}
                        className="w-7 h-7 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2C31] hover:bg-neutral-200 dark:hover:bg-neutral-700 font-bold text-sm cursor-pointer flex items-center justify-center"
                        aria-label="Standard-Portionen verringern"
                      >
                        −
                      </button>
                      <span className="min-w-[3.5rem] text-center font-bold text-xs tabular-nums">
                        {cookbookDefaultPortions} Port.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = Math.min(24, cookbookDefaultPortions + 1);
                          saveCookbookChanges({ settings: { defaultCyclePortions: nextVal } });
                        }}
                        style={{ backgroundColor: activeColors.recipes }}
                        className="w-7 h-7 rounded-lg text-white font-bold text-sm cursor-pointer flex items-center justify-center shadow-2xs"
                        aria-label="Standard-Portionen erhöhen"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Enable / Disable Einkaufsliste & Verbrauchs-Forecast */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-2xs"
                        style={{ backgroundColor: activeColors.recipes }}
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                          Einkaufsliste &amp; Verbrauchs-Forecast aktivieren
                        </span>
                        <span className="text-[11px] text-neutral-500 block">
                          Blendet den Tab „Einkaufsliste“ im Essensplan sowie den offenen Einkaufs-Forecast auf Wunsch ein oder aus.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !cookbookEnableShoppingList;
                        saveCookbookChanges({
                          settings: {
                            defaultCyclePortions: cookbookDefaultPortions,
                            enableShoppingList: nextVal,
                          },
                        });
                      }}
                      style={cookbookEnableShoppingList ? { backgroundColor: activeColors.recipes } : undefined}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                        cookbookEnableShoppingList
                          ? 'justify-end'
                          : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                    </button>
                  </div>

                  {renderColorPickerBlock(
                    activeColors.recipes,
                    (hex) => updateSuiteModuleColor('recipes', hex),
                    () => resetModuleColorsToOchre('recipes'),
                    'Essensplan Akzentfarbe (Ocker-Palette)'
                  )}

                  {/* Legacy Sharing Settings for Essensplan */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-3">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <Share2 className="w-4 h-4" style={{ color: activeColors.recipes }} />
                      <span>Katalog- &amp; Plan-Freigaben für @{currentUser.username}</span>
                    </div>

                    {!cookbookLoaded ? (
                      <p className="text-[11px] text-neutral-400">Lade Essensplan-Einstellungen...</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Catalog share */}
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold block">Rezeptkatalog freigeben</span>
                              <span className="text-[11px] text-neutral-500">
                                Andere können deine Rezepte in ihrem Essensplan sehen &amp; einplanen.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                saveCookbookChanges({
                                  sharing: { ...cookbookSharing, shareCatalog: !cookbookSharing.shareCatalog },
                                })
                              }
                              style={cookbookSharing.shareCatalog ? { backgroundColor: activeColors.recipes } : undefined}
                              className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                                cookbookSharing.shareCatalog
                                  ? 'justify-end'
                                  : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                              }`}
                            >
                              <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                            </button>
                          </div>
                          {cookbookSharing.shareCatalog && otherUsers.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                              <button
                                type="button"
                                onClick={() =>
                                  saveCookbookChanges({ sharing: { ...cookbookSharing, catalogSharedWith: ['*'] } })
                                }
                                style={
                                  cookbookSharing.catalogSharedWith.includes('*')
                                    ? { backgroundColor: activeColors.recipes, borderColor: activeColors.recipes }
                                    : undefined
                                }
                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                  cookbookSharing.catalogSharedWith.includes('*') ? 'text-white' : ''
                                }`}
                              >
                                Alle
                              </button>
                              {otherUsers.map((u) => {
                                const active =
                                  !cookbookSharing.catalogSharedWith.includes('*') &&
                                  cookbookSharing.catalogSharedWith.includes(u.username);
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => toggleRecipient('catalogSharedWith', u.username)}
                                    style={
                                      active
                                        ? { backgroundColor: activeColors.recipes, borderColor: activeColors.recipes }
                                        : undefined
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                      active ? 'text-white' : ''
                                    }`}
                                  >
                                    {u.displayName}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Cycle & Calendar share */}
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold block">Zyklus &amp; Essenskalender freigeben</span>
                              <span className="text-[11px] text-neutral-500">
                                Andere können deinen Wochenplan und Essenszyklus einsehen &amp; drucken.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                saveCookbookChanges({
                                  sharing: {
                                    ...cookbookSharing,
                                    shareCycleAndCalendar: !cookbookSharing.shareCycleAndCalendar,
                                  },
                                })
                              }
                              style={
                                cookbookSharing.shareCycleAndCalendar
                                  ? { backgroundColor: activeColors.recipes }
                                  : undefined
                              }
                              className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                                cookbookSharing.shareCycleAndCalendar
                                  ? 'justify-end'
                                  : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                              }`}
                            >
                              <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                            </button>
                          </div>
                          {cookbookSharing.shareCycleAndCalendar && otherUsers.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                              <button
                                type="button"
                                onClick={() =>
                                  saveCookbookChanges({ sharing: { ...cookbookSharing, cycleSharedWith: ['*'] } })
                                }
                                style={
                                  cookbookSharing.cycleSharedWith.includes('*')
                                    ? { backgroundColor: activeColors.recipes, borderColor: activeColors.recipes }
                                    : undefined
                                }
                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                  cookbookSharing.cycleSharedWith.includes('*') ? 'text-white' : ''
                                }`}
                              >
                                Alle
                              </button>
                              {otherUsers.map((u) => {
                                const active =
                                  !cookbookSharing.cycleSharedWith.includes('*') &&
                                  cookbookSharing.cycleSharedWith.includes(u.username);
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => toggleRecipient('cycleSharedWith', u.username)}
                                    style={
                                      active
                                        ? { backgroundColor: activeColors.recipes, borderColor: activeColors.recipes }
                                        : undefined
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                      active ? 'text-white' : ''
                                    }`}
                                  >
                                    {u.displayName}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Food Categories Management */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-2.5">
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                      Essenskategorien für Katalog-Filter
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCatInput}
                        onChange={(e) => setNewCatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCatInput.trim()) {
                            const clean = newCatInput.trim();
                            if (!cookbookCategories.includes(clean)) {
                              saveCookbookChanges({ categories: [...cookbookCategories, clean] });
                            }
                            setNewCatInput('');
                          }
                        }}
                        placeholder="Neue Essenskategorie (z. B. Suppen, Grillen)..."
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = newCatInput.trim();
                          if (clean && !cookbookCategories.includes(clean)) {
                            saveCookbookChanges({ categories: [...cookbookCategories, clean] });
                          }
                          setNewCatInput('');
                        }}
                        style={{ backgroundColor: activeColors.recipes }}
                        className="px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Hinzufügen</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {cookbookCategories.map((cat) => (
                        <div
                          key={cat}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] font-medium"
                        >
                          <span>{cat}</span>
                          {cookbookCategories.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                saveCookbookChanges({
                                  categories: cookbookCategories.filter((c) => c !== cat),
                                })
                              }
                              className="text-neutral-400 hover:text-red-500 cursor-pointer ml-1"
                              title="Kategorie entfernen"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* --- MODULE: FINANZEN --- */}
              {selectedModuleSettingsTab === 'finance' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-1">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <DollarSign className="w-4 h-4" style={{ color: activeColors.finance }} />
                      <span>Finanzen &amp; Bank-CSV Import</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Kreditor-Regeln und Kategorien werden direkt im Finanzen-Modul verwaltet. Die mobile Barzahlungs-Erfassung passt sich automatisch der gewählten Ocker-Farbe an.
                    </p>
                  </div>

                  {renderColorPickerBlock(
                    activeColors.finance,
                    (hex) => updateSuiteModuleColor('finance', hex),
                    () => resetModuleColorsToOchre('finance'),
                    'Finanzen Akzentfarbe (Ocker-Palette)'
                  )}
                </div>
              )}

              {/* --- MODULE: PROJEKTE --- */}
              {selectedModuleSettingsTab === 'projects' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-1">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <FolderKanban className="w-4 h-4" style={{ color: activeColors.projects }} />
                      <span>Projekte (Kanban, Timeline &amp; Dokumente)</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Projekte werden als offenes JSON in <span className="font-mono">Projects/</span> gespeichert. Verknüpfte Notizen und Wiki-Artikel bleiben bidirektional verbunden, Aufgaben lassen sich beliebigen Team-Mitgliedern oder externen Namen zuweisen.
                    </p>
                  </div>

                  {renderColorPickerBlock(
                    activeColors.projects,
                    (hex) => updateSuiteModuleColor('projects', hex),
                    () => resetModuleColorsToOchre('projects'),
                    'Projekte Akzentfarbe (Ocker-Palette)'
                  )}
                </div>
              )}

              {/* --- MODULE: SMARTHOME --- */}
              {selectedModuleSettingsTab === 'smarthome' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-1">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <Cpu className="w-4 h-4" style={{ color: activeColors.smarthome }} />
                      <span>Smarthome Viewer &amp; MQTT / HTTP-Quellen</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Konfiguriere MQTT-Broker, HTTP/JSON-Telemetrie-Quellen und Kacheln direkt im Smarthome-Modul. Als Administrator kannst du Kacheln als „Admin-Vorgabe“ markieren, sodass Standardnutzer diese mit 1 Klick übernehmen können.
                    </p>
                  </div>

                  {renderColorPickerBlock(
                    activeColors.smarthome,
                    (hex) => updateSuiteModuleColor('smarthome', hex),
                    () => resetModuleColorsToOchre('smarthome'),
                    'Smarthome Akzentfarbe (Ocker-Palette)'
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: BENUTZERVERWALTUNG & PROFILBILD                         */}
          {/* ============================================================== */}
          {activeSettingsTab === 'users' && (
            <div className="space-y-4">
              {/* Top Action Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    Benutzerverwaltung &amp; Profilbilder
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Erstelle neue Benutzerkonten, wechsle zwischen Benutzern und passe Profilbilder individuell an.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewUserForm((prev) => !prev);
                    setNewUserStatus(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--ochre-accent)] text-white text-xs font-semibold shadow-xs hover:opacity-90 cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{showNewUserForm ? 'Abbrechen' : 'Neuen Benutzer anlegen'}</span>
                </button>
              </div>

              {/* New User Creation Form */}
              {showNewUserForm && (
                <form
                  onSubmit={handleCreateNewUser}
                  className="p-3.5 rounded-2xl border-2 border-[var(--ochre-accent)]/50 bg-[#FAF9F5] dark:bg-[#18191B] space-y-3 animate-in fade-in duration-150"
                >
                  <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                    <UserPlus className="w-4 h-4 text-[var(--ochre-accent)]" />
                    <span>Neues Benutzerkonto erstellen</span>
                  </div>

                  {/* Avatar picker for new user */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {newUserAvatarDataUrl ? (
                      <img
                        src={newUserAvatarDataUrl}
                        alt="Vorschau"
                        className="w-12 h-12 rounded-full object-cover border-2 border-[var(--ochre-accent)] shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[var(--ochre-accent)] text-white flex items-center justify-center font-bold text-base shrink-0">
                        {(newUserDisplayName || newUserHandle || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[var(--ochre-accent)] text-xs font-semibold cursor-pointer">
                      <Camera className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                      <span>Profilbild wählen</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const url = await resizeAvatarFile(file);
                            setNewUserAvatarDataUrl(url);
                          } catch {}
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                    {newUserAvatarDataUrl && (
                      <button
                        type="button"
                        onClick={() => setNewUserAvatarDataUrl('')}
                        className="text-[11px] text-neutral-500 hover:text-red-500 cursor-pointer"
                      >
                        Bild entfernen
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                        Anzeigename *
                      </label>
                      <input
                        type="text"
                        required
                        value={newUserDisplayName}
                        onChange={(e) => setNewUserDisplayName(e.target.value)}
                        placeholder="z. B. Lena"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                        Benutzername (Ordnername)
                      </label>
                      <input
                        type="text"
                        value={newUserHandle}
                        onChange={(e) => setNewUserHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        placeholder="z. B. lena (wird auto-generiert)"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                        Rolle
                      </label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user' | 'family')}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                      >
                        <option value="user">Benutzer</option>
                        <option value="family">Familie</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                        Passwort (optional)
                      </label>
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Leer lassen = 1-Klick-Anmeldung"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                      Kurzbeschreibung (optional)
                    </label>
                    <input
                      type="text"
                      value={newUserDesc}
                      onChange={(e) => setNewUserDesc(e.target.value)}
                      placeholder="z. B. Familie, Kochbuch & gemeinsame Notizen"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                    />
                  </div>

                  {newUserStatus && (
                    <p className="text-[11px] text-red-500 font-medium">{newUserStatus}</p>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowNewUserForm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={userSaving || (!newUserDisplayName.trim() && !newUserHandle.trim())}
                      className="px-4 py-1.5 rounded-lg bg-[var(--ochre-accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {userSaving ? 'Erstelle...' : 'Benutzer erstellen'}
                    </button>
                  </div>
                </form>
              )}

              {/* User List (Switch or Select to Edit) */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                  Vorhandene Benutzer ({allUsers.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allUsers.map((u) => {
                    const isSelectedForEdit = editedTargetUser.username === u.username;
                    const isCurrent = currentUser.username === u.username;
                    return (
                      <div
                        key={u.id}
                        onClick={() => setEditingUsername(u.username)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelectedForEdit
                            ? 'border-[var(--ochre-accent)] bg-amber-50/40 dark:bg-amber-950/20 shadow-2xs'
                            : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/70 dark:bg-[#18191B] hover:border-neutral-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.displayName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-[#E5E3DC] dark:border-[#2F3136] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[var(--ochre-accent)] text-white flex items-center justify-center font-bold text-xs shrink-0">
                              {u.displayName?.[0]?.toUpperCase() || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                                {u.displayName}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--ochre-accent)] text-white font-semibold shrink-0">
                                  Aktiv
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-neutral-500 block truncate">
                              @{u.username} · {u.role === 'admin' ? 'Admin' : u.role === 'family' ? 'Familie' : 'Benutzer'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isCurrent && onSwitchUser && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSwitchUser(u);
                              }}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[var(--ochre-accent)] text-[11px] font-semibold cursor-pointer"
                              title="Zu diesem Benutzer wechseln"
                            >
                              Wechseln
                            </button>
                          )}
                          {allUsers.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteUser(u);
                              }}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              title="Benutzer entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected User Profile & Avatar Editor */}
              <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                    <UserCheck className="w-4 h-4 text-[var(--ochre-accent)]" />
                    <span>Profil bearbeiten: {editedTargetUser.displayName} (@{editedTargetUser.username})</span>
                  </div>
                  {userEditStatus && (
                    <span className="text-[11px] font-semibold text-[var(--ochre-accent)]">
                      {userEditStatus}
                    </span>
                  )}
                </div>

                {/* Avatar Replacement Controls */}
                <div className="p-3 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    {editedTargetUser.avatar ? (
                      <img
                        src={editedTargetUser.avatar}
                        alt={editedTargetUser.displayName}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-full object-cover border-2 border-[var(--ochre-accent)] shrink-0 shadow-xs"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[var(--ochre-accent)] text-white flex items-center justify-center font-bold text-lg shrink-0">
                        {editedTargetUser.displayName?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}

                    <div className="space-y-1.5 flex-1 min-w-[180px]">
                      <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block">
                        Profilbild austauschen
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--ochre-accent)] text-white text-xs font-semibold hover:opacity-90 cursor-pointer shadow-2xs">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Foto hochladen</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUploadForEdit}
                            disabled={userSaving}
                            className="hidden"
                          />
                        </label>
                        {editedTargetUser.avatar && (
                          <button
                            type="button"
                            onClick={async () => {
                              setUserSaving(true);
                              try {
                                const updated = await api.updateUser(editedTargetUser.username, { clearAvatar: true });
                                await syncUsersList(updated);
                                setUserEditStatus('Profilbild zurückgesetzt.');
                              } finally {
                                setUserSaving(false);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[11px] font-medium hover:text-red-500 cursor-pointer"
                          >
                            Initiale verwenden
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Avatar Presets */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136] flex-wrap">
                    <span className="text-[11px] text-neutral-500">Schnellauswahl:</span>
                    {AVATAR_PRESETS.map((presetUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectPresetAvatar(presetUrl)}
                        className="w-7 h-7 rounded-full overflow-hidden border border-[#E5E3DC] dark:border-neutral-700 hover:scale-110 transition-transform cursor-pointer"
                        title={`Avatar-Vorlage ${idx + 1}`}
                      >
                        <img src={presetUrl} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name, Role, Description Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                      Anzeigename
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                      Rolle
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as 'admin' | 'user' | 'family')}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden"
                    >
                      <option value="user">Benutzer</option>
                      <option value="family">Familie</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 block mb-1">
                    Beschreibung
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="z. B. Familie, Arbeit, Notizen..."
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 outline-hidden focus:border-[var(--ochre-accent)]"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Ordner: <span className="font-mono">User/{editedTargetUser.username}/</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveUserProfile}
                    disabled={userSaving || !editDisplayName.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--ochre-accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    Änderungen speichern
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: BACKUP & DOCKER                                         */}
          {/* ============================================================== */}
          {activeSettingsTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                    <Server className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                    <span>Docker &amp; NAS Storage (UID:GID 2000:100)</span>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--ochre-accent)]">
                    user: 2000:100
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Für dein NAS ist die Rechte-Verwaltung auf ID 2000:100 ausgelegt (umask 0002). Alle Notizen, Wiki-Artikel und Essenspläne liegen isoliert im <span className="font-mono text-neutral-700 dark:text-neutral-300 font-semibold">User/</span> Verzeichnis.
                </p>
                <div className="relative">
                  <pre className="text-[10px] p-2.5 rounded-lg bg-neutral-900 text-neutral-200 font-mono overflow-x-auto select-all leading-relaxed border border-neutral-700">
{`services:
  ochrenotes:
    image: ochrenotes:latest
    restart: unless-stopped
    user: "2000:100"
    ports:
      - "3000:3000"
    environment:
      - VAULT_PATH=/data/vault
      - NODE_ENV=production
    volumes:
      - /srv/NASDRIVE/Files/OchreSuite/User:/data/vault/User
      - /srv/NASDRIVE/Files/OchreSuite/config:/data/config`}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `services:\n  ochrenotes:\n    image: ochrenotes:latest\n    restart: unless-stopped\n    user: "2000:100"\n    ports:\n      - "3000:3000"\n    environment:\n      - VAULT_PATH=/data/vault\n      - NODE_ENV=production\n    volumes:\n      - /srv/NASDRIVE/Files/OchreSuite/User:/data/vault/User\n      - /srv/NASDRIVE/Files/OchreSuite/config:/data/config`
                      );
                      setCopiedDocker(true);
                      setTimeout(() => setCopiedDocker(false), 2000);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    title="Compose-Auszug kopieren"
                  >
                    {copiedDocker ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <Database className="w-4 h-4 text-[var(--ochre-accent)]" />
                  <span>Vault-Datensicherung ({activeProfile.name})</span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Exportiere Notizen, Aufgaben und Freigaben des aktiven Profils als JSON-Archivdatei.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <button
                    onClick={handleDownloadBackup}
                    disabled={exportLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[var(--ochre-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportLoading ? 'Wird gepackt...' : 'Vault-Backup herunterladen'}</span>
                  </button>

                  <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-700 dark:text-neutral-300 font-medium hover:border-[var(--ochre-accent)] cursor-pointer transition-colors text-center">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{restoreLoading ? 'Lade hoch...' : 'Backup einspielen'}</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      disabled={restoreLoading}
                      className="hidden"
                    />
                  </label>
                </div>

                {restoreStatus && (
                  <div
                    className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                      restoreStatus.startsWith('Erfolg')
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {restoreStatus.startsWith('Erfolg') ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span>{restoreStatus}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: ÜBER / UPDATES (Changelog aus UPDATE-Datei)             */}
          {/* ============================================================== */}
          {activeSettingsTab === 'about' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#F4F3EF] dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <img src="/favicon.svg" alt="Ochre Suite" className="w-8 h-8 rounded-xl shadow-xs shrink-0" />
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      {appTitle} – Release-Verlauf &amp; Updates
                    </h3>
                    <span className="text-[11px] text-neutral-500 block">
                      {changelog?.updatedAt
                        ? `Zuletzt aktualisiert: ${new Date(changelog.updatedAt).toLocaleDateString('de-DE')}`
                        : 'Übersicht aller Neuerungen und Modul-Erweiterungen'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadChangelogData}
                  disabled={loadingChangelog}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[var(--ochre-accent)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingChangelog ? 'animate-spin' : ''}`} />
                  <span>Aktualisieren</span>
                </button>
              </div>

              {loadingChangelog && !changelog ? (
                <div className="p-6 text-center text-xs text-neutral-500">
                  Lade Update-Verlauf...
                </div>
              ) : changelog?.versions && changelog.versions.length > 0 ? (
                <div className="space-y-3">
                  {changelog.versions.map((ver, vIdx) => (
                    <div
                      key={`${ver.version}-${vIdx}`}
                      className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E5E3DC] dark:border-[#2F3136]">
                        <div className="flex items-center gap-2">
                          <span
                            style={{ backgroundColor: 'var(--ochre-accent)' }}
                            className="px-2.5 py-0.5 rounded-full text-white font-bold text-[11px]"
                          >
                            {ver.version}
                          </span>
                          {vIdx === 0 && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              Aktuell
                            </span>
                          )}
                        </div>
                        {ver.date && (
                          <span className="text-[11px] text-neutral-400 font-medium">{ver.date}</span>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {ver.sections.map((sec, sIdx) => (
                          <div key={`${sec.title}-${sIdx}`} className="space-y-1">
                            {sec.title && (
                              <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                                {sec.title}
                              </h4>
                            )}
                            <ul className="space-y-1 pl-4 list-disc text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                              {sec.items.map((item, iIdx) => (
                                <li key={iIdx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : changelog?.raw ? (
                <pre className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#18191B] text-[11px] font-mono whitespace-pre-wrap leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {changelog.raw}
                </pre>
              ) : (
                <div className="p-6 text-center text-xs text-neutral-500 rounded-2xl border border-dashed border-[#E5E3DC] dark:border-[#2F3136]">
                  Keine Changelog-Einträge gefunden.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
