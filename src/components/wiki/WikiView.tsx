import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookMarked,
  Plus,
  Search,
  Copy,
  Check,
  ImagePlus,
  Video,
  Code2,
  Edit3,
  Trash2,
  Download,
  FolderOpen,
  X,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  Maximize2,
  FileText,
  ArrowUp,
  ArrowDown,
  Link2,
  Camera,
  Upload,
  ExternalLink,
  Layers,
  Globe,
  Lock,
  Briefcase,
} from 'lucide-react';
import {
  WikiArticle,
  WikiBlock,
  WikiBlockType,
  WikiCodeSnippet,
  WikiImage,
  WikiVisibility,
  NoteMetadata,
  ProjectItem,
} from '../../types';
import { api } from '../../services/api';
import { useSwipeDrawer } from '../../hooks/useSwipeDrawer';

interface WikiViewProps {
  username: string;
  accentColor?: string;
  mobileBarPosition?: 'top' | 'bottom';
  onActiveArticleChange?: (article: WikiArticle | null) => void;
  onNavigateToNote?: (title: string) => void;
  notes?: NoteMetadata[];
  projects?: ProjectItem[];
  onNavigateToProject?: (projectId: string) => void;
  initialSelectedSlug?: string | null;
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

function inferMediaKind(url: string): 'image' | 'video' {
  const clean = (url || '').split('?')[0].toLowerCase();
  if (
    /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i.test(clean) ||
    /youtube\.com|youtu\.be|vimeo\.com/i.test(url || '')
  ) {
    return 'video';
  }
  return 'image';
}

function extractYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/);
  if (watchMatch?.[1]) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }
  return null;
}

function ensureArticleBlocks(article: WikiArticle): WikiBlock[] {
  if (Array.isArray(article.blocks) && article.blocks.length > 0) {
    return article.blocks;
  }
  const blocks: WikiBlock[] = [];
  if (article.body?.trim()) {
    blocks.push({
      id: `wb_txt_${Date.now()}`,
      type: 'text',
      content: article.body,
    });
  }
  (article.images || []).forEach((img, idx) => {
    blocks.push({
      id: img.id || `wb_img_${idx}_${Date.now()}`,
      type: 'media',
      mediaUrl: img.url,
      mediaKind: inferMediaKind(img.url),
      alt: img.alt,
      caption: img.caption,
    });
  });
  (article.snippets || []).forEach((snip, idx) => {
    blocks.push({
      id: snip.id || `wb_code_${idx}_${Date.now()}`,
      type: 'code',
      title: snip.title,
      language: snip.language,
      content: snip.code,
      collapsible: snip.collapsible,
      defaultCollapsed: snip.defaultCollapsed,
    });
  });
  if (blocks.length === 0) {
    blocks.push({
      id: `wb_txt_default_${Date.now()}`,
      type: 'text',
      content: '',
    });
  }
  return blocks;
}

