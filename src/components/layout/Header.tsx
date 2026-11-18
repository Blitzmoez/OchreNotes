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
  ChevronLeft,
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
  LayoutDashboard,
  Cpu,
  FolderKanban,
  HelpCircle
} from 'lucide-react';
import { User, PaneType, SuiteModuleId, EnabledModules, SuiteProfileSettings, NoteProfileId, CookbookTab } from '../../types';
import { DEFAULT_MODULE_ORDER } from '../../services/profileDefaults';
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
  enableCookbookCycle?: boolean;
  mobileBarPosition?: 'top' | 'bottom';
  onStartTour?: () => void;
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
  enableCookbookCycle = true,
  mobileBarPosition = 'top',
  onStartTour,
}) => {
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
  const currentModuleColor = activeColors[activeSuiteModule] || activeColors.notes;
  const { t } = useTranslation();
  // Ochre Suite modular menu dropdown
  const [isSuiteMenuOpen, setIsSuiteMenuOpen] = useState(false);
  const [isSuiteMenuClosing, setIsSuiteMenuClosing] = useState(false);
  // User & actions menu dropdown
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isUserMenuClosing, setIsUserMenuClosing] = useState(false);

  const suiteMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const suiteCloseTimerRef = useRef<number | null>(null);
  const userCloseTimerRef = useRef<number | null>(null);

  const openSuiteMenu = () => {
    if (suiteCloseTimerRef.current) {
      window.clearTimeout(suiteCloseTimerRef.current);
      suiteCloseTimerRef.current = null;
    }
    setIsSuiteMenuClosing(false);
    setIsSuiteMenuOpen(true);
  };

  const closeSuiteMenu = () => {
    if (!isSuiteMenuOpen || isSuiteMenuClosing) return;
    setIsSuiteMenuClosing(true);
    if (suiteCloseTimerRef.current) window.clearTimeout(suiteCloseTimerRef.current);
    suiteCloseTimerRef.current = window.setTimeout(() => {
      setIsSuiteMenuOpen(false);
      setIsSuiteMenuClosing(false);
      suiteCloseTimerRef.current = null;
    }, 195);
  };

  const openUserMenu = () => {
    if (userCloseTimerRef.current) {
      window.clearTimeout(userCloseTimerRef.current);
      userCloseTimerRef.current = null;
    }
    setIsUserMenuClosing(false);
    setIsUserMenuOpen(true);
  };

  const closeUserMenu = () => {
    if (!isUserMenuOpen || isUserMenuClosing) return;
    setIsUserMenuClosing(true);
    if (userCloseTimerRef.current) window.clearTimeout(userCloseTimerRef.current);
    userCloseTimerRef.current = window.setTimeout(() => {
      setIsUserMenuOpen(false);
      setIsUserMenuClosing(false);
      userCloseTimerRef.current = null;
    }, 195);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (suiteMenuRef.current && !suiteMenuRef.current.contains(e.target as Node)) {
        closeSuiteMenu();
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        closeUserMenu();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  });

  const isBottomMobile = mobileBarPosition === 'bottom';

  return (
    <header
      className={`border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] px-3 md:px-4 flex items-center justify-between gap-2 md:gap-3 select-none shrink-0 relative z-[90] ${
        isBottomMobile
          ? 'order-last lg:order-first border-t lg:border-t-0 lg:border-b min-h-14 lg:h-14 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:py-0'
          : 'h-14 border-b'
      }`}
    >
      {/* Zone 1: Modular Logo & Active Module Name */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        {/* Module Switcher Drawer Trigger */}
        <div className="relative" ref={suiteMenuRef}>
          {/* Backdrop overlay */}
          {isSuiteMenuOpen && (
            <div 
              data-no-swipe
              onClick={closeSuiteMenu}
              className={`fixed inset-0 z-[100] bg-black/25 backdrop-blur-2xs transition-opacity duration-200 ${
                isSuiteMenuClosing ? 'opacity-0' : 'opacity-100'
              }`}
            />
          )}

          <button
            type="button"
            data-tour="module-switcher"
            onClick={(e) => {
              e.stopPropagation();
              if (isSuiteMenuOpen && !isSuiteMenuClosing) {
                closeSuiteMenu();
              } else {
                openSuiteMenu();
              }
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
            {activeSuiteModule === 'smarthome' && (
              <div
                style={{ backgroundColor: activeColors.smarthome }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
              >
                <Cpu className="w-3.5 h-3.5" />
              </div>
            )}
            {activeSuiteModule === 'projects' && (
              <div
                style={{ backgroundColor: activeColors.projects }}
                className="w-6.5 h-6.5 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
              >
                <FolderKanban className="w-3.5 h-3.5" />
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
                  ? 'Essensplan'
                  : activeSuiteModule === 'finance'
                  ? 'Finanzen'
                  : activeSuiteModule === 'smarthome'
                  ? 'Smarthome'
                  : 'Projekte'}
              </span>
              <ChevronRight className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-transform duration-200 ${isSuiteMenuOpen && !isSuiteMenuClosing ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {/* Module Switcher Full-Height Left Drawer (Slides in from left, fades out cleanly) */}
          {isSuiteMenuOpen && (
            <div 
              data-no-swipe
              onClick={(e) => e.stopPropagation()}
              className={`fixed inset-y-0 left-0 h-[100dvh] w-72 sm:w-80 bg-white dark:bg-[#1E1F23] shadow-2xl border-r border-[#E5E3DC] dark:border-[#2F3136] z-[110] flex flex-col p-4 space-y-3 ${
                isSuiteMenuClosing ? 'animate-drawer-fade-out pointer-events-none' : 'animate-drawer-in-left'
              }`}
            >
              {/* Prominent Ochre Suite Brand Header with Notizbuch Icon */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DC] dark:border-[#2F3136] shrink-0">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/favicon.svg"
                    alt="Ochre Suite"
                    className="w-8 h-8 rounded-xl shadow-xs shrink-0"
                  />
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 leading-tight">
                      Ochre Suite
                    </h3>
                    <span className="text-[11px] text-neutral-400">
                      {activeSuiteModule === 'notes' ? `Profil: ${activeProfile.name}` : `@${currentUser?.username || 'michael'}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Module Items sorted by user-configured moduleOrder */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {(() => {
                  const descriptors: Record<
                    SuiteModuleId,
                    {
                      label: string;
                      subtitle: string;
                      icon: React.ComponentType<{ className?: string }>;
                    }
                  > = {
                    dashboard: {
                      label: 'Dashboard',
                      subtitle: 'Alle Module, Aufgaben & Forecast',
                      icon: LayoutDashboard,
                    },
                    notes: {
                      label: 'Notes',
                      subtitle: 'Obsidian Markdown & Aufgaben',
                      icon: BookOpen,
                    },
                    wiki: {
                      label: 'Wiki',
                      subtitle: 'Anleitungen, Fotos & Code-Ablage',
                      icon: BookMarked,
                    },
                    recipes: {
                      label: 'Essensplan',
                      subtitle: 'Kalender, Rezepte & Einkaufsliste',
                      icon: Utensils,
                    },
                    finance: {
                      label: 'Finanzen',
                      subtitle: 'CSV Bankimport, Kreditoren & Bar',
                      icon: BarChart3,
                    },
                    projects: {
                      label: 'Projekte',
                      subtitle: 'Kanban, Timeline & Notiz-Links',
                      icon: FolderKanban,
                    },
                    smarthome: {
                      label: 'Smarthome',
                      subtitle: 'Live MQTT, Sensoren & Telemetrie',
                      icon: Cpu,
                    },
                  };

                  const rawOrder = profileSettings.moduleOrder && profileSettings.moduleOrder.length > 0
                    ? profileSettings.moduleOrder
                    : DEFAULT_MODULE_ORDER;
                  const orderedModules: SuiteModuleId[] = [
                    ...rawOrder.filter((id, idx) => Boolean(descriptors[id]) && rawOrder.indexOf(id) === idx),
                    ...DEFAULT_MODULE_ORDER.filter((id) => !rawOrder.includes(id)),
                  ];

                  return orderedModules.map((modId) => {
                    if (!enabledModules[modId]) return null;
                    const desc = descriptors[modId];
                    const ModIcon = desc.icon;
                    const color = activeColors[modId];
                    const isActive = activeSuiteModule === modId;
                    return (
                      <div
                        key={modId}
                        onClick={() => {
                          onSelectSuiteModule(modId);
                          setIsSuiteMenuOpen(false);
                        }}
                        style={
                          isActive
                            ? { borderColor: color, backgroundColor: `${color}14` }
                            : undefined
                        }
                        className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                          isActive
                            ? 'border-2'
                            : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-neutral-400 bg-white dark:bg-[#202225]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            style={{ backgroundColor: color }}
                            className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
                          >
                            <ModIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-neutral-900 dark:text-neutral-100 block">
                              {desc.label}
                            </span>
                            <span className="text-[11px] text-neutral-500">{desc.subtitle}</span>
                          </div>
                        </div>
                        {isActive ? (
                          <span
                            style={{ backgroundColor: color }}
                            className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                          >
                            Aktiv
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-400">Öffnen →</span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Split Thumb-Zone Footer: 2/3 Close Button + 1/3 Module Verwalten */}
              <div className="pt-3 border-t border-[#E5E3DC] dark:border-[#2F3136] flex items-stretch gap-2 text-xs shrink-0 pb-[env(safe-area-inset-bottom)]">
                <button
                  type="button"
                  onClick={closeSuiteMenu}
                  className="w-2/3 min-h-[44px] rounded-xl bg-[#F4F3EF] hover:bg-neutral-200 dark:bg-[#25272C] dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>Menü schließen</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeSuiteMenu();
                    onOpenSettings();
                  }}
                  style={{ borderColor: `${currentModuleColor}40`, color: currentModuleColor }}
                  className="w-1/3 min-h-[44px] rounded-xl border bg-white hover:bg-amber-500/10 dark:bg-[#202225] dark:hover:bg-amber-500/10 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] leading-tight font-bold transition-colors cursor-pointer active:scale-[0.98]"
                  title="Module & Profile verwalten"
                >
                  <Settings className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-left">
                    Module
                    <br />
                    verwalten
                  </span>
                </button>
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

          {enableCookbookCycle && (
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
          )}

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
              data-no-swipe
              onClick={closeUserMenu}
              className={`fixed inset-0 z-[100] bg-black/25 backdrop-blur-2xs transition-opacity duration-200 ${
                isUserMenuClosing ? 'opacity-0' : 'opacity-100'
              }`}
            />
          )}

          <button
            data-tour="user-menu"
            onClick={() => {
              if (isUserMenuOpen && !isUserMenuClosing) {
                closeUserMenu();
              } else {
                openUserMenu();
              }
            }}
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
            <ChevronLeft className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${isUserMenuOpen && !isUserMenuClosing ? 'rotate-180' : ''}`} />
          </button>

          {/* Right-Anchored Full-Height Profile Drawer (Slides in from right, fades out cleanly) */}
          {isUserMenuOpen && (
            <div
              data-no-swipe
              onClick={(e) => e.stopPropagation()}
              className={`fixed inset-y-0 right-0 h-[100dvh] w-72 sm:w-80 max-w-[85vw] bg-white dark:bg-[#1E1F23] shadow-2xl border-l border-[#E5E3DC] dark:border-[#2F3136] z-[110] flex flex-col p-4 space-y-3 ${
                isUserMenuClosing ? 'animate-drawer-fade-out pointer-events-none' : 'animate-drawer-in-right'
              }`}
            >
              {/* Drawer Header matching Module Drawer (single bottom close button) */}
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#E5E3DC] dark:border-[#2F3136] shrink-0">
                {currentUser?.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.displayName}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-xl object-cover shadow-xs shrink-0"
                  />
                ) : (
                  <div
                    style={{ backgroundColor: currentModuleColor }}
                    className="w-8 h-8 rounded-xl text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0"
                  >
                    {currentUser?.displayName?.[0] || 'U'}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 leading-tight truncate">
                    {currentUser?.displayName || 'Gast'}
                  </h3>
                  <span className="text-[11px] text-neutral-400 block truncate">
                    @{currentUser?.username || 'user'} · {currentUser?.role === 'admin' ? 'Administrator' : 'Benutzer'}
                  </span>
                </div>
              </div>

              {/* Scrollable Middle Actions Area */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {/* Profil 1 / 2 Switch at TOP on Desktop or when Mobile Bar is TOP */}
                {activeSuiteModule === 'notes' && profileSettings.enableSecondProfile && (
                  <div
                    className={`p-2.5 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] space-y-1.5 ${
                      isBottomMobile ? 'hidden lg:block' : 'block'
                    }`}
                  >
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

                {/* User Switch Box */}
                <div className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#202225] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                      Benutzerkonto
                    </span>
                    <span className="text-[11px] text-neutral-500 block truncate">
                      Aktuell: {currentUser?.displayName || 'Gast'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      onOpenUserSwitch();
                      setIsUserMenuOpen(false);
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#2A2C31] hover:bg-[#C87D20] hover:text-white transition-colors text-neutral-700 dark:text-neutral-300 font-semibold border border-[#E5E3DC] dark:border-neutral-600 cursor-pointer shadow-2xs shrink-0"
                  >
                    Wechseln
                  </button>
                </div>

                {/* Action Items: Context-aware per active Suite Module */}
                <div className="space-y-1.5">
                  {(activeSuiteModule === 'notes' || activeSuiteModule === 'wiki' || activeSuiteModule === 'recipes') && (
                    <button
                      onClick={() => {
                        onOpenShareModal();
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:border-[var(--ochre-accent)] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                          style={{ backgroundColor: `${currentModuleColor}1A`, color: currentModuleColor }}
                        >
                          <Share2 className="w-4 h-4" />
                        </div>
                        <span className="font-semibold">
                          {activeSuiteModule === 'wiki'
                            ? 'Wiki-Artikel teilen'
                            : activeSuiteModule === 'recipes'
                            ? 'Rezept teilen'
                            : t.shareNote}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    </button>
                  )}

                  {(activeSuiteModule === 'notes' ||
                    activeSuiteModule === 'wiki' ||
                    activeSuiteModule === 'recipes' ||
                    activeSuiteModule === 'projects') && (
                    <button
                      onClick={() => {
                        onPrintA4();
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:border-[var(--ochre-accent)] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 transition-colors">
                          <Printer className="w-4 h-4" />
                        </div>
                        <span className="font-semibold">
                          {activeSuiteModule === 'wiki'
                            ? 'Wiki-Artikel als A4 drucken'
                            : activeSuiteModule === 'recipes'
                            ? 'Essensplan als A4 drucken'
                            : activeSuiteModule === 'projects'
                            ? 'Projekt als A4 drucken'
                            : t.printA4}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onOpenSystemLogs();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 group-hover:bg-[#C87D20] group-hover:text-white transition-colors">
                        <Server className="w-4 h-4" />
                      </div>
                      <span className="font-semibold">{t.dockerDiagnostics}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-400" />
                  </button>

                  <button
                    onClick={() => {
                      onOpenSettings();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 group-hover:bg-[#C87D20] group-hover:text-white transition-colors">
                        <Settings className="w-4 h-4" />
                      </div>
                      <span className="font-semibold">{t.settings}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-400" />
                  </button>

                  {onStartTour && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onStartTour();
                      }}
                      className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:border-[var(--ochre-accent)] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                          style={{ backgroundColor: `${currentModuleColor}1A`, color: currentModuleColor }}
                        >
                          <HelpCircle className="w-4 h-4" />
                        </div>
                        <span className="font-semibold">Hilfe / Geführte Tour</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onToggleDarkMode();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#202225] hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
                        {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
                      </div>
                      <span className="font-semibold">{t.themeToggle}: {isDarkMode ? t.darkMode : t.lightMode}</span>
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
                      className="lg:hidden w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[#C87D20] dark:text-[#E09228] font-semibold transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#C87D20] text-white flex items-center justify-center">
                          <Download className="w-4 h-4" />
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
                      className="w-full flex items-center justify-between p-3 text-xs rounded-2xl border border-red-200 dark:border-red-950/40 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center">
                          <LogOut className="w-4 h-4" />
                        </div>
                        <span className="font-semibold">Benutzer abmelden</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Thumb-Zone Footer: Profil 1/2 Switch (when Mobile Bar is Bottom) + Menü schließen Button */}
              <div className="pt-3 border-t border-[#E5E3DC] dark:border-[#2F3136] flex flex-col gap-2 shrink-0 pb-[env(safe-area-inset-bottom)]">
                {isBottomMobile && activeSuiteModule === 'notes' && profileSettings.enableSecondProfile && (
                  <div className="lg:hidden p-2 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-1 block">
                      Notiz-Profil wechseln
                    </span>
                    <div
                      role="group"
                      aria-label="Profil-Umschalter unten"
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
                            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 truncate ${
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

                <button
                  type="button"
                  onClick={closeUserMenu}
                  className="w-full min-h-[42px] rounded-xl bg-[#F4F3EF] hover:bg-neutral-200 dark:bg-[#25272C] dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                >
                  <X className="w-4 h-4" />
                  <span>Menü schließen</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
