import React, { useState, useEffect } from 'react';
import { 
  X, 
  Server, 
  RefreshCw, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  HardDrive,
  Cpu,
  Layers
} from 'lucide-react';
import { SystemHealth, SystemLog } from '../../types';
import { api } from '../../services/api';

interface SystemLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemLogsModal: React.FC<SystemLogsModalProps> = ({ isOpen, onClose }) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [copied, setCopied] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const [h, l] = await Promise.all([
        api.fetchSystemHealth(),
        api.fetchSystemLogs(),
      ]);
      setHealth(h);
      setLogs(l);
    } catch (e) {
      console.error(e);
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

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === 'all') return true;
    return log.level === filterLevel;
  });

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white dark:bg-[#18191B] rounded-xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-[#C87D20]" />
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Docker & Server Systemdiagnose
              </h2>
              <span className="text-[11px] text-neutral-400">
                Echtzeit-Diagnose und Konsolen-Logs des Node.js/Docker Backends
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiagnostics}
              className="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Logs aktualisieren"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Health KPI Strip */}
        {health && (
          <div className="p-3 bg-[#F4F3EF] dark:bg-[#202225] border-b border-[#E5E3DC] dark:border-[#2F3136] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0">
            {/* Status */}
            <div className="flex items-center gap-2">
              {health.status === 'healthy' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <div>
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">Server Status</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {health.status === 'healthy' ? 'Bereit & Gesund' : 'Eingeschränkt'}
                </span>
              </div>
            </div>

            {/* Volume Writable */}
            <div className="flex items-center gap-2">
              <HardDrive className={`w-4 h-4 shrink-0 ${health.volumeWritable ? 'text-emerald-500' : 'text-red-500'}`} />
              <div>
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">Docker Volume</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {health.volumeWritable ? 'Schreibrechte OK' : 'Schreibfehler!'}
                </span>
              </div>
            </div>

            {/* Port & Container */}
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#C87D20] shrink-0" />
              <div>
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">Port / Docker</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Port {health.port} {health.dockerDetected ? '(Container)' : '(Host)'}
                </span>
              </div>
            </div>

            {/* RAM */}
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">RAM Auslastung</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">
                  {health.memoryMb} MB
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Filter & Copy Bar */}
        <div className="px-4 py-2 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2 shrink-0 bg-white dark:bg-[#18191B]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterLevel('all')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filterLevel === 'all'
                  ? 'bg-neutral-800 dark:bg-white text-white dark:text-neutral-900 font-medium'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Alle ({logs.length})
            </button>
            <button
              onClick={() => setFilterLevel('error')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filterLevel === 'error'
                  ? 'bg-red-600 text-white font-medium'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Fehler ({logs.filter((l) => l.level === 'error').length})
            </button>
            <button
              onClick={() => setFilterLevel('warn')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filterLevel === 'warn'
                  ? 'bg-amber-600 text-white font-medium'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Warnungen ({logs.filter((l) => l.level === 'warn').length})
            </button>
          </div>

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#F4F3EF] dark:bg-[#202225] text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Kopiert' : 'Logs kopieren'}</span>
          </button>
        </div>

        {/* Log Stream Viewer */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#111214] text-neutral-200 font-mono text-[11px] leading-relaxed space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-neutral-500 py-6 text-center">
              Keine Log-Einträge für diesen Filter vorhanden.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 border-b border-neutral-900/60 pb-1">
                <span className="text-neutral-500 shrink-0 tabular-nums">
                  {log.timestamp.split('T')[1].replace('Z', '')}
                </span>

                <span className={`px-1 rounded text-[9px] font-bold uppercase shrink-0 ${
                  log.level === 'error'
                    ? 'bg-red-950 text-red-400 border border-red-800'
                    : log.level === 'warn'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                }`}>
                  {log.level}
                </span>

                <span className="text-neutral-400 shrink-0">[{log.source}]</span>

                <span className={`flex-1 break-all ${
                  log.level === 'error'
                    ? 'text-red-300'
                    : log.level === 'warn'
                    ? 'text-amber-300'
                    : 'text-neutral-200'
                }`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
