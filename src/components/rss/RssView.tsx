import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Rss,
  Plus,
  RefreshCw,
  Search,
  EyeOff,
  Eye,
  Trash2,
  Edit3,
  BookOpen,
  ExternalLink,
  X,
  Check,
  AlertTriangle,
  SlidersHorizontal,
  ChevronLeft,
  Filter,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api';
import { useSwipeDrawer } from '../../hooks/useSwipeDrawer';
import { RssArticle, RssReaderResponse, RssSource } from '../../types';

interface RssViewProps {
  username: string;
  accentColor: string;
  mobileNavPosition?: 'top' | 'bottom';
  onOpenMenu?: () => void;
  onActiveArticleChange?: (article: RssArticle | null, readerData?: RssReaderResponse | null) => void;
}

const QUICK_PRESET_FEEDS: Array<{ title: string; url: string; category: string }> = [
  { title: 'Tagesschau', url: 'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml', category: 'Nachrichten' },
  { title: 'Heise Online', url: 'https://www.heise.de/rss/heise-atom.xml', category: 'Technik' },
  { title: 'Golem.de', url: 'https://rss.golem.de/rss.php?feed=RSS2.0', category: 'Technik' },
  { title: 'Netzpolitik.org', url: 'https://netzpolitik.org/feed/', category: 'Gesellschaft' },
];

