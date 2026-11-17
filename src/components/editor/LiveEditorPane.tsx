import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  CheckSquare,
  Calendar,
  MessageSquareQuote,
  Link2,
  Code,
  Youtube,
  X,
  Play,
  ExternalLink,
  Edit3,
  ImagePlus,
  Images,
  Camera,
  FolderOpen,
  Trash2,
  Maximize2,
  Plus,
  Upload,
} from 'lucide-react';
import { YouTubeDisplayMode, NoteMediaItem, NoteProfileId } from '../../types';
import { api } from '../../services/api';

export interface NoteMediaContext {
  username: string;
  notePath: string | null;
  noteProfile: NoteProfileId;
  isShared?: boolean;
  sharedFrom?: string;
}

interface LiveEditorPaneProps {
  content: string;
  onChange: (newContent: string) => void;
  isReadOnly?: boolean;
  onSave?: () => void;
  lastSaved?: number;
  onToggleTask?: (lineIndex: number, completed: boolean) => void;
  onWikilinkClick?: (target: string) => void;
  onTagClick?: (tag: string) => void;
  noteTitle?: string;
  onRenameNote?: (newTitle: string) => void;
  showToolbar?: boolean;
  onToggleToolbar?: () => void;
  noteContext?: NoteMediaContext;
  // Mobile note tabs support
  openNoteTabs?: { path: string; title: string }[];
  activeTabPath?: string;
  onSelectTab?: (path: string) => void;
  onAddTab?: () => void;
  onCloseTab?: (path: string) => void;
}

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)\)/;

function getYouTubeId(text: string): string | null {
  const match = text.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

function getImageEmbed(text: string): { alt: string; url: string } | null {
  const mdMatch = text.match(MARKDOWN_IMAGE_REGEX);
  if (mdMatch) {
    return {
      alt: mdMatch[1] || 'Bild',
      url: mdMatch[2],
    };
  }
  const directMediaMatch = text.match(/(\/api\/notes\/media\/file\/[^\s)]+)/);
  if (directMediaMatch) {
    return {
      alt: 'Notiz-Bild',
      url: directMediaMatch[1],
    };
  }
  return null;
}

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  const nextHeight = Math.max(24, el.scrollHeight);
  el.style.height = `${nextHeight}px`;
}

// Helper: Resize large camera photos cleanly while keeping crisp quality and small PNGs/GIFs intact
async function prepareNoteImageDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });

  if (file.size <= 1_600_000 || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return rawDataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = rawDataUrl;
    });
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return rawDataUrl;
  }
}

// Helper: Estimate character offset inside clicked inactive line accurately
function getClickCharOffset(e: React.MouseEvent<HTMLDivElement>, cleanText: string, rawPrefixLen: number): number {
  if (!cleanText) return rawPrefixLen;
  try {
    const doc = document as any;
    let offsetInClean: number | null = null;
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos && pos.offsetNode && e.currentTarget.contains(pos.offsetNode)) {
        const range = document.createRange();
        range.selectNodeContents(e.currentTarget);
        range.setEnd(pos.offsetNode, pos.offset);
        offsetInClean = range.toString().length;
      }
    } else if (typeof doc.caretRangeFromPoint === 'function') {
      const caretRange = doc.caretRangeFromPoint(e.clientX, e.clientY);
      if (caretRange && e.currentTarget.contains(caretRange.startContainer)) {
        const range = document.createRange();
        range.selectNodeContents(e.currentTarget);
        range.setEnd(caretRange.startContainer, caretRange.startOffset);
        offsetInClean = range.toString().length;
      }
    }
    if (offsetInClean !== null && !isNaN(offsetInClean)) {
      const clamped = Math.max(0, Math.min(cleanText.length, offsetInClean));
      return rawPrefixLen + clamped;
    }
  } catch {}
  return rawPrefixLen + cleanText.length;
}

interface MarkdownLineRowProps {
  idx: number;
  rawLine: string;
  isActive: boolean;
  isReadOnly: boolean;
  isOnlyLine: boolean;
  isDatePickerOpen: boolean;
  selectedDueDate: string;
  ytDisplayMode: YouTubeDisplayMode | undefined;
  imgDisplayMode: 'embed' | 'link' | undefined;
  activeTextareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  onFocusLine: (idx: number, cursorPos?: number) => void;
  onBlurLine: (idx: number) => void;
  onUpdateLine: (idx: number, newText: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>, idx: number) => void;
  onToggleTaskCheckbox: (idx: number, completed: boolean) => void;
  onOpenDatePicker: (idx: number) => void;
  onChangeDueDate: (val: string) => void;
  onSaveDueDate: (idx: number, val: string) => void;
  onCloseDatePicker: () => void;
  onSetYtDisplayMode: (ytId: string, mode: YouTubeDisplayMode) => void;
  onSetImgDisplayMode: (imgUrl: string, mode: 'embed' | 'link') => void;
  onPreviewImage: (url: string, alt: string) => void;
  onWikilinkClick?: (target: string) => void;
  onTagClick?: (tag: string) => void;
}

