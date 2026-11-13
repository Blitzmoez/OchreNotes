import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookMarked,
  Plus,
  Search,
  Copy,
  Check,
  ImagePlus,
  Code2,
  Edit3,
  Eye,
  Trash2,
  Download,
  FolderOpen,
  X,
  Menu,
  ChevronRight,
  Save,
  Maximize2,
  FileText,
} from 'lucide-react';
import { WikiArticle, WikiCodeSnippet, WikiImage } from '../../types';
import { api } from '../../services/api';

interface WikiViewProps {
  username: string;
  accentColor?: string;
  onActiveArticleChange?: (article: WikiArticle | null) => void;
}

const CODE_LANGUAGES = [
  'bash',
  'yaml',
  'typescript',
  'javascript',
  'python',
  'sql',
  'json',
  'dockerfile',
  'nginx',
  'text',
];

export const WikiView: React.FC<WikiViewProps> = ({
  username,
  accentColor = '#B87333',
  onActiveArticleChange,
}) => {
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isMobileIndexOpen, setIsMobileIndexOpen] = useState(false);

  // Draft state when editing or creating
  const [draft, setDraft] = useState<WikiArticle | null>(null);
  const [originalSlug, setOriginalSlug] = useState<string | undefined>(undefined);
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<WikiImage | null>(null);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadArticles = async (preferSlug?: string) => {
    setLoading(true);
    try {
      const data = await api.fetchWikiArticles(username);
      setArticles(data);
      const target = preferSlug
        ? data.find((a) => a.slug === preferSlug)
        : data.find((a) => a.slug === selectedSlug) || data[0];
      if (target) {
        setSelectedSlug(target.slug);
      } else {
        setSelectedSlug(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, [username]);

  const activeArticle = useMemo(
    () => articles.find((a) => a.slug === selectedSlug) || null,
    [articles, selectedSlug]
  );

  useEffect(() => {
    if (onActiveArticleChange) {
      onActiveArticleChange(activeArticle);
    }
  }, [activeArticle, onActiveArticleChange]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    articles.forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [articles]);

  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q));
      const matchesCat = selectedCategory === 'all' || a.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [articles, searchQuery, selectedCategory]);

  const handleCopyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {}
  };

  const handleStartNewArticle = () => {
    const newArt: WikiArticle = {
      slug: '',
      title: '',
      category: selectedCategory !== 'all' ? selectedCategory : 'Anleitungen',
      tags: ['anleitung'],
      updatedAt: new Date().toISOString(),
      body: '1. Schritt eins beschreiben...\n2. Schritt zwei beschreiben...',
      images: [],
      snippets: [
        {
          id: `snip_${Date.now()}`,
          title: 'Beispiel-Befehl',
          language: 'bash',
          code: '# Hier Code oder Befehl für Copy & Paste ablegen',
        },
      ],
    };
    setDraft(newArt);
    setOriginalSlug(undefined);
    setTagsInput(newArt.tags.join(', '));
    setMode('edit');
    setIsMobileIndexOpen(false);
  };

  const handleStartEdit = (article: WikiArticle) => {
    setDraft(JSON.parse(JSON.stringify(article)));
    setOriginalSlug(article.slug);
    setTagsInput(article.tags.join(', '));
    setMode('edit');
  };

  const handleSaveDraft = async () => {
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const saved = await api.saveWikiArticle(
        username,
        {
          ...draft,
          title: draft.title.trim(),
          category: draft.category.trim() || 'Allgemein',
          tags: parsedTags,
        },
        originalSlug
      );

      await loadArticles(saved.slug);
      setMode('read');
      setSaveFeedback('Als Standard-Markdown gespeichert');
      setTimeout(() => setSaveFeedback(null), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArticle = async (slug: string) => {
    await api.deleteWikiArticle(username, slug);
    setConfirmDeleteSlug(null);
    if (mode === 'edit' && originalSlug === slug) {
      setMode('read');
      setDraft(null);
    }
    await loadArticles();
  };

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/') || !draft) return;
    setUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.uploadWikiImage(username, file.name, dataUrl);
      const newImg: WikiImage = {
        id: `img_${Date.now()}`,
        url: res.url,
        alt: file.name.replace(/\.[^.]+$/, ''),
        caption: '',
      };
      setDraft((prev) => (prev ? { ...prev, images: [...prev.images, newImg] } : prev));
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDownloadMarkdown = (article: WikiArticle) => {
    const content = article.rawMarkdown || `# ${article.title}\n\n${article.body}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${article.slug || 'wiki-artikel'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addSnippetToDraft = () => {
    if (!draft) return;
    const next: WikiCodeSnippet = {
      id: `snip_${Date.now()}`,
      title: `Code-Block ${draft.snippets.length + 1}`,
      language: 'bash',
      code: '',
    };
    setDraft({ ...draft, snippets: [...draft.snippets, next] });
  };

  // Render clean Markdown prose (with inline fenced code blocks + copy button)
  const renderMarkdownBody = (text: string) => {
    const blocks = text.split(/(```[\s\S]*?```)/g);
    return blocks.map((block, bIdx) => {
      if (block.startsWith('```') && block.endsWith('```')) {
        const lines = block.slice(3, -3).split('\n');
        const lang = lines[0]?.trim() || 'text';
        const code = lines.slice(1).join('\n').trimEnd();
        const blockId = `inline_${bIdx}`;
        return (
          <div
            key={bIdx}
            className="my-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#1D1F23] text-neutral-100 overflow-hidden"
          >
            <div className="px-3 py-1.5 bg-[#26282E] border-b border-neutral-700/60 flex items-center justify-between text-[11px] text-neutral-300">
              <span className="font-mono uppercase tracking-wider">{lang}</span>
              <button
                type="button"
                onClick={() => handleCopyCode(blockId, code)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                {copiedId === blockId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === blockId ? 'Kopiert' : 'Kopieren'}</span>
              </button>
            </div>
            <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed select-text">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      return (
        <div key={bIdx} className="space-y-2">
          {block.split('\n').map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lIdx} className="h-1.5" />;
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={lIdx} className="text-sm font-bold text-neutral-900 dark:text-neutral-100 pt-2">
                  {trimmed.slice(4)}
                </h4>
              );
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={lIdx} className="text-base font-bold text-neutral-900 dark:text-neutral-100 pt-3">
                  {trimmed.slice(3)}
                </h3>
              );
            }
            if (trimmed.startsWith('# ')) {
              return (
                <h2 key={lIdx} className="text-lg font-bold text-neutral-900 dark:text-neutral-100 pt-2">
                  {trimmed.slice(2)}
                </h2>
              );
            }
            // Inline image in markdown body
            const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
            if (imgMatch) {
              return (
                <div key={lIdx} className="my-3 rounded-xl overflow-hidden border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-100 dark:bg-neutral-900">
                  <img
                    src={imgMatch[2]}
                    alt={imgMatch[1]}
                    referrerPolicy="no-referrer"
                    className="max-h-96 w-full object-contain"
                  />
                </div>
              );
            }
            // Numbered or bulleted list
            if (/^\d+\.\s/.test(trimmed) || /^[-*]\s/.test(trimmed)) {
              return (
                <p key={lIdx} className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 pl-2">
                  {trimmed}
                </p>
              );
            }
            return (
              <p key={lIdx} className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 select-text">
                {line}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div
      className="flex-1 h-full flex flex-col bg-[#FBFBFA] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden relative"
      style={{ '--wiki-accent': accentColor } as React.CSSProperties}
    >
      {/* Sub-header Bar */}
      <div className="h-12 border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/90 dark:bg-[#1C1E22]/90 px-3 md:px-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileIndexOpen(!isMobileIndexOpen)}
            className="lg:hidden p-2 -ml-1 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-neutral-700 dark:text-neutral-200 cursor-pointer"
            aria-label="Wiki-Artikel-Index öffnen"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0"
            style={{ backgroundColor: accentColor }}
          >
            <BookMarked className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold tracking-tight text-neutral-900 dark:text-neutral-100 truncate">
              Ochre Wiki · Standard Markdown
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saveFeedback && (
            <span className="hidden sm:inline text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
              {saveFeedback}
            </span>
          )}

          {mode === 'read' ? (
            <button
              type="button"
              onClick={handleStartNewArticle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
              style={{ backgroundColor: accentColor }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Neuer Artikel</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMode('read');
                  setDraft(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#25272C] text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || !draft?.title.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold cursor-pointer disabled:opacity-50 active:scale-95 transition-transform"
                style={{ backgroundColor: accentColor }}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Speichert...' : 'Speichern'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop for Index Drawer */}
        {isMobileIndexOpen && (
          <div
            onClick={() => setIsMobileIndexOpen(false)}
            className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-2xs"
          />
        )}

        {/* Left Index Sidebar (Desktop static, Mobile slide-over) */}
        <aside
          className={`fixed lg:static top-14 lg:top-0 bottom-0 left-0 z-40 w-72 bg-[#F4F3EF] dark:bg-[#1D1F23] border-r border-[#E5E3DC] dark:border-[#2F3136] flex flex-col transition-transform duration-200 ${
            isMobileIndexOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
            <div className="flex items-center justify-between lg:hidden">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Wiki-Einträge ({articles.length})
              </span>
              <button
                type="button"
                onClick={() => setIsMobileIndexOpen(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wiki durchsuchen..."
                className="w-full text-xs pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-800 dark:text-neutral-200 outline-hidden"
              />
            </div>

            {/* Category filter */}
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-700 dark:text-neutral-300 outline-hidden cursor-pointer"
              >
                <option value="all">Alle Kategorien ({articles.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Articles List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="p-4 text-xs text-neutral-400">Lade Wiki-Einträge...</div>
            ) : filteredArticles.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-neutral-500">Keine Wiki-Einträge gefunden.</p>
                <button
                  type="button"
                  onClick={handleStartNewArticle}
                  className="text-xs font-semibold underline cursor-pointer"
                  style={{ color: accentColor }}
                >
                  Ersten Artikel erstellen
                </button>
              </div>
            ) : (
              filteredArticles.map((art) => {
                const isActive = art.slug === selectedSlug && mode === 'read';
                return (
                  <button
                    key={art.slug}
                    type="button"
                    onClick={() => {
                      setSelectedSlug(art.slug);
                      setMode('read');
                      setDraft(null);
                      setIsMobileIndexOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition-colors cursor-pointer flex items-start justify-between gap-2 border ${
                      isActive
                        ? 'bg-white dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#383A40] font-semibold'
                        : 'border-transparent hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className="text-xs block truncate"
                        style={isActive ? { color: accentColor } : undefined}
                      >
                        {art.title}
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block truncate mt-0.5">
                        {art.category} · {art.snippets.length} Code · {art.images.length} Fotos
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                  </button>
                );
              })
            )}
          </div>

          <div className="p-2.5 px-3 border-t border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              User/{username}/Wiki
            </span>
            <span className="tabular-nums">{articles.length} .md</span>
          </div>
        </aside>

        {/* Main Content Canvas: Reader or Editor */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto">
            {mode === 'edit' && draft ? (
              /* ======================================================= */
              /* EDITOR MODE: Title, Category, Markdown, Photo Upload, Code-Ablage */
              /* ======================================================= */
              <div className="space-y-6 pb-16">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      {originalSlug ? 'Wiki-Eintrag bearbeiten' : 'Neuen Wiki-Eintrag verfassen'}
                    </h3>
                    <span className="text-[11px] text-neutral-500">
                      Speicherformat: Open-Standard Markdown (.md)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Titel der Anleitung / Seite
                      </label>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        placeholder="z. B. Nginx Reverse Proxy Setup"
                        className="w-full text-sm px-3 py-2 rounded-lg bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Kategorie
                      </label>
                      <input
                        type="text"
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        placeholder="z. B. Server & Docker"
                        className="w-full text-sm px-3 py-2 rounded-lg bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Tags (kommagetrennt)
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="linux, docker, backup"
                      className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                    />
                  </div>
                </div>

                {/* Instructions / Markdown Body */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Anleitung & Beschreibung (Markdown)
                  </label>
                  <textarea
                    rows={8}
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.startsWith('image/')) {
                          const file = items[i].getAsFile();
                          if (file) handleImageFile(file);
                        }
                      }
                    }}
                    placeholder="Schreibe hier deine Schritt-für-Schritt-Anleitung..."
                    className="w-full text-sm p-3 rounded-xl bg-white dark:bg-[#1E2024] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden leading-relaxed select-text"
                  />
                </div>

                {/* Photo Upload Section */}
                <div className="p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ImagePlus className="w-4 h-4" style={{ color: accentColor }} />
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        Anleitungs-Fotos & Screenshots ({draft.images.length})
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                      style={{ backgroundColor: accentColor }}
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>{uploadingImage ? 'Lädt hoch...' : 'Foto hochladen'}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageFile(f);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </div>

                  {/* Drag & Drop Target */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleImageFile(f);
                    }}
                    className="p-4 rounded-xl border border-dashed border-[#E5E3DC] dark:border-[#383A40] bg-[#FBFBFA] dark:bg-[#18191B] text-center text-xs text-neutral-500"
                  >
                    Foto hierher ziehen oder oben auswählen (auch aus Zwischenablage einfügbar). Wird lokal im Ordner <span className="font-mono">Wiki/assets/</span> abgelegt.
                  </div>

                  {draft.images.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {draft.images.map((img, idx) => (
                        <div
                          key={img.id}
                          className="rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden bg-[#FBFBFA] dark:bg-[#18191B] flex flex-col"
                        >
                          <div className="relative h-36 bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
                            <img
                              src={img.url}
                              alt={img.alt}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  images: draft.images.filter((_, i) => i !== idx),
                                })
                              }
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-red-600 cursor-pointer"
                              title="Foto entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="p-2">
                            <input
                              type="text"
                              value={img.caption || ''}
                              onChange={(e) => {
                                const updated = [...draft.images];
                                updated[idx] = { ...img, caption: e.target.value };
                                setDraft({ ...draft, images: updated });
                              }}
                              placeholder="Bildbeschreibung / Schritt-Notiz..."
                              className="w-full text-xs px-2 py-1.5 rounded bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dedicated Code-Ablage Builder */}
                <div className="p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4" style={{ color: accentColor }} />
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        Code-Ablage für Copy & Paste ({draft.snippets.length})
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={addSnippetToDraft}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-xs font-semibold hover:border-neutral-400 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Code-Feld hinzufügen</span>
                    </button>
                  </div>

                  {draft.snippets.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      Füge ein Code-Feld hinzu, um Befehle, Konfigurationen oder Skripte direkt kopierbar abzulegen.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {draft.snippets.map((snip, idx) => (
                        <div
                          key={snip.id}
                          className="p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] space-y-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={snip.title}
                              onChange={(e) => {
                                const updated = [...draft.snippets];
                                updated[idx] = { ...snip, title: e.target.value };
                                setDraft({ ...draft, snippets: updated });
                              }}
                              placeholder="Titel des Code-Blocks..."
                              className="flex-1 min-w-[160px] text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                            />
                            <select
                              value={snip.language}
                              onChange={(e) => {
                                const updated = [...draft.snippets];
                                updated[idx] = { ...snip, language: e.target.value };
                                setDraft({ ...draft, snippets: updated });
                              }}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden font-mono"
                            >
                              {CODE_LANGUAGES.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  snippets: draft.snippets.filter((_, i) => i !== idx),
                                })
                              }
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
                              title="Code-Feld entfernen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <textarea
                            rows={5}
                            value={snip.code}
                            onChange={(e) => {
                              const updated = [...draft.snippets];
                              updated[idx] = { ...snip, code: e.target.value };
                              setDraft({ ...draft, snippets: updated });
                            }}
                            placeholder="Code, Befehle oder YAML hier einfügen..."
                            className="w-full text-xs font-mono p-2.5 rounded-lg bg-[#1D1F23] text-neutral-100 border border-[#2F3136] outline-hidden leading-relaxed select-text"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : activeArticle ? (
              /* ======================================================= */
              /* READER MODE: Clean Typography, Photos & Copy-Paste Code */
              /* ======================================================= */
              <article className="space-y-6 pb-16">
                {/* Article Header */}
                <div className="pb-4 border-b border-[#E5E3DC] dark:border-[#2B2D31] space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-semibold" style={{ color: accentColor }}>
                      {activeArticle.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Aktualisiert: {new Date(activeArticle.updatedAt).toLocaleDateString('de-DE')}
                    </span>
                    {activeArticle.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {activeArticle.tags.map((t) => `#${t}`).join(' ')}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <h1 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-snug">
                      {activeArticle.title}
                    </h1>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(activeArticle)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Bearbeiten</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadMarkdown(activeArticle)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:border-neutral-400 cursor-pointer"
                        title="Als Standard-Markdown (.md) exportieren"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">.md</span>
                      </button>

                      {confirmDeleteSlug === activeArticle.slug ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteArticle(activeArticle.slug)}
                          className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Löschen?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteSlug(activeArticle.slug);
                            setTimeout(() => setConfirmDeleteSlug(null), 3500);
                          }}
                          className="p-2 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#23252A] text-neutral-500 hover:text-red-600 cursor-pointer"
                          title="Artikel löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prose Body */}
                {activeArticle.body && (
                  <div className="space-y-3">{renderMarkdownBody(activeArticle.body)}</div>
                )}

                {/* Uploaded Instruction Photos */}
                {activeArticle.images.length > 0 && (
                  <section className="space-y-3 pt-2">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      Fotos & Anleitungsbilder
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeArticle.images.map((img) => (
                        <div
                          key={img.id}
                          onClick={() => setZoomedImage(img)}
                          className="group rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] overflow-hidden cursor-pointer"
                        >
                          <div className="relative h-52 bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
                            <img
                              src={img.url}
                              alt={img.alt}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain"
                            />
                            <span className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-80 group-hover:opacity-100">
                              <Maximize2 className="w-3.5 h-3.5" />
                            </span>
                          </div>
                          {(img.caption || img.alt) && (
                            <p className="p-2.5 text-xs text-neutral-600 dark:text-neutral-300 border-t border-[#E5E3DC] dark:border-[#2F3136]">
                              {img.caption || img.alt}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Dedicated Code-Ablage (Copy & Paste Cards) */}
                {activeArticle.snippets.length > 0 && (
                  <section className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                        <Code2 className="w-4 h-4" style={{ color: accentColor }} />
                        <span>Code-Ablage (Copy & Paste)</span>
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {activeArticle.snippets.map((snip) => (
                        <div
                          key={snip.id}
                          className="rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#1D1F23] text-neutral-100 overflow-hidden"
                        >
                          <div className="px-3.5 py-2 bg-[#26282E] border-b border-neutral-700/60 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-white truncate">
                                {snip.title}
                              </span>
                              <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                                {snip.language}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopyCode(snip.id, snip.code)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer shrink-0 active:scale-95"
                              style={{
                                backgroundColor: copiedId === snip.id ? '#16A34A' : accentColor,
                              }}
                            >
                              {copiedId === snip.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Kopiert</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Kopieren</span>
                                </>
                              )}
                            </button>
                          </div>

                          <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed select-text">
                            <code>{snip.code}</code>
                          </pre>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            ) : (
              /* Empty State */
              <div className="py-16 text-center space-y-4">
                <div
                  className="w-12 h-12 rounded-2xl text-white flex items-center justify-center mx-auto"
                  style={{ backgroundColor: accentColor }}
                >
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    Dein Wiki nach offenem Standard
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    Erstelle Schritt-für-Schritt-Anleitungen mit hochgeladenen Fotos und direkt kopierbarer Code-Ablage. Alle Einträge werden als offene Markdown-Dateien (.md) gespeichert.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartNewArticle}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Ersten Wiki-Artikel anlegen</span>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Lightbox Modal for Zoomed Wiki Image */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl max-h-[90vh] bg-white dark:bg-[#1E2024] rounded-2xl overflow-hidden shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] flex flex-col"
          >
            <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                {zoomedImage.caption || zoomedImage.alt}
              </span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-neutral-100 dark:bg-neutral-900">
              <img
                src={zoomedImage.url}
                alt={zoomedImage.alt}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
