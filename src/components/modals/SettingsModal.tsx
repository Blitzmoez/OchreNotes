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
} from 'lucide-react';
import {
  User,
  EnabledModules,
  SuiteModuleId,
  SuiteProfileSettings,
  NoteProfileId,
  CookbookSharingSettings,
} from '../../types';
import { api } from '../../services/api';
import { useTranslation, Language } from '../../services/i18n';
import { OCHRE_COLOR_PRESETS, DEFAULT_PROFILE_SETTINGS } from '../../services/profileDefaults';

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
  enabledModules: EnabledModules;
  onToggleModule: (moduleId: SuiteModuleId) => void;
  profileSettings: SuiteProfileSettings;
  onUpdateProfileSettings: (next: SuiteProfileSettings) => void;
  initialModuleContext?: SuiteModuleId;
  onCookbookUpdated?: () => void;
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
  enabledModules,
  onToggleModule,
  profileSettings,
  onUpdateProfileSettings,
  initialModuleContext = 'notes',
  onCookbookUpdated,
}) => {
  const { language, setLanguage, t } = useTranslation();
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'modules' | 'moduleSettings' | 'backup'>('general');
  const [selectedModuleSettingsTab, setSelectedModuleSettingsTab] = useState<SuiteModuleId>(initialModuleContext);
  const [editingProfileTab, setEditingProfileTab] = useState<NoteProfileId>('profile1');
  const [exportLoading, setExportLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  // App Name state
  const [nameInput, setNameInput] = useState(appTitle);
  const [titleSaved, setTitleSaved] = useState(false);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  // Docker copy state
  const [copiedDocker, setCopiedDocker] = useState(false);

  // Cookbook module settings (sharing & food categories)
  const [cookbookCategories, setCookbookCategories] = useState<string[]>([]);
  const [cookbookSharing, setCookbookSharing] = useState<CookbookSharingSettings>({
    shareCatalog: false,
    catalogSharedWith: ['*'],
    shareCycleAndCalendar: false,
    cycleSharedWith: ['*'],
  });
  const [newCatInput, setNewCatInput] = useState('');
  const [cookbookLoaded, setCookbookLoaded] = useState(false);

  useEffect(() => {
    setNameInput(appTitle);
  }, [appTitle]);

  useEffect(() => {
    if (isOpen) {
      setSelectedModuleSettingsTab(initialModuleContext || 'notes');
    }
  }, [isOpen, initialModuleContext]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api
      .fetchCookbook(currentUser.username)
      .then((data) => {
        if (cancelled) return;
        setCookbookCategories(data.categories || []);
        if (data.sharing) setCookbookSharing(data.sharing);
        setCookbookLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser.username]);

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
  const activeColors = {
    notes: activeProfile.colors.notes,
    wiki: profileSettings.profile1.colors.wiki,
    recipes: profileSettings.profile1.colors.recipes,
    finance: profileSettings.profile1.colors.finance,
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

  const updateSuiteModuleColor = (mod: 'wiki' | 'recipes' | 'finance', hex: string) => {
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
      updateSuiteModuleColor(mod, DEFAULT_PROFILE_SETTINGS.profile1.colors[mod]);
    }
  };

  const saveCookbookChanges = async (partial: {
    categories?: string[];
    sharing?: CookbookSharingSettings;
  }) => {
    if (partial.categories !== undefined) setCookbookCategories(partial.categories);
    if (partial.sharing !== undefined) setCookbookSharing(partial.sharing);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1E1F23] rounded-xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[var(--ochre-accent)]" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Einstellungen &amp; Suite-Verwaltung
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Tabs with Small Icons: Allgemein | Module | Modul-Einstellungen | Backup & Docker */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#1A1C1F] overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveSettingsTab('general')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'general'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Allgemein</span>
          </button>

          <button
            onClick={() => setActiveSettingsTab('modules')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'modules'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Module</span>
          </button>

          <button
            onClick={() => setActiveSettingsTab('moduleSettings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'moduleSettings'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Modul-Einstellungen</span>
          </button>

          <button
            onClick={() => setActiveSettingsTab('backup')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeSettingsTab === 'backup'
                ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup &amp; Docker</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 space-y-5 text-xs text-neutral-700 dark:text-neutral-300 overflow-y-auto">
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
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MODULE AN- & ABSCHALTEN                                */}
          {/* ============================================================== */}
          {activeSettingsTab === 'modules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    Module an- &amp; abschalten
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Blende Bereiche aus, die du nicht nutzt. Detail-Konfigurationen findest du im Tab „Modul-Einstellungen“.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Notes */}
                <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ backgroundColor: activeColors.notes }}
                      className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs"
                    >
                      <BookOpen className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                        Notes (Obsidian Markdown &amp; Aufgaben)
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Zentraler Wissens-Hub mit Privat/Business-Trennung, Tasks &amp; Graph
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-neutral-400 font-semibold">Basis</span>
                    <button
                      disabled
                      style={{ backgroundColor: activeColors.notes }}
                      className="w-11 h-6 rounded-full opacity-80 cursor-not-allowed flex items-center justify-end px-1"
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                    </button>
                  </div>
                </div>

                {/* Wiki */}
                <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ backgroundColor: activeColors.wiki }}
                      className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs"
                    >
                      <BookMarked className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                        Wiki (Open-Standard Markdown)
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Anleitungen mit Foto-Upload, Code-Ablage &amp; A4-Druck
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleModule('wiki')}
                    style={enabledModules.wiki ? { backgroundColor: activeColors.wiki } : undefined}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                      enabledModules.wiki ? 'justify-end' : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>

                {/* Kochbuch */}
                <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ backgroundColor: activeColors.recipes }}
                      className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs"
                    >
                      <Utensils className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                        Kochbuch &amp; Essenszyklus
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Eigener Tellergerichtskatalog, Zyklus, Kalender &amp; Freigaben
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleModule('recipes')}
                    style={enabledModules.recipes ? { backgroundColor: activeColors.recipes } : undefined}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                      enabledModules.recipes ? 'justify-end' : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>

                {/* Finanzen */}
                <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ backgroundColor: activeColors.finance }}
                      className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs"
                    >
                      <DollarSign className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                        Finanzen &amp; CSV Analyse
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Bank CSV-Upload, Kreditor-Erkennung &amp; Bartransaktionen
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleModule('finance')}
                    style={enabledModules.finance ? { backgroundColor: activeColors.finance } : undefined}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer shrink-0 ${
                      enabledModules.finance ? 'justify-end' : 'bg-neutral-300 dark:bg-neutral-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>
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
          )}

          {/* ============================================================== */}
          {/* TAB 3: MODUL-EINSTELLUNGEN (Per-Module Organized Settings)     */}
          {/* ============================================================== */}
          {activeSettingsTab === 'moduleSettings' && (
            <div className="space-y-4">
              {/* Sub-navigation per module */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F4F3EF] dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'notes', label: 'Notes', icon: BookOpen, color: activeColors.notes },
                    { id: 'wiki', label: 'Wiki', icon: BookMarked, color: activeColors.wiki },
                    { id: 'recipes', label: 'Kochbuch', icon: Utensils, color: activeColors.recipes },
                    { id: 'finance', label: 'Finanzen', icon: DollarSign, color: activeColors.finance },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const isSelected = selectedModuleSettingsTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedModuleSettingsTab(item.id)}
                      style={isSelected ? { backgroundColor: item.color } : undefined}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
                      Alle Wiki-Artikel werden als portables Standard-Markdown (YAML-Frontmatter + Fotos in <span className="font-mono">Wiki/assets/</span> + Code-Ablage) im Verzeichnis <span className="font-mono">User/{currentUser.username}/Wiki/</span> gespeichert.
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

              {/* --- MODULE: KOCHBUCH --- */}
              {selectedModuleSettingsTab === 'recipes' && (
                <div className="space-y-4">
                  {renderColorPickerBlock(
                    activeColors.recipes,
                    (hex) => updateSuiteModuleColor('recipes', hex),
                    () => resetModuleColorsToOchre('recipes'),
                    'Kochbuch Akzentfarbe (Ocker-Palette)'
                  )}

                  {/* Sharing Settings for Cookbook */}
                  <div className="p-3.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] space-y-3">
                    <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                      <Share2 className="w-4 h-4" style={{ color: activeColors.recipes }} />
                      <span>Freigaben für @{currentUser.username}</span>
                    </div>

                    {!cookbookLoaded ? (
                      <p className="text-[11px] text-neutral-400">Lade Kochbuch-Einstellungen...</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Catalog share */}
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold block">Tellergerichtskatalog freigeben</span>
                              <span className="text-[11px] text-neutral-500">
                                Andere können deine Tellergerichte in ihrem Kochbuch sehen &amp; einplanen.
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
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: BACKUP & DOCKER                                         */}
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
                  Für dein NAS ist die Rechte-Verwaltung auf ID 2000:100 ausgelegt (umask 0002). Alle Notizen, Wiki-Artikel und Kochbücher liegen isoliert im <span className="font-mono text-neutral-700 dark:text-neutral-300 font-semibold">User/</span> Verzeichnis.
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
