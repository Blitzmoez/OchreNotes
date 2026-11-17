import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Server,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Cpu,
  Layers,
  Wifi,
  WifiOff,
  FileText,
  Clock,
  Terminal,
  Activity,
  Trash2,
} from 'lucide-react';
import { SystemHealth, SystemLog, OfflineQueueItem } from '../../types';
import { api } from '../../services/api';

interface SystemLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentStats?: { lines: number; words: number; chars: number };
  lastSaved?: number;
  isOnline?: boolean;
  pendingSyncCount?: number;
  activeNoteTitle?: string;
}

type DiagnosticTabId = 'sync' | 'server' | 'logs';
const TAB_ORDER: DiagnosticTabId[] = ['sync', 'server', 'logs'];

export const SystemLogsModal: React.FC<SystemLogsModalProps> = ({
  isOpen,
  onClose,
  documentStats = { lines: 0, words: 0, chars: 0 },
  lastSaved,
  isOnline = true,
  pendingSyncCount = 0,
  activeNoteTitle,
}) => {
  const [activeTab, setActiveTab] = useState<DiagnosticTabId>('sync');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'server' | 'client'>('all');
  const [copied, setCopied] = useState(false);

  const tabRefs = useRef<Record<DiagnosticTabId, HTMLButtonElement | null>>({
    sync: null,
    server: null,
    logs: null,
  });
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const [h, serverLogs] = await Promise.all([api.fetchSystemHealth(), api.fetchSystemLogs()]);
      const clientLogs = api.getClientLogs();
      const merged = [...serverLogs, ...clientLogs].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setHealth(h);
      setLogs(merged);
      setQueueItems(api.getOfflineQueue());
    } catch (e) {
      console.error(e);
      setLogs(api.getClientLogs());
      setQueueItems(api.getOfflineQueue());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
      const interval = setInterval(fetchDiagnostics, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeTab]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (sourceFilter === 'client' && !log.source.startsWith('CLIENT:')) return false;
    if (sourceFilter === 'server' && log.source.startsWith('CLIENT:')) return false;
    return true;
  });

  const formatLastSavedTime = () => {
    if (!lastSaved) return 'Noch nicht gespeichert';
    const diffSec = Math.floor((Date.now() - lastSaved) / 1000);
    if (diffSec < 5) return 'gerade eben';
    if (diffSec < 60) return `vor ${diffSec} Sekunden`;
    const diffMin = Math.floor(diffSec / 60);
    return `vor ${diffMin} Minute${diffMin > 1 ? 'n' : ''}`;
  };

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs} Std. ${mins} Min.`;
    if (mins > 0) return `${mins} Min. ${secs} Sek.`;
    return `${secs} Sek.`;
  };

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFlushQueueNow = async () => {
    setSyncingQueue(true);
    try {
      await api.flushQueueNow();
      await fetchDiagnostics();
    } finally {
      setSyncingQueue(false);
    }
  };

  const handleClearQueue = () => {
    api.clearOfflineQueue();
    fetchDiagnostics();
  };

  const handleBodyTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-tab-swipe]') || target?.closest('input') || target?.closest('pre')) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleBodyTouchEnd = (e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const idx = TAB_ORDER.indexOf(activeTab);
      if (dx < 0 && idx < TAB_ORDER.length - 1) {
        setActiveTab(TAB_ORDER[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        setActiveTab(TAB_ORDER[idx - 1]);
      }
    }
  };

  const effectivePending = queueItems.length || pendingSyncCount;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-start justify-center px-2.5 pt-16 pb-3 sm:px-4 sm:pt-16 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white dark:bg-[#18191B] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col max-h-[calc(100dvh-5rem)] h-[80dvh]"
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Server className="w-5 h-5 text-[var(--ochre-accent)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                Docker &amp; Server Systemdiagnose
              </h2>
              <span className="text-[11px] text-neutral-400 block truncate">
                Synchronität, Serverstatus &amp; erweiterte Diagnose-Logs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={fetchDiagnostics}
              className="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Diagnose aktualisieren"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              aria-label="Systemdiagnose schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Swipeable Tab Bar */}
        <div className="px-3 sm:px-4 py-2.5 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#1A1C1F] shrink-0">
          <div
            data-no-tab-swipe
            className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F4F3EF] dark:bg-[#141518] border border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto no-scrollbar touch-pan-x overscroll-x-contain snap-x"
          >
            <button
              ref={(el) => {
                tabRefs.current.sync = el;
              }}
              type="button"
              onClick={() => setActiveTab('sync')}
              className={`flex-1 min-w-[115px] snap-center flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'sync'
                  ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 shrink-0" />}
              <span>Synchronität</span>
            </button>

            <button
              ref={(el) => {
                tabRefs.current.server = el;
              }}
              type="button"
              onClick={() => setActiveTab('server')}
              className={`flex-1 min-w-[115px] snap-center flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'server'
                  ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>Serverstatus</span>
            </button>

            <button
              ref={(el) => {
                tabRefs.current.logs = el;
              }}
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex-1 min-w-[100px] snap-center flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'logs'
                  ? 'bg-[var(--ochre-accent)] text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span>Logs ({logs.length})</span>
            </button>
          </div>
        </div>

        {/* Swipe-enabled Tab Body */}
        <div
          onTouchStart={handleBodyTouchStart}
          onTouchEnd={handleBodyTouchEnd}
          className="flex-1 overflow-hidden flex flex-col"
        >
          {/* TAB 1: SYNCHRONITÄT */}
          {activeTab === 'sync' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    {isOnline ? (
                      <Wifi className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-red-500" />
                    )}
                    <span>Speicher &amp; Synchronisation</span>
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      !isOnline
                        ? 'bg-red-100 dark:bg-red-950/40 text-red-600'
                        : effectivePending > 0
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {!isOnline ? 'Offline' : effectivePending > 0 ? `${effectivePending} ausstehend` : 'Synchron'}
                  </span>
                </div>

                <div className="space-y-2 pt-1 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Zuletzt gespeichert:</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {formatLastSavedTime()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Offline-Warteschlange:</span>
                    <span
                      className={`font-semibold ${
                        effectivePending === 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {effectivePending === 0 ? 'Alles synchron' : `${effectivePending} ausstehend`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-500 shrink-0">Vault-Pfad:</span>
                    <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300 truncate">
                      {health?.vaultPath || '/vault'}
                    </span>
                  </div>
                </div>

                {queueItems.length > 0 && (
                  <div className="pt-2.5 border-t border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                        Ausstehende Einträge ({queueItems.length})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleFlushQueueNow}
                          disabled={syncingQueue || !isOnline}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--ochre-accent)] text-white text-[11px] font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncingQueue ? 'animate-spin' : ''}`} />
                          <span>Jetzt synchronisieren</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearQueue}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-red-300 dark:border-red-900/50 text-red-600 dark:text-red-400 text-[11px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Leeren</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {queueItems.map((q) => (
                        <div
                          key={q.id}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 block truncate">
                              {q.action}: {q.payload?.path || q.payload?.notePath || 'Element'}
                            </span>
                            {q.lastError && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 block truncate">
                                {q.lastError} ({q.attempts || 0} Versuche)
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-400 shrink-0">
                            {new Date(q.timestamp).toLocaleTimeString('de-DE')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-[var(--ochre-accent)] shrink-0" />
                    <span className="truncate">
                      {activeNoteTitle ? `Aktives Dokument: ${activeNoteTitle}` : 'Aktuelles Dokument'}
                    </span>
                  </span>
                  <span className="text-[11px] text-neutral-400 flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    ~{Math.max(1, Math.ceil(documentStats.words / 200))} Min. Lesezeit
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="py-2.5 px-2 rounded-xl bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136]">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 block tabular-nums">
                      {documentStats.words}
                    </span>
                    <span className="text-[10px] text-neutral-500">Wörter</span>
                  </div>
                  <div className="py-2.5 px-2 rounded-xl bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136]">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 block tabular-nums">
                      {documentStats.chars}
                    </span>
                    <span className="text-[10px] text-neutral-500">Zeichen</span>
                  </div>
                  <div className="py-2.5 px-2 rounded-xl bg-white dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136]">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100 block tabular-nums">
                      {documentStats.lines}
                    </span>
                    <span className="text-[10px] text-neutral-500">Zeilen</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SERVERSTATUS */}
          {activeTab === 'server' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {!health ? (
                <div className="py-12 text-center text-neutral-400">Lade Serverstatus...</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-3">
                      {health.status === 'healthy' ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                      )}
                      <div>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                          Server Status
                        </span>
                        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          {health.status === 'healthy' ? 'Bereit & Gesund' : 'Eingeschränkt'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-3">
                      <HardDrive
                        className={`w-6 h-6 shrink-0 ${
                          health.volumeWritable ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      />
                      <div>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                          Docker Volume
                        </span>
                        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          {health.volumeWritable ? 'Schreibrechte OK' : 'Schreibfehler!'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-3">
                      <Layers className="w-6 h-6 text-[var(--ochre-accent)] shrink-0" />
                      <div>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                          Port / Umgebung
                        </span>
                        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          Port {health.port} {health.dockerDetected ? '(Docker Container)' : '(Host)'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-3">
                      <Cpu className="w-6 h-6 text-blue-500 shrink-0" />
                      <div>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                          RAM Auslastung
                        </span>
                        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                          {health.memoryMb} MB
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF9F5] dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Laufzeit (Uptime):</span>
                      <span className="font-semibold tabular-nums">{formatUptime(health.uptimeSeconds)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Notizen im Vault:</span>
                      <span className="font-semibold tabular-nums">{health.notesCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Erkannte Aufgaben:</span>
                      <span className="font-semibold tabular-nums">{health.tasksCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-500 shrink-0">Datenverzeichnis:</span>
                      <span className="font-mono text-[10px] text-neutral-600 dark:text-neutral-400 truncate">
                        {health.vaultPath}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: LOGS */}
          {activeTab === 'logs' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-3 sm:px-4 py-2 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0 bg-white dark:bg-[#18191B] flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterLevel('all')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                      filterLevel === 'all'
                        ? 'bg-neutral-800 dark:bg-white text-white dark:text-neutral-900 font-medium'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Alle ({logs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterLevel('error')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                      filterLevel === 'error'
                        ? 'bg-red-600 text-white font-medium'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Fehler ({logs.filter((l) => l.level === 'error').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterLevel('warn')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                      filterLevel === 'warn'
                        ? 'bg-amber-600 text-white font-medium'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Warnungen ({logs.filter((l) => l.level === 'warn').length})
                  </button>

                  <span className="w-px h-3.5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-1" />

                  {(['all', 'server', 'client'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setSourceFilter(src)}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                        sourceFilter === src
                          ? 'bg-[var(--ochre-accent)] text-white font-semibold'
                          : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                      }`}
                    >
                      {src === 'all' ? 'Server+Client' : src === 'server' ? 'Server' : 'Client'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#F4F3EF] dark:bg-[#202225] text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Kopiert' : 'Logs kopieren'}</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 bg-[#111214] text-neutral-200 font-mono text-[11px] leading-relaxed space-y-1">
                {filteredLogs.length === 0 ? (
                  <div className="text-neutral-500 py-6 text-center">
                    Keine Log-Einträge für diesen Filter vorhanden.
                  </div>
                ) : (
                  filteredLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 border-b border-neutral-900/60 pb-1">
                      <span className="text-neutral-500 shrink-0 tabular-nums">
                        {log.timestamp.split('T')[1]?.replace('Z', '') || log.timestamp}
                      </span>

                      <span
                        className={`px-1 rounded text-[9px] font-bold uppercase shrink-0 ${
                          log.level === 'error'
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : log.level === 'warn'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}
                      >
                        {log.level}
                      </span>

                      <span className="text-neutral-400 shrink-0">[{log.source}]</span>

                      <span
                        className={`flex-1 break-all ${
                          log.level === 'error'
                            ? 'text-red-300'
                            : log.level === 'warn'
                            ? 'text-amber-300'
                            : 'text-neutral-200'
                        }`}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
