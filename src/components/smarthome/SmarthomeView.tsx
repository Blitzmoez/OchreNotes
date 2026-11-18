import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
  SmarthomeState,
  SmarthomeBrokerConfig,
  SmarthomeDiscoveredBroker,
  SmarthomeDbSource,
  SmarthomeTile,
  SmarthomeTileSize,
  SmarthomeLiveValue,
} from '../../types';
import { api } from '../../services/api';
import {
  Cpu,
  Plus,
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  LayoutGrid,
  Activity,
  Trash2,
  Edit3,
  Check,
  X,
  Download,
  Sparkles,
  Radio,
  Server,
  ChevronRight,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface SmarthomeViewProps {
  currentUser: User;
  accentColor?: string;
  mobileBarPosition?: 'top' | 'bottom';
}

type SmarthomeTab = 'tiles' | 'brokers' | 'sources';

const PRESET_TILE_ICONS = ['thermometer', 'zap', 'droplets', 'home', 'sun', 'gauge'];

const renderSparkline = (history: number[], color: string) => {
  if (!history || history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const w = 160;
  const h = 42;
  const pad = 3;
  const pts = history
    .map((val, idx) => {
      const x = pad + (idx / (history.length - 1)) * (w - pad * 2);
      const y = h - pad - ((val - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPts = `${pad},${h - pad} ${pts} ${w - pad},${h - pad}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 overflow-visible">
      <polygon points={areaPts} fill={`${color}1F`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
};

export const SmarthomeView: React.FC<SmarthomeViewProps> = ({
  currentUser,
  accentColor = '#0D9488',
  mobileBarPosition = 'top',
}) => {
  const [state, setState] = useState<SmarthomeState>({
    brokers: [],
    dbSources: [],
    tiles: [],
    values: {},
  });
  const [activeTab, setActiveTab] = useState<SmarthomeTab>('tiles');
  const [isLoading, setIsLoading] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);

  // Broker network scan
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredBrokers, setDiscoveredBrokers] = useState<SmarthomeDiscoveredBroker[]>([]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Mobile floating nav
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);

  // Tile Modal
  const [tileModalOpen, setTileModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<SmarthomeTile | null>(null);
  const [tileTitle, setTileTitle] = useState('');
  const [tileSubtitle, setTileSubtitle] = useState('');
  const [tileSize, setTileSize] = useState<SmarthomeTileSize>('sm');
  const [tileDisplayMode, setTileDisplayMode] = useState<'value' | 'chart'>('value');
  const [tileSourceType, setTileSourceType] = useState<'mqtt' | 'db'>('mqtt');
  const [tileSourceId, setTileSourceId] = useState('');
  const [tileTopicOrPath, setTileTopicOrPath] = useState('');
  const [tileJsonPath, setTileJsonPath] = useState('');
  const [tileUnit, setTileUnit] = useState('');
  const [tileIsPreset, setTileIsPreset] = useState(false);
  const [tileSaving, setTileSaving] = useState(false);

  // Broker Modal
  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null);
  const [brokerName, setBrokerName] = useState('');
  const [brokerHost, setBrokerHost] = useState('');
  const [brokerPort, setBrokerPort] = useState('1883');
  const [brokerProtocol, setBrokerProtocol] = useState<'mqtt' | 'mqtts' | 'ws'>('mqtt');
  const [brokerUsername, setBrokerUsername] = useState('');
  const [brokerPassword, setBrokerPassword] = useState('');
  const [brokerEnabled, setBrokerEnabled] = useState(true);
  const [brokerSaving, setBrokerSaving] = useState(false);

  // DB Source Modal
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [editingDbId, setEditingDbId] = useState<string | null>(null);
  const [dbName, setDbName] = useState('');
  const [dbKind, setDbKind] = useState<'http-json' | 'influx-v2' | 'prometheus'>('http-json');
  const [dbUrl, setDbUrl] = useState('');
  const [dbPollSec, setDbPollSec] = useState('30');
  const [dbAuthHeader, setDbAuthHeader] = useState('');
  const [dbEnabled, setDbEnabled] = useState(true);
  const [dbSaving, setDbSaving] = useState(false);
  const [pollingSourceId, setPollingSourceId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await api.fetchSmarthomeState(currentUser.username);
      setState(next);
    } catch (e) {
      console.error('Smarthome load error', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.username]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Real-time SSE telemetry stream
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/smarthome/stream');
      es.onopen = () => setStreamConnected(true);
      es.onerror = () => setStreamConnected(false);
      es.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'live_value' && msg.entry) {
            const entry = msg.entry as SmarthomeLiveValue;
            setState((prev) => ({
              ...prev,
              values: {
                ...prev.values,
                [entry.key]: entry,
              },
            }));
          } else if (msg.type === 'broker_status' && msg.brokerId) {
            setState((prev) => ({
              ...prev,
              brokers: prev.brokers.map((b) =>
                b.id === msg.brokerId
                  ? { ...b, status: msg.status, lastError: msg.error }
                  : b
              ),
            }));
          }
        } catch {
          // ignore malformed event
        }
      };
    } catch {
      setStreamConnected(false);
    }
    return () => {
      es?.close();
    };
  }, []);

  const ownAndUserTiles = useMemo(
    () =>
      state.tiles.filter(
        (t) => t.ownerUsername === currentUser.username || !t.isAdminPreset
      ),
    [state.tiles, currentUser.username]
  );

  const adminPresetTiles = useMemo(
    () =>
      state.tiles.filter(
        (t) => t.isAdminPreset && t.ownerUsername !== currentUser.username
      ),
    [state.tiles, currentUser.username]
  );

  const openCreateTileModal = () => {
    setEditingTile(null);
    setTileTitle('');
    setTileSubtitle('');
    setTileSize('sm');
    setTileDisplayMode('value');
    const defaultMqtt = state.brokers[0];
    const defaultDb = state.dbSources[0];
    if (defaultMqtt) {
      setTileSourceType('mqtt');
      setTileSourceId(defaultMqtt.id);
    } else if (defaultDb) {
      setTileSourceType('db');
      setTileSourceId(defaultDb.id);
    } else {
      setTileSourceType('mqtt');
      setTileSourceId('');
    }
    setTileTopicOrPath('');
    setTileJsonPath('');
    setTileUnit('');
    setTileIsPreset(false);
    setTileModalOpen(true);
  };

  const openEditTileModal = (tile: SmarthomeTile) => {
    setEditingTile(tile);
    setTileTitle(tile.title);
    setTileSubtitle(tile.subtitle || '');
    setTileSize(tile.size);
    setTileDisplayMode(tile.displayMode || 'value');
    setTileSourceType(tile.sourceType);
    setTileSourceId(tile.sourceId);
    setTileTopicOrPath(tile.topicOrPath);
    setTileJsonPath(tile.jsonPath || '');
    setTileUnit(tile.unit || '');
    setTileIsPreset(Boolean(tile.isAdminPreset));
    setTileModalOpen(true);
  };

  const handleSaveTile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tileTitle.trim() || !tileTopicOrPath.trim()) return;
    setTileSaving(true);
    try {
      const payload: SmarthomeTile = {
        id: editingTile?.id || `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerUsername: editingTile?.ownerUsername || currentUser.username,
        title: tileTitle.trim(),
        subtitle: tileSubtitle.trim() || undefined,
        size: tileSize,
        displayMode: tileDisplayMode,
        sourceType: tileSourceType,
        sourceId:
          tileSourceId ||
          (tileSourceType === 'mqtt' ? state.brokers[0]?.id || 'default' : state.dbSources[0]?.id || 'default'),
        topicOrPath: tileTopicOrPath.trim(),
        jsonPath: tileJsonPath.trim() || undefined,
        unit: tileUnit.trim() || undefined,
        icon: editingTile?.icon || PRESET_TILE_ICONS[0],
        isAdminPreset: currentUser.role === 'admin' ? tileIsPreset : false,
      };
      const saved = await api.saveSmarthomeTile(payload);
      setState((prev) => {
        const exists = prev.tiles.some((t) => t.id === saved.id);
        return {
          ...prev,
          tiles: exists ? prev.tiles.map((t) => (t.id === saved.id ? saved : t)) : [...prev.tiles, saved],
        };
      });
      setTileModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setTileSaving(false);
    }
  };

  const handleDeleteTile = async (tileId: string) => {
    const ok = await api.deleteSmarthomeTile(tileId);
    if (ok) {
      setState((prev) => ({
        ...prev,
        tiles: prev.tiles.filter((t) => t.id !== tileId),
      }));
    }
  };

  const handleAdoptPreset = async (presetId: string) => {
    try {
      const adopted = await api.adoptSmarthomePreset(currentUser.username, presetId);
      setState((prev) => ({
        ...prev,
        tiles: [...prev.tiles, adopted],
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleScanBrokers = async () => {
    setIsScanning(true);
    setScanMessage(null);
    try {
      const found = await api.discoverSmarthomeBrokers();
      setDiscoveredBrokers(found);
      setScanMessage(
        found.length > 0
          ? `${found.length} MQTT-Broker im Netzwerk gefunden.`
          : 'Keine lokalen MQTT-Broker auf Standard-Ports gefunden. Du kannst einen Broker manuell anlegen.'
      );
    } catch {
      setScanMessage('Netzwerk-Scan fehlgeschlagen.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectDiscovered = async (disc: SmarthomeDiscoveredBroker) => {
    const payload: SmarthomeBrokerConfig = {
      id: `broker_${Date.now()}`,
      name: disc.label || `MQTT (${disc.host}:${disc.port})`,
      host: disc.host,
      port: disc.port,
      protocol: 'mqtt',
      enabled: true,
    };
    const saved = await api.saveSmarthomeBroker(payload);
    setState((prev) => ({
      ...prev,
      brokers: [...prev.brokers, saved],
    }));
  };

  const openCreateBrokerModal = () => {
    setEditingBrokerId(null);
    setBrokerName('');
    setBrokerHost('localhost');
    setBrokerPort('1883');
    setBrokerProtocol('mqtt');
    setBrokerUsername('');
    setBrokerPassword('');
    setBrokerEnabled(true);
    setBrokerModalOpen(true);
  };

  const openEditBrokerModal = (b: SmarthomeBrokerConfig) => {
    setEditingBrokerId(b.id);
    setBrokerName(b.name);
    setBrokerHost(b.host);
    setBrokerPort(String(b.port));
    setBrokerProtocol(b.protocol);
    setBrokerUsername(b.username || '');
    setBrokerPassword(b.password || '');
    setBrokerEnabled(b.enabled);
    setBrokerModalOpen(true);
  };

  const handleSaveBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brokerName.trim() || !brokerHost.trim()) return;
    setBrokerSaving(true);
    try {
      const payload: SmarthomeBrokerConfig = {
        id: editingBrokerId || `broker_${Date.now()}`,
        name: brokerName.trim(),
        host: brokerHost.trim(),
        port: Number(brokerPort) || 1883,
        protocol: brokerProtocol,
        username: brokerUsername.trim() || undefined,
        password: brokerPassword || undefined,
        enabled: brokerEnabled,
      };
      const saved = await api.saveSmarthomeBroker(payload);
      setState((prev) => {
        const exists = prev.brokers.some((b) => b.id === saved.id);
        return {
          ...prev,
          brokers: exists ? prev.brokers.map((b) => (b.id === saved.id ? saved : b)) : [...prev.brokers, saved],
        };
      });
      setBrokerModalOpen(false);
    } finally {
      setBrokerSaving(false);
    }
  };

  const handleDeleteBroker = async (id: string) => {
    const ok = await api.deleteSmarthomeBroker(id);
    if (ok) {
      setState((prev) => ({
        ...prev,
        brokers: prev.brokers.filter((b) => b.id !== id),
      }));
    }
  };

  const openCreateDbModal = () => {
    setEditingDbId(null);
    setDbName('');
    setDbKind('http-json');
    setDbUrl('');
    setDbPollSec('30');
    setDbAuthHeader('');
    setDbEnabled(true);
    setDbModalOpen(true);
  };

  const openEditDbModal = (src: SmarthomeDbSource) => {
    setEditingDbId(src.id);
    setDbName(src.name);
    setDbKind(src.kind);
    setDbUrl(src.url);
    setDbPollSec(String(src.pollIntervalSec || 30));
    setDbAuthHeader(src.authHeader || '');
    setDbEnabled(src.enabled);
    setDbModalOpen(true);
  };

  const handleSaveDbSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbName.trim() || !dbUrl.trim()) return;
    setDbSaving(true);
    try {
      const payload: SmarthomeDbSource = {
        id: editingDbId || `db_${Date.now()}`,
        name: dbName.trim(),
        kind: dbKind,
        url: dbUrl.trim(),
        pollIntervalSec: Math.max(5, Number(dbPollSec) || 30),
        authHeader: dbAuthHeader.trim() || undefined,
        enabled: dbEnabled,
      };
      const saved = await api.saveSmarthomeDbSource(payload);
      setState((prev) => {
        const exists = prev.dbSources.some((d) => d.id === saved.id);
        return {
          ...prev,
          dbSources: exists
            ? prev.dbSources.map((d) => (d.id === saved.id ? saved : d))
            : [...prev.dbSources, saved],
        };
      });
      setDbModalOpen(false);
    } finally {
      setDbSaving(false);
    }
  };

  const handleDeleteDbSource = async (id: string) => {
    const ok = await api.deleteSmarthomeDbSource(id);
    if (ok) {
      setState((prev) => ({
        ...prev,
        dbSources: prev.dbSources.filter((d) => d.id !== id),
      }));
    }
  };

  const handlePollDbSource = async (sourceId: string) => {
    setPollingSourceId(sourceId);
    try {
      const res = await api.pollSmarthomeDbSource(sourceId);
      if (res.values) {
        setState((prev) => ({
          ...prev,
          values: { ...prev.values, ...res.values },
        }));
      }
    } finally {
      setPollingSourceId(null);
    }
  };

  const resolveTileLive = (tile: SmarthomeTile): SmarthomeLiveValue | undefined => {
    const primaryKey = `${tile.sourceId}::${tile.topicOrPath}`;
    if (state.values[primaryKey]) return state.values[primaryKey];
    const fallbackMatch = Object.values(state.values).find((v) =>
      v.key.endsWith(`::${tile.topicOrPath}`)
    );
    return fallbackMatch;
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return 'Warte auf Daten...';
    return new Date(ts).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const floatingNavBottomClass =
    mobileBarPosition === 'bottom' ? 'bottom-[4.75rem] lg:bottom-5' : 'bottom-5';

  const statusBadge = (status?: SmarthomeBrokerConfig['status']) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <Wifi className="w-3 h-3" /> Verbunden
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <RefreshCw className="w-3 h-3 animate-spin" /> Verbindet...
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-700 dark:text-red-400">
            <WifiOff className="w-3 h-3" /> Fehler
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            <WifiOff className="w-3 h-3" /> Getrennt
          </span>
        );
    }
  };

  return (
    <div
      style={{ '--smarthome-accent': accentColor } as React.CSSProperties}
      className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F7F4] dark:bg-[#16171A]"
    >
      {/* Header Bar */}
      <div className="px-4 sm:px-6 py-3 bg-[#FFFDF9] dark:bg-[#1B1D21] border-b border-[#E5E3DC] dark:border-[#2F3136] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            style={{ backgroundColor: accentColor }}
            className="w-9 h-9 rounded-2xl text-white flex items-center justify-center shadow-xs shrink-0"
          >
            <Cpu className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-neutral-900 dark:text-neutral-100 truncate">
                Smarthome Viewer
              </h2>
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  streamConnected
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
                }`}
              >
                <Radio className="w-2.5 h-2.5" />
                {streamConnected ? 'Live Stream' : 'Offline'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {state.brokers.filter((b) => b.status === 'connected').length}/{state.brokers.length} MQTT-Broker ·{' '}
              {state.dbSources.length} HTTP/DB-Quellen · {ownAndUserTiles.length} Kacheln
            </p>
          </div>
        </div>

        {/* Desktop Section Switcher */}
        <div className="hidden lg:flex items-center gap-1 bg-[#F4F3EF] dark:bg-[#23252A] p-1 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136]">
          {(
            [
              { id: 'tiles', label: 'Kacheln', icon: LayoutGrid },
              { id: 'brokers', label: 'MQTT Broker & Scan', icon: Server },
              { id: 'sources', label: 'DB & HTTP-Quellen', icon: Database },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={active ? { color: accentColor } : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#2C2F36] shadow-xs font-bold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Primary Action */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadState}
            className="p-2 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 cursor-pointer active:scale-95 transition-all"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {activeTab === 'tiles' && (
            <button
              type="button"
              onClick={openCreateTileModal}
              style={{ backgroundColor: accentColor }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Neue Kachel</span>
            </button>
          )}
          {activeTab === 'brokers' && (
            <button
              type="button"
              onClick={openCreateBrokerModal}
              style={{ backgroundColor: accentColor }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Broker anlegen</span>
            </button>
          )}
          {activeTab === 'sources' && (
            <button
              type="button"
              onClick={openCreateDbModal}
              style={{ backgroundColor: accentColor }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Quelle anlegen</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-8 space-y-5">
        {/* TAB 1: KACHELN */}
        {activeTab === 'tiles' && (
          <>
            {/* Admin Presets Banner for adoption */}
            {adminPresetTiles.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" style={{ color: accentColor }} />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                      Admin-Vorgaben (Presets übernehmen)
                    </h3>
                  </div>
                  <span className="text-[11px] text-neutral-400">
                    1-Klick Kopie in dein eigenes Dashboard
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {adminPresetTiles.map((preset) => (
                    <div
                      key={preset.id}
                      className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#32353D] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                          {preset.title}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono block truncate">
                          {preset.topicOrPath}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdoptPreset(preset.id)}
                        style={{ backgroundColor: accentColor }}
                        className="px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                      >
                        <Download className="w-3 h-3" />
                        <span>Übernehmen</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tiles Grid */}
            {ownAndUserTiles.length === 0 ? (
              <div className="p-8 rounded-3xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-dashed border-[#D6D3C9] dark:border-[#32353D] text-center space-y-3">
                <div
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                  className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                >
                  <LayoutGrid className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    Noch keine Smarthome-Kacheln eingerichtet
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Verbinde zuerst einen MQTT-Broker oder eine HTTP/JSON-Quelle und lege Sensor-Kacheln für Temperaturen, Energie oder Statuswerte an.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('brokers')}
                    className="px-3.5 py-2 rounded-xl border border-[#E5E3DC] dark:border-[#32353D] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                  >
                    Broker konfigurieren
                  </button>
                  <button
                    type="button"
                    onClick={openCreateTileModal}
                    style={{ backgroundColor: accentColor }}
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Erste Kachel erstellen
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-[minmax(140px,auto)]">
                {ownAndUserTiles.map((tile) => {
                  const live = resolveTileLive(tile);
                  const sizeClass =
                    tile.size === 'lg'
                      ? 'col-span-2 row-span-2'
                      : tile.size === 'wide'
                      ? 'col-span-2'
                      : 'col-span-1';
                  const canEdit =
                    tile.ownerUsername === currentUser.username || currentUser.role === 'admin';
                  const valText = live?.value ?? tile.lastValue ?? '–';

                  return (
                    <div
                      key={tile.id}
                      className={`${sizeClass} p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs flex flex-col justify-between gap-2 group relative overflow-hidden transition-all hover:border-neutral-300 dark:hover:border-neutral-600`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                              {tile.title}
                            </h4>
                            {tile.isAdminPreset && (
                              <span
                                style={{ backgroundColor: `${accentColor}1F`, color: accentColor }}
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                              >
                                <ShieldCheck className="w-2.5 h-2.5" /> Preset
                              </span>
                            )}
                          </div>
                          {tile.subtitle && (
                            <p className="text-[11px] text-neutral-500 truncate">{tile.subtitle}</p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1 shrink-0 opacity-90 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => openEditTileModal(tile)}
                              className="p-1.5 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2D34] text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 cursor-pointer"
                              title="Kachel bearbeiten"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTile(tile.id)}
                              className="p-1.5 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2D34] text-neutral-500 hover:text-red-500 cursor-pointer"
                              title="Kachel löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Value & Optional Sparkline */}
                      <div className="space-y-1.5 my-auto">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span
                            style={{ color: live ? accentColor : undefined }}
                            className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 dark:text-neutral-100 tabular-nums break-all"
                          >
                            {valText}
                          </span>
                          {tile.unit && (
                            <span className="text-xs sm:text-sm font-bold text-neutral-500">
                              {tile.unit}
                            </span>
                          )}
                        </div>
                        {tile.displayMode === 'chart' && live?.history && live.history.length > 1 && (
                          <div className="pt-1">{renderSparkline(live.history, accentColor)}</div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F0EFEA] dark:border-[#2A2C32] text-[10px] text-neutral-400">
                        <span className="font-mono truncate" title={tile.topicOrPath}>
                          {tile.sourceType === 'mqtt' ? 'MQTT' : 'HTTP/DB'} · {tile.topicOrPath}
                        </span>
                        <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimestamp(live?.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 2: MQTT BROKER & NETWORK SCAN */}
        {activeTab === 'brokers' && (
          <div className="space-y-5 max-w-4xl">
            <div className="p-4 sm:p-5 rounded-3xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                    MQTT Netzwerk-Erkennung
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Prüft lokale Standard-Broker &amp; Subnetz-Ports (1883/8883) per echtem TCP-MQTT-Handshake.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScanBrokers}
                  disabled={isScanning}
                  style={{ backgroundColor: accentColor }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-95 disabled:opacity-60 cursor-pointer active:scale-95 transition-all"
                >
                  <Search className={`w-3.5 h-3.5 ${isScanning ? 'animate-pulse' : ''}`} />
                  <span>{isScanning ? 'Scanne Netzwerk...' : 'Netzwerk nach MQTT-Brokern scannen'}</span>
                </button>
              </div>

              {scanMessage && (
                <div className="p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] text-xs text-neutral-700 dark:text-neutral-300">
                  {scanMessage}
                </div>
              )}

              {discoveredBrokers.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {discoveredBrokers.map((d, idx) => {
                    const alreadyAdded = state.brokers.some(
                      (b) => b.host === d.host && b.port === d.port
                    );
                    return (
                      <div
                        key={`${d.host}-${d.port}-${idx}`}
                        className="p-3 rounded-2xl border border-[#E5E3DC] dark:border-[#32353D] bg-[#F4F3EF]/60 dark:bg-[#23252A] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                            {d.label}
                          </span>
                          <span className="text-[11px] font-mono text-neutral-500">
                            {d.host}:{d.port}
                          </span>
                        </div>
                        {alreadyAdded ? (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Vorhanden
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConnectDiscovered(d)}
                            style={{ backgroundColor: accentColor }}
                            className="px-3 py-1.5 rounded-lg text-white text-[11px] font-bold cursor-pointer active:scale-95"
                          >
                            Verbinden
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Configured Brokers List */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 px-1">
                Konfigurierte MQTT-Broker ({state.brokers.length})
              </h3>
              {state.brokers.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] text-xs text-neutral-500 text-center">
                  Noch keine Broker konfiguriert. Starte oben einen Netzwerk-Scan oder lege einen Broker manuell an.
                </div>
              ) : (
                state.brokers.map((broker) => (
                  <div
                    key={broker.id}
                    className="p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          {broker.name}
                        </span>
                        {statusBadge(broker.status)}
                        {!broker.enabled && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-500 font-semibold">
                            Deaktiviert
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-neutral-500 truncate">
                        {broker.protocol}://{broker.host}:{broker.port}
                        {broker.username ? ` · User: ${broker.username}` : ''}
                      </div>
                      {broker.lastError && (
                        <div className="text-[11px] text-red-500">{broker.lastError}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditBrokerModal(broker)}
                        className="px-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBroker(broker.id)}
                        className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 cursor-pointer"
                        title="Broker löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DB & HTTP SOURCES */}
        {activeTab === 'sources' && (
          <div className="space-y-4 max-w-4xl">
            <div className="p-4 sm:p-5 rounded-3xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                  Datenbank-, Influx-, Prometheus- &amp; HTTP-JSON-Quellen
                </h3>
                <p className="text-xs text-neutral-500">
                  Fragt zyklisch REST-JSON-APIs, Home-Assistant-Endpunkte, InfluxDB v2 oder Prometheus-Metriken ab.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateDbModal}
                style={{ backgroundColor: accentColor }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Neue Quelle hinzufügen</span>
              </button>
            </div>

            {state.dbSources.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] text-xs text-neutral-500 text-center">
                Noch keine HTTP-/Datenbank-Quelle hinterlegt.
              </div>
            ) : (
              state.dbSources.map((src) => (
                <div
                  key={src.id}
                  className="p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E2025] border border-[#E5E3DC] dark:border-[#2F3136] flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        {src.name}
                      </span>
                      <span
                        style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                      >
                        {src.kind}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        alle {src.pollIntervalSec}s
                      </span>
                    </div>
                    <div className="text-xs font-mono text-neutral-500 truncate">{src.url}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pollingSourceId === src.id}
                      onClick={() => handlePollDbSource(src.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 cursor-pointer"
                    >
                      <Activity className={`w-3.5 h-3.5 ${pollingSourceId === src.id ? 'animate-spin' : ''}`} />
                      <span>Jetzt abfragen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditDbModal(src)}
                      className="px-3 py-1.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 cursor-pointer"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDbSource(src.id)}
                      className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Mobile & Tablet Thumb-Zone Floating Capsule Navigation */}
      <div className="lg:hidden select-none">
        {isMobileNavExpanded && (
          <div
            onClick={() => setIsMobileNavExpanded(false)}
            className="fixed inset-0 bg-black/25 backdrop-blur-2xs z-40"
          />
        )}
        {isMobileNavExpanded ? (
          <div
            style={{ borderColor: accentColor }}
            className={`fixed ${floatingNavBottomClass} left-3 right-3 sm:left-auto sm:right-4 z-50 h-14 px-2.5 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-between gap-1.5`}
          >
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {(
                [
                  { id: 'tiles', label: 'Kacheln', icon: LayoutGrid },
                  { id: 'brokers', label: 'Broker', icon: Server },
                  { id: 'sources', label: 'Quellen', icon: Database },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsMobileNavExpanded(false);
                    }}
                    style={active ? { backgroundColor: accentColor } : undefined}
                    className={`flex-1 h-9.5 px-2.5 rounded-full flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer ${
                      active ? 'text-white shadow-xs' : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setIsMobileNavExpanded(false)}
              className="w-9.5 h-9.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Navigation schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsMobileNavExpanded(true)}
            style={{ borderColor: accentColor, color: accentColor }}
            className={`fixed ${floatingNavBottomClass} right-4 z-40 w-13 h-13 rounded-full bg-[#FFFDF9] dark:bg-[#1E1F23] shadow-2xl border-2 flex items-center justify-center cursor-pointer active:scale-95 transition-transform`}
            aria-label="Smarthome-Navigation öffnen"
          >
            {activeTab === 'tiles' && <LayoutGrid className="w-5 h-5" />}
            {activeTab === 'brokers' && <Server className="w-5 h-5" />}
            {activeTab === 'sources' && <Database className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Tile Modal */}
      {tileModalOpen && (
        <div
          onClick={() => setTileModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-12 lg:pt-4 pb-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveTile}
            className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                {editingTile ? 'Kachel bearbeiten' : 'Neue Sensor-Kachel'}
              </h3>
              <button
                type="button"
                onClick={() => setTileModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Titel *
                </label>
                <input
                  type="text"
                  required
                  placeholder="z.B. Wohnzimmer Temperatur"
                  value={tileTitle}
                  onChange={(e) => setTileTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Untertitel
                </label>
                <input
                  type="text"
                  placeholder="z.B. EG Südseite"
                  value={tileSubtitle}
                  onChange={(e) => setTileSubtitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Größe
                </label>
                <select
                  value={tileSize}
                  onChange={(e) => setTileSize(e.target.value as SmarthomeTileSize)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="sm">Kompakt (1x1)</option>
                  <option value="wide">Breit (2x1)</option>
                  <option value="lg">Groß (2x2)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Darstellung
                </label>
                <select
                  value={tileDisplayMode}
                  onChange={(e) => setTileDisplayMode(e.target.value as 'value' | 'chart')}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="value">Einzelwert</option>
                  <option value="chart">Wert + Verlaufskurve</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Quelltyp
                </label>
                <select
                  value={tileSourceType}
                  onChange={(e) => {
                    const nextType = e.target.value as 'mqtt' | 'db';
                    setTileSourceType(nextType);
                    setTileSourceId(
                      nextType === 'mqtt'
                        ? state.brokers[0]?.id || ''
                        : state.dbSources[0]?.id || ''
                    );
                  }}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="mqtt">MQTT Broker</option>
                  <option value="db">DB / HTTP Quelle</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Quelle wählen
                </label>
                <select
                  value={tileSourceId}
                  onChange={(e) => setTileSourceId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  {tileSourceType === 'mqtt' ? (
                    state.brokers.length > 0 ? (
                      state.brokers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))
                    ) : (
                      <option value="">(Standard / später verknüpfen)</option>
                    )
                  ) : state.dbSources.length > 0 ? (
                    state.dbSources.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                  ) : (
                    <option value="">(Standard / später verknüpfen)</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                {tileSourceType === 'mqtt' ? 'MQTT Topic *' : 'JSON-Pfad oder Metrik-Name *'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  tileSourceType === 'mqtt'
                    ? 'z.B. zigbee2mqtt/wohnzimmer/temperature'
                    : 'z.B. state oder sensors.temp'
                }
                value={tileTopicOrPath}
                onChange={(e) => setTileTopicOrPath(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  JSON-Feld (optional)
                </label>
                <input
                  type="text"
                  placeholder="z.B. temperature"
                  value={tileJsonPath}
                  onChange={(e) => setTileJsonPath(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Einheit
                </label>
                <input
                  type="text"
                  placeholder="z.B. °C, W, %, kWh"
                  value={tileUnit}
                  onChange={(e) => setTileUnit(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            {currentUser.role === 'admin' && (
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={tileIsPreset}
                  onChange={(e) => setTileIsPreset(e.target.checked)}
                />
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Als Admin-Vorgabe (Preset) für alle Benutzer bereitstellen
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTileModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={tileSaving}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {tileSaving ? 'Speichere...' : 'Kachel speichern'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Broker Modal */}
      {brokerModalOpen && (
        <div
          onClick={() => setBrokerModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-12 lg:pt-4 pb-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveBroker}
            className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                {editingBrokerId ? 'MQTT-Broker bearbeiten' : 'MQTT-Broker hinzufügen'}
              </h3>
              <button
                type="button"
                onClick={() => setBrokerModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                placeholder="z.B. Mosquitto Hauptserver"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Host / IP *
                </label>
                <input
                  type="text"
                  required
                  placeholder="192.168.1.50"
                  value={brokerHost}
                  onChange={(e) => setBrokerHost(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={brokerPort}
                  onChange={(e) => setBrokerPort(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Protokoll
                </label>
                <select
                  value={brokerProtocol}
                  onChange={(e) => setBrokerProtocol(e.target.value as 'mqtt' | 'mqtts' | 'ws')}
                  className="w-full text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="mqtt">mqtt://</option>
                  <option value="mqtts">mqtts://</option>
                  <option value="ws">ws://</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Benutzer
                </label>
                <input
                  type="text"
                  value={brokerUsername}
                  onChange={(e) => setBrokerUsername(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Passwort
                </label>
                <input
                  type="password"
                  value={brokerPassword}
                  onChange={(e) => setBrokerPassword(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={brokerEnabled}
                onChange={(e) => setBrokerEnabled(e.target.checked)}
              />
              <span>Verbindung aktivieren</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBrokerModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={brokerSaving}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                {brokerSaving ? 'Speichere...' : 'Broker speichern'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DB Source Modal */}
      {dbModalOpen && (
        <div
          onClick={() => setDbModalOpen(false)}
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-start lg:items-center justify-center px-3 pt-12 lg:pt-4 pb-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveDbSource}
            className="w-full max-w-md bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                {editingDbId ? 'Datenquelle bearbeiten' : 'HTTP / Datenbank-Quelle anlegen'}
              </h3>
              <button
                type="button"
                onClick={() => setDbModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Bezeichnung *
                </label>
                <input
                  type="text"
                  required
                  placeholder="z.B. Wechselrichter API"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Typ
                </label>
                <select
                  value={dbKind}
                  onChange={(e) =>
                    setDbKind(e.target.value as 'http-json' | 'influx-v2' | 'prometheus')
                  }
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="http-json">HTTP JSON Endpoint</option>
                  <option value="influx-v2">InfluxDB v2 Query</option>
                  <option value="prometheus">Prometheus Metrics</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                Endpoint URL *
              </label>
              <input
                type="url"
                required
                placeholder="http://192.168.1.20/api/status"
                value={dbUrl}
                onChange={(e) => setDbUrl(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Abfrage-Intervall (Sek.)
                </label>
                <input
                  type="number"
                  min={5}
                  value={dbPollSec}
                  onChange={(e) => setDbPollSec(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Auth Header (optional)
                </label>
                <input
                  type="text"
                  placeholder="Bearer ..."
                  value={dbAuthHeader}
                  onChange={(e) => setDbAuthHeader(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={dbEnabled}
                onChange={(e) => setDbEnabled(e.target.checked)}
              />
              <span>Automatisches Polling aktivieren</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDbModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={dbSaving}
                style={{ backgroundColor: accentColor }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                {dbSaving ? 'Speichere...' : 'Quelle speichern'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
