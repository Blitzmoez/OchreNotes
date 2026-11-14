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
} from 'lucide-react';
import { YouTubeDisplayMode } from '../../types';

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
  // Mobile note tabs support
  openNoteTabs?: { path: string; title: string }[];
  activeTabPath?: string;
  onSelectTab?: (path: string) => void;
  onAddTab?: () => void;
  onCloseTab?: (path: string) => void;
}

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function getYouTubeId(text: string): string | null {
  const match = text.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  const nextHeight = Math.max(24, el.scrollHeight);
  el.style.height = `${nextHeight}px`;
}

// Helper: Estimate character offset inside clicked inactive line
function getClickCharOffset(e: React.MouseEvent<HTMLDivElement>, cleanText: string, rawPrefixLen: number): number {
  try {
    const doc = document as any;
    let offsetInClean: number | null = null;
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos && typeof pos.offset === 'number') {
        // Walk text nodes in container to accumulate character offset accurately
        const range = document.createRange();
        range.selectNodeContents(e.currentTarget);
        range.setEnd(pos.offsetNode, pos.offset);
        offsetInClean = range.toString().length;
      }
    } else if (typeof doc.caretRangeFromPoint === 'function') {
      const caretRange = doc.caretRangeFromPoint(e.clientX, e.clientY);
      if (caretRange) {
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
    onWikilinkClick,
    onTagClick,
  }) => {
    const isComposingRef = useRef(false);
    const localInputRef = useRef<HTMLTextAreaElement | null>(null);
    const [localDraft, setLocalDraft] = useState(rawLine);

    // Sync local draft only when inactive or when rawLine updates externally (not mid-IME composition)
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

    let typographyClass = 'text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200';
    if (isHeading1) {
      typographyClass = 'text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 pt-3 pb-1';
    } else if (isHeading2) {
      typographyClass = 'text-xl md:text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100 pt-2.5 pb-0.5';
    } else if (isHeading3) {
      typographyClass = 'text-lg font-semibold text-neutral-800 dark:text-neutral-200 pt-1.5';
    } else if (isQuote) {
      typographyClass =
        'text-[14px] italic border-l-3 border-[var(--ochre-accent)] bg-amber-50/40 dark:bg-amber-950/25 pl-3 py-1 my-0.5 text-neutral-700 dark:text-neutral-300 rounded-r';
    } else if (isTaskCompleted) {
      typographyClass = 'text-[14px] line-through text-neutral-400 dark:text-neutral-500';
    }

    const renderInlineFormatted = (text: string) => {
      if (!text) return <span className="inline-block min-w-1">&nbsp;</span>;

      const regex = /(\[\[.*?\]\]|#[\w\d_-]+|\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
      const parts = text.split(regex);

      return parts.map((part, i) => {
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
      <div className="group relative flex flex-col">
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
                if (isReadOnly) return;
                const offset = getClickCharOffset(e, cleanText, rawPrefixLen);
                onFocusLine(idx, offset);
              }}
              className={`w-full cursor-text transition-colors rounded-xs hover:bg-black/[0.02] dark:hover:bg-white/[0.02] touch-manipulation ${typographyClass}`}
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
          <div className="ml-7 my-1.5 p-2 bg-white dark:bg-[#1E1F23] rounded-lg shadow-xl border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-2 z-30 animate-in fade-in duration-100">
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

        {/* Interactive YouTube Preview Embed */}
        {ytId && (
          <div className="my-2 p-3 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1D1F23] max-w-xl">
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

export const LiveEditorPane: React.FC<LiveEditorPaneProps> = ({
  content,
  onChange,
  isReadOnly = false,
  onToggleTask,
  onWikilinkClick,
  onTagClick,
  noteTitle,
  onRenameNote,
  showToolbar: propShowToolbar,
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

  // Due Date popover picker state
  const [datePickerLine, setDatePickerLine] = useState<number | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState<string>('');

  // Rename Note Modal state
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');

  // YouTube embed vs link preference per URL
  const [ytDisplayModes, setYtDisplayModes] = useState<Record<string, YouTubeDisplayMode>>({});

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

  // Synchronous layout-phase cursor positioning (zero 15ms timer race, zero cursor jumpback!)
  useLayoutEffect(() => {
    const pending = pendingCursorRef.current;
    if (!pending || focusedLineIndex !== pending.line) return;
    const el = activeTextareaRef.current;
    if (el) {
      el.focus({ preventScroll: false });
      const pos = Math.max(0, Math.min(el.value.length, pending.pos));
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
      resizeTextarea(el);
    }
    pendingCursorRef.current = null;
  }, [focusedLineIndex, draftLines]);

  // Translate vertical mouse wheel into horizontal scroll on toolbar without scrolling page
  useEffect(() => {
    const el = toolbarScrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 1.2;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
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

    // If same line is already active, apply cursor immediately without waiting for effect
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
    }, 100);
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
    [commitLines, focusLineAt]
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
    <div className="flex-1 h-full flex flex-col bg-[#FBFBFA] dark:bg-[#18191B] overflow-hidden select-text relative">
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
          className="border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA]/95 dark:bg-[#1D1F23]/95 shrink-0 select-none animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <div
              ref={toolbarScrollRef}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x flex-1 py-0.5 px-1"
            >
              {toolbarButtons.map((btn, index) => {
                if (btn.type === 'divider') {
                  return <div key={index} className="w-px h-5 bg-[#E5E3DC] dark:bg-[#2F3136] mx-0.5 shrink-0" />;
                }

                return (
                  <div key={btn.id} className="relative group shrink-0">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={btn.action}
                      onMouseEnter={() => setActiveTooltip(btn.id!)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:border-[var(--ochre-accent)] hover:text-[var(--ochre-accent)] active:scale-95 transition-all cursor-pointer touch-manipulation"
                      aria-label={btn.label}
                    >
                      {btn.icon}
                    </button>

                    {activeTooltip === btn.id && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-neutral-900 text-white text-[10px] whitespace-nowrap shadow-lg z-50 pointer-events-none">
                        <span>{btn.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Fluid Document Canvas (Obsidian Live Preview Style) */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget && !isReadOnly) {
            focusLineAt(draftLines.length - 1);
          }
        }}
        className="flex-1 relative overflow-y-auto px-4 md:px-12 py-6 cursor-text"
      >
        <div className="max-w-3xl mx-auto space-y-1 min-h-[400px]">
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
              onWikilinkClick={onWikilinkClick}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      </div>

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
};