export const RssView: React.FC<RssViewProps> = ({
  username,
  accentColor,
  mobileNavPosition = 'bottom',
  onOpenMenu,
  onActiveArticleChange,
}) => {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [feedErrors, setFeedErrors] = useState<Array<{ sourceId: string; title: string; error: string }>>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Filters & Vault state
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hidePaidGlobal, setHidePaidGlobal] = useState<boolean>(true);
  const [isMobileVaultOpen, setIsMobileVaultOpen] = useState(false);

  // Source modal
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<RssSource | null>(null);
  const [srcTitle, setSrcTitle] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcCategory, setSrcCategory] = useState('Nachrichten');
  const [srcEnabled, setSrcEnabled] = useState(true);
  const [srcHidePaid, setSrcHidePaid] = useState(false);

  // Reader modal
  const [activeArticle, setActiveArticle] = useState<RssArticle | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerData, setReaderData] = useState<RssReaderResponse | null>(null);
  const [readerFont, setReaderFont] = useState<'sans' | 'serif'>('serif');
  const [readerSize, setReaderSize] = useState<'sm' | 'md' | 'lg'>('md');

  const persistSources = useCallback(
    async (next: RssSource[]) => {
      setSources(next);
      try {
        const saved = await api.saveRssSources(username, next);
        setSources(saved);
      } catch (err) {
        console.error('RSS sources save failed', err);
      }
    },
    [username]
  );

  const loadFeed = useCallback(
    async (targetSources: RssSource[], hidePaid: boolean) => {
      const enabled = targetSources.filter((s) => s.enabled !== false);
      if (enabled.length === 0) {
        setArticles([]);
        setFeedErrors([]);
        return;
      }
      setLoadingFeed(true);
      try {
        const res = await api.fetchRssFeed(enabled, hidePaid);
        setArticles(Array.isArray(res.articles) ? res.articles : []);
        setFeedErrors(Array.isArray(res.errors) ? res.errors : []);
      } catch {
        setFeedErrors([{ sourceId: 'all', title: 'Netzwerk', error: 'Feeds konnten nicht geladen werden.' }]);
      } finally {
        setLoadingFeed(false);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    setLoadingSources(true);
    api
      .fetchRssSources(username)
      .then((list) => {
        if (!active) return;
        setSources(list);
        setLoadingSources(false);
        if (list.length > 0) {
          loadFeed(list, hidePaidGlobal);
        } else {
          setArticles([]);
        }
      })
      .catch(() => {
        if (active) setLoadingSources(false);
      });
    return () => {
      active = false;
    };
  }, [username]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    sources.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [sources]);

  const visibleArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (selectedSourceId !== 'all' && a.sourceId !== selectedSourceId) return false;
      if (selectedCategory !== 'all' && a.category !== selectedCategory) return false;
      const src = sources.find((s) => s.id === a.sourceId);
      if ((hidePaidGlobal || src?.hidePaid) && a.isPaid) return false;
      if (q) {
        const hay = `${a.title} ${a.summary} ${a.sourceTitle} ${a.author || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [articles, selectedSourceId, selectedCategory, hidePaidGlobal, sources, searchQuery]);

  const openAddSource = () => {
    setEditingSource(null);
    setSrcTitle('');
    setSrcUrl('');
    setSrcCategory('Nachrichten');
    setSrcEnabled(true);
    setSrcHidePaid(false);
    setIsSourceModalOpen(true);
  };

  const openEditSource = (src: RssSource) => {
    setEditingSource(src);
    setSrcTitle(src.title);
    setSrcUrl(src.url);
    setSrcCategory(src.category || 'Allgemein');
    setSrcEnabled(src.enabled !== false);
    setSrcHidePaid(Boolean(src.hidePaid));
    setIsSourceModalOpen(true);
  };

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!srcUrl.trim()) return;
    const item: RssSource = {
      id: editingSource?.id || `rss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: srcTitle.trim() || srcUrl.trim(),
      url: srcUrl.trim(),
      category: srcCategory.trim() || 'Allgemein',
      enabled: srcEnabled,
      hidePaid: srcHidePaid,
      createdAt: editingSource?.createdAt || Date.now(),
    };
    const next = editingSource
      ? sources.map((s) => (s.id === editingSource.id ? item : s))
      : [...sources, item];
    setIsSourceModalOpen(false);
    await persistSources(next);
    await loadFeed(next, hidePaidGlobal);
  };

  const handleAddPreset = async (preset: { title: string; url: string; category: string }) => {
    if (sources.some((s) => s.url === preset.url)) return;
    const item: RssSource = {
      id: `rss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: preset.title,
      url: preset.url,
      category: preset.category,
      enabled: true,
      hidePaid: false,
      createdAt: Date.now(),
    };
    const next = [...sources, item];
    await persistSources(next);
    await loadFeed(next, hidePaidGlobal);
  };

  const handleDeleteSource = async (id: string) => {
    const next = sources.filter((s) => s.id !== id);
    if (selectedSourceId === id) setSelectedSourceId('all');
    await persistSources(next);
    await loadFeed(next, hidePaidGlobal);
  };

  const handleToggleSourceEnabled = async (src: RssSource) => {
    const next = sources.map((s) => (s.id === src.id ? { ...s, enabled: !s.enabled } : s));
    await persistSources(next);
    await loadFeed(next, hidePaidGlobal);
  };

  useEffect(() => {
    onActiveArticleChange?.(activeArticle, readerData);
  }, [activeArticle, readerData, onActiveArticleChange]);

  const handleOpenArticle = async (article: RssArticle) => {
    setActiveArticle(article);
    setReaderData(null);
    setReaderLoading(true);
    try {
      const res = await api.fetchRssArticleReader(
        article.link,
        article.title,
        article.summary,
        article.contentText
      );
      setReaderData(res);
    } catch {
      const fallbackParas = (article.contentText || article.summary || 'Artikeltext konnte im Reader nicht geladen werden.')
        .split(/\n{2,}/)
        .filter(Boolean);
      setReaderData({
        url: article.link,
        title: article.title,
        paragraphs: fallbackParas,
      });
    } finally {
      setReaderLoading(false);
    }
  };

  // Unified Pixel-Launcher Swipe gesture with velocity fling & subtle haptics
  const { dragOffset: vaultDragX, bind: drawerSwipeBind } = useSwipeDrawer({
    isOpen: isMobileVaultOpen,
    onOpen: () => setIsMobileVaultOpen(true),
    onClose: () => setIsMobileVaultOpen(false),
    width: 288,
    edgeZonePx: 42,
    disabled: Boolean(activeArticle),
  });

  const formatDate = (ts: number, raw?: string) => {
    if (ts && Number.isFinite(ts)) {
      return new Date(ts).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return raw || '';
  };

  const renderVaultContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Rss size={16} style={{ color: accentColor }} className="shrink-0" />
          <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">Quellen-Vault</h2>
          <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            {sources.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={openAddSource}
            className="p-1.5 rounded-lg text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: accentColor }}
            title="Quelle hinzufügen"
          >
            <Plus size={15} />
          </button>
          <button
            onClick={() => setIsMobileVaultOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* Global filter switch in Vault */}
      <div className="px-3.5 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800/80 space-y-2 bg-zinc-50/70 dark:bg-zinc-900/40">
        <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            {hidePaidGlobal ? <EyeOff size={13} className="text-amber-600" /> : <Eye size={13} className="text-zinc-400" />}
            Bezahlte ausblenden
          </span>
          <button
            type="button"
            onClick={() => {
              const nextVal = !hidePaidGlobal;
              setHidePaidGlobal(nextVal);
              loadFeed(sources, nextVal);
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              hidePaidGlobal ? 'bg-amber-600' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                hidePaidGlobal ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
        <p className="text-[10px] text-zinc-400 leading-snug">
          Nur Quellen werden im Vault gespeichert. Artikel bleiben rein temporär im RAM.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        <button
          onClick={() => {
            setSelectedSourceId('all');
            setIsMobileVaultOpen(false);
          }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-semibold transition-colors ${
            selectedSourceId === 'all'
              ? 'text-white shadow-sm'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
          }`}
          style={selectedSourceId === 'all' ? { backgroundColor: accentColor } : undefined}
        >
          <span>Alle aktiven Quellen</span>
          <span className="font-mono tabular-nums text-[11px] opacity-80">{articles.length}</span>
        </button>

        {sources.map((src) => {
          const isSelected = selectedSourceId === src.id;
          const count = articles.filter((a) => a.sourceId === src.id).length;
          return (
            <div
              key={src.id}
              className={`group rounded-xl border transition-all ${
                isSelected
                  ? 'border-amber-500/60 bg-amber-50/70 dark:bg-amber-900/20'
                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button
                  onClick={() => {
                    setSelectedSourceId(isSelected ? 'all' : src.id);
                    setIsMobileVaultOpen(false);
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        src.enabled !== false ? 'bg-emerald-500' : 'bg-zinc-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {src.title}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5 pl-3.5">
                    {src.category || 'Allgemein'}
                    {src.hidePaid ? ' • Abo-Filter' : ''}
                    {count > 0 ? ` • ${count}` : ''}
                  </div>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleToggleSourceEnabled(src)}
                    className={`p-1 rounded-md text-[10px] ${
                      src.enabled !== false
                        ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                    title={src.enabled !== false ? 'Quelle pausieren' : 'Quelle aktivieren'}
                  >
                    {src.enabled !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    onClick={() => openEditSource(src)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title="Bearbeiten"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteSource(src.id)}
                    className="p-1 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Löschen"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {sources.length === 0 && !loadingSources && (
          <div className="p-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center space-y-2 mt-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Noch keine RSS-Quellen angelegt.</p>
            <div className="space-y-1">
              {QUICK_PRESET_FEEDS.map((p) => (
                <button
                  key={p.url}
                  onClick={() => handleAddPreset(p)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center justify-between"
                >
                  <span>+ {p.title}</span>
                  <span className="text-[10px] text-zinc-400">{p.category}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="flex-1 flex min-h-0 bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden"
      {...drawerSwipeBind}
    >
      {/* Desktop Vault Sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-col min-h-0">
        {renderVaultContent()}
      </aside>

      {/* Mobile Edge Pull Tab */}
      {!isMobileVaultOpen && vaultDragX === null && (
        <button
          onClick={() => setIsMobileVaultOpen(true)}
          aria-label="RSS Quellen öffnen"
          className="md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-30 w-5 h-16 rounded-r-xl bg-white/90 dark:bg-zinc-900/90 border border-l-0 border-zinc-300 dark:border-zinc-700 shadow-md flex items-center justify-center text-zinc-500"
        >
          <span className="w-1 h-8 rounded-full bg-amber-500/70" />
        </button>
      )}

      {/* Mobile Swipeable Light Vault */}
      {(isMobileVaultOpen || vaultDragX !== null) && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setIsMobileVaultOpen(false)}
          />
          <div
            className={`relative w-72 max-w-[85vw] h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl z-10 ${
              vaultDragX !== null ? 'transition-none' : 'transition-transform duration-150'
            }`}
            style={{
              transform: `translateX(${vaultDragX !== null ? vaultDragX : 0}px)`,
            }}
          >
            {renderVaultContent()}
          </div>
        </div>
      )}

      {/* Main Feed Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Toolbar */}
        <div className="px-3 sm:px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => setIsMobileVaultOpen(true)}
            className="md:hidden px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Rss size={14} style={{ color: accentColor }} />
            Quellen ({sources.length})
          </button>

          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Schlagzeilen durchsuchen..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !hidePaidGlobal;
                setHidePaidGlobal(next);
                loadFeed(sources, next);
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                hidePaidGlobal
                  ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-900/25 text-amber-800 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {hidePaidGlobal ? <EyeOff size={13} /> : <Eye size={13} />}
              <span className="hidden sm:inline">{hidePaidGlobal ? 'Ohne Bezahlschranke' : 'Alle Artikel'}</span>
            </button>

            <button
              onClick={() => loadFeed(sources, hidePaidGlobal)}
              disabled={loadingFeed}
              className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: accentColor }}
            >
              <RefreshCw size={13} className={loadingFeed ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Aktualisieren</span>
            </button>

            <button
              onClick={openAddSource}
              className="hidden sm:flex px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 items-center gap-1 whitespace-nowrap"
            >
              <Plus size={14} /> Quelle
            </button>
          </div>
        </div>

        {/* Category Filter Strip */}
        {categories.length > 0 && (
          <div className="px-3 sm:px-6 py-2 bg-zinc-100/70 dark:bg-zinc-900/60 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <Filter size={12} className="text-zinc-400 shrink-0 mr-1" />
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              Alle Kategorien
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? 'all' : cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'text-white shadow-sm'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                }`}
                style={selectedCategory === cat ? { backgroundColor: accentColor } : undefined}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Feed Errors Banner */}
        {feedErrors.length > 0 && (
          <div className="mx-3 sm:mx-6 mt-3 px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 shrink-0">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {feedErrors.map((err, i) => (
                <div key={`${err.sourceId}_${i}`}>
                  <strong>{err.title}:</strong> {err.error}
                </div>
              ))}
            </div>
            <button onClick={() => setFeedErrors([])} className="p-0.5 hover:opacity-70">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Feed Content */}
        <div
          className={`flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3 ${
            mobileNavPosition === 'bottom' ? 'pb-24 md:pb-6' : 'pb-6'
          }`}
        >
          {sources.length === 0 && !loadingSources ? (
            <div className="max-w-xl mx-auto mt-8 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm text-center space-y-4">
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-sm"
                style={{ backgroundColor: accentColor }}
              >
                <Rss size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Dein News Feed & RSS Reader
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Quellen im Vault verwalten, Bezahlartikel ausblenden und Meldungen werbefrei direkt in der Ochre Suite lesen.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {QUICK_PRESET_FEEDS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => handleAddPreset(p)}
                    className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-amber-500/60 bg-zinc-50 dark:bg-zinc-800/60 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{p.title}</div>
                      <div className="text-[10px] text-zinc-500">{p.category}</div>
                    </div>
                    <Plus size={15} style={{ color: accentColor }} />
                  </button>
                ))}
              </div>
              <button
                onClick={openAddSource}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                Eigene RSS-URL hinzufügen
              </button>
            </div>
          ) : loadingFeed && articles.length === 0 ? (
            <div className="py-16 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
              <RefreshCw size={20} className="animate-spin" style={{ color: accentColor }} />
              Feeds werden live abgerufen...
            </div>
          ) : visibleArticles.length === 0 ? (
            <div className="py-14 text-center text-xs text-zinc-500 space-y-2">
              <p>Keine passenden Artikel für die aktuellen Filter gefunden.</p>
              {hidePaidGlobal && (
                <button
                  onClick={() => {
                    setHidePaidGlobal(false);
                    loadFeed(sources, false);
                  }}
                  className="text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                >
                  Bezahlte Artikel testweise einblenden
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto grid grid-cols-1 gap-3">
              {visibleArticles.map((art) => (
                <article
                  key={art.id}
                  onClick={() => handleOpenArticle(art)}
                  className="group cursor-pointer rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 p-4 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-bold truncate"
                        style={{ color: accentColor }}
                      >
                        {art.sourceTitle}
                      </span>
                      {art.category && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium">
                          {art.category}
                        </span>
                      )}
                      {art.isPaid && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                          Plus / Abo
                        </span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums shrink-0">{formatDate(art.timestamp, art.pubDate)}</span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors leading-snug">
                    {art.title}
                  </h3>

                  {art.summary && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                      {art.summary}
                    </p>
                  )}

                  <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                      <BookOpen size={12} style={{ color: accentColor }} />
                      Im Reader lesen
                    </span>
                    {art.author && (
                      <span className="text-[10px] text-zinc-400 truncate max-w-[140px]">
                        {art.author}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      {mobileNavPosition === 'bottom' && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 px-3 py-2 flex items-center justify-around gap-2">
          <button
            onClick={() => setIsMobileVaultOpen(true)}
            className="flex-1 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-1.5"
          >
            <Rss size={14} style={{ color: accentColor }} /> Quellen
          </button>
          <button
            onClick={() => loadFeed(sources, hidePaidGlobal)}
            className="flex-1 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            style={{ backgroundColor: accentColor }}
          >
            <RefreshCw size={14} className={loadingFeed ? 'animate-spin' : ''} /> Laden
          </button>
          <button
            onClick={openAddSource}
            className="flex-1 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Neu
          </button>
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
            >
              <SlidersHorizontal size={14} />
            </button>
          )}
        </div>
      )}

      {/* Source Add/Edit Modal */}
      {isSourceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSource}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {editingSource ? 'RSS-Quelle bearbeiten' : 'Neue RSS-Quelle'}
              </h3>
              <button type="button" onClick={() => setIsSourceModalOpen(false)} className="text-zinc-400 hover:text-zinc-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Name</label>
                <input
                  type="text"
                  value={srcTitle}
                  onChange={(e) => setSrcTitle(e.target.value)}
                  placeholder="z.B. Heise Online"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Feed-URL (RSS / Atom)</label>
                <input
                  type="url"
                  required
                  value={srcUrl}
                  onChange={(e) => setSrcUrl(e.target.value)}
                  placeholder="https://example.com/rss.xml"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Kategorie</label>
                <input
                  type="text"
                  value={srcCategory}
                  onChange={(e) => setSrcCategory(e.target.value)}
                  placeholder="Nachrichten, Technik, Finanzen..."
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 cursor-pointer">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Quelle aktiv</span>
                <input
                  type="checkbox"
                  checked={srcEnabled}
                  onChange={(e) => setSrcEnabled(e.target.checked)}
                  className="rounded"
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 cursor-pointer">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Bezahlte Artikel dieser Quelle ausblenden</span>
                <input
                  type="checkbox"
                  checked={srcHidePaid}
                  onChange={(e) => setSrcHidePaid(e.target.checked)}
                  className="rounded"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSourceModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm hover:opacity-90 flex items-center gap-1.5"
                style={{ backgroundColor: accentColor }}
              >
                <Check size={14} /> Speichern
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Distraction-free In-App Reader Modal */}
      {activeArticle && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6">
          <div className="w-full max-w-3xl max-h-[92vh] rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
            {/* Reader Header */}
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen size={16} style={{ color: accentColor }} className="shrink-0" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                  {readerData?.siteName || activeArticle.sourceTitle}
                </span>
                <span className="hidden sm:inline text-[11px] text-zinc-400">• Werbefreier Reader</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setReaderFont(readerFont === 'serif' ? 'sans' : 'serif')}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  {readerFont === 'serif' ? 'Serif' : 'Sans'}
                </button>
                <button
                  onClick={() => setReaderSize(readerSize === 'sm' ? 'md' : readerSize === 'md' ? 'lg' : 'sm')}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  {readerSize.toUpperCase()}
                </button>
                <button
                  onClick={() => setActiveArticle(null)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Reader Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-10 py-6 space-y-5">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  <span>{activeArticle.sourceTitle}</span>
                  {readerData?.byline || activeArticle.author ? (
                    <span>• {readerData?.byline || activeArticle.author}</span>
                  ) : null}
                  {activeArticle.timestamp ? (
                    <span>• {formatDate(activeArticle.timestamp, activeArticle.pubDate)}</span>
                  ) : null}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
                  {readerData?.title || activeArticle.title}
                </h1>
              </div>

              {readerData?.leadImage && (
                <img
                  src={readerData.leadImage}
                  alt={readerData.title}
                  className="w-full max-h-72 object-cover rounded-xl border border-zinc-200 dark:border-zinc-800"
                />
              )}

              {readerLoading ? (
                <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                  <Sparkles size={20} className="animate-pulse" style={{ color: accentColor }} />
                  Kerntext wird extrahiert & Werbung entfernt...
                </div>
              ) : (
                <div
                  className={`space-y-4 leading-relaxed text-zinc-800 dark:text-zinc-200 ${
                    readerFont === 'serif' ? 'font-serif' : 'font-sans'
                  } ${
                    readerSize === 'sm' ? 'text-sm' : readerSize === 'lg' ? 'text-lg' : 'text-base'
                  }`}
                >
                  {(readerData?.paragraphs || [activeArticle.summary]).map((p, idx) => {
                    if (p.startsWith('## ')) {
                      return (
                        <h2 key={idx} className="text-lg font-bold text-zinc-900 dark:text-zinc-100 pt-2">
                          {p.slice(3)}
                        </h2>
                      );
                    }
                    if (p.startsWith('> ')) {
                      return (
                        <blockquote
                          key={idx}
                          className="border-l-4 border-amber-500/60 pl-4 italic text-zinc-600 dark:text-zinc-400"
                        >
                          {p.slice(2)}
                        </blockquote>
                      );
                    }
                    return <p key={idx}>{p}</p>;
                  })}
                </div>
              )}

              {activeArticle.link && (
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>Originalquelle im internen Reader bereinigt</span>
                  <a
                    href={activeArticle.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold hover:underline"
                    style={{ color: accentColor }}
                  >
                    Original öffnen <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
