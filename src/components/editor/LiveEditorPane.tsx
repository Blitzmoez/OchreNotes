import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  ChevronUp,
  ChevronDown,
  Layers,
  X,
  Play,
  ExternalLink,
  Edit3
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

export const LiveEditorPane: React.FC<LiveEditorPaneProps> = ({
  content,
  onChange,
  isReadOnly = false,
  onSave,
  lastSaved,
  onToggleTask,
  onWikilinkClick,
  onTagClick,
  noteTitle,
  onRenameNote,
  showToolbar: propShowToolbar,
  onToggleToolbar,
  openNoteTabs = [],
  activeTabPath,
  onSelectTab,
  onAddTab,
  onCloseTab,
}) => {
  // Collapsible classic formatting toolbar (internal fallback if not controlled)
  const [internalShowToolbar, setInternalShowToolbar] = useState<boolean>(true);
  const showToolbar = propShowToolbar !== undefined ? propShowToolbar : internalShowToolbar;
  const toggleToolbar = onToggleToolbar || (() => setInternalShowToolbar((prev) => !prev));

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Active line cursor tracking
  const [focusedLineIndex, setFocusedLineIndex] = useState<number | null>(null);

  // Due Date popover picker state
  const [datePickerLine, setDatePickerLine] = useState<number | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState<string>('');

  // Rename Note Modal state
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');

  // YouTube embed vs link preference per URL
  const [ytDisplayModes, setYtDisplayModes] = useState<Record<string, YouTubeDisplayMode>>({});

  // Line textareas refs
  const lineRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // Toolbar horizontal scroll ref for mouse wheel redirection
  const toolbarScrollRef = useRef<HTMLDivElement>(null);

  // Split document into lines
  const lines = content.length > 0 ? content.split('\n') : [''];

  // Keep refs array in sync
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, lines.length);
  }, [lines.length]);

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

  // Auto-resize textarea height to fit content
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Focus a specific line and position cursor
  const focusLineAt = (index: number, cursorPosition?: number) => {
    const safeIdx = Math.max(0, Math.min(lines.length - 1, index));
    setFocusedLineIndex(safeIdx);
    setTimeout(() => {
      const el = lineRefs.current[safeIdx];
      if (el) {
        el.focus();
        const pos = cursorPosition !== undefined ? cursorPosition : el.value.length;
        el.setSelectionRange(pos, pos);
        autoResize(el);
      }
    }, 15);
  };

  // Update a single line in the markdown document
  const updateLine = (index: number, newText: string) => {
    const updated = [...lines];
    updated[index] = newText;
    onChange(updated.join('\n'));
  };

  // Helper: Extract YouTube video ID
  const getYouTubeId = (text: string): string | null => {
    const match = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  // Set due date on a task line (e.g. `📅 YYYY-MM-DD`)
  const handleSetDueDate = (index: number, dateStr: string) => {
    const current = lines[index];
    let updated = current.replace(/📅\s*\d{4}-\d{2}-\d{2}/, '').trimEnd();
    if (dateStr) {
      updated = `${updated} 📅 ${dateStr}`;
    }
    updateLine(index, updated);
    setDatePickerLine(null);
  };

  // Key Down Handler for seamless document flow
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const el = e.currentTarget;
    const cursor = el.selectionStart ?? el.value.length;
    const currentVal = el.value;

    // 1. ENTER KEY: Fluid line splitting and list continuation
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const beforeCursor = currentVal.substring(0, cursor);
      const afterCursor = currentVal.substring(cursor);

      // Determine prefixes
      const taskMatch = beforeCursor.match(/^([ \t]*)- \[([ xX])\][ ](.*)$/);
      const bulletMatch = beforeCursor.match(/^([ \t]*[-*])[ ](.*)$/);
      const numMatch = beforeCursor.match(/^([ \t]*)(\d+)\.[ ](.*)$/);
      const quoteMatch = beforeCursor.match(/^([ \t]*>[ ]?)(.*)$/);

      let nextPrefix = '';

      if (taskMatch) {
        if (taskMatch[3].trim() === '' && afterCursor.trim() === '') {
          // Empty task line: convert to blank line
          const updated = [...lines];
          updated[index] = '';
          onChange(updated.join('\n'));
          focusLineAt(index, 0);
          return;
        }
        nextPrefix = '- [ ] ';
      } else if (bulletMatch) {
        if (bulletMatch[2].trim() === '' && afterCursor.trim() === '') {
          // Empty bullet line: convert to blank line
          const updated = [...lines];
          updated[index] = '';
          onChange(updated.join('\n'));
          focusLineAt(index, 0);
          return;
        }
        nextPrefix = `${bulletMatch[1]} `;
      } else if (numMatch) {
        if (numMatch[3].trim() === '' && afterCursor.trim() === '') {
          // Empty numbered line: convert to blank line
          const updated = [...lines];
          updated[index] = '';
          onChange(updated.join('\n'));
          focusLineAt(index, 0);
          return;
        }
        const nextNum = parseInt(numMatch[2], 10) + 1;
        nextPrefix = `${numMatch[1]}${nextNum}. `;
      } else if (quoteMatch && quoteMatch[2].trim() !== '') {
        nextPrefix = quoteMatch[1];
      }

      const updated = [...lines];
      updated[index] = beforeCursor;
      updated.splice(index + 1, 0, nextPrefix + afterCursor);
      onChange(updated.join('\n'));
      focusLineAt(index + 1, nextPrefix.length);
      return;
    }

    // 2. BACKSPACE: Line Merging & Prefix Removal
    if (e.key === 'Backspace') {
      // If at start of line (cursor 0) and not the very first line: merge with previous line
      if (cursor === 0 && index > 0) {
        e.preventDefault();
        const prevLine = lines[index - 1];
        const prevLen = prevLine.length;
        const updated = [...lines];
        updated[index - 1] = prevLine + currentVal;
        updated.splice(index, 1);
        onChange(updated.join('\n'));
        focusLineAt(index - 1, prevLen);
        return;
      }

      // If on an empty command prefix (e.g. "- ", "## ", "- [ ] "): backspace removes prefix
      if (currentVal.match(/^[ \t]*[-*][ ]$/) || currentVal.match(/^[ \t]*- \[[ ]\][ ]$/) || currentVal.match(/^#{1,4}[ ]$/)) {
        e.preventDefault();
        updateLine(index, '');
        return;
      }
    }

    // 3. ARROW UP / DOWN: Fluid cursor navigation between lines
    if (e.key === 'ArrowUp' && index > 0) {
      if (cursor === 0 || el.selectionStart === 0) {
        e.preventDefault();
        focusLineAt(index - 1, lines[index - 1].length);
      }
    } else if (e.key === 'ArrowDown' && index < lines.length - 1) {
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
  };

  // Handle multi-line paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, index: number) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('\n')) {
      e.preventDefault();
      const el = e.currentTarget;
      const cursor = el.selectionStart ?? 0;
      const before = el.value.substring(0, cursor);
      const after = el.value.substring(cursor);

      const pasteLines = text.split('\n');
      const firstLine = before + pasteLines[0];
      const lastLine = pasteLines[pasteLines.length - 1] + after;
      const middleLines = pasteLines.slice(1, -1);

      const updated = [...lines];
      updated.splice(index, 1, firstLine, ...middleLines, lastLine);
      onChange(updated.join('\n'));
      focusLineAt(index + pasteLines.length - 1, pasteLines[pasteLines.length - 1].length);
    }
  };

  // Helper: Format inline elements (bold, italic, tags, wikilinks)
  const renderInlineFormatted = (rawText: string) => {
    if (!rawText) return <span className="inline-block min-w-1">&nbsp;</span>;

    // Split by markdown inline tokens: wikilinks [[...]], tags #word, bold **...**, code `...`
    const regex = /(\[\[.*?\]\]|#[\w\d_-]+|\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
    const parts = rawText.split(regex);

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
            className="text-[#C87D20] dark:text-[#E09228] underline decoration-[#C87D20]/40 font-medium cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-950/40 px-0.5 rounded"
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
            className="inline-flex items-center text-xs px-1.5 py-0.2 rounded bg-amber-500/15 text-[#C87D20] dark:text-[#E09228] font-medium cursor-pointer hover:bg-amber-500/25 mx-0.5"
          >
            #{tag}
          </span>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return <strong key={i} className="font-bold text-neutral-900 dark:text-neutral-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return <em key={i} className="italic text-neutral-800 dark:text-neutral-200">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return <code key={i} className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800 text-amber-700 dark:text-amber-400 font-mono text-xs">{part.slice(1, -1)}</code>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Formatting Toolbar Buttons
  const applyPrefix = (prefix: string) => {
    const idx = focusedLineIndex !== null ? focusedLineIndex : lines.length - 1;
    const current = lines[idx] || '';
    updateLine(idx, `${prefix}${current.replace(/^(#{1,6}|-\s\[[ xX]\]|-\s|\*\s|>\s)\s*/, '')}`);
    focusLineAt(idx);
  };

  const applySurround = (prefix: string, suffix: string) => {
    const idx = focusedLineIndex !== null ? focusedLineIndex : lines.length - 1;
    const current = lines[idx] || '';
    updateLine(idx, `${current} ${prefix}Text${suffix}`);
    focusLineAt(idx);
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
    { id: 'task', label: 'Aufgabe (- [ ])', icon: <CheckSquare className="w-4 h-4 text-[#C87D20]" />, action: () => applyPrefix('- [ ] ') },
    { id: 'quote', label: 'Zitat (> )', icon: <MessageSquareQuote className="w-4 h-4" />, action: () => applyPrefix('> ') },
    { id: 'link', label: 'Wikilink ([[...]])', icon: <Link2 className="w-4 h-4 text-[#C87D20]" />, action: () => applySurround('[[', ']]') },
    { id: 'code', label: 'Code', icon: <Code className="w-4 h-4" />, action: () => applySurround('`', '`') },
    { 
      id: 'youtube', 
      label: 'YouTube Video einfügen', 
      icon: <Youtube className="w-4 h-4 text-red-500" />, 
      action: () => {
        const url = prompt('YouTube URL eingeben (z.B. https://www.youtube.com/watch?v=...):');
        if (url) {
          const idx = focusedLineIndex !== null ? focusedLineIndex : lines.length - 1;
          const current = lines[idx] || '';
          updateLine(idx, current ? `${current}\n${url}` : url);
        }
      }
    },
    { 
      id: 'rename', 
      label: 'Notiz umbenennen', 
      icon: <Edit3 className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />, 
      action: () => {
        setNewTitleInput(noteTitle ? noteTitle.replace(/\.md$/, '') : '');
        setIsRenameModalOpen(true);
      }
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
                    ? 'bg-white dark:bg-[#25272C] text-[#C87D20] dark:text-[#E09228] shadow-2xs font-semibold'
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
                      onClick={btn.action}
                      onMouseEnter={() => setActiveTooltip(btn.id!)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:border-[#C87D20] hover:text-[#C87D20] active:scale-95 transition-all cursor-pointer"
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

            {/* Collapse Toolbar Button */}
            <button
              type="button"
              onClick={toggleToolbar}
              className="w-8 h-8 rounded-full bg-white dark:bg-[#25272C] border border-[#E5E3DC] dark:border-[#2F3136] shadow-2xs flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 ml-1.5 shrink-0 cursor-pointer"
              title="Werkzeuge einklappen"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Fluid Document Canvas (Obsidian Live Preview Style) */}
      <div 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            focusLineAt(lines.length - 1);
          }
        }}
        className="flex-1 relative overflow-y-auto px-4 md:px-12 py-6 cursor-text"
      >
        <div className="max-w-3xl mx-auto space-y-1 min-h-[400px]">
          {lines.map((rawLine, idx) => {
            const isActive = focusedLineIndex === idx;

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

            // Clean text without the markdown command prefix (for rendered view)
            let cleanText = rawLine;
            if (isHeading1) cleanText = rawLine.replace(/^#\s*/, '');
            else if (isHeading2) cleanText = rawLine.replace(/^##\s*/, '');
            else if (isHeading3) cleanText = rawLine.replace(/^###\s*/, '');
            else if (isQuote) cleanText = rawLine.replace(/^>\s*/, '');
            else if (taskMatch) cleanText = taskMatch[3];
            else if (isBullet) cleanText = rawLine.replace(/^[ \t]*[-*]\s*/, '');
            else if (isNumbered) cleanText = rawLine.replace(/^[ \t]*\d+\.\s*/, '');

            // Dynamic typography class matching heading styles
            let typographyClass = 'text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200';
            if (isHeading1) {
              typographyClass = 'text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 pt-3 pb-1';
            } else if (isHeading2) {
              typographyClass = 'text-xl md:text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100 pt-2.5 pb-0.5';
            } else if (isHeading3) {
              typographyClass = 'text-lg font-semibold text-neutral-800 dark:text-neutral-200 pt-1.5';
            } else if (isQuote) {
              typographyClass = 'text-[14px] italic border-l-3 border-[#C87D20] bg-amber-50/40 dark:bg-amber-950/25 pl-3 py-1 my-0.5 text-neutral-700 dark:text-neutral-300 rounded-r';
            } else if (isTaskCompleted) {
              typographyClass = 'text-[14px] line-through text-neutral-400 dark:text-neutral-500';
            }

            return (
              <div key={idx} className="group relative flex flex-col">
                <div className="flex items-start gap-2">
                  {/* Task Checkbox & Calendar Due Date Button */}
                  {isTask && (
                    <div className="flex items-center gap-1.5 pt-1 shrink-0 select-none">
                      {/* Generous touch target wrapper */}
                      <label className="relative flex items-center justify-center w-7 h-7 -my-1.5 -ml-1.5 rounded-full hover:bg-neutral-200/60 dark:hover:bg-neutral-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isTaskCompleted}
                          onChange={(e) => {
                            const completed = e.target.checked;
                            const current = lines[idx];
                            const today = new Date().toISOString().split('T')[0];
                            let updated = completed
                              ? current.replace(/^([ \t]*- \[)[ ](\])/, '$1x$2') + (current.includes('✅') ? '' : ` ✅ ${today}`)
                              : current.replace(/^([ \t]*- \[)[xX](\])/, '$1 $2').replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trimEnd();
                            updateLine(idx, updated);
                            if (onToggleTask) onToggleTask(idx, completed);
                          }}
                          className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-[#C87D20] accent-[#C87D20] cursor-pointer"
                          title="Aufgabe abhaken / aktivieren"
                        />
                      </label>

                      {/* Calendar Icon Button with touch target */}
                      <button
                        type="button"
                        onClick={() => {
                          setDatePickerLine(datePickerLine === idx ? null : idx);
                          setSelectedDueDate(new Date().toISOString().split('T')[0]);
                        }}
                        className="w-7 h-7 -my-1.5 flex items-center justify-center rounded-full text-neutral-400 hover:text-[#C87D20] hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
                        title="Fälligkeitsdatum hinzufügen / ändern"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Bullet Dot */}
                  {isBullet && (
                    <span className="text-[#C87D20] text-sm pt-1 select-none shrink-0">•</span>
                  )}

                  {/* Rendered vs. Editable Mode (Obsidian Live Preview) */}
                  {isActive ? (
                    /* ACTIVE LINE: Full editable textarea with raw markdown syntax */
                    <textarea
                      ref={(el) => {
                        lineRefs.current[idx] = el;
                        if (el) autoResize(el);
                      }}
                      value={rawLine}
                      onChange={(e) => {
                        updateLine(idx, e.target.value);
                        autoResize(e.currentTarget);
                      }}
                      onFocus={() => setFocusedLineIndex(idx)}
                      onBlur={() => {
                        // Delay blur slightly so button clicks register
                        setTimeout(() => {
                          if (focusedLineIndex === idx) setFocusedLineIndex(null);
                        }, 120);
                      }}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      onPaste={(e) => handlePaste(e, idx)}
                      readOnly={isReadOnly}
                      rows={1}
                      spellCheck={false}
                      className={`w-full bg-transparent border-0 ring-0 outline-hidden p-0 m-0 resize-none overflow-hidden font-sans ${typographyClass}`}
                      placeholder={idx === 0 && lines.length === 1 ? 'Schreibe Notizen oder Markdown (z.B. ## Überschrift)...' : ''}
                      autoFocus
                    />
                  ) : (
                    /* INACTIVE LINE: Formatted view without markdown symbols */
                    <div
                      onClick={() => focusLineAt(idx)}
                      className={`w-full cursor-text transition-colors rounded-xs hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${typographyClass}`}
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
                {datePickerLine === idx && (
                  <div className="ml-7 my-1.5 p-2 bg-white dark:bg-[#1E1F23] rounded-lg shadow-xl border border-[#E5E3DC] dark:border-[#2F3136] flex items-center gap-2 z-30 animate-in fade-in duration-100">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#C87D20]" />
                      <span>Fälligkeitsdatum:</span>
                    </span>
                    <input
                      type="date"
                      value={selectedDueDate}
                      onChange={(e) => setSelectedDueDate(e.target.value)}
                      className="text-xs px-2 py-1 rounded bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleSetDueDate(idx, selectedDueDate)}
                      className="text-xs px-2.5 py-1 rounded bg-[#C87D20] text-white font-medium hover:bg-[#b06c19]"
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatePickerLine(null)}
                      className="p-1 rounded-full text-neutral-400 hover:text-neutral-600"
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
                          onClick={() => setYtDisplayModes((prev) => ({ ...prev, [ytId]: 'player' }))}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            ytDisplayModes[ytId] !== 'link'
                              ? 'bg-white dark:bg-neutral-700 text-[#C87D20] font-medium shadow-2xs'
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          Player
                        </button>
                        <button
                          type="button"
                          onClick={() => setYtDisplayModes((prev) => ({ ...prev, [ytId]: 'link' }))}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            ytDisplayModes[ytId] === 'link'
                              ? 'bg-white dark:bg-neutral-700 text-[#C87D20] font-medium shadow-2xs'
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          Link
                        </button>
                      </div>
                    </div>

                    {ytDisplayModes[ytId] === 'link' ? (
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
          })}
        </div>
      </div>

      {/* Rename Note Modal */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1E1F23] rounded-2xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#C87D20]" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  Notiz umbenennen
                </h3>
              </div>
              <button
                onClick={() => setIsRenameModalOpen(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">
                Neuer Notiztitel:
              </label>
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
                className="w-full text-sm px-3 py-2 rounded-lg bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 outline-hidden focus:border-[#C87D20]"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#C87D20] text-white hover:bg-[#b06c19] shadow-xs"
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