const MarkdownLineRow: React.FC<MarkdownLineRowProps> = React.memo(
  ({
    idx,
    rawLine,
    isActive,
    isReadOnly,
    isOnlyLine,
    isDatePickerOpen,
    selectedDueDate,
    ytDisplayMode,
    imgDisplayMode,
    activeTextareaRef,
    onFocusLine,
    onBlurLine,
    onUpdateLine,
    onKeyDown,
    onPaste,
    onToggleTaskCheckbox,
    onOpenDatePicker,
    onChangeDueDate,
    onSaveDueDate,
    onCloseDatePicker,
    onSetYtDisplayMode,
    onSetImgDisplayMode,
    onPreviewImage,
    onWikilinkClick,
    onTagClick,
  }) => {
    const isComposingRef = useRef(false);
    const localInputRef = useRef<HTMLTextAreaElement | null>(null);
    const [localDraft, setLocalDraft] = useState(rawLine);

    useEffect(() => {
      if (!isComposingRef.current) {
        setLocalDraft(rawLine);
      }
    }, [rawLine]);

    useLayoutEffect(() => {
      if (isActive && localInputRef.current) {
        resizeTextarea(localInputRef.current);
      }
    }, [isActive, localDraft]);

    // Markdown syntax checks
    const isHeading1 = rawLine.startsWith('# ');
    const isHeading2 = rawLine.startsWith('## ');
    const isHeading3 = rawLine.startsWith('### ');
    const isQuote = rawLine.startsWith('> ');
    const taskMatch = rawLine.match(/^([ \t]*)- \[([ xX])\][ ]?(.*)$/);
    const isTask = !!taskMatch;
    const isTaskCompleted = taskMatch ? taskMatch[2].toLowerCase() === 'x' : false;
    const isBullet = !isTask && /^[ \t]*[-*][ ]/.test(rawLine);
    const isNumbered = /^[ \t]*\d+\.[ ]/.test(rawLine);
    const ytId = getYouTubeId(rawLine);
    const imageEmbed = getImageEmbed(rawLine);

    // Clean text without markdown command prefix (for rendered view)
    let cleanText = rawLine;
    let rawPrefixLen = 0;
    if (isHeading1) {
      cleanText = rawLine.replace(/^#\s*/, '');
      rawPrefixLen = rawLine.length - cleanText.length;
    } else if (isHeading2) {
      cleanText = rawLine.replace(/^##\s*/, '');
      rawPrefixLen = rawLine.length - cleanText.length;
    } else if (isHeading3) {
      cleanText = rawLine.replace(/^###\s*/, '');
      rawPrefixLen = rawLine.length - cleanText.length;
    } else if (isQuote) {
      cleanText = rawLine.replace(/^>\s*/, '');
      rawPrefixLen = rawLine.length - cleanText.length;
    } else if (taskMatch) {
      cleanText = taskMatch[3];
      rawPrefixLen = rawLine.length - cleanText.length;
    } else if (isBullet) {
      cleanText = rawLine.replace(/^[ \t]*[-*]\s*/, '');
      rawPrefixLen = rawLine.length - cleanText.length;
    } else if (isNumbered) {
      cleanText = rawLine.replace(/^[ \t]*\d+\.\s*/, '');
      rawPrefixLen = rawLine.length - cleanText.length;
    }

    let typographyClass = 'text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200 min-h-[24px]';
    if (isHeading1) {
      typographyClass = 'text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 pt-3 pb-1 min-h-[40px]';
    } else if (isHeading2) {
      typographyClass = 'text-xl md:text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100 pt-2.5 pb-0.5 min-h-[34px]';
    } else if (isHeading3) {
      typographyClass = 'text-lg font-semibold text-neutral-800 dark:text-neutral-200 pt-1.5 min-h-[28px]';
    } else if (isQuote) {
      typographyClass =
        'text-[14px] italic border-l-3 border-[var(--ochre-accent)] bg-amber-50/40 dark:bg-amber-950/25 pl-3 py-1 my-0.5 text-neutral-700 dark:text-neutral-300 rounded-r min-h-[26px]';
    } else if (isTaskCompleted) {
      typographyClass = 'text-[14px] leading-relaxed line-through text-neutral-400 dark:text-neutral-500 min-h-[24px]';
    }

    const renderInlineFormatted = (text: string) => {
      if (!text) return <span className="inline-block min-w-1">&nbsp;</span>;

      const regex = /(!\[[^\]]*\]\([^)\s]+\)|\[\[.*?\]\]|#[\w\d_-]+|\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
      const parts = text.split(regex);

      return parts.map((part, i) => {
        const imgPart = part.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (imgPart) {
          const alt = imgPart[1] || 'Bild';
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-[var(--ochre-accent)] dark:text-[#E09228] font-medium"
            >
              <span>Bild: {alt}</span>
            </span>
          );
        }
        if (part.startsWith('[[') && part.endsWith(']]')) {
          const inner = part.slice(2, -2);
          const [target, alias] = inner.split('|');
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                if (onWikilinkClick) onWikilinkClick(target.trim());
              }}
              className="text-[var(--ochre-accent)] dark:text-[#E09228] underline decoration-[var(--ochre-accent)]/40 font-medium cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-950/40 px-0.5 rounded"
            >
              {alias ? alias.trim() : target.trim()}
            </span>
          );
        }
        if (part.startsWith('#') && part.length > 1 && !part.includes(' ')) {
          const tag = part.substring(1);
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                if (onTagClick) onTagClick(tag);
              }}
              className="inline-flex items-center text-xs px-1.5 py-0.2 rounded bg-amber-500/15 text-[var(--ochre-accent)] dark:text-[#E09228] font-medium cursor-pointer hover:bg-amber-500/25 mx-0.5"
            >
              #{tag}
            </span>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return (
            <strong key={i} className="font-bold text-neutral-900 dark:text-neutral-100">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
          return (
            <em key={i} className="italic text-neutral-800 dark:text-neutral-200">
              {part.slice(1, -1)}
            </em>
          );
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800 text-amber-700 dark:text-amber-400 font-mono text-xs"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      });
    };

    return (
      <div data-line-row="true" className="group relative flex flex-col">
        <div className="flex items-start gap-2">
          {/* Task Checkbox & Calendar Due Date Button */}
          {isTask && (
            <div className="flex items-center gap-1.5 pt-1 shrink-0 select-none">
              <label className="relative flex items-center justify-center w-7 h-7 -my-1.5 -ml-1.5 rounded-full hover:bg-neutral-200/60 dark:hover:bg-neutral-800 cursor-pointer touch-manipulation">
                <input
                  type="checkbox"
                  checked={isTaskCompleted}
                  onChange={(e) => onToggleTaskCheckbox(idx, e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-[var(--ochre-accent)] accent-[var(--ochre-accent)] cursor-pointer"
                  title="Aufgabe abhaken / aktivieren"
                />
              </label>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOpenDatePicker(idx)}
                className="w-7 h-7 -my-1.5 flex items-center justify-center rounded-full text-neutral-400 hover:text-[var(--ochre-accent)] hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer touch-manipulation"
                title="Fälligkeitsdatum hinzufügen / ändern"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Bullet Dot */}
          {isBullet && <span className="text-[var(--ochre-accent)] text-sm pt-1 select-none shrink-0">•</span>}

          {/* Rendered vs. Editable Mode */}
          {isActive ? (
            <textarea
              ref={(el) => {
                localInputRef.current = el;
                activeTextareaRef.current = el;
              }}
              value={localDraft}
              onClick={(e) => e.stopPropagation()}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                isComposingRef.current = false;
                const val = e.currentTarget.value;
                setLocalDraft(val);
                onUpdateLine(idx, val);
              }}
              onChange={(e) => {
                const val = e.target.value;
                setLocalDraft(val);
                resizeTextarea(e.currentTarget);
                if (!isComposingRef.current) {
                  onUpdateLine(idx, val);
                }
              }}
              onFocus={() => onFocusLine(idx)}
              onBlur={() => onBlurLine(idx)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              onPaste={(e) => onPaste(e, idx)}
              readOnly={isReadOnly}
              rows={1}
              spellCheck={false}
              autoCapitalize="sentences"
              className={`w-full bg-transparent border-0 ring-0 outline-hidden p-0 m-0 resize-none overflow-hidden font-sans caret-[var(--ochre-accent)] ${typographyClass}`}
              placeholder={
                idx === 0 && isOnlyLine
                  ? 'Schreibe Notizen oder Markdown (z.B. ## Überschrift)...'
                  : ''
              }
            />
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (isReadOnly) return;
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed && sel.toString().length > 0) {
                  return;
                }
                const offset = getClickCharOffset(e, cleanText, rawPrefixLen);
                onFocusLine(idx, offset);
              }}
              className={`w-full select-text cursor-text transition-colors rounded-xs hover:bg-black/[0.02] dark:hover:bg-white/[0.02] touch-manipulation ${typographyClass}`}
            >
              {cleanText.trim() === '' ? (
                <span className="inline-block h-5 text-neutral-300 dark:text-neutral-700 select-none">&nbsp;</span>
              ) : (
                renderInlineFormatted(cleanText)
              )}
            </div>
          )}
        </div>

        {/* Due Date Popover Picker */}
        {isDatePickerOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="ml-7 my-1.5 p-2 bg-white dark:bg-[#1E1F23] rounded-lg shadow-xl border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-2 z-30 animate-in fade-in duration-100"
          >
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
              <span>Fälligkeitsdatum:</span>
            </span>
            <input
              type="date"
              value={selectedDueDate}
              onChange={(e) => onChangeDueDate(e.target.value)}
              className="text-xs px-2 py-1 rounded bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
            />
            <button
              type="button"
              onClick={() => onSaveDueDate(idx, selectedDueDate)}
              className="text-xs px-2.5 py-1 rounded bg-[var(--ochre-accent)] text-white font-medium hover:bg-[#b06c19] cursor-pointer"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={onCloseDatePicker}
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Interactive Embedded Image Card (matching YouTube Preview Embed style) */}
        {imageEmbed && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-2 p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1D1F23] max-w-xl"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 min-w-0">
                <Images className="w-4 h-4 text-[var(--ochre-accent)] shrink-0" />
                <span className="truncate">{imageEmbed.alt}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center gap-1 p-0.5 bg-neutral-200 dark:bg-neutral-800 rounded text-[11px]">
                  <button
                    type="button"
                    onClick={() => onSetImgDisplayMode(imageEmbed.url, 'embed')}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      imgDisplayMode !== 'link'
                        ? 'bg-white dark:bg-neutral-700 text-[var(--ochre-accent)] font-medium shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Bild
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetImgDisplayMode(imageEmbed.url, 'link')}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      imgDisplayMode === 'link'
                        ? 'bg-white dark:bg-neutral-700 text-[var(--ochre-accent)] font-medium shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Link
                  </button>
                </div>
                {imgDisplayMode !== 'link' && (
                  <button
                    type="button"
                    onClick={() => onPreviewImage(imageEmbed.url, imageEmbed.alt)}
                    className="p-1 rounded text-neutral-400 hover:text-[var(--ochre-accent)] cursor-pointer"
                    title="Bild groß anzeigen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {imgDisplayMode === 'link' ? (
              <a
                href={imageEmbed.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 text-[var(--ochre-accent)] text-xs hover:underline"
              >
                <Images className="w-4 h-4 shrink-0" />
                <span className="truncate">{imageEmbed.alt}</span>
                <ExternalLink className="w-3.5 h-3.5 ml-auto shrink-0" />
              </a>
            ) : (
              <div
                onClick={() => onPreviewImage(imageEmbed.url, imageEmbed.alt)}
                className="relative rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900 cursor-zoom-in border border-[#E5E3DC]/60 dark:border-[#2F3136]"
              >
                <img
                  src={imageEmbed.url}
                  alt={imageEmbed.alt}
                  loading="lazy"
                  className="w-full max-h-[380px] object-contain mx-auto"
                />
              </div>
            )}
          </div>
        )}

        {/* Interactive YouTube Preview Embed */}
        {ytId && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-2 p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1D1F23] max-w-xl"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                <Youtube className="w-4 h-4 text-red-500" />
                <span>YouTube Video Vorschau</span>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-neutral-200 dark:bg-neutral-800 rounded text-[11px]">
                <button
                  type="button"
                  onClick={() => onSetYtDisplayMode(ytId, 'player')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    ytDisplayMode !== 'link'
                      ? 'bg-white dark:bg-neutral-700 text-[var(--ochre-accent)] font-medium shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  Player
                </button>
                <button
                  type="button"
                  onClick={() => onSetYtDisplayMode(ytId, 'link')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    ytDisplayMode === 'link'
                      ? 'bg-white dark:bg-neutral-700 text-[var(--ochre-accent)] font-medium shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  Link
                </button>
              </div>
            </div>

            {ytDisplayMode === 'link' ? (
              <a
                href={`https://www.youtube.com/watch?v=${ytId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs hover:underline"
              >
                <Play className="w-4 h-4 shrink-0 fill-current" />
                <span className="truncate">Auf YouTube ansehen: https://youtu.be/{ytId}</span>
                <ExternalLink className="w-3.5 h-3.5 ml-auto" />
              </a>
            ) : (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black shadow-md">
                <iframe
                  src={`https://www.youtube.com/embed/${ytId}`}
                  title="YouTube Video Player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

export const LiveEditorPane: React.FC<LiveEditorPaneProps> = React.memo(({
  content,
  onChange,
  isReadOnly = false,
  onToggleTask,
  onWikilinkClick,
  onTagClick,
  noteTitle,
  onRenameNote,
  showToolbar: propShowToolbar,
  noteContext,
  openNoteTabs = [],
  activeTabPath,
  onSelectTab,
  onAddTab,
  onCloseTab,
}) => {
  const [internalShowToolbar] = useState<boolean>(true);
  const showToolbar = propShowToolbar !== undefined ? propShowToolbar : internalShowToolbar;

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [focusedLineIndex, setFocusedLineIndex] = useState<number | null>(null);
  const focusedLineRef = useRef<number | null>(null);

  // Local decoupled line buffer: prevents async parent round-trips from snapping cursor backwards
  const [draftLines, setDraftLines] = useState<string[]>(() =>
    content.length > 0 ? content.split('\n') : ['']
  );
  const draftLinesRef = useRef<string[]>(draftLines);
  draftLinesRef.current = draftLines;

  const lastEmittedRef = useRef<string>(content);
  const pendingCursorRef = useRef<{ line: number; pos: number } | null>(null);
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const toolbarScrollRef = useRef<HTMLDivElement>(null);
  const toolbarDraggedRef = useRef<boolean>(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Due Date popover picker state
  const [datePickerLine, setDatePickerLine] = useState<number | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState<string>('');

  // Rename Note Modal state
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');

  // YouTube & Image embed vs link preferences
  const [ytDisplayModes, setYtDisplayModes] = useState<Record<string, YouTubeDisplayMode>>({});
  const [imgDisplayModes, setImgDisplayModes] = useState<Record<string, 'embed' | 'link'>>({});

  // Per-Note Media Browser, Upload & Drag-Drop state
  const [noteMedia, setNoteMedia] = useState<NoteMediaItem[]>([]);
  const [isMediaBrowserOpen, setIsMediaBrowserOpen] = useState(false);
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);

  // Load media list for current note
  const refreshNoteMedia = useCallback(async () => {
    if (!noteContext?.username || !noteContext?.notePath) {
      setNoteMedia([]);
      return;
    }
    const items = await api.listNoteMedia(
      noteContext.username,
      noteContext.notePath,
      noteContext.noteProfile,
      noteContext.isShared,
      noteContext.sharedFrom
    );
    setNoteMedia(items);
  }, [
    noteContext?.username,
    noteContext?.notePath,
    noteContext?.noteProfile,
    noteContext?.isShared,
    noteContext?.sharedFrom,
  ]);

  useEffect(() => {
    refreshNoteMedia();
    setIsImageMenuOpen(false);
  }, [refreshNoteMedia]);

  // Sync incoming content ONLY when external change / note switch occurs (never on echo of our own edits)
  useEffect(() => {
    if (content !== lastEmittedRef.current) {
      const nextLines = content.length > 0 ? content.split('\n') : [''];
      lastEmittedRef.current = content;
      draftLinesRef.current = nextLines;
      setDraftLines(nextLines);
      setFocusedLineIndex(null);
      focusedLineRef.current = null;
    }
  }, [content]);

  // Synchronous layout-phase cursor positioning (zero timer race, instant focus)
  useLayoutEffect(() => {
    const pending = pendingCursorRef.current;
    if (!pending || focusedLineIndex !== pending.line) return;
    const el = activeTextareaRef.current;
    if (el) {
      if (document.activeElement !== el) {
        el.focus({ preventScroll: false });
      }
      const pos = Math.max(0, Math.min(el.value.length, pending.pos));
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
      resizeTextarea(el);
    }
    pendingCursorRef.current = null;
  }, [focusedLineIndex, draftLines]);

  // Translate wheel & desktop mouse-drag into crisp horizontal scroll (touch uses native OS momentum pan-x)
  useEffect(() => {
    const el = toolbarScrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 1.2;
      }
    };

    let isMouseDown = false;
    let startX = 0;
    let startScrollLeft = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isMouseDown = true;
      toolbarDraggedRef.current = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) {
        toolbarDraggedRef.current = true;
      }
      if (toolbarDraggedRef.current) {
        el.scrollLeft = startScrollLeft - dx;
      }
    };

    const handleMouseUp = () => {
      isMouseDown = false;
      window.setTimeout(() => {
        toolbarDraggedRef.current = false;
      }, 40);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showToolbar]);

  const commitLines = useCallback(
    (nextLines: string[]) => {
      const joined = nextLines.join('\n');
      lastEmittedRef.current = joined;
      draftLinesRef.current = nextLines;
      setDraftLines(nextLines);
      onChange(joined);
    },
    [onChange]
  );

  const focusLineAt = useCallback((index: number, cursorPosition?: number) => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    const currentLines = draftLinesRef.current;
    const safeIdx = Math.max(0, Math.min(currentLines.length - 1, index));
    const targetLen = currentLines[safeIdx]?.length ?? 0;
    const pos = cursorPosition !== undefined ? Math.max(0, Math.min(targetLen, cursorPosition)) : targetLen;

    pendingCursorRef.current = { line: safeIdx, pos };
    focusedLineRef.current = safeIdx;
    setFocusedLineIndex(safeIdx);

    if (activeTextareaRef.current && focusedLineRef.current === safeIdx && document.activeElement === activeTextareaRef.current) {
      try {
        activeTextareaRef.current.setSelectionRange(pos, pos);
      } catch {}
    }
  }, []);

  const handleRowFocus = useCallback((idx: number, cursorPos?: number) => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    if (cursorPos !== undefined) {
      focusLineAt(idx, cursorPos);
    } else if (focusedLineRef.current !== idx) {
      focusedLineRef.current = idx;
      setFocusedLineIndex(idx);
    }
  }, [focusLineAt]);

  const handleRowBlur = useCallback((idx: number) => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = window.setTimeout(() => {
      if (focusedLineRef.current === idx) {
        focusedLineRef.current = null;
        setFocusedLineIndex(null);
      }
      blurTimerRef.current = null;
    }, 60);
  }, []);

  const updateLine = useCallback(
    (index: number, newText: string) => {
      const updated = [...draftLinesRef.current];
      if (updated[index] === newText) return;
      updated[index] = newText;
      commitLines(updated);
    },
    [commitLines]
  );

  const insertImageMarkdown = useCallback(
    (alt: string, url: string) => {
      const markdownLine = `![${alt}](${url})`;
      const linesNow = [...draftLinesRef.current];
      const idx = focusedLineRef.current !== null ? focusedLineRef.current : linesNow.length - 1;
      const current = linesNow[idx] || '';
      if (current.trim() === '') {
        linesNow[idx] = markdownLine;
        commitLines(linesNow);
      } else {
        linesNow.splice(idx + 1, 0, markdownLine);
        commitLines(linesNow);
      }
    },
    [commitLines]
  );

  const uploadAndInsertImages = useCallback(
    async (files: FileList | File[], embedImmediately = true) => {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      if (!noteContext?.username || !noteContext?.notePath) {
        setMediaNotice('Bitte zuerst eine Notiz öffnen.');
        window.setTimeout(() => setMediaNotice(null), 2500);
        return;
      }

      setIsUploadingMedia(true);
      setMediaNotice(null);
      try {
        for (const file of imageFiles) {
          const dataUrl = await prepareNoteImageDataUrl(file);
          const item = await api.uploadNoteMedia({
            username: noteContext.username,
            profile: noteContext.noteProfile,
            notePath: noteContext.notePath,
            filename: file.name || `bild_${Date.now()}.jpg`,
            dataUrl,
            isShared: noteContext.isShared,
            sharedFrom: noteContext.sharedFrom,
          });
          setNoteMedia((prev) => [item, ...prev.filter((p) => p.filename !== item.filename)]);
          if (embedImmediately) {
            const cleanAlt = (file.name || 'Bild').replace(/\.[^.]+$/, '');
            insertImageMarkdown(cleanAlt, item.url);
          }
        }
        setMediaNotice('Bild im Notiz-Ordner gespeichert.');
        window.setTimeout(() => setMediaNotice(null), 2500);
      } catch (err: any) {
        setMediaNotice(err?.message || 'Upload fehlgeschlagen');
        window.setTimeout(() => setMediaNotice(null), 3500);
      } finally {
        setIsUploadingMedia(false);
      }
    },
    [noteContext, insertImageMarkdown]
  );

  const handleDeleteMediaItem = useCallback(
    async (item: NoteMediaItem) => {
      if (!noteContext?.username || !noteContext?.notePath) return;
      const ok = await api.deleteNoteMedia({
        username: noteContext.username,
        profile: noteContext.noteProfile,
        notePath: noteContext.notePath,
        filename: item.filename,
        isShared: noteContext.isShared,
        sharedFrom: noteContext.sharedFrom,
      });
      if (ok) {
        setNoteMedia((prev) => prev.filter((m) => m.filename !== item.filename));
      }
    },
    [noteContext]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
      const el = e.currentTarget;
      const cursor = el.selectionStart ?? el.value.length;
      const currentVal = el.value;
      const currentLines = draftLinesRef.current;

      // 1. ENTER KEY: Fluid line splitting & list continuation
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const beforeCursor = currentVal.substring(0, cursor);
        const afterCursor = currentVal.substring(cursor);

        const taskMatch = beforeCursor.match(/^([ \t]*)- \[([ xX])\][ ](.*)$/);
        const bulletMatch = beforeCursor.match(/^([ \t]*[-*])[ ](.*)$/);
        const numMatch = beforeCursor.match(/^([ \t]*)(\d+)\.[ ](.*)$/);
        const quoteMatch = beforeCursor.match(/^([ \t]*>[ ]?)(.*)$/);

        let nextPrefix = '';

        if (taskMatch) {
          if (taskMatch[3].trim() === '' && afterCursor.trim() === '') {
            const updated = [...currentLines];
            updated[index] = '';
            commitLines(updated);
            focusLineAt(index, 0);
            return;
          }
          nextPrefix = '- [ ] ';
        } else if (bulletMatch) {
          if (bulletMatch[2].trim() === '' && afterCursor.trim() === '') {
            const updated = [...currentLines];
            updated[index] = '';
            commitLines(updated);
            focusLineAt(index, 0);
            return;
          }
          nextPrefix = `${bulletMatch[1]} `;
        } else if (numMatch) {
          if (numMatch[3].trim() === '' && afterCursor.trim() === '') {
            const updated = [...currentLines];
            updated[index] = '';
            commitLines(updated);
            focusLineAt(index, 0);
            return;
          }
          const nextNum = parseInt(numMatch[2], 10) + 1;
          nextPrefix = `${numMatch[1]}${nextNum}. `;
        } else if (quoteMatch && quoteMatch[2].trim() !== '') {
          nextPrefix = quoteMatch[1];
        }

        const updated = [...currentLines];
        updated[index] = beforeCursor;
        updated.splice(index + 1, 0, nextPrefix + afterCursor);
        commitLines(updated);
        focusLineAt(index + 1, nextPrefix.length);
        return;
      }

      // 2. BACKSPACE: Line merging & prefix clearing
      if (e.key === 'Backspace') {
        if (cursor === 0 && (el.selectionEnd ?? 0) === 0 && index > 0) {
          e.preventDefault();
          const prevLine = currentLines[index - 1];
          const prevLen = prevLine.length;
          const updated = [...currentLines];
          updated[index - 1] = prevLine + currentVal;
          updated.splice(index, 1);
          commitLines(updated);
          focusLineAt(index - 1, prevLen);
          return;
        }

        if (
          currentVal.match(/^[ \t]*[-*][ ]$/) ||
          currentVal.match(/^[ \t]*- \[[ ]\][ ]$/) ||
          currentVal.match(/^#{1,4}[ ]$/)
        ) {
          e.preventDefault();
          updateLine(index, '');
          focusLineAt(index, 0);
          return;
        }
      }

      // 3. ARROW UP / DOWN: Fluid cursor navigation across lines
      if (e.key === 'ArrowUp' && index > 0) {
        if (cursor === 0) {
          e.preventDefault();
          focusLineAt(index - 1, currentLines[index - 1].length);
        }
      } else if (e.key === 'ArrowDown' && index < currentLines.length - 1) {
        if (cursor === currentVal.length) {
          e.preventDefault();
          focusLineAt(index + 1, 0);
        }
      }

      // 4. TAB: Indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentVal.startsWith('  ')) {
            updateLine(index, currentVal.substring(2));
            focusLineAt(index, Math.max(0, cursor - 2));
          }
        } else {
          updateLine(index, '  ' + currentVal);
          focusLineAt(index, cursor + 2);
        }
      }
    },
    [commitLines, focusLineAt, updateLine]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>, index: number) => {
      // Support direct clipboard image paste (screenshots / copied photos)
      const items = Array.from(e.clipboardData.items || []);
      const imgFiles = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((f): f is File => !!f);
      if (imgFiles.length > 0 && !isReadOnly) {
        e.preventDefault();
        uploadAndInsertImages(imgFiles, true);
        return;
      }

      const text = e.clipboardData.getData('text');
      if (text.includes('\n')) {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const before = el.value.substring(0, start);
        const after = el.value.substring(end);

        const pasteLines = text.replace(/\r\n/g, '\n').split('\n');
        const firstLine = before + pasteLines[0];
        const lastLine = pasteLines[pasteLines.length - 1] + after;
        const middleLines = pasteLines.slice(1, -1);

        const updated = [...draftLinesRef.current];
        updated.splice(index, 1, firstLine, ...middleLines, lastLine);
        commitLines(updated);
        focusLineAt(index + pasteLines.length - 1, pasteLines[pasteLines.length - 1].length);
      }
    },
    [commitLines, focusLineAt, isReadOnly, uploadAndInsertImages]
  );

  const handleToggleTaskCheckbox = useCallback(
    (idx: number, completed: boolean) => {
      const current = draftLinesRef.current[idx] || '';
      const today = new Date().toISOString().split('T')[0];
      const updated = completed
        ? current.replace(/^([ \t]*- \[)[ ](\])/, '$1x$2') + (current.includes('✅') ? '' : ` ✅ ${today}`)
        : current.replace(/^([ \t]*- \[)[xX](\])/, '$1 $2').replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trimEnd();
      updateLine(idx, updated);
      if (onToggleTask) onToggleTask(idx, completed);
    },
    [updateLine, onToggleTask]
  );

  const handleOpenDatePicker = useCallback((idx: number) => {
    setDatePickerLine((prev) => (prev === idx ? null : idx));
    setSelectedDueDate(new Date().toISOString().split('T')[0]);
  }, []);

  const handleSaveDueDate = useCallback(
    (index: number, dateStr: string) => {
      const current = draftLinesRef.current[index] || '';
      let updated = current.replace(/📅\s*\d{4}-\d{2}-\d{2}/, '').trimEnd();
      if (dateStr) {
        updated = `${updated} 📅 ${dateStr}`;
      }
      updateLine(index, updated);
      setDatePickerLine(null);
    },
    [updateLine]
  );

  const handleSetYtDisplayMode = useCallback((ytId: string, mode: YouTubeDisplayMode) => {
    setYtDisplayModes((prev) => ({ ...prev, [ytId]: mode }));
  }, []);

  const handleSetImgDisplayMode = useCallback((imgUrl: string, mode: 'embed' | 'link') => {
    setImgDisplayModes((prev) => ({ ...prev, [imgUrl]: mode }));
  }, []);

  // Formatting Toolbar Buttons
  const applyPrefix = (prefix: string) => {
    const linesNow = draftLinesRef.current;
    const idx = focusedLineRef.current !== null ? focusedLineRef.current : linesNow.length - 1;
    const current = linesNow[idx] || '';
    const stripped = current.replace(/^(#{1,6}|-\s\[[ xX]\]|-\s|\*\s|>\s)\s*/, '');
    const nextLine = `${prefix}${stripped}`;
    updateLine(idx, nextLine);
    focusLineAt(idx, nextLine.length);
  };

  const applySurround = (prefix: string, suffix: string) => {
    const linesNow = draftLinesRef.current;
    const idx = focusedLineRef.current !== null ? focusedLineRef.current : linesNow.length - 1;
    const current = linesNow[idx] || '';
    const el = activeTextareaRef.current;
    if (el && focusedLineRef.current === idx) {
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const selected = current.substring(start, end) || 'Text';
      const nextLine = current.substring(0, start) + prefix + selected + suffix + current.substring(end);
      updateLine(idx, nextLine);
      focusLineAt(idx, start + prefix.length + selected.length);
    } else {
      const nextLine = `${current}${current ? ' ' : ''}${prefix}Text${suffix}`;
      updateLine(idx, nextLine);
      focusLineAt(idx, nextLine.length - suffix.length);
    }
  };

  // Focus editor immediately when clicking/tapping anywhere in empty canvas area
  const handleCanvasEmptyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isReadOnly) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) {
      return;
    }
    if ((e.target as HTMLElement).closest('[data-line-row]')) return;
    const currentLines = draftLinesRef.current;
    const lastIdx = Math.max(0, currentLines.length - 1);
    const lastLine = currentLines[lastIdx] || '';
    if (lastLine.trim() !== '') {
      const updated = [...currentLines, ''];
      commitLines(updated);
      focusLineAt(updated.length - 1, 0);
    } else {
      focusLineAt(lastIdx, lastLine.length);
    }
  };

  const toolbarButtons = [
    { id: 'h1', label: 'Titel (H1)', icon: <Heading1 className="w-4 h-4" />, action: () => applyPrefix('# ') },
    { id: 'h2', label: 'Untertitel (H2)', icon: <Heading2 className="w-4 h-4" />, action: () => applyPrefix('## ') },
    { id: 'h3', label: 'Abschnitt (H3)', icon: <Heading3 className="w-4 h-4" />, action: () => applyPrefix('### ') },
    { type: 'divider' },
    { id: 'bold', label: 'Fett', icon: <Bold className="w-4 h-4" />, action: () => applySurround('**', '**') },
    { id: 'italic', label: 'Kursiv', icon: <Italic className="w-4 h-4" />, action: () => applySurround('*', '*') },
    { id: 'strike', label: 'Durchgestrichen', icon: <Strikethrough className="w-4 h-4" />, action: () => applySurround('~~', '~~') },
    { type: 'divider' },
    { id: 'task', label: 'Aufgabe (- [ ])', icon: <CheckSquare className="w-4 h-4 text-[var(--ochre-accent)]" />, action: () => applyPrefix('- [ ] ') },
    { id: 'quote', label: 'Zitat (> )', icon: <MessageSquareQuote className="w-4 h-4" />, action: () => applyPrefix('> ') },
    { id: 'link', label: 'Wikilink ([[...]])', icon: <Link2 className="w-4 h-4 text-[var(--ochre-accent)]" />, action: () => applySurround('[[', ']]') },
    { id: 'code', label: 'Code', icon: <Code className="w-4 h-4" />, action: () => applySurround('`', '`') },
    { type: 'divider' },
    {
      id: 'image',
      label: 'Bild anhängen / Kamera',
      icon: <ImagePlus className="w-4 h-4 text-[var(--ochre-accent)]" />,
      action: () => setIsImageMenuOpen((prev) => !prev),
    },
    {
      id: 'mediabrowser',
      label: `Medienbrowser (${noteMedia.length})`,
      icon: <Images className="w-4 h-4" />,
      badge: noteMedia.length > 0 ? noteMedia.length : undefined,
      action: () => {
        setIsImageMenuOpen(false);
        setIsMediaBrowserOpen((prev) => !prev);
      },
    },
    {
      id: 'youtube',
      label: 'YouTube Video einfügen',
      icon: <Youtube className="w-4 h-4 text-red-500" />,
      action: () => {
        const url = prompt('YouTube URL eingeben (z.B. https://www.youtube.com/watch?v=...):');
        if (url) {
          const linesNow = draftLinesRef.current;
          const idx = focusedLineRef.current !== null ? focusedLineRef.current : linesNow.length - 1;
          const current = linesNow[idx] || '';
          const updated = [...linesNow];
          if (current) {
            updated.splice(idx + 1, 0, url.trim());
          } else {
            updated[idx] = url.trim();
          }
          commitLines(updated);
        }
      },
    },
    {
      id: 'rename',
      label: 'Notiz umbenennen',
      icon: <Edit3 className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />,
      action: () => {
        setNewTitleInput(noteTitle ? noteTitle.replace(/\.md$/, '') : '');
        setIsRenameModalOpen(true);
      },
    },
  ];

  return (
    <div
      onDragOver={(e) => {
        if (isReadOnly) return;
        const hasFiles = Array.from(e.dataTransfer.types || []).includes('Files');
        if (hasFiles) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setIsDraggingImage(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingImage(false);
        }
      }}
      onDrop={(e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          const hasImage = Array.from(files).some((f) => f.type.startsWith('image/'));
          if (hasImage && !isReadOnly) {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingImage(false);
            uploadAndInsertImages(files, true);
            return;
          }
        }
        setIsDraggingImage(false);
      }}
      className="flex-1 h-full flex flex-col bg-[#FBFBFA] dark:bg-[#18191B] overflow-hidden select-text relative"
    >
      {/* Hidden File & Camera Inputs for Desktop / Tablet / Mobile */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            uploadAndInsertImages(e.target.files, true);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            uploadAndInsertImages(e.target.files, true);
          }
          e.target.value = '';
        }}
      />

      {/* Mobile Tabs Header Bar (if openNoteTabs provided) */}
      {openNoteTabs.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 bg-[#F4F3EF] dark:bg-[#1A1B1E] border-b border-[#E5E3DC] dark:border-[#2F3136] overflow-x-auto no-scrollbar shrink-0 select-none">
          {openNoteTabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => onSelectTab && onSelectTab(tab.path)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                  isActive
                    ? 'bg-white dark:bg-[#25272C] text-[var(--ochre-accent)] dark:text-[#E09228] shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="truncate max-w-[120px]">{tab.title}</span>
                {openNoteTabs.length > 1 && onCloseTab && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.path);
                    }}
                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700"
                    title="Tab schließen"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          {onAddTab && (
            <button
              onClick={onAddTab}
              className="p-1 rounded-md text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
              title="Notiz-Tab hinzufügen"
            >
              +
            </button>
          )}
        </div>
      )}

      {/* Classic Toolbar Header (Collapsible & Horizontally Scrollable) */}
      {!isReadOnly && showToolbar && (
        <div
          data-no-swipe="true"
          className="border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA]/95 dark:bg-[#1D1F23]/95 shrink-0 select-none animate-in fade-in duration-100 relative"
        >
          <div className="flex items-center px-2 py-1 min-w-0">
            <div
              ref={toolbarScrollRef}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
              className="flex items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x min-w-0 w-full flex-1 py-1 px-1 pr-6 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300/70 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-700/70"
            >
              {toolbarButtons.map((btn, index) => {
                if (btn.type === 'divider') {
                  return <div key={index} className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5 shrink-0" />;
                }

                const isHighlighted =
                  (btn.id === 'image' && isImageMenuOpen) ||
                  (btn.id === 'mediabrowser' && isMediaBrowserOpen);

                return (
                  <div key={btn.id} className="relative group shrink-0 touch-pan-x">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (toolbarDraggedRef.current) return;
                        btn.action?.();
                      }}
                      onMouseEnter={() => setActiveTooltip(btn.id!)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-[#25272C] border shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer touch-pan-x ${
                        isHighlighted
                          ? 'border-[var(--ochre-accent)] text-[var(--ochre-accent)]'
                          : 'border-[#E5E3DC] dark:border-[#2F3136] text-neutral-600 dark:text-neutral-300 hover:border-[var(--ochre-accent)] hover:text-[var(--ochre-accent)]'
                      }`}
                      aria-label={btn.label}
                    >
                      {btn.icon}
                    </button>

                    {typeof (btn as any).badge === 'number' && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--ochre-accent)] text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
                        {(btn as any).badge}
                      </span>
                    )}

                    {activeTooltip === btn.id && (
                      <div className="hidden md:block absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-neutral-900 text-white text-[10px] whitespace-nowrap shadow-lg z-50 pointer-events-none">
                        <span>{btn.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Image Attachment Action Popover (Ordnerstruktur / Kamera / Medienbrowser) */}
          {isImageMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mx-3 mb-2 p-2.5 rounded-2xl bg-white dark:bg-[#1E1F23] border border-[#E5E3DC] dark:border-[#2F3136] shadow-xl flex flex-wrap items-center gap-2 z-40 animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <button
                type="button"
                onClick={() => {
                  setIsImageMenuOpen(false);
                  imageFileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--ochre-accent)] text-white text-xs font-semibold shadow-xs cursor-pointer active:scale-95 touch-manipulation"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Aus Ordner / Galerie</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsImageMenuOpen(false);
                  cameraInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#3A3D44] text-neutral-800 dark:text-neutral-200 text-xs font-semibold cursor-pointer active:scale-95 touch-manipulation hover:border-[var(--ochre-accent)]"
              >
                <Camera className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                <span>Kamera nutzen</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsImageMenuOpen(false);
                  setIsMediaBrowserOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#3A3D44] text-neutral-800 dark:text-neutral-200 text-xs font-semibold cursor-pointer active:scale-95 touch-manipulation hover:border-[var(--ochre-accent)]"
              >
                <Images className="w-3.5 h-3.5 text-[var(--ochre-accent)]" />
                <span>Medienbrowser ({noteMedia.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImageMenuOpen(false)}
                className="ml-auto p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload / Media Notice Toast */}
      {(isUploadingMedia || mediaNotice) && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-xs font-medium text-[var(--ochre-accent)] flex items-center justify-between shrink-0">
          <span>{isUploadingMedia ? 'Bild wird in Media-Ordner hochgeladen...' : mediaNotice}</span>
        </div>
      )}

      {/* Collapsible Per-Note Media Browser */}
      {isMediaBrowserOpen && (
        <div
          data-no-swipe="true"
          className="border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/85 dark:bg-[#1E2024] px-3 py-2.5 shrink-0 space-y-2 select-none animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Images className="w-4 h-4 text-[var(--ochre-accent)] shrink-0" />
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 truncate">
                Notiz-Medienbrowser
              </span>
              <span className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#3A3D44] text-neutral-500 truncate">
                Media/{(noteTitle || 'Notiz').replace(/\.md$/i, '')}/
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => imageFileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--ochre-accent)] text-white text-[11px] font-semibold cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Bild</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#3A3D44] text-neutral-700 dark:text-neutral-200 text-[11px] font-semibold cursor-pointer active:scale-95"
                  >
                    <Camera className="w-3 h-3 text-[var(--ochre-accent)]" />
                    <span className="hidden sm:inline">Kamera</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setIsMediaBrowserOpen(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
                aria-label="Medienbrowser schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {noteMedia.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed border-[#D7D4CB] dark:border-[#34373E] text-center text-xs text-neutral-500">
              Noch keine Bilder für diese Notiz. Ziehe Bilder per Drag & Drop auf die Notiz oder nutze Ordner / Kamera.
            </div>
          ) : (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {noteMedia.map((item) => (
                <div
                  key={item.filename}
                  className="w-36 shrink-0 rounded-xl bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#32353D] overflow-hidden shadow-2xs flex flex-col"
                >
                  <div
                    onClick={() => setLightboxImage({ url: item.url, alt: item.filename })}
                    className="h-20 bg-neutral-100 dark:bg-neutral-900 overflow-hidden cursor-zoom-in relative group"
                  >
                    <img src={item.url} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-1.5 space-y-1">
                    <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300 truncate block">
                      {item.filename}
                    </span>
                    <div className="flex items-center justify-between gap-1">
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => insertImageMarkdown(item.filename.replace(/\.[^.]+$/, ''), item.url)}
                          className="flex-1 text-[10px] font-semibold px-1.5 py-1 rounded bg-amber-500/15 text-[var(--ochre-accent)] hover:bg-[var(--ochre-accent)] hover:text-white transition-colors cursor-pointer"
                          title="Als Vorschau in Notiz einbinden"
                        >
                          Einbinden
                        </button>
                      )}
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMediaItem(item)}
                          className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          title="Bild aus Media-Ordner löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drag & Drop Image Overlay */}
      {isDraggingImage && (
        <div className="absolute inset-3 rounded-2xl bg-[var(--ochre-accent)]/12 border-2 border-dashed border-[var(--ochre-accent)] flex items-center justify-center pointer-events-none z-50 backdrop-blur-2xs animate-in fade-in duration-100">
          <div className="p-4 px-5 rounded-2xl bg-white dark:bg-[#1E1F23] shadow-2xl border border-[var(--ochre-accent)] flex items-center gap-2.5 text-xs font-bold text-[var(--ochre-accent)]">
            <Upload className="w-5 h-5" />
            <span>Bild hier ablegen → wird in Media/{(noteTitle || 'Notiz').replace(/\.md$/i, '')}/ gespeichert</span>
          </div>
        </div>
      )}

      {/* Main Fluid Document Canvas (Obsidian Live Preview Style) */}
      <div
        onClick={handleCanvasEmptyClick}
        className="flex-1 relative overflow-y-auto px-4 md:px-12 py-6 cursor-text select-text"
      >
        <div
          onClick={handleCanvasEmptyClick}
          className="max-w-3xl mx-auto space-y-1 min-h-[calc(100%-1rem)] pb-24 select-text"
        >
          {draftLines.map((rawLine, idx) => (
            <MarkdownLineRow
              key={idx}
              idx={idx}
              rawLine={rawLine}
              isActive={focusedLineIndex === idx}
              isReadOnly={isReadOnly}
              isOnlyLine={draftLines.length === 1}
              isDatePickerOpen={datePickerLine === idx}
              selectedDueDate={selectedDueDate}
              ytDisplayMode={(() => {
                const ytId = getYouTubeId(rawLine);
                return ytId ? ytDisplayModes[ytId] : undefined;
              })()}
              imgDisplayMode={(() => {
                const img = getImageEmbed(rawLine);
                return img ? imgDisplayModes[img.url] : undefined;
              })()}
              activeTextareaRef={activeTextareaRef}
              onFocusLine={handleRowFocus}
              onBlurLine={handleRowBlur}
              onUpdateLine={updateLine}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onToggleTaskCheckbox={handleToggleTaskCheckbox}
              onOpenDatePicker={handleOpenDatePicker}
              onChangeDueDate={setSelectedDueDate}
              onSaveDueDate={handleSaveDueDate}
              onCloseDatePicker={() => setDatePickerLine(null)}
              onSetYtDisplayMode={handleSetYtDisplayMode}
              onSetImgDisplayMode={handleSetImgDisplayMode}
              onPreviewImage={(url, alt) => setLightboxImage({ url, alt })}
              onWikilinkClick={onWikilinkClick}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[88dvh] flex flex-col items-center gap-2"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="self-end w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
              aria-label="Vorschau schließen"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.alt}
              className="max-w-full max-h-[80dvh] rounded-xl object-contain shadow-2xl"
            />
            <span className="text-xs text-white/80 font-medium">{lightboxImage.alt}</span>
          </div>
        </div>
      )}

      {/* Rename Note Modal */}
      {isRenameModalOpen && (
        <div
          onClick={() => setIsRenameModalOpen(false)}
          className="fixed inset-0 bg-black/40 z-[110] flex items-start justify-center p-4 pt-16 backdrop-blur-2xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] max-w-sm w-full p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[var(--ochre-accent)]" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">Notiz umbenennen</h3>
              </div>
              <button
                onClick={() => setIsRenameModalOpen(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">Neuer Notiztitel:</label>
              <input
                type="text"
                value={newTitleInput}
                onChange={(e) => setNewTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitleInput.trim()) {
                    if (onRenameNote) onRenameNote(newTitleInput.trim());
                    setIsRenameModalOpen(false);
                  }
                }}
                className="w-full text-sm px-3 py-2 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 outline-hidden focus:border-[var(--ochre-accent)]"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newTitleInput.trim() && onRenameNote) {
                    onRenameNote(newTitleInput.trim());
                  }
                  setIsRenameModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ochre-accent)] text-white hover:bg-[#b06c19] shadow-xs cursor-pointer"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
