import React, { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, 
  CheckSquare,
  Network,
  Share2, 
  Printer, 
  Server, 
  Sun, 
  Moon, 
  Settings, 
  ChevronDown,
  ChevronRight,
  Download,
  LogOut,
  Utensils,
  BarChart3,
  Layers,
  X,
  BookMarked,
  Calendar as CalendarIcon,
  Repeat,
  ShoppingCart,
  Sparkles,
  LayoutDashboard
} from 'lucide-react';
import { User, PaneType, SuiteModuleId, EnabledModules, SuiteProfileSettings, NoteProfileId, CookbookTab } from '../../types';
import { useTranslation } from '../../services/i18n.tsx';

interface HeaderProps {
  currentUser: User | null;
  activeView: PaneType;
  onChangeView: (view: PaneType) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenShareModal: () => void;
  onPrintA4: () => void;
  onOpenSystemLogs: () => void;
  onOpenSettings: () => void;
  onOpenUserSwitch: () => void;
  onLogout?: () => void;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
  activeSuiteModule: SuiteModuleId;
  onSelectSuiteModule: (mod: SuiteModuleId) => void;
  enabledModules: EnabledModules;
  profileSettings: SuiteProfileSettings;
  onSwitchProfile: (id: NoteProfileId) => void;
  activeCookbookTab?: CookbookTab;
  onChangeCookbookTab?: (tab: CookbookTab) => void;
  enableCookbookShoppingList?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeView,
  onChangeView,
  isDarkMode,
  onToggleDarkMode,
  onOpenShareModal,
  onPrintA4,
  onOpenSystemLogs,
  onOpenSettings,
  onOpenUserSwitch,
  onLogout,
  canInstallPwa,
  onInstallPwa,
  activeSuiteModule,
  onSelectSuiteModule,
  enabledModules,
  profileSettings,
  onSwitchProfile,
  activeCookbookTab = 'calendar',
  onChangeCookbookTab,
  enableCookbookShoppingList = true,
}) => {
  const activeProfile = profileSettings[profileSettings.activeProfileId] || profileSettings.profile1;
  const activeColors = {
    dashboard: profileSettings.profile1.colors.dashboard || '#A67C21',
    notes: activeProfile.colors.notes,
    wiki: profileSettings.profile1.colors.wiki,
    recipes: profileSettings.profile1.colors.recipes,
    finance: profileSettings.profile1.colors.finance,
  };
  const currentModuleColor = activeColors[activeSuiteModule] || activeColors.notes;
  const { t } = useTranslation();
  // Ochre Suite modular menu dropdown
  const [isSuiteMenuOpen, setIsSuiteMenuOpen] = useState(false);
  // User & actions menu dropdown
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const suiteMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (suiteMenuRef.current && !suiteMenuRef.current.contains(e.target as Node)) {
        setIsSuiteMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <header className="h-14 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] px-3 md:px-4 flex items-center justify-between gap-2 md:gap-3 select-none shrink-0 relative z-[90]">
      {/* Zone 1: Modular Logo & Active Module Name */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        {/* Module Switcher Dropdown */}
        <div className="relative" ref={suiteMenuRef}>
          {/* Subtle backdrop overlay to guarantee menu stays above all elements including Vault */}
          {isSuiteMenuOpen && (
            <div 
              onClick={() => setIsSuiteMenuOpen(false)}
              className="fixed inset-0 z-[95] bg-black/10 backdrop-blur-2xs"
            />
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsSuiteMenuOpen((prev) => !prev);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[#C87D20] shadow-2xs hover:shadow-xs transition-all text-left group cursor-pointer active:scale-95"
            title="Modulauswahl der Ochre Suite öffnen"
            aria-label="Modulauswahl"
          >
            {/* Active Module Icon Badge */}
            {activeSuiteModule === 'dashboard' && (
              <div
                style={{ backgroundColor: activeColors.dashboard }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
              </div>
            )}
            {activeSuiteModule === 'notes' && (
              <div
                style={{ backgroundColor: activeColors.notes }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs relative overflow-hidden shrink-0"
              >
                <div className="absolute left-0.5 top-0 bottom-0 flex flex-col justify-around py-0.5">
                  <span className="w-1 h-0.5 rounded-full bg-white/90 shadow-2xs"></span>
                  <span className="w-1 h-0.5 rounded-full bg-white/90 shadow-2xs"></span>
                  <span className="w-1 h-0.5 rounded-full bg-white/90 shadow-2xs"></span>
                </div>
                <div className="ml-1.5 flex flex-col gap-0.5 w-3">
                  <div className="h-0.5 bg-white/95 rounded-full w-full"></div>
                  <div className="h-0.5 bg-white/75 rounded-full w-3/4"></div>
                  <div className="h-0.5 bg-white/60 rounded-full w-2/3"></div>
                </div>
              </div>
            )}
            {activeSuiteModule === 'wiki' && (
              <div
                style={{ backgroundColor: activeColors.wiki }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
              >
                <BookMarked className="w-3.5 h-3.5" />
              </div>
            )}
            {activeSuiteModule === 'recipes' && (
              <div
                style={{ backgroundColor: activeColors.recipes }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
              >
                <Utensils className="w-3.5 h-3.5" />
              </div>
            )}
            {activeSuiteModule === 'finance' && (
              <div
                style={{ backgroundColor: activeColors.finance }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Active Module Name */}
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-xs md:text-sm tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                {activeSuiteModule === 'dashboard'
                  ? 'Dashboard'
                  : activeSuiteModule === 'notes'
                  ? 'Notes'
                  : activeSuiteModule === 'wiki'
                  ? 'Wiki'
                  : activeSuiteModule === 'recipes'
                  ? 'Kochbuch'
                  : 'Finanzen'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-transform duration-200 ${isSuiteMenuOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {/* Module Switcher Dropdown (Opens strictly ABOVE the Vault Explorer and main canvas) */}
          {isSuiteMenuOpen && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute top-full left-0 mt-2 w-80 p-3 bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 space-y-2.5"
            >
              {/* Prominent Ochre Suite Brand Header */}
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2F3136]">
                <div className="flex items-center gap-2">
                  <div
                    style={{ backgroundColor: activeColors.notes }}
                    className="w-7 h-7 rounded-lg text-white flex items-center justify-center font-bold text-xs shadow-xs"
                  >
                    OS
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 leading-tight">
                      Ochre Suite
                    </h3>
                    <span className="text-[10px] text-neutral-400">
                      {activeSuiteModule === 'notes' ? `Profil: ${activeProfile.name}` : `@${currentUser?.username || 'michael'}`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsSuiteMenuOpen(false)}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Module Items with rounded box cards for switching */}
              <div className="space-y-2">
                {/* Module 0: Dashboard (Overview across all modules) */}
                {enabledModules.dashboard ? (
                  <div
                    onClick={() => {
                      onSelectSuiteModule('dashboard');
                      setIsSuiteMenuOpen(false);
                    }}
                    style={
                      activeSuiteModule === 'dashboard'
                        ? { borderColor: activeColors.dashboard, backgroundColor: `${activeColors.dashboard}14` }
                        : undefined
                    }
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      activeSuiteModule === 'dashboard'
                        ? 'border-2'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 bg-white dark:bg-[#202225]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        style={{ backgroundColor: activeColors.dashboard }}
                        className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 block">Dashboard</span>
                        <span className="text-[11px] text-neutral-500">Alle Module, Aufgaben &amp; Forecast</span>
                      </div>
                    </div>
                    {activeSuiteModule === 'dashboard' ? (
                      <span
                        style={{ backgroundColor: activeColors.dashboard }}
                        className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                      >
                        Aktiv
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-400">Öffnen →</span>
                    )}
                  </div>
                ) : null}

                {/* Module 1: Notes (Always available) */}
                <div 
                  onClick={() => {
                    onSelectSuiteModule('notes');
                    setIsSuiteMenuOpen(false);
                  }}
                  style={
                    activeSuiteModule === 'notes'
                      ? { borderColor: activeColors.notes, backgroundColor: `${activeColors.notes}14` }
                      : undefined
                  }
                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                    activeSuiteModule === 'notes'
                      ? 'border-2'
                      : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 bg-white dark:bg-[#202225]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      style={{ backgroundColor: activeColors.notes }}
                      className="w-8 h-8 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-xs"
                    >
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">Notes</span>
                      <span className="text-[11px] text-neutral-500">Obsidian Markdown & Aufgaben</span>
                    </div>
                  </div>
                  {activeSuiteModule === 'notes' ? (
                    <span
                      style={{ backgroundColor: activeColors.notes }}
                      className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                    >
                      Aktiv
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-400">Öffnen →</span>
                  )}
                </div>

                {/* Module 2: Wiki (Open-Standard Knowledge Base) */}
                {enabledModules.wiki ? (
                  <div 
                    onClick={() => {
                      onSelectSuiteModule('wiki');
                      setIsSuiteMenuOpen(false);
                    }}
                    style={
                      activeSuiteModule === 'wiki'
                        ? { borderColor: activeColors.wiki, backgroundColor: `${activeColors.wiki}14` }
                        : undefined
                    }
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      activeSuiteModule === 'wiki'
                        ? 'border-2'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 bg-white dark:bg-[#202225]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        style={{ backgroundColor: activeColors.wiki }}
                        className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
                      >
                        <BookMarked className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">Wiki</span>
                        <span className="text-[11px] text-neutral-500">Anleitungen, Fotos & Code-Ablage</span>
                      </div>
                    </div>
                    {activeSuiteModule === 'wiki' ? (
                      <span
                        style={{ backgroundColor: activeColors.wiki }}
                        className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                      >
                        Aktiv
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-400">Öffnen →</span>
                    )}
                  </div>
                ) : null}

                {/* Module 3: Kochbuch (Enabled or Disabled) */}
                {enabledModules.recipes ? (
                  <div 
                    onClick={() => {
                      onSelectSuiteModule('recipes');
                      setIsSuiteMenuOpen(false);
                    }}
                    style={
                      activeSuiteModule === 'recipes'
                        ? { borderColor: activeColors.recipes, backgroundColor: `${activeColors.recipes}14` }
                        : undefined
                    }
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      activeSuiteModule === 'recipes'
                        ? 'border-2'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 bg-white dark:bg-[#202225]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        style={{ backgroundColor: activeColors.recipes }}
                        className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
                      >
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">Kochbuch</span>
                        <span className="text-[11px] text-neutral-500">Tellergerichte & Essenszyklus</span>
                      </div>
                    </div>
                    {activeSuiteModule === 'recipes' ? (
                      <span
                        style={{ backgroundColor: activeColors.recipes }}
                        className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                      >
                        Aktiv
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-400">Öffnen →</span>
                    )}
                  </div>
                ) : null}

                {/* Module 4: Finanzen (Enabled or Disabled) */}
                {enabledModules.finance ? (
                  <div 
                    onClick={() => {
                      onSelectSuiteModule('finance');
                      setIsSuiteMenuOpen(false);
                    }}
                    style={
                      activeSuiteModule === 'finance'
                        ? { borderColor: activeColors.finance, backgroundColor: `${activeColors.finance}14` }
                        : undefined
                    }
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      activeSuiteModule === 'finance'
                        ? 'border-2'
                        : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 bg-white dark:bg-[#202225]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        style={{ backgroundColor: activeColors.finance }}
                        className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">Finanzen</span>
                        <span className="text-[11px] text-neutral-500">CSV Bankimport & Barzahlung</span>
                      </div>
                    </div>
                    {activeSuiteModule === 'finance' ? (
                      <span
                        style={{ backgroundColor: activeColors.finance }}
                        className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                      >
                        Aktiv
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-400">Öffnen →</span>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Module Management Link */}
              <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136] px-1 flex items-center justify-between text-[11px]">
                <button
                  onClick={() => {
                    setIsSuiteMenuOpen(false);
                    onOpenSettings();
                  }}
                  style={{ color: activeColors.notes }}
                  className="hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Module & Profile verwalten</span>
                </button>
                <span className="text-neutral-400">Ochre Suite</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Desktop-Only Center Mode Switcher (Mobile/Tablet uses the bottom-right floating navigation button) */}
      {activeSuiteModule === 'notes' && (
        <div className="hidden lg:flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#202225] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
          <button
            type="button"
            onClick={() => onChangeView('editor')}
            style={activeView === 'editor' ? { color: activeColors.notes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeView === 'editor'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>{t.notes}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeView('tasks')}
            style={activeView === 'tasks' ? { color: activeColors.notes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeView === 'tasks'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <CheckSquare className="w-4 h-4 shrink-0" />
            <span>{t.tasks}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeView('graph')}
            style={activeView === 'graph' ? { color: activeColors.notes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeView === 'graph'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Network className="w-4 h-4 shrink-0" />
            <span>{t.graph}</span>
          </button>
        </div>
      )}

      {activeSuiteModule === 'recipes' && onChangeCookbookTab && (
        <div className="hidden lg:flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#202225] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
          <button
            type="button"
            onClick={() => onChangeCookbookTab('calendar')}
            style={activeCookbookTab === 'calendar' ? { color: activeColors.recipes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeCookbookTab === 'calendar'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <CalendarIcon className="w-4 h-4 shrink-0" />
            <span>Essenskalender</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeCookbookTab('cycle')}
            style={activeCookbookTab === 'cycle' ? { color: activeColors.recipes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeCookbookTab === 'cycle'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Repeat className="w-4 h-4 shrink-0" />
            <span>Zyklus</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeCookbookTab('recipes')}
            style={activeCookbookTab === 'recipes' ? { color: activeColors.recipes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeCookbookTab === 'recipes'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Katalog</span>
          </button>

          {enableCookbookShoppingList && (
            <button
              type="button"
              onClick={() => onChangeCookbookTab('shopping')}
              style={activeCookbookTab === 'shopping' ? { color: activeColors.recipes } : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeCookbookTab === 'shopping'
                  ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span>Einkaufsliste</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onChangeCookbookTab('presentation')}
            style={activeCookbookTab === 'presentation' ? { color: activeColors.recipes } : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeCookbookTab === 'presentation'
                ? 'bg-white dark:bg-[#2B2D31] font-bold shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Wochenshow</span>
          </button>
        </div>
      )}

      {/* Zone 2: Unified Profile & Actions Menu */}
      <div className="flex items-center gap-2">
        <div className="relative" ref={userMenuRef}>
          {isUserMenuOpen && (
            <div 
              onClick={() => setIsUserMenuOpen(false)}
              className="fixed inset-0 z-[95] bg-black/10 backdrop-blur-2xs"
            />
          )}

          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[#E5E3DC] dark:border-[#2F3136] hover:border-[#C87D20] bg-white dark:bg-[#1E1F23] transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
            title="Benutzer- und Funktionsmenü öffnen"
          >
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.displayName}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#C87D20] text-white flex items-center justify-center text-xs font-bold">
                {currentUser?.displayName?.[0] || 'U'}
              </div>
            )}
            <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 hidden md:inline max-w-[90px] truncate">
              {currentUser?.displayName || 'Profil'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Unified Dropdown Content */}
          {isUserMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-24px)] p-2.5 bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 space-y-2">
              {/* PLATZ 1 (Top Position): Profile 1 / Profile 2 Switch when enabled in Notes */}
              {activeSuiteModule === 'notes' && profileSettings.enableSecondProfile && (
                <div className="p-2 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-1 block">
                    Notiz-Profil wechseln
                  </span>
                  <div
                    role="group"
                    aria-label="Profil-Umschalter"
                    className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white dark:bg-[#1A1B1E] border border-[#E5E3DC] dark:border-[#2F3136]"
                  >
                    {(['profile1', 'profile2'] as NoteProfileId[]).map((pid) => {
                      const prof = profileSettings[pid];
                      const isSelected = profileSettings.activeProfileId === pid;
                      const pColor = prof.colors.notes;
                      return (
                        <button
                          key={pid}
                          type="button"
                          onClick={() => {
                            onSwitchProfile(pid);
                            setIsUserMenuOpen(false);
                          }}
                          style={isSelected ? { backgroundColor: pColor } : undefined}
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 truncate ${
                            isSelected
                              ? 'text-white shadow-xs'
                              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: isSelected ? '#FFFFFF' : pColor }}
                          />
                          <span className="truncate">{prof.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* User Header Box */}
              <div className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                    {currentUser?.displayName || 'Gast'}
                  </span>
                  <span className="text-[10px] text-neutral-400 block truncate">
                    @{currentUser?.username || 'user'} · {currentUser?.role === 'admin' ? 'Administrator' : 'Benutzer'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    onOpenUserSwitch();
                    setIsUserMenuOpen(false);
                  }}
                  className="text-[10px] px-2 py-1 rounded-lg bg-white dark:bg-neutral-700 hover:bg-[#C87D20] hover:text-white transition-colors text-neutral-700 dark:text-neutral-300 font-medium border border-[#E5E3DC] dark:border-neutral-600 cursor-pointer shadow-2xs"
                >
                  Wechseln
                </button>
              </div>

              {/* Action Items: Context-aware per active Suite Module */}
              <div className="space-y-1.5">
                {activeSuiteModule !== 'finance' && activeSuiteModule !== 'dashboard' && (
                  <>
                    <button
                      onClick={() => {
                        onOpenShareModal();
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[var(--ochre-accent)] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ backgroundColor: `${currentModuleColor}1A`, color: currentModuleColor }}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </div>
                        <span>
                          {activeSuiteModule === 'wiki'
                            ? 'Wiki-Artikel teilen'
                            : activeSuiteModule === 'recipes'
                            ? 'Rezept teilen'
                            : t.shareNote}
                        </span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                    </button>

                    <button
                      onClick={() => {
                        onPrintA4();
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[var(--ochre-accent)] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 group-hover:text-white transition-colors">
                          <Printer className="w-3.5 h-3.5" />
                        </div>
                        <span>
                          {activeSuiteModule === 'wiki'
                            ? 'Wiki-Artikel als A4 drucken'
                            : activeSuiteModule === 'recipes'
                            ? 'Kochplan als A4 drucken'
                            : t.printA4}
                        </span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    onOpenSystemLogs();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 group-hover:bg-[#C87D20] group-hover:text-white transition-colors">
                      <Server className="w-3.5 h-3.5" />
                    </div>
                    <span>{t.dockerDiagnostics}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                <button
                  onClick={() => {
                    onOpenSettings();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 group-hover:bg-[#C87D20] group-hover:text-white transition-colors">
                      <Settings className="w-3.5 h-3.5" />
                    </div>
                    <span>{t.settings}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                <button
                  onClick={() => {
                    onToggleDarkMode();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
                      {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
                    </div>
                    <span>{t.themeToggle}: {isDarkMode ? t.darkMode : t.lightMode}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400">Umschalten</span>
                </button>

                {/* PWA App Install: Only appears on mobile devices */}
                {canInstallPwa && onInstallPwa && (
                  <button
                    onClick={() => {
                      onInstallPwa();
                      setIsUserMenuOpen(false);
                    }}
                    className="lg:hidden w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[#C87D20] dark:text-[#E09228] font-medium transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#C87D20] text-white flex items-center justify-center">
                        <Download className="w-3.5 h-3.5" />
                      </div>
                      <span>{t.installPwa}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C87D20] text-white">App</span>
                  </button>
                )}

                {onLogout && (
                  <button
                    onClick={() => {
                      onLogout();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-red-200 dark:border-red-950/40 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center">
                        <LogOut className="w-3.5 h-3.5" />
                      </div>
                      <span>Benutzer abmelden</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
