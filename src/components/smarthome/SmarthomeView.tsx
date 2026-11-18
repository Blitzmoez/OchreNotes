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
  SmarthomeTimeRange,
  SmarthomeTileCalculation,
  SmarthomeDiscoveredTopic,
  SmarthomeSeriesPoint,
} from '../../types';
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
  ChevronDown,
  Clock,
  ShieldCheck,
  Calculator,
  FolderOpen,
  TrendingUp,
} from 'lucide-react';

interface SmarthomeViewProps {
  currentUser: User;
  accentColor?: string;
  mobileBarPosition?: 'top' | 'bottom';
}

type SmarthomeTab = 'tiles' | 'brokers' | 'sources';

const PRESET_TILE_ICONS = ['thermometer', 'zap', 'droplets', 'home', 'sun', 'gauge'];

const TIME_RANGE_OPTIONS: Array<{ id: SmarthomeTimeRange; label: string }> = [
  { id: '1h', label: '1 Std' },
  { id: '6h', label: '6 Std' },
  { id: '24h', label: '24 Std' },
  { id: '7d', label: '7 Tage' },
  { id: '30d', label: '30 Tage' },
  { id: 'ytd', label: 'Dieses Jahr (YTD)' },
];

const formatChartTime = (ts: number, range?: SmarthomeTimeRange): string => {
  const d = new Date(ts);
  if (range === '7d' || range === '30d' || range === 'ytd') {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

const formatCompactNum = (v: number): string => {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2).replace(/\.?0+$/, '');
};

interface TelemetryChartProps {
  tileId: string;
  points: SmarthomeSeriesPoint[];
  color: string;
  unit?: string;
  timeRange?: SmarthomeTimeRange;
  tall?: boolean;
}

const TelemetryCurveChart: React.FC<TelemetryChartProps> = ({
  tileId,
  points,
  color,
  unit,
  timeRange = '24h',
  tall = false,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!points || points.length < 2) return null;

  const minVal = Math.min(...points.map((p) => p.v));
  const maxVal = Math.max(...points.map((p) => p.v));
  const valRange = maxVal - minVal || 1;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const tRange = maxT - minT || 1;

  const w = 260;
  const h = tall ? 110 : 72;
  const padX = 4;
  const padY = 6;

  const coords = points.map((p, idx) => {
    const xRatio = tRange > 0 ? (p.t - minT) / tRange : idx / (points.length - 1);
    const x = padX + xRatio * (w - padX * 2);
    const y = h - padY - ((p.v - minVal) / valRange) * (h - padY * 2);
    return { x, y, pt: p };
  });

  const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPts = `${coords[0].x.toFixed(1)},${h - padY} ${linePts} ${coords[coords.length - 1].x.toFixed(1)},${h - padY}`;
  const activeCoord = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : coords[coords.length - 1];
  const gradId = `sh_grad_${tileId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div className="space-y-1 pt-1 select-none">
      <div className="flex items-center justify-between text-[10px] text-neutral-400 tabular-nums">
        <span>
          Min {formatCompactNum(minVal)} · Max {formatCompactNum(maxVal)} {unit || ''}
        </span>
        {hoverIdx !== null && activeCoord ? (
          <span className="font-bold text-neutral-700 dark:text-neutral-200">
            {formatCompactNum(activeCoord.pt.v)} {unit || ''} · {formatChartTime(activeCoord.pt.t, timeRange)}
          </span>
        ) : (
          <span className="uppercase tracking-wider font-semibold">{timeRange}</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className={`w-full ${tall ? 'h-28' : 'h-18'} overflow-visible touch-pan-y`}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
          const idx = Math.min(coords.length - 1, Math.max(0, Math.round(relX * (coords.length - 1))));
          setHoverIdx(idx);
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          y1={h / 2}
          x2={w - padX}
          y2={h / 2}
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeDasharray="3 3"
        />
        <polygon points={areaPts} fill={`url(#${gradId})`} />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePts}
        />
        {activeCoord && (
          <>
            {hoverIdx !== null && (
              <line
                x1={activeCoord.x}
                y1={padY}
                x2={activeCoord.x}
                y2={h - padY}
                stroke={color}
                strokeOpacity="0.35"
                strokeWidth="1"
              />
            )}
            <circle cx={activeCoord.x} cy={activeCoord.y} r="3.2" fill={color} stroke="#fff" strokeWidth="1.2" />
          </>
        )}
      </svg>

      <div className="flex items-center justify-between text-[9px] text-neutral-400 tabular-nums">
        <span>{formatChartTime(minT, timeRange)}</span>
        <span>{formatChartTime(maxT, timeRange)}</span>
      </div>
    </div>
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

  // Tile Organization: Tabs & Collapsible Groups
  const [selectedTileTab, setSelectedTileTab] = useState<string>('Alle');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Tile Modal
  const [tileModalOpen, setTileModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<SmarthomeTile | null>(null);
  const [tileTitle, setTileTitle] = useState('');
  const [tileSubtitle, setTileSubtitle] = useState('');
  const [tileTab, setTileTab] = useState('');
  const [tileGroup, setTileGroup] = useState('');
  const [tileSize, setTileSize] = useState<SmarthomeTileSize>('sm');
  const [tileDisplayMode, setTileDisplayMode] = useState<'value' | 'chart'>('value');
  const [tileTimeRange, setTileTimeRange] = useState<SmarthomeTimeRange>('24h');
  const [tileSourceType, setTileSourceType] = useState<'mqtt' | 'db'>('mqtt');
  const [tileSourceId, setTileSourceId] = useState('');
  const [tileTopicOrPath, setTileTopicOrPath] = useState('');
  const [tileJsonPath, setTileJsonPath] = useState('');
  const [tileUnit, setTileUnit] = useState('');
  const [tileCalcMode, setTileCalcMode] = useState<SmarthomeTileCalculation['mode']>('none');
  const [tileCalcFormula, setTileCalcFormula] = useState('');
  const [tileCalcRefTs, setTileCalcRefTs] = useState('');
  const [tileIsPreset, setTileIsPreset] = useState(false);
  const [tileSaving, setTileSaving] = useState(false);

  // MQTT # Auto-Discovery Topic Picker
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [discoveredTopics, setDiscoveredTopics] = useState<SmarthomeDiscoveredTopic[]>([]);
  const [topicFilterQuery, setTopicFilterQuery] = useState('');

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

  // DB Source Modal (http-json | influx-v1 | influx-v2 | prometheus)
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [editingDbId, setEditingDbId] = useState<string | null>(null);
  const [dbName, setDbName] = useState('');
  const [dbKind, setDbKind] = useState<SmarthomeDbSource['kind']>('http-json');
  const [dbUrl, setDbUrl] = useState('');
  const [dbPollSec, setDbPollSec] = useState('30');
  const [dbAuthHeader, setDbAuthHeader] = useState('');
  const [dbDatabase, setDbDatabase] = useState('');
  const [dbRetentionPolicy, setDbRetentionPolicy] = useState('');
  const [dbOrg, setDbOrg] = useState('');
  const [dbBucket, setDbBucket] = useState('');
  const [dbUsername, setDbUsername] = useState('');
  const [dbPassword, setDbPassword] = useState('');
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

  const availableTileTabs = useMemo(() => {
    const tabSet = new Set<string>();
    ownAndUserTiles.forEach((t) => {
      if (t.tab?.trim()) tabSet.add(t.tab.trim());
    });
    return ['Alle', ...Array.from(tabSet)];
  }, [ownAndUserTiles]);

  const existingGroupNames = useMemo(() => {
    const gSet = new Set<string>();
    ownAndUserTiles.forEach((t) => {
      if (t.group?.trim()) gSet.add(t.group.trim());
    });
    return Array.from(gSet);
  }, [ownAndUserTiles]);

  const existingTabNames = useMemo(
    () => availableTileTabs.filter((t) => t !== 'Alle'),
    [availableTileTabs]
  );

  useEffect(() => {
    if (selectedTileTab !== 'Alle' && !availableTileTabs.includes(selectedTileTab)) {
      setSelectedTileTab('Alle');
    }
  }, [availableTileTabs, selectedTileTab]);

  const groupedVisibleTiles = useMemo(() => {
    const filtered =
      selectedTileTab === 'Alle'
        ? ownAndUserTiles
        : ownAndUserTiles.filter((t) => (t.tab?.trim() || '') === selectedTileTab);
    const groupMap = new Map<string, SmarthomeTile[]>();
    filtered.forEach((t) => {
      const gName = t.group?.trim() || 'Allgemein';
      const arr = groupMap.get(gName) || [];
      arr.push(t);
      groupMap.set(gName, arr);
    });
    return Array.from(groupMap.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [ownAndUserTiles, selectedTileTab]);

  const handleLoadMqttTopics = async (brokerIdOverride?: string) => {
    setLoadingTopics(true);
    setShowTopicPicker(true);
    try {
      const topics = await api.fetchSmarthomeMqttTopics(brokerIdOverride || tileSourceId || undefined);
      setDiscoveredTopics(topics);
    } finally {
      setLoadingTopics(false);
    }
  };

  const openCreateTileModal = () => {
    setEditingTile(null);
    setTileTitle('');
    setTileSubtitle('');
    setTileTab(selectedTileTab !== 'Alle' ? selectedTileTab : '');
    setTileGroup('');
    setTileSize('sm');
    setTileDisplayMode('value');
    setTileTimeRange('24h');
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
    setTileCalcMode('none');
    setTileCalcFormula('');
    setTileCalcRefTs('');
    setTileIsPreset(false);
    setShowTopicPicker(false);
    setTopicFilterQuery('');
    setTileModalOpen(true);
  };

  const openEditTileModal = (tile: SmarthomeTile) => {
    setEditingTile(tile);
    setTileTitle(tile.title);
    setTileSubtitle(tile.subtitle || '');
    setTileTab(tile.tab || '');
    setTileGroup(tile.group || '');
    setTileSize(tile.size);
    setTileDisplayMode(tile.displayMode || 'value');
    setTileTimeRange(tile.timeRange || '24h');
    setTileSourceType(tile.sourceType);
    setTileSourceId(tile.sourceId);
    setTileTopicOrPath(tile.topicOrPath);
    setTileJsonPath(tile.jsonPath || '');
    setTileUnit(tile.unit || '');
    setTileCalcMode(tile.calculation?.mode || 'none');
    setTileCalcFormula(tile.calculation?.formula || '');
    setTileCalcRefTs(tile.calculation?.referenceTimestamp || '');
    setTileIsPreset(Boolean(tile.isAdminPreset));
    setShowTopicPicker(false);
    setTopicFilterQuery('');
    setTileModalOpen(true);
  };

  const handleSaveTile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tileTitle.trim() || !tileTopicOrPath.trim()) return;
    setTileSaving(true);
    try {
      const calcPayload: SmarthomeTileCalculation | undefined =
        tileCalcMode !== 'none' || tileCalcFormula.trim() || tileCalcRefTs.trim()
          ? {
              mode: tileCalcMode === 'none' && tileCalcFormula.trim() ? 'formula' : tileCalcMode,
              formula: tileCalcFormula.trim() || undefined,
              referenceTimestamp: tileCalcRefTs.trim() || undefined,
            }
          : undefined;
      const payload: SmarthomeTile = {
        id: editingTile?.id || `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerUsername: editingTile?.ownerUsername || currentUser.username,
        title: tileTitle.trim(),
        subtitle: tileSubtitle.trim() || undefined,
        tab: tileTab.trim() || undefined,
        group: tileGroup.trim() || undefined,
        size: tileSize,
        displayMode: tileDisplayMode,
        timeRange: tileTimeRange,
        sourceType: tileSourceType,
        sourceId:
          tileSourceId ||
          (tileSourceType === 'mqtt' ? state.brokers[0]?.id || 'default' : state.dbSources[0]?.id || 'default'),
        topicOrPath: tileTopicOrPath.trim(),
        jsonPath: tileJsonPath.trim() || undefined,
        unit: tileUnit.trim() || undefined,
        calculation: calcPayload,
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
      if (saved.sourceType === 'db') {
        api.pollSmarthomeDbSource(saved.sourceId).then((res) => {
          if (res.values) {
            setState((prev) => ({
              ...prev,
              values: { ...prev.values, ...res.values },
            }));
          }
        }).catch(() => {});
      }
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
    setDbKind('influx-v1');
    setDbUrl('');
    setDbPollSec('30');
    setDbAuthHeader('');
    setDbDatabase('');
    setDbRetentionPolicy('');
    setDbOrg('');
    setDbBucket('');
    setDbUsername('');
    setDbPassword('');
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
    setDbDatabase(src.database || '');
    setDbRetentionPolicy(src.retentionPolicy || '');
    setDbOrg(src.org || '');
    setDbBucket(src.bucket || '');
    setDbUsername(src.username || '');
    setDbPassword(src.password || '');
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
        database: dbDatabase.trim() || undefined,
        retentionPolicy: dbRetentionPolicy.trim() || undefined,
        org: dbOrg.trim() || undefined,
        bucket: dbBucket.trim() || undefined,
        username: dbUsername.trim() || undefined,
        password: dbPassword || undefined,
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
    const tileKey = `tile:${tile.id}`;
    if (state.values[tileKey]) return state.values[tileKey];
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

            {/* Notes-style Horizontal Slideable Tab Strip */}
            {ownAndUserTiles.length > 0 && availableTileTabs.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {availableTileTabs.map((tabLabel) => {
                  const isActive = selectedTileTab === tabLabel;
                  const count =
                    tabLabel === 'Alle'
                      ? ownAndUserTiles.length
                      : ownAndUserTiles.filter((t) => (t.tab?.trim() || '') === tabLabel).length;
                  return (
                    <button
                      key={tabLabel}
                      type="button"
                      onClick={() => setSelectedTileTab(tabLabel)}
                      style={
                        isActive
                          ? { backgroundColor: accentColor, borderColor: accentColor, color: '#fff' }
                          : undefined
                      }
                      className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                        isActive
                          ? 'shadow-xs'
                          : 'bg-[#FFFDF9] dark:bg-[#1E2025] border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300 hover:border-neutral-400'
                      }`}
                    >
                      <span>{tabLabel}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : 'bg-[#F4F3EF] dark:bg-[#2A2C32] text-neutral-500'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tiles Grid (Grouped & Collapsible) */}
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
                    Verbinde zuerst einen MQTT-Broker oder eine InfluxDB-/HTTP-Quelle und lege Sensor-Kacheln für Temperaturen, Energie oder Berechnungen an.
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
              <div className="space-y-5">
                {groupedVisibleTiles.map(({ groupName, items }) => {
                  const isCollapsed = !!collapsedGroups[groupName];
                  return (
                    <section key={groupName} className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({
                            ...prev,
                            [groupName]: !prev[groupName],
                          }))
                        }
                        className="flex items-center gap-2 px-1 py-1 text-left cursor-pointer group/grp"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-neutral-400" />
                        )}
                        <FolderOpen className="w-3.5 h-3.5" style={{ color: accentColor }} />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
                          {groupName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ECEAE2] dark:bg-[#25272D] text-neutral-500 tabular-nums">
                          {items.length}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-[minmax(145px,auto)]">
                          {items.map((tile) => {
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
                            const chartPoints: SmarthomeSeriesPoint[] =
                              live?.series && live.series.length > 1
                                ? live.series
                                : live?.history && live.history.length > 1
                                ? live.history.map((v, i, arr) => ({
                                    t: (live.timestamp || Date.now()) - (arr.length - 1 - i) * 60000,
                                    v,
                                  }))
                                : [];
                            const hasCalcDetails =
                              Boolean(tile.calculation?.formula) ||
                              live?.referenceValue !== undefined;

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
                                      {tile.calculation && tile.calculation.mode !== 'none' && (
                                        <span
                                          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                                          className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                                          title={tile.calculation.formula || 'Zeitvergleich aktiv'}
                                        >
                                          <Calculator className="w-2.5 h-2.5" /> Formel
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

                                {/* Value, Calculation Summary & SVG Telemetry Curve */}
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

                                  {hasCalcDetails && (
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                                      {live?.rawValue && live.rawValue !== valText && (
                                        <span className="px-1.5 py-0.5 rounded bg-[#F4F3EF] dark:bg-[#282A30]">
                                          Aktuell: {live.rawValue}
                                        </span>
                                      )}
                                      {live?.referenceValue !== undefined && (
                                        <span className="px-1.5 py-0.5 rounded bg-[#F4F3EF] dark:bg-[#282A30]">
                                          Ref: {formatCompactNum(live.referenceValue)}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {tile.displayMode === 'chart' && chartPoints.length > 1 && (
                                    <TelemetryCurveChart
                                      tileId={tile.id}
                                      points={chartPoints}
                                      color={accentColor}
                                      unit={tile.unit}
                                      timeRange={tile.timeRange || '24h'}
                                      tall={tile.size === 'lg'}
                                    />
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F0EFEA] dark:border-[#2A2C32] text-[10px] text-neutral-400">
                                  <span className="font-mono truncate" title={tile.topicOrPath}>
                                    {tile.sourceType === 'mqtt' ? 'MQTT' : 'DB/HTTP'} · {tile.topicOrPath}
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
                    </section>
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
                  Datenbank-, InfluxDB v1/v2-, Prometheus- &amp; HTTP-JSON-Quellen
                </h3>
                <p className="text-xs text-neutral-500">
                  Fragt zyklisch InfluxDB v1 (InfluxQL), InfluxDB v2 (Flux), Prometheus-Metriken oder REST-JSON-APIs inkl. Verlaufsdaten ab.
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
            className="w-full max-w-lg max-h-[86dvh] overflow-y-auto bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
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
                  placeholder="z.B. Hausverbrauch Leistung"
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
                  placeholder="z.B. Smartmeter Zähler"
                  value={tileSubtitle}
                  onChange={(e) => setTileSubtitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            {/* Tab & Gruppe Organization */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Tab (Reiter)
                </label>
                <input
                  type="text"
                  list="sh-tab-suggestions"
                  placeholder="z.B. Energie, Klima, Solar"
                  value={tileTab}
                  onChange={(e) => setTileTab(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
                <datalist id="sh-tab-suggestions">
                  {existingTabNames.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Gruppe (klappbar)
                </label>
                <input
                  type="text"
                  list="sh-group-suggestions"
                  placeholder="z.B. Stromzähler, Erdgeschoss"
                  value={tileGroup}
                  onChange={(e) => setTileGroup(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
                <datalist id="sh-group-suggestions">
                  {existingGroupNames.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Größe
                </label>
                <select
                  value={tileSize}
                  onChange={(e) => setTileSize(e.target.value as SmarthomeTileSize)}
                  className="w-full text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
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
                  className="w-full text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="value">Einzelwert</option>
                  <option value="chart">Wert + Kurve</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Zeitraum
                </label>
                <select
                  value={tileTimeRange}
                  onChange={(e) => setTileTimeRange(e.target.value as SmarthomeTimeRange)}
                  className="w-full text-xs px-2.5 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
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
                    setShowTopicPicker(false);
                    setTileSourceId(
                      nextType === 'mqtt'
                        ? state.brokers[0]?.id || ''
                        : state.dbSources[0]?.id || ''
                    );
                  }}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="mqtt">MQTT Broker</option>
                  <option value="db">DB / Influx / HTTP Quelle</option>
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
                        {d.name} ({d.kind})
                      </option>
                    ))
                  ) : (
                    <option value="">(Standard / später verknüpfen)</option>
                  )}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
                  {tileSourceType === 'mqtt'
                    ? 'MQTT Topic *'
                    : 'Measurement / Metrik / Query *'}
                </label>
                {tileSourceType === 'mqtt' && (
                  <button
                    type="button"
                    onClick={() =>
                      showTopicPicker ? setShowTopicPicker(false) : handleLoadMqttTopics()
                    }
                    style={{ color: accentColor }}
                    className="text-[11px] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Radio className="w-3 h-3" />
                    <span>
                      {showTopicPicker ? 'Liste ausblenden' : 'Live Topics durchsuchen (#)'}
                    </span>
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                placeholder={
                  tileSourceType === 'mqtt'
                    ? 'z.B. zigbee2mqtt/wohnzimmer/temperature'
                    : 'z.B. smartmeterenergybuy oder smartmeter.power'
                }
                value={tileTopicOrPath}
                onChange={(e) => setTileTopicOrPath(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />

              {tileSourceType === 'mqtt' && showTopicPicker && (
                <div className="p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={topicFilterQuery}
                      onChange={(e) => setTopicFilterQuery(e.target.value)}
                      placeholder="Topics filtern..."
                      className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleLoadMqttTopics()}
                      className="p-1.5 rounded-lg bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#343740] cursor-pointer"
                      title="Topics neu laden"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingTopics ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {loadingTopics ? (
                      <div className="text-[11px] text-neutral-400 py-2 text-center">
                        Lade erkannte Topics vom Broker...
                      </div>
                    ) : discoveredTopics.filter(
                        (dt) =>
                          !topicFilterQuery.trim() ||
                          dt.topic.toLowerCase().includes(topicFilterQuery.trim().toLowerCase())
                      ).length === 0 ? (
                      <div className="text-[11px] text-neutral-400 py-2 text-center">
                        Noch keine Topics empfangen (Broker aktivieren & warten).
                      </div>
                    ) : (
                      discoveredTopics
                        .filter(
                          (dt) =>
                            !topicFilterQuery.trim() ||
                            dt.topic.toLowerCase().includes(topicFilterQuery.trim().toLowerCase())
                        )
                        .slice(0, 60)
                        .map((dt) => (
                          <button
                            key={`${dt.brokerId}-${dt.topic}`}
                            type="button"
                            onClick={() => {
                              setTileTopicOrPath(dt.topic);
                              if (dt.brokerId) setTileSourceId(dt.brokerId);
                              setShowTopicPicker(false);
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg bg-white dark:bg-[#1E1F23] hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between gap-2 text-[11px] cursor-pointer"
                          >
                            <span className="font-mono truncate text-neutral-800 dark:text-neutral-200">
                              {dt.topic}
                            </span>
                            <span className="font-mono text-[10px] text-neutral-400 shrink-0 max-w-[90px] truncate">
                              {dt.lastPayload}
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Feld / JSON-Pfad (optional)
                </label>
                <input
                  type="text"
                  placeholder="z.B. value oder temperature"
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
                  placeholder="z.B. °C, W, kWh, €"
                  value={tileUnit}
                  onChange={(e) => setTileUnit(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                />
              </div>
            </div>

            {/* Berechnung & Historischer Zeitvergleich */}
            <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#25272D] border border-[#E5E3DC] dark:border-[#343740] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  <span>Berechnung &amp; Zeitvergleich</span>
                </span>
                <select
                  value={tileCalcMode}
                  onChange={(e) =>
                    setTileCalcMode(e.target.value as SmarthomeTileCalculation['mode'])
                  }
                  className="text-[11px] px-2 py-1 rounded-lg bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#343740] font-semibold outline-hidden cursor-pointer"
                >
                  <option value="none">Keine Berechnung (Direktwert)</option>
                  <option value="delta_since">Differenz ab Zeitpunkt X</option>
                  <option value="formula">Eigene Formel (z.B. Kosten)</option>
                </select>
              </div>

              {tileCalcMode !== 'none' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-neutral-500 block mb-1">
                      Referenz-Zeitpunkt X (optional, z. B. Zählerstand am 01.01.2026)
                    </label>
                    <input
                      type="datetime-local"
                      value={tileCalcRefTs}
                      onChange={(e) => setTileCalcRefTs(e.target.value)}
                      className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-neutral-500 block mb-1">
                      Formel (Variablen: <code>latest</code>, <code>ref</code>, <code>diff</code>)
                    </label>
                    <input
                      type="text"
                      placeholder="(latest - ref) * 0.35"
                      value={tileCalcFormula}
                      onChange={(e) => setTileCalcFormula(e.target.value)}
                      className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {[
                        { label: 'Differenz', formula: 'latest - ref' },
                        { label: 'Stromkosten (0,35 €)', formula: '(latest - ref) * 0.35' },
                        { label: 'Wh → kWh', formula: 'latest / 1000' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setTileCalcFormula(preset.formula)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#343740] text-neutral-600 dark:text-neutral-300 hover:border-neutral-400 cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
            className="w-full max-w-md max-h-[86dvh] overflow-y-auto bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                {editingDbId ? 'Datenquelle bearbeiten' : 'InfluxDB / HTTP / Prometheus Quelle'}
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
                  placeholder="z.B. InfluxDB Smartmeter"
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
                  onChange={(e) => setDbKind(e.target.value as SmarthomeDbSource['kind'])}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                >
                  <option value="influx-v1">InfluxDB v1 (InfluxQL)</option>
                  <option value="influx-v2">InfluxDB v2 (Flux)</option>
                  <option value="prometheus">Prometheus Metrics</option>
                  <option value="http-json">HTTP JSON Endpoint</option>
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
                placeholder={
                  dbKind === 'influx-v1'
                    ? 'http://192.168.1.20:8086'
                    : dbKind === 'influx-v2'
                    ? 'http://192.168.1.20:8086'
                    : 'http://192.168.1.20/api/status'
                }
                value={dbUrl}
                onChange={(e) => setDbUrl(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
              />
            </div>

            {dbKind === 'influx-v1' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                    Datenbank *
                  </label>
                  <input
                    type="text"
                    placeholder="z.B. telegraf oder smarthome"
                    value={dbDatabase}
                    onChange={(e) => setDbDatabase(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                    Retention Policy (opt.)
                  </label>
                  <input
                    type="text"
                    placeholder="autogen"
                    value={dbRetentionPolicy}
                    onChange={(e) => setDbRetentionPolicy(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                    Benutzer (opt.)
                  </label>
                  <input
                    type="text"
                    value={dbUsername}
                    onChange={(e) => setDbUsername(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                    Passwort (opt.)
                  </label>
                  <input
                    type="password"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                </div>
              </div>
            )}

            {dbKind === 'influx-v2' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                    Organisation (Org)
                  </label>
                  <input
                    type="text"
                    placeholder="z.B. home"
                    value={dbOrg}
                    onChange={(e) => setDbOrg(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 block mb-1">
                    Bucket *
                  </label>
                  <input
                    type="text"
                    placeholder="z.B. energy"
                    value={dbBucket}
                    onChange={(e) => setDbBucket(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#282A30] border border-[#E5E3DC] dark:border-[#343740] outline-hidden"
                  />
                </div>
              </div>
            )}

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
                  {dbKind === 'influx-v2' ? 'API Token / Auth Header' : 'Auth Header (optional)'}
                </label>
                <input
                  type="text"
                  placeholder={dbKind === 'influx-v2' ? 'Token ...' : 'Bearer ...'}
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