export const WikiView: React.FC<WikiViewProps> = ({
  username,
  accentColor = '#B87333',
  mobileBarPosition = 'top',
  onActiveArticleChange,
  onNavigateToNote,
  notes = [],
  projects = [],
  onNavigateToProject,
  initialSelectedSlug = null,
}) => {
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSelectedSlug || null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Unified Pixel-Launcher 1:1 finger-tracked swipe for mobile Wiki Vault drawer
  const wikiDrawer = useSwipeDrawer({
    direction: 'left',
    width: 288,
    edgeThreshold: 140,
    globalWindow: true,
    enabled: true,
  });

  // Draft state when editing or creating
  const [draft, setDraft] = useState<WikiArticle | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<WikiBlock[]>([]);
  const [originalSlug, setOriginalSlug] = useState<string | undefined>(undefined);
  const [originalVisibility, setOriginalVisibility] = useState<WikiVisibility | undefined>(undefined);
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<WikiImage | null>(null);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);

  // Link picker popover state inside text block editor
  const [linkPickerBlockId, setLinkPickerBlockId] = useState<string | null>(null);
  const [linkPickerSearch, setLinkPickerSearch] = useState('');

  // Collapsible blocks open/closed map in Reader mode
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  // "+ Baustein" Chooser Modal (insert at specific index or append)
  const [addBlockModalIndex, setAddBlockModalIndex] = useState<number | null>(null);

  // Hidden file inputs for media block upload & mobile camera
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const mediaCameraInputRef = useRef<HTMLInputElement>(null);
  const activeUploadTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialSelectedSlug) {
      setSelectedSlug(initialSelectedSlug);
      setMode('read');
      setDraft(null);
    }
  }, [initialSelectedSlug]);

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
    loadArticles(initialSelectedSlug || undefined);
  }, [username]);

  const activeArticle = useMemo(
    () => articles.find((a) => a.slug === selectedSlug) || null,
    [articles, selectedSlug]
  );

  // Reset collapsible states whenever switching article
  useEffect(() => {
    if (!activeArticle) return;
    const blocks = ensureArticleBlocks(activeArticle);
    const initial: Record<string, boolean> = {};
    blocks.forEach((b) => {
      if (b.collapsible) {
        initial[b.id] = b.defaultCollapsed !== false ? Boolean(b.defaultCollapsed) : false;
      }
    });
    setCollapsedMap(initial);
  }, [activeArticle?.slug, activeArticle?.updatedAt]);

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
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        (a.blocks || []).some(
          (b) =>
            (b.title || '').toLowerCase().includes(q) ||
            (b.content || '').toLowerCase().includes(q) ||
            (b.caption || '').toLowerCase().includes(q)
        );
      const matchesCat = selectedCategory === 'all' || a.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [articles, searchQuery, selectedCategory]);

  const handleCopyCode = async (id: string, code: string) => {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        copied = true;
      }
    } catch {}

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }

    if (copied) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    }
  };

  const handleWikilinkClick = (rawTarget: string) => {
    const cleanTarget = rawTarget.replace(/\.md$/i, '').trim();
    if (!cleanTarget) return;
    const matchedWiki = articles.find(
      (a) =>
        a.title.toLowerCase() === cleanTarget.toLowerCase() ||
        a.slug.toLowerCase() === cleanTarget.toLowerCase()
    );
    if (matchedWiki) {
      setSelectedSlug(matchedWiki.slug);
      setMode('read');
      setDraft(null);
      return;
    }
    if (onNavigateToNote) {
      onNavigateToNote(cleanTarget);
    }
  };

  const handleStartNewArticle = () => {
    const starterBlocks: WikiBlock[] = [
      {
        id: `wb_txt_${Date.now()}`,
        type: 'text',
        content: '1. Schritt eins beschreiben...\n2. Verknüpfe verwandte Seiten einfach mit [[Wikilink]].',
      },
      {
        id: `wb_code_${Date.now() + 1}`,
        type: 'code',
        title: 'Beispiel-Befehl',
        language: 'bash',
        content: '# Hier Code oder Befehl für Copy & Paste ablegen',
        collapsible: false,
        defaultCollapsed: false,
      },
    ];
    const newArt: WikiArticle = {
      slug: '',
      title: '',
      category: selectedCategory !== 'all' ? selectedCategory : 'Anleitungen',
      visibility: 'public',
      author: username,
      tags: ['anleitung'],
      updatedAt: new Date().toISOString(),
      body: starterBlocks[0].content || '',
      images: [],
      snippets: [],
      blocks: starterBlocks,
    };
    setDraft(newArt);
    setDraftBlocks(starterBlocks);
    setOriginalSlug(undefined);
    setOriginalVisibility(undefined);
    setTagsInput(newArt.tags.join(', '));
    setMediaError(null);
    setMode('edit');
    wikiDrawer.close();
  };

  const handleStartEdit = (article: WikiArticle) => {
    const cloned: WikiArticle = JSON.parse(JSON.stringify(article));
    if (!cloned.visibility) cloned.visibility = 'public';
    setDraft(cloned);
    setDraftBlocks(ensureArticleBlocks(cloned));
    setOriginalSlug(article.slug);
    setOriginalVisibility(article.visibility || 'public');
    setTagsInput(article.tags.join(', '));
    setMediaError(null);
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

      const cleanBlocks = draftBlocks.map((b) => ({
        ...b,
        title: b.title?.trim() || undefined,
      }));

      const aggregatedBody = cleanBlocks
        .filter((b) => b.type === 'text')
        .map((b) => (b.title ? `## ${b.title}\n\n${b.content || ''}` : b.content || ''))
        .filter(Boolean)
        .join('\n\n');

      const aggregatedImages: WikiImage[] = cleanBlocks
        .filter((b) => b.type === 'media' && b.mediaUrl)
        .map((b) => ({
          id: b.id,
          url: b.mediaUrl || '',
          alt: b.alt || b.title || 'Medien',
          caption: b.caption,
        }));

      const aggregatedSnippets: WikiCodeSnippet[] = cleanBlocks
        .filter((b) => b.type === 'code')
        .map((b) => ({
          id: b.id,
          title: b.title || 'Code-Block',
          language: b.language || 'bash',
          code: b.content || '',
          collapsible: b.collapsible,
          defaultCollapsed: b.defaultCollapsed,
        }));

      const vis: WikiVisibility = draft.visibility || 'public';
      const saved = await api.saveWikiArticle(
        username,
        {
          ...draft,
          title: draft.title.trim(),
          category: draft.category.trim() || 'Allgemein',
          visibility: vis,
          tags: parsedTags,
          blocks: cleanBlocks,
          body: aggregatedBody,
          images: aggregatedImages,
          snippets: aggregatedSnippets,
        },
        originalSlug,
        originalVisibility
      );

      await loadArticles(saved.slug);
      setMode('read');
      setSaveFeedback(
        vis === 'public'
          ? 'Im öffentlichen Wiki (Wiki/Public/) gespeichert'
          : `Im privaten Wiki (${username}) gespeichert`
      );
      setTimeout(() => setSaveFeedback(null), 2800);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArticle = async (slug: string, vis?: WikiVisibility) => {
    await api.deleteWikiArticle(username, slug, vis);
    setConfirmDeleteSlug(null);
    if (mode === 'edit' && originalSlug === slug) {
      setMode('read');
      setDraft(null);
    }
    await loadArticles();
  };

  const handleUploadMediaFileForBlock = async (file: File, targetBlockId: string | null) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setMediaError('Bitte eine Bild- oder Videodatei auswählen.');
      return;
    }
    if (file.size > 35 * 1024 * 1024) {
      setMediaError('Datei ist größer als 35 MB – für große Videos bitte direkt verlinken.');
      return;
    }
    setMediaError(null);
    const loadingKey = targetBlockId || 'new';
    setUploadingBlockId(loadingKey);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.uploadWikiMedia(username, file.name, dataUrl, draft?.visibility || 'public');
      const cleanName = file.name.replace(/\.[^.]+$/, '');
      if (targetBlockId) {
        setDraftBlocks((prev) =>
          prev.map((b) =>
            b.id === targetBlockId
              ? {
                  ...b,
                  mediaUrl: res.url,
                  mediaKind: res.mediaKind,
                  alt: b.alt || cleanName,
                }
              : b
          )
        );
      } else {
        const newBlock: WikiBlock = {
          id: `wb_media_${Date.now()}`,
          type: 'media',
          mediaUrl: res.url,
          mediaKind: res.mediaKind,
          alt: cleanName,
          caption: '',
        };
        setDraftBlocks((prev) => [...prev, newBlock]);
      }
    } catch (e: any) {
      setMediaError(e?.message || 'Upload fehlgeschlagen');
    } finally {
      setUploadingBlockId(null);
    }
  };

  const handleInsertBlock = (type: WikiBlockType, atIndex?: number | null) => {
    const uid = `wb_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newBlock: WikiBlock =
      type === 'text'
        ? { id: uid, type: 'text', content: '' }
        : type === 'media'
        ? { id: uid, type: 'media', mediaKind: 'image', mediaUrl: '', alt: '', caption: '' }
        : {
            id: uid,
            type: 'code',
            title: 'Code-Block',
            language: 'bash',
            content: '',
            collapsible: true,
            defaultCollapsed: false,
          };

    setDraftBlocks((prev) => {
      const idx =
        typeof atIndex === 'number' && atIndex >= 0 && atIndex <= prev.length
          ? atIndex
          : prev.length;
      const next = [...prev];
      next.splice(idx, 0, newBlock);
      return next;
    });
    setAddBlockModalIndex(null);
  };

  const moveBlock = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draftBlocks.length) return;
    setDraftBlocks((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeBlock = (id: string) => {
    setDraftBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBlock = (id: string, patch: Partial<WikiBlock>) => {
    setDraftBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
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

  // Render inline Markdown tokens: [[Wikilinks]], `code`, **bold**, *italic*, [label](url)
  const renderInlineTokens = (line: string): React.ReactNode[] => {
    const tokenRegex = /(\[\[[^\]|]+(?:\|[^\]]+)?\]\]|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    const parts = line.split(tokenRegex);
    return parts.map((part, idx) => {
      if (!part) return null;
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const inner = part.slice(2, -2);
        const [target, alias] = inner.split('|');
        const label = (alias || target || '').trim();
        const existsInWiki = articles.some(
          (a) =>
            a.title.toLowerCase() === (target || '').trim().toLowerCase() ||
            a.slug.toLowerCase() === (target || '').trim().toLowerCase()
        );
        return (
          <button
            key={idx}
            type="button"
            onClick={() => handleWikilinkClick(target)}
            style={{ color: accentColor }}
            className="inline font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80 cursor-pointer"
            title={existsInWiki ? `Wiki-Artikel "${target}" öffnen` : `Notiz "${target}" öffnen`}
          >
            {label}
          </button>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-[#F0EEE8] dark:bg-[#26282E] font-mono text-[12px] text-neutral-900 dark:text-neutral-100"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={idx} className="font-bold text-neutral-900 dark:text-neutral-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={idx} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }
      const linkM = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkM) {
        return (
          <a
            key={idx}
            href={linkM[2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: accentColor }}
            className="underline hover:opacity-80"
          >
            {linkM[1]}
          </a>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  // Render clean Markdown prose (with headings, lists, inline tokens, fenced code fallback, and Wikilinks)
  const renderMarkdownBody = (text: string) => {
    const chunks = (text || '').split(/(```[\s\S]*?```)/g);
    return chunks.map((chunk, bIdx) => {
      if (chunk.startsWith('```') && chunk.endsWith('```')) {
        const lines = chunk.slice(3, -3).split('\n');
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
        <div key={bIdx} className="space-y-1.5">
          {chunk.split('\n').map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lIdx} className="h-1.5" />;
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={lIdx} className="text-sm font-bold text-neutral-900 dark:text-neutral-100 pt-2">
                  {renderInlineTokens(trimmed.slice(4))}
                </h4>
              );
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={lIdx} className="text-base font-bold text-neutral-900 dark:text-neutral-100 pt-3">
                  {renderInlineTokens(trimmed.slice(3))}
                </h3>
              );
            }
            if (trimmed.startsWith('# ')) {
              return (
                <h2 key={lIdx} className="text-lg font-bold text-neutral-900 dark:text-neutral-100 pt-2">
                  {renderInlineTokens(trimmed.slice(2))}
                </h2>
              );
            }
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote
                  key={lIdx}
                  style={{ borderLeftColor: accentColor }}
                  className="border-l-3 pl-3 py-1 bg-[#F4F3EF]/70 dark:bg-[#1E2024] rounded-r-lg text-sm text-neutral-700 dark:text-neutral-300"
                >
                  {renderInlineTokens(trimmed.slice(2))}
                </blockquote>
              );
            }
            const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
            if (imgMatch) {
              return (
                <div
                  key={lIdx}
                  className="my-3 rounded-xl overflow-hidden border border-[#E5E3DC] dark:border-[#2F3136] bg-neutral-100 dark:bg-neutral-900"
                >
                  <img
                    src={imgMatch[2]}
                    alt={imgMatch[1]}
                    referrerPolicy="no-referrer"
                    className="max-h-96 w-full object-contain"
                  />
                </div>
              );
            }
            if (/^\d+\.\s/.test(trimmed) || /^[-*]\s/.test(trimmed)) {
              return (
                <p key={lIdx} className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 pl-2 select-text">
                  {renderInlineTokens(trimmed)}
                </p>
              );
            }
            return (
              <p key={lIdx} className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 select-text">
                {renderInlineTokens(line)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  const renderMediaContent = (blk: WikiBlock, isEditorPreview = false) => {
    const url = blk.mediaUrl || '';
    if (!url) {
      return (
        <div className="p-4 text-center text-xs text-neutral-400">
          Noch kein Foto oder Video ausgewählt oder verlinkt.
        </div>
      );
    }
    const kind = blk.mediaKind || inferMediaKind(url);
    const ytEmbed = kind === 'video' ? extractYouTubeEmbedUrl(url) : null;

    if (kind === 'video') {
      if (ytEmbed) {
        return (
          <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
            <iframe
              src={ytEmbed}
              title={blk.alt || blk.title || 'YouTube Video'}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
      const isDirectVideo =
        url.startsWith('/api/wiki/assets/') ||
        url.startsWith('data:video/') ||
        /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(url);
      if (isDirectVideo) {
        return (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className={`w-full ${isEditorPreview ? 'max-h-56' : 'max-h-[420px]'} bg-black rounded-lg`}
          />
        );
      }
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#363940] hover:border-[var(--wiki-accent)] transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              style={{ backgroundColor: `${accentColor}1F`, color: accentColor }}
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
              <Video className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 block truncate">
                {blk.alt || blk.title || 'Video-Link öffnen'}
              </span>
              <span className="text-[11px] text-neutral-500 block truncate">{url}</span>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-neutral-400 shrink-0" />
        </a>
      );
    }

    return (
      <div
        onClick={() => {
          if (!isEditorPreview) {
            setZoomedImage({
              id: blk.id,
              url,
              alt: blk.alt || blk.title || 'Foto',
              caption: blk.caption,
            });
          }
        }}
        className={`relative bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center overflow-hidden ${
          isEditorPreview ? 'h-48 rounded-lg' : 'max-h-[460px] rounded-lg cursor-pointer group'
        }`}
      >
        <img
          src={url}
          alt={blk.alt || blk.title || 'Wiki Foto'}
          referrerPolicy="no-referrer"
          className="max-h-full w-full object-contain"
        />
        {!isEditorPreview && (
          <span className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-black/60 text-white opacity-80 group-hover:opacity-100">
            <Maximize2 className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    );
  };

  const activeBlocks = useMemo(
    () => (activeArticle ? ensureArticleBlocks(activeArticle) : []),
    [activeArticle]
  );

  return (
    <div
      className="flex-1 h-full flex flex-col bg-[#FBFBFA] dark:bg-[#161719] text-neutral-900 dark:text-neutral-100 overflow-hidden relative"
      style={{ '--wiki-accent': accentColor } as React.CSSProperties}
    >
      {/* Hidden File Inputs for Media Block Upload & Camera */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadMediaFileForBlock(f, activeUploadTargetRef.current);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={mediaCameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadMediaFileForBlock(f, activeUploadTargetRef.current);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Sub-header Bar */}
      <div className="h-12 border-b border-[#E5E3DC] dark:border-[#2B2D31] bg-[#F4F3EF]/90 dark:bg-[#1C1E22]/90 px-3 md:px-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={wikiDrawer.toggle}
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
              Ochre Wiki · Baukasten
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
                  setDraftBlocks([]);
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
        {/* Mobile Left-Edge Pull Tab (matching Notes & Projects) */}
        <button
          type="button"
          onClick={wikiDrawer.toggle}
          style={{
            backgroundColor: accentColor,
            ...(wikiDrawer.dragOffset !== null
              ? { left: `${Math.max(0, 288 + wikiDrawer.dragOffset)}px`, transition: 'none' }
              : {}),
          }}
          className={`lg:hidden fixed top-1/2 -translate-y-1/2 z-40 h-14 flex items-center justify-center text-white shadow-lg cursor-pointer active:scale-95 ${
            wikiDrawer.isDragging ? 'transition-none' : 'transition-all duration-200'
          } ${
            wikiDrawer.dragOffset !== null
              ? 'w-6 rounded-r-xl'
              : wikiDrawer.isOpen
              ? 'left-72 w-7 rounded-r-xl'
              : 'left-0 w-5 rounded-r-xl opacity-90 hover:opacity-100 hover:w-6.5'
          }`}
          title={wikiDrawer.isOpen ? 'Wiki Light Vault schließen' : 'Wiki Light Vault öffnen'}
          aria-label="Wiki Light Vault umschalten"
        >
          {wikiDrawer.isOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <div className="flex flex-col items-center gap-1 py-1">
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="w-1 h-3 rounded-full bg-white/70"></span>
            </div>
          )}
        </button>

        {(() => {
          const wikiIndexContent = (
            <div className="h-full w-72 bg-[#F4F3EF] dark:bg-[#1D1F23] border-r border-[#E5E3DC] dark:border-[#2F3136] flex flex-col">
              <div className="p-3 border-b border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
                <div className="flex items-center justify-between lg:hidden">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    Wiki-Einträge ({articles.length})
                  </span>
                  <button
                    type="button"
                    onClick={wikiDrawer.close}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

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

              <div className="flex-1 overflow-y-auto overscroll-y-contain p-2 space-y-1">
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
                    const blockCount = ensureArticleBlocks(art).length;
                    const isPrivate = art.visibility === 'private';
                    return (
                      <button
                        key={art.slug}
                        type="button"
                        onClick={() => {
                          setSelectedSlug(art.slug);
                          setMode('read');
                          setDraft(null);
                          wikiDrawer.close();
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition-colors cursor-pointer flex items-start justify-between gap-2 border ${
                          isActive
                            ? 'bg-white dark:bg-[#25272C] border-[#E5E3DC] dark:border-[#383A40] font-semibold'
                            : 'border-transparent hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {isPrivate ? (
                              <span title="Privat" className="inline-flex shrink-0">
                                <Lock className="w-3 h-3 text-neutral-400" />
                              </span>
                            ) : (
                              <span title="Öffentlich (Shared)" className="inline-flex shrink-0">
                                <Globe className="w-3 h-3" style={{ color: accentColor }} />
                              </span>
                            )}
                            <span
                              className="text-xs block truncate"
                              style={isActive ? { color: accentColor } : undefined}
                            >
                              {art.title}
                            </span>
                          </div>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block truncate mt-0.5">
                            {art.category} · {blockCount} Bausteine
                          </span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                      </button>
                    );
                  })
                )}
              </div>

              <div className="p-2.5 px-3 border-t border-[#E5E3DC] dark:border-[#2F3136] text-[11px] text-neutral-500 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Wiki/Public &amp; Privat</span>
                </span>
                <span className="tabular-nums shrink-0">{articles.length} .md</span>
              </div>
            </div>
          );

          return (
            <>
              {/* Desktop Static Left Sidebar */}
              <aside className="hidden lg:flex w-72 shrink-0 flex-col">
                {wikiIndexContent}
              </aside>

              {/* Mobile Light Vault Swipe Drawer */}
              {(wikiDrawer.isOpen || wikiDrawer.dragOffset !== null) && (
                <div
                  onClick={wikiDrawer.close}
                  style={
                    wikiDrawer.dragOffset !== null
                      ? {
                          opacity: Math.max(0.08, Math.min(1, (wikiDrawer.dragOffset + 288) / 288)),
                          transition: 'none',
                        }
                      : undefined
                  }
                  className="lg:hidden fixed inset-0 z-50 bg-black/35 backdrop-blur-2xs"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      transform:
                        wikiDrawer.dragOffset !== null
                          ? `translateX(${wikiDrawer.dragOffset}px)`
                          : wikiDrawer.isOpen
                          ? 'translateX(0)'
                          : 'translateX(-100%)',
                      transition: wikiDrawer.isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className={`w-72 ${
                      mobileBarPosition === 'bottom' ? 'h-[calc(100dvh-3.75rem)]' : 'h-full'
                    } shadow-2xl`}
                  >
                    {wikiIndexContent}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Main Content Canvas: Reader or Modular Block Editor */}
        <main className="flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-8 pb-24 lg:pb-10">
          <div className="max-w-3xl mx-auto">
            {mode === 'edit' && draft ? (
              /* ======================================================= */
              /* MODULAR BLOCK EDITOR MODE: Free-Order Chain of Blocks */
              /* ======================================================= */
              <div className="space-y-5 pb-16">
                <div className="p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {originalSlug ? 'Wiki-Eintrag bearbeiten' : 'Neuer Wiki-Eintrag'}
                    </h3>
                    <span className="text-[11px] text-neutral-500">
                      Open-Standard Markdown (.md)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Titel der Seite
                      </label>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        placeholder="z. B. Nginx Reverse Proxy Setup"
                        className="w-full text-sm px-3 py-2 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
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
                        className="w-full text-sm px-3 py-2 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Sichtbarkeit &amp; Ablageort
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, visibility: 'public' })}
                        style={
                          (draft.visibility || 'public') === 'public'
                            ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                            : undefined
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                          (draft.visibility || 'public') === 'public'
                            ? 'border-2'
                            : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#161719]'
                        }`}
                      >
                        <Globe className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                        <div className="min-w-0">
                          <span className="text-xs font-bold block text-neutral-900 dark:text-neutral-100">
                            Öffentlich
                          </span>
                          <span className="text-[10px] text-neutral-500 block truncate">
                            Wiki/Public/ · Alle Suite-Nutzer
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, visibility: 'private' })}
                        style={
                          draft.visibility === 'private'
                            ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                            : undefined
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                          draft.visibility === 'private'
                            ? 'border-2'
                            : 'border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#161719]'
                        }`}
                      >
                        <Lock className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                        <div className="min-w-0">
                          <span className="text-xs font-bold block text-neutral-900 dark:text-neutral-100">
                            Privat
                          </span>
                          <span className="text-[10px] text-neutral-500 block truncate">
                            User/{username}/Wiki · Nur für dich
                          </span>
                        </div>
                      </button>
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
                      className="w-full text-xs px-3 py-2 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                    />
                  </div>
                </div>

                {mediaError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
                    <span>{mediaError}</span>
                    <button type="button" onClick={() => setMediaError(null)} className="cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Chain of Modular Reorderable Blocks */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" style={{ color: accentColor }} />
                      <span>Bausteine ({draftBlocks.length}) · frei aneinanderreihbar</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddBlockModalIndex(draftBlocks.length)}
                      style={{ backgroundColor: accentColor }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-semibold cursor-pointer active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Baustein</span>
                    </button>
                  </div>

                  {draftBlocks.map((blk, bIdx) => (
                    <div key={blk.id} className="space-y-2">
                      <div className="p-3.5 sm:p-4 rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] shadow-2xs space-y-3">
                        {/* Block Header Controls */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5E3DC]/70 dark:border-[#2B2D31]">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0"
                            >
                              {blk.type === 'text' && <FileText className="w-3 h-3" />}
                              {blk.type === 'media' && (
                                blk.mediaKind === 'video' ? <Video className="w-3 h-3" /> : <ImagePlus className="w-3 h-3" />
                              )}
                              {blk.type === 'code' && <Code2 className="w-3 h-3" />}
                              <span>
                                {blk.type === 'text'
                                  ? 'Text'
                                  : blk.type === 'media'
                                  ? blk.mediaKind === 'video'
                                    ? 'Video'
                                    : 'Foto / Video'
                                  : 'Code'}
                              </span>
                            </span>

                            <input
                              type="text"
                              value={blk.title || ''}
                              onChange={(e) => updateBlock(blk.id, { title: e.target.value })}
                              placeholder={
                                blk.type === 'text'
                                  ? 'Optionaler Abschnitt-Titel...'
                                  : blk.type === 'media'
                                  ? 'Optionaler Medien-Titel...'
                                  : 'Titel des Code-Blocks...'
                              }
                              className="flex-1 min-w-[120px] text-xs font-semibold px-2 py-1 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                            />
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={bIdx === 0}
                              onClick={() => moveBlock(bIdx, -1)}
                              className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Nach oben"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={bIdx === draftBlocks.length - 1}
                              onClick={() => moveBlock(bIdx, 1)}
                              className="p-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Nach unten"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBlock(blk.id)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
                              title="Baustein entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* BLOCK BODY BY TYPE */}
                        {blk.type === 'text' && (
                          <div className="space-y-1.5 relative">
                            <textarea
                              rows={6}
                              value={blk.content || ''}
                              onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                              onPaste={(e) => {
                                const items = e.clipboardData?.items;
                                if (!items) return;
                                for (let i = 0; i < items.length; i++) {
                                  if (items[i].type.startsWith('image/')) {
                                    const file = items[i].getAsFile();
                                    if (file) handleUploadMediaFileForBlock(file, null);
                                  }
                                }
                              }}
                              placeholder="Klassisches Markdown (# Überschrift, Listen, **Fett**) und [[Wikilinks]]..."
                              className="w-full text-sm p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden leading-relaxed select-text"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-neutral-400">
                                Unterstützt Markdown &amp; Wikilinks{' '}
                                <span className="font-mono text-neutral-600 dark:text-neutral-300">[[Seite oder Notiz]]</span>.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setLinkPickerSearch('');
                                  setLinkPickerBlockId((prev) => (prev === blk.id ? null : blk.id));
                                }}
                                style={{ color: accentColor }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] font-semibold cursor-pointer"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>+ Notiz / Wiki verknüpfen</span>
                              </button>
                            </div>

                            {linkPickerBlockId === blk.id && (
                              <div className="p-2.5 rounded-xl bg-[#FBFBFA] dark:bg-[#18191D] border border-[#E5E3DC] dark:border-[#2F3136] shadow-lg space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                  <input
                                    type="text"
                                    autoFocus
                                    value={linkPickerSearch}
                                    onChange={(e) => setLinkPickerSearch(e.target.value)}
                                    placeholder="Notiz oder Wiki-Artikel suchen..."
                                    className="flex-1 text-xs bg-transparent outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setLinkPickerBlockId(null)}
                                    className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {articles
                                    .filter((a) => !linkPickerSearch.trim() || a.title.toLowerCase().includes(linkPickerSearch.toLowerCase()))
                                    .slice(0, 6)
                                    .map((a) => (
                                      <button
                                        key={`w_${a.slug}`}
                                        type="button"
                                        onClick={() => {
                                          const sep = blk.content && !blk.content.endsWith(' ') && !blk.content.endsWith('\n') ? ' ' : '';
                                          updateBlock(blk.id, { content: `${blk.content || ''}${sep}[[${a.title}]]` });
                                          setLinkPickerBlockId(null);
                                        }}
                                        className="w-full text-left px-2 py-1 rounded-lg hover:bg-amber-500/10 text-xs flex items-center justify-between gap-2 cursor-pointer"
                                      >
                                        <span className="truncate font-medium">[[{a.title}]]</span>
                                        <span className="text-[10px] text-neutral-400 shrink-0">Wiki</span>
                                      </button>
                                    ))}
                                  {notes
                                    .filter((n) => !linkPickerSearch.trim() || n.title.toLowerCase().includes(linkPickerSearch.toLowerCase()))
                                    .slice(0, 6)
                                    .map((n) => (
                                      <button
                                        key={`n_${n.path}`}
                                        type="button"
                                        onClick={() => {
                                          const sep = blk.content && !blk.content.endsWith(' ') && !blk.content.endsWith('\n') ? ' ' : '';
                                          updateBlock(blk.id, { content: `${blk.content || ''}${sep}[[${n.title}]]` });
                                          setLinkPickerBlockId(null);
                                        }}
                                        className="w-full text-left px-2 py-1 rounded-lg hover:bg-amber-500/10 text-xs flex items-center justify-between gap-2 cursor-pointer"
                                      >
                                        <span className="truncate font-medium">[[{n.title}]]</span>
                                        <span className="text-[10px] text-neutral-400 shrink-0">Notiz</span>
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {blk.type === 'media' && (
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'copy';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const f = e.dataTransfer.files?.[0];
                              if (f) handleUploadMediaFileForBlock(f, blk.id);
                            }}
                            className="space-y-3"
                          >
                            {/* Upload / Camera / URL Controls */}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={uploadingBlockId === blk.id}
                                onClick={() => {
                                  activeUploadTargetRef.current = blk.id;
                                  mediaFileInputRef.current?.click();
                                }}
                                style={{ backgroundColor: accentColor }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold cursor-pointer active:scale-95 disabled:opacity-50"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>{uploadingBlockId === blk.id ? 'Lädt hoch...' : 'Datei hochladen'}</span>
                              </button>

                              <button
                                type="button"
                                disabled={uploadingBlockId === blk.id}
                                onClick={() => {
                                  activeUploadTargetRef.current = blk.id;
                                  mediaCameraInputRef.current?.click();
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-xs font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer active:scale-95"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>Kamera</span>
                              </button>

                              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] text-[11px] ml-auto">
                                <button
                                  type="button"
                                  onClick={() => updateBlock(blk.id, { mediaKind: 'image' })}
                                  className={`px-2 py-1 rounded-md cursor-pointer ${
                                    (blk.mediaKind || 'image') === 'image'
                                      ? 'bg-white dark:bg-[#1E2024] font-bold shadow-2xs'
                                      : 'text-neutral-500'
                                  }`}
                                >
                                  Foto
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateBlock(blk.id, { mediaKind: 'video' })}
                                  className={`px-2 py-1 rounded-md cursor-pointer ${
                                    blk.mediaKind === 'video'
                                      ? 'bg-white dark:bg-[#1E2024] font-bold shadow-2xs'
                                      : 'text-neutral-500'
                                  }`}
                                >
                                  Video
                                </button>
                              </div>
                            </div>

                            {/* Direct Link Input (Photo URL, Video URL, YouTube) */}
                            <div className="relative">
                              <Link2 className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={blk.mediaUrl || ''}
                                onChange={(e) => {
                                  const nextUrl = e.target.value;
                                  updateBlock(blk.id, {
                                    mediaUrl: nextUrl,
                                    mediaKind: nextUrl.trim() ? inferMediaKind(nextUrl) : blk.mediaKind,
                                  });
                                }}
                                placeholder="Oder URL verlinken (Foto-URL, MP4 oder YouTube-Link)..."
                                className="w-full text-xs pl-8 pr-3 py-2 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                              />
                            </div>

                            {/* Live Preview */}
                            <div className="rounded-xl border border-dashed border-[#E5E3DC] dark:border-[#363940] bg-[#FAF9F5] dark:bg-[#18191B] p-2">
                              {renderMediaContent(blk, true)}
                            </div>

                            {/* Caption + Optional Collapsible */}
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={blk.caption || ''}
                                onChange={(e) => updateBlock(blk.id, { caption: e.target.value })}
                                placeholder="Bildunterschrift / Notiz zum Medium..."
                                className="flex-1 min-w-[160px] text-xs px-2.5 py-1.5 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden"
                              />
                              <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={Boolean(blk.collapsible)}
                                  onChange={(e) =>
                                    updateBlock(blk.id, {
                                      collapsible: e.target.checked,
                                      defaultCollapsed: e.target.checked ? Boolean(blk.defaultCollapsed) : false,
                                    })
                                  }
                                  className="rounded accent-[var(--wiki-accent)]"
                                />
                                <span>Einklappbar</span>
                              </label>
                            </div>
                          </div>
                        )}

                        {blk.type === 'code' && (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <select
                                value={blk.language || 'bash'}
                                onChange={(e) => updateBlock(blk.id, { language: e.target.value })}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-[#FAF9F5] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] outline-hidden font-mono"
                              >
                                {CODE_LANGUAGES.map((l) => (
                                  <option key={l} value={l}>
                                    {l}
                                  </option>
                                ))}
                              </select>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(blk.collapsible)}
                                    onChange={(e) =>
                                      updateBlock(blk.id, {
                                        collapsible: e.target.checked,
                                        defaultCollapsed: e.target.checked ? Boolean(blk.defaultCollapsed) : false,
                                      })
                                    }
                                    className="rounded accent-[var(--wiki-accent)]"
                                  />
                                  <span>Einklappbar</span>
                                </label>

                                {blk.collapsible && (
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(blk.defaultCollapsed)}
                                      onChange={(e) => updateBlock(blk.id, { defaultCollapsed: e.target.checked })}
                                      className="rounded accent-[var(--wiki-accent)]"
                                    />
                                    <span>Standard: zugeklappt</span>
                                  </label>
                                )}
                              </div>
                            </div>

                            <textarea
                              rows={6}
                              value={blk.content || ''}
                              onChange={(e) => updateBlock(blk.id, { content: e.target.value })}
                              placeholder="Code, Befehle oder Konfiguration hier einfügen..."
                              className="w-full text-xs font-mono p-3 rounded-xl bg-[#1D1F23] text-neutral-100 border border-[#2F3136] outline-hidden leading-relaxed select-text"
                            />
                          </div>
                        )}
                      </div>

                      {/* Subtle Inline Insert Trigger Between Blocks */}
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setAddBlockModalIndex(bIdx + 1)}
                          className="text-[11px] px-3 py-1 rounded-full border border-dashed border-[#D8D5CC] dark:border-[#34373D] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-[var(--wiki-accent)] bg-white/60 dark:bg-[#1E2024]/60 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Baustein einfügen</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {draftBlocks.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setAddBlockModalIndex(0)}
                      className="w-full p-8 rounded-2xl border-2 border-dashed border-[#E5E3DC] dark:border-[#2F3136] text-center text-xs font-semibold text-neutral-500 hover:border-[var(--wiki-accent)] cursor-pointer"
                    >
                      + Ersten Baustein hinzufügen (Text, Foto/Video oder Code)
                    </button>
                  )}
                </div>
              </div>
            ) : activeArticle ? (
              /* ======================================================= */
              /* READER MODE: Seamless Ordered Modular Wiki Blocks */
              /* ======================================================= */
              <article className="space-y-5 pb-16">
                {/* Article Header */}
                <div className="pb-4 border-b border-[#E5E3DC] dark:border-[#2B2D31] space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-semibold" style={{ color: accentColor }}>
                      {activeArticle.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F4F3EF] dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136]"
                    >
                      {activeArticle.visibility === 'private' ? (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Privat</span>
                        </>
                      ) : (
                        <>
                          <Globe className="w-3 h-3" style={{ color: accentColor }} />
                          <span>Öffentlich</span>
                        </>
                      )}
                    </span>
                    {activeArticle.author && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Von {activeArticle.author}</span>
                      </>
                    )}
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

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
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
                          onClick={() => handleDeleteArticle(activeArticle.slug, activeArticle.visibility)}
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

                  {/* Linked Projects Pill Bar */}
                  {projects.filter((p) => p.linkedWikiSlugs.includes(activeArticle.slug)).length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 mr-1">
                        <Briefcase className="w-3.5 h-3.5" style={{ color: accentColor }} />
                        <span>Verknüpfte Projekte:</span>
                      </span>
                      {projects
                        .filter((p) => p.linkedWikiSlugs.includes(activeArticle.slug))
                        .map((proj) => (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() => onNavigateToProject?.(proj.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] font-semibold text-[var(--wiki-accent)] cursor-pointer transition-colors"
                          >
                            <span>{proj.title}</span>
                            <ExternalLink className="w-3 h-3 opacity-75" />
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Ordered Modular Blocks */}
                <div className="space-y-5">
                  {activeBlocks.map((blk) => {
                    const isCollapsed = blk.collapsible ? Boolean(collapsedMap[blk.id]) : false;

                    if (blk.type === 'text') {
                      return (
                        <section key={blk.id} className="space-y-2">
                          {blk.title && (
                            <h2 className="text-base md:text-lg font-bold text-neutral-900 dark:text-neutral-100">
                              {blk.title}
                            </h2>
                          )}
                          {renderMarkdownBody(blk.content || '')}
                        </section>
                      );
                    }

                    if (blk.type === 'media') {
                      const label = blk.title || blk.alt || (blk.mediaKind === 'video' ? 'Video' : 'Abbildung');
                      if (blk.collapsible) {
                        return (
                          <section
                            key={blk.id}
                            className="rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedMap((prev) => ({ ...prev, [blk.id]: !isCollapsed }))
                              }
                              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#FAF9F5] dark:hover:bg-[#24262B] cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {blk.mediaKind === 'video' ? (
                                  <Video className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                                ) : (
                                  <ImagePlus className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                                )}
                                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                                  {label}
                                </span>
                              </div>
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                              )}
                            </button>
                            {!isCollapsed && (
                              <div className="p-3 pt-0 space-y-2 border-t border-[#E5E3DC]/60 dark:border-[#2B2D31]">
                                <div className="pt-2">{renderMediaContent(blk)}</div>
                                {blk.caption && (
                                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                                    {blk.caption}
                                  </p>
                                )}
                              </div>
                            )}
                          </section>
                        );
                      }

                      return (
                        <figure
                          key={blk.id}
                          className="rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-white dark:bg-[#1E2024] overflow-hidden p-2.5 space-y-2"
                        >
                          {blk.title && (
                            <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 px-1">
                              {blk.title}
                            </div>
                          )}
                          {renderMediaContent(blk)}
                          {(blk.caption || (blk.alt && !blk.title)) && (
                            <figcaption className="px-1 text-xs text-neutral-600 dark:text-neutral-300">
                              {blk.caption || blk.alt}
                            </figcaption>
                          )}
                        </figure>
                      );
                    }

                    // Code block (with Copy + optional interactive Collapse/Expand)
                    const codeText = blk.content || '';
                    return (
                      <section
                        key={blk.id}
                        className="rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#1D1F23] text-neutral-100 overflow-hidden"
                      >
                        <div className="px-3.5 py-2 bg-[#26282E] border-b border-neutral-700/60 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (blk.collapsible) {
                                setCollapsedMap((prev) => ({ ...prev, [blk.id]: !isCollapsed }));
                              }
                            }}
                            className={`flex items-center gap-2 min-w-0 text-left ${
                              blk.collapsible ? 'cursor-pointer hover:opacity-85' : 'cursor-default'
                            }`}
                          >
                            {blk.collapsible &&
                              (isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                              ))}
                            <span className="text-xs font-semibold text-white truncate">
                              {blk.title || 'Code-Block'}
                            </span>
                            <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                              {blk.language || 'bash'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyCode(blk.id, codeText)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer shrink-0 active:scale-95"
                            style={{
                              backgroundColor: copiedId === blk.id ? '#16A34A' : accentColor,
                            }}
                          >
                            {copiedId === blk.id ? (
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

                        {!isCollapsed && (
                          <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed select-text">
                            <code>{codeText}</code>
                          </pre>
                        )}
                      </section>
                    );
                  })}
                </div>
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
                    Kombiniere Text-Bausteine (Markdown &amp; [[Wikilinks]]), Fotos/Videos und einklappbaren Code flexibel in beliebiger Reihenfolge.
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

      {/* Add Baustein Chooser Modal: Top-anchored on Mobile, Centered on Desktop */}
      {addBlockModalIndex !== null && (
        <div
          onClick={() => setAddBlockModalIndex(null)}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-2xs flex items-start lg:items-center justify-center pt-14 lg:pt-4 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-[#1E2024] rounded-2xl border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E3DC] dark:border-[#2F3136]">
              <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Baustein hinzufügen
              </h4>
              <button
                type="button"
                onClick={() => setAddBlockModalIndex(null)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleInsertBlock('text', addBlockModalIndex)}
                className="w-full p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#23252A] hover:border-[var(--wiki-accent)] flex items-center gap-3 text-left cursor-pointer transition-colors"
              >
                <div
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                >
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-bold block text-neutral-900 dark:text-neutral-100">
                    Text-Baustein
                  </span>
                  <span className="text-[11px] text-neutral-500 block">
                    Klassisches Markdown &amp; [[Wikilinks]]
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleInsertBlock('media', addBlockModalIndex)}
                className="w-full p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#23252A] hover:border-[var(--wiki-accent)] flex items-center gap-3 text-left cursor-pointer transition-colors"
              >
                <div
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                >
                  <ImagePlus className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-bold block text-neutral-900 dark:text-neutral-100">
                    Foto / Video-Baustein
                  </span>
                  <span className="text-[11px] text-neutral-500 block">
                    Hochladen, Kamera oder Link / YouTube
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleInsertBlock('code', addBlockModalIndex)}
                className="w-full p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#23252A] hover:border-[var(--wiki-accent)] flex items-center gap-3 text-left cursor-pointer transition-colors"
              >
                <div
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                >
                  <Code2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-bold block text-neutral-900 dark:text-neutral-100">
                    Code-Baustein
                  </span>
                  <span className="text-[11px] text-neutral-500 block">
                    Copy &amp; Paste mit optionalem Einklappen
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

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
