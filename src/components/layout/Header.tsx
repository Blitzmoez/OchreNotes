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
  Wifi, 
  WifiOff, 
  Settings, 
  UserCheck,
  ChevronDown,
  ChevronRight,
  Check,
  Download,
  LogOut,
  Sparkles,
  Utensils,
  BarChart3,
  HardDrive,
  Info,
  Clock,
  Layers,
  X
} from 'lucide-react';
import { User, PaneType } from '../../types';

interface HeaderProps {
  currentUser: User | null;
  activeNoteTitle: string;
  isSharedNote?: boolean;
  sharedFrom?: string;
  activeView: PaneType;
  onChangeView: (view: PaneType) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  lastSaved?: number;
  documentStats?: { lines: number; words: number; chars: number };
  onOpenShareModal: () => void;
  onPrintA4: () => void;
  onOpenSystemLogs: () => void;
  onOpenSettings: () => void;
  onOpenUserSwitch: () => void;
  onLogout?: () => void;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
  appTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeNoteTitle,
  isSharedNote,
  sharedFrom,
  activeView,
  onChangeView,
  isDarkMode,
  onToggleDarkMode,
  isOnline,
  pendingSyncCount,
  lastSaved,
  documentStats = { lines: 0, words: 0, chars: 0 },
  onOpenShareModal,
  onPrintA4,
  onOpenSystemLogs,
  onOpenSettings,
  onOpenUserSwitch,
  onLogout,
  canInstallPwa,
  onInstallPwa,
  appTitle = 'Ochre Suite',
}) => {
  // Ochre Suite modular menu dropdown
  const [isSuiteMenuOpen, setIsSuiteMenuOpen] = useState(false);
  // User & actions menu dropdown
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  // Wifi / Sync info popover
  const [isSyncInfoOpen, setIsSyncInfoOpen] = useState(false);

  const suiteMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const syncInfoRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (suiteMenuRef.current && !suiteMenuRef.current.contains(e.target as Node)) {
        setIsSuiteMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (syncInfoRef.current && !syncInfoRef.current.contains(e.target as Node)) {
        setIsSyncInfoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const formatLastSavedTime = () => {
    if (!lastSaved) return 'Noch nicht gespeichert';
    const diffSec = Math.floor((Date.now() - lastSaved) / 1000);
    if (diffSec < 5) return 'gerade eben';
    if (diffSec < 60) return `vor ${diffSec} Sekunden`;
    const diffMin = Math.floor(diffSec / 60);
    return `vor ${diffMin} Minute${diffMin > 1 ? 'n' : ''}`;
  };

  return (
    <header className="h-14 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] px-3 md:px-4 flex items-center justify-between gap-2 md:gap-3 select-none shrink-0 relative z-[90]">
      {/* Zone 1: Modular Logo & Active Module Name */}
      <div className="flex items-center gap-2.5 min-w-0">
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
            {/* Ringblock Icon */}
            <div className="w-6.5 h-6.5 rounded-lg bg-gradient-to-br from-[#D98B26] to-[#A86415] text-white flex items-center justify-center shadow-xs relative overflow-hidden shrink-0">
              {/* Spiral rings */}
              <div className="absolute left-0.5 top-0 bottom-0 flex flex-col justify-around py-0.5">
                <span className="w-1 h-0.5 rounded-full bg-white/90 shadow-2xs"></span>
                <span className="w-1 h-0.5 rounded-full bg-white/90 shadow-2xs"></span>
                <span className="w-1 h-0.5 rounded-full bg-white/90 shadow-2xs"></span>
              </div>
              {/* Lined paper lines inside Ringblock */}
              <div className="ml-1.5 flex flex-col gap-0.5 w-3">
                <div className="h-0.5 bg-white/95 rounded-full w-full"></div>
                <div className="h-0.5 bg-white/75 rounded-full w-3/4"></div>
                <div className="h-0.5 bg-white/60 rounded-full w-2/3"></div>
              </div>
            </div>

            {/* In Daily Business: Only clean Module Name (e.g. "Notes") in bubble with subtle dropdown chevron */}
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-xs md:text-sm tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                Notes
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
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#D98B26] to-[#A86415] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    OS
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 leading-tight">
                      Ochre Suite
                    </h3>
                    <span className="text-[10px] text-neutral-400">Modulares Ökosystem</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsSuiteMenuOpen(false)}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Module Items with rounded box cards for optimal mobile & desktop touch */}
              <div className="space-y-2">
                {/* Active Module: Notes */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border-2 border-[#C87D20] text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#C87D20] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      📝
                    </div>
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 block">Notes</span>
                      <span className="text-[11px] text-neutral-500">Obsidian Markdown & Aufgaben</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C87D20] text-white font-semibold">
                    Aktiv
                  </span>
                </div>

                {/* Future Module: Kochbuch */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 text-xs opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200 block">Kochbuch</span>
                      <span className="text-[11px] text-neutral-400">Rezepte & Essensplaner</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-500 font-medium">
                    Demnächst
                  </span>
                </div>

                {/* Future Module: Analytics */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 text-xs opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200 block">Analytics</span>
                      <span className="text-[11px] text-neutral-400">Statistiken & Fokus</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-500 font-medium">
                    Geplant
                  </span>
                </div>

                {/* Future Module: Cloud Sync */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 text-xs opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200 block">Vault Sync</span>
                      <span className="text-[11px] text-neutral-400">End-to-End P2P Sync</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-500 font-medium">
                    Geplant
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136] px-1 text-[11px] text-neutral-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C87D20]" />
                <span>More to come... Modulare Suite</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: Navigation Modes (Notizen, Aufgaben, Graph) - Desktop View */}
      <div className="hidden lg:flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#202225] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
        <button
          onClick={() => onChangeView('editor')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeView === 'editor'
              ? 'bg-white dark:bg-[#2B2D31] text-[#C87D20] dark:text-[#E09228] font-bold shadow-xs'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          title="Notizen-Editor"
        >
          <BookOpen className="w-4 h-4" />
          <span>Notizen</span>
        </button>

        <button
          onClick={() => onChangeView('tasks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeView === 'tasks'
              ? 'bg-white dark:bg-[#2B2D31] text-[#C87D20] dark:text-[#E09228] font-bold shadow-xs'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          title="Aufgaben-Übersicht"
        >
          <CheckSquare className="w-4 h-4" />
          <span>Aufgaben</span>
        </button>

        <button
          onClick={() => onChangeView('graph')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeView === 'graph'
              ? 'bg-white dark:bg-[#2B2D31] text-[#C87D20] dark:text-[#E09228] font-bold shadow-xs'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          title="Wissensgraph"
        >
          <Network className="w-4 h-4" />
          <span>Graph</span>
        </button>
      </div>

      {/* Zone 3: Wifi/Cloud Status Badge & Unified User Menu */}
      <div className="flex items-center gap-2">
        {/* Wifi / Sync / Document Stats Badge */}
        <div className="relative" ref={syncInfoRef}>
          <button
            onClick={() => setIsSyncInfoOpen(!isSyncInfoOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              !isOnline
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 text-red-600'
                : pendingSyncCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 text-amber-700'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
            }`}
            title="WLAN-, Speicher- und Dokumentenstatistik anzeigen"
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {!isOnline
                ? 'Offline'
                : pendingSyncCount > 0
                ? `${pendingSyncCount} ausstehend`
                : 'Gespeichert'}
            </span>
            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* Sync & Stats Popover Card */}
          {isSyncInfoOpen && (
            <div className="absolute top-full right-0 mt-2 w-72 p-3 bg-white dark:bg-[#1E1F23] rounded-xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2F3136]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  <Info className="w-3.5 h-3.5 text-[#C87D20]" />
                  <span>Speicher & Dokumentenstatus</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold">
                  Aktiv
                </span>
              </div>

              {/* Document Statistics */}
              <div className="space-y-1.5 text-xs">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                  Aktuelles Dokument
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2C31]">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 block">
                      {documentStats.words}
                    </span>
                    <span className="text-[10px] text-neutral-500">Wörter</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2C31]">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 block">
                      {documentStats.chars}
                    </span>
                    <span className="text-[10px] text-neutral-500">Zeichen</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2C31]">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 block">
                      {documentStats.lines}
                    </span>
                    <span className="text-[10px] text-neutral-500">Zeilen</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Geschätzte Lesezeit:
                  </span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    ~{Math.max(1, Math.ceil(documentStats.words / 200))} min
                  </span>
                </div>
              </div>

              {/* Storage & Cloud Sync Status */}
              <div className="space-y-1.5 text-xs pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-500">Zuletzt gespeichert:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {formatLastSavedTime()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-500">Synchronisation:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {pendingSyncCount === 0 ? 'Alles synchron' : `${pendingSyncCount} in Warteschlange`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-500">Docker Volume:</span>
                  <span className="font-mono text-[10px] text-neutral-600 dark:text-neutral-400">/vault</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Unified Profile & Actions Dropdown Menu */}
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
            <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 hidden md:inline max-w-[80px] truncate">
              {currentUser?.displayName || 'Profil'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Unified Dropdown Content: Every action in its own button card outline */}
          {isUserMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-72 p-2.5 bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 space-y-2">
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

              {/* Action Items: Formatted as individual button cards */}
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    onOpenShareModal();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-[#C87D20] group-hover:bg-[#C87D20] group-hover:text-white transition-colors">
                      <Share2 className="w-3.5 h-3.5" />
                    </div>
                    <span>Notiz teilen</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                <button
                  onClick={() => {
                    onPrintA4();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-50/70 dark:bg-neutral-800/40 hover:border-[#C87D20] hover:bg-amber-500/10 text-neutral-800 dark:text-neutral-200 transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 group-hover:bg-[#C87D20] group-hover:text-white transition-colors">
                      <Printer className="w-3.5 h-3.5" />
                    </div>
                    <span>DIN A4 Druck / PDF</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

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
                    <span>Docker Container & Diagnose</span>
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
                    <span>Einstellungen & Vault-Backup</span>
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
                    <span>Design: {isDarkMode ? 'Dunkelmodus' : 'Hellmodus'}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400">Umschalten</span>
                </button>

                {canInstallPwa && onInstallPwa && (
                  <button
                    onClick={() => {
                      onInstallPwa();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2.5 text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[#C87D20] dark:text-[#E09228] font-medium transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#C87D20] text-white flex items-center justify-center">
                        <Download className="w-3.5 h-3.5" />
                      </div>
                      <span>App installieren (PWA)</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C87D20] text-white">Neu</span>
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
