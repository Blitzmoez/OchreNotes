import React, { useRef, useState, useEffect } from 'react';
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
  Table, 
  Code, 
  Youtube, 
  Lock,
  Save,
  Clock
} from 'lucide-react';

interface EditorPaneProps {
  content: string;
  onChange: (newContent: string) => void;
  isReadOnly?: boolean;
  onSave?: () => void;
  lastSaved?: number;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  content,
  onChange,
  isReadOnly = false,
  onSave,
  lastSaved,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Helper to insert markdown syntax at selection or line
  const insertSyntax = (prefix: string, suffix = '', placeholder = '') => {
    if (isReadOnly || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);

    const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}${placeholder}${suffix}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    onChange(newContent);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected ? selected.length : placeholder.length)
      );
    }, 10);
  };

  // Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+S)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        insertSyntax('**', '**', 'fetter Text');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        insertSyntax('*', '*', 'kursiver Text');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (onSave) onSave();
      }
    }
  };

  // Calculate words and characters
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const lineCount = content.split('\n').length;

  const todayStr = new Date().toISOString().split('T')[0];

  const toolbarButtons = [
    {
      id: 'h1',
      icon: <Heading1 className="w-3.5 h-3.5" />,
      label: 'Überschrift 1',
      cmd: '# Überschrift 1',
      action: () => insertSyntax('# ', '', 'Titel'),
    },
    {
      id: 'h2',
      icon: <Heading2 className="w-3.5 h-3.5" />,
      label: 'Überschrift 2',
      cmd: '## Überschrift 2',
      action: () => insertSyntax('## ', '', 'Unterabschnitt'),
    },
    {
      id: 'h3',
      icon: <Heading3 className="w-3.5 h-3.5" />,
      label: 'Überschrift 3',
      cmd: '### Überschrift 3',
      action: () => insertSyntax('### ', '', 'Thema'),
    },
    { type: 'divider' },
    {
      id: 'bold',
      icon: <Bold className="w-3.5 h-3.5" />,
      label: 'Fett',
      cmd: '**Fett** (Strg+B)',
      action: () => insertSyntax('**', '**', 'wichtiger Text'),
    },
    {
      id: 'italic',
      icon: <Italic className="w-3.5 h-3.5" />,
      label: 'Kursiv',
      cmd: '*Kursiv* (Strg+I)',
      action: () => insertSyntax('*', '*', 'betonter Text'),
    },
    {
      id: 'strike',
      icon: <Strikethrough className="w-3.5 h-3.5" />,
      label: 'Durchgestrichen',
      cmd: '~~Durchgestrichen~~',
      action: () => insertSyntax('~~', '~~', 'veraltet'),
    },
    { type: 'divider' },
    {
      id: 'task',
      icon: <CheckSquare className="w-3.5 h-3.5 text-[#C87D20]" />,
      label: 'Aufgabe (Task)',
      cmd: `- [ ] Aufgabe 📅 ${todayStr}`,
      action: () => insertSyntax(`- [ ] Neue Aufgabe 📅 ${todayStr} ⏫ #prio\n`),
    },
    {
      id: 'due',
      icon: <Calendar className="w-3.5 h-3.5" />,
      label: 'Fälligkeitsdatum',
      cmd: `📅 ${todayStr} oder due:${todayStr}`,
      action: () => insertSyntax(` 📅 ${todayStr}`),
    },
    {
      id: 'callout',
      icon: <MessageSquareQuote className="w-3.5 h-3.5" />,
      label: 'Obsidian Callout Box',
      cmd: '> [!NOTE] Wichtiger Hinweis',
      action: () => insertSyntax('> [!NOTE]\n> Hier steht die hervorgehobene Box.\n'),
    },
    {
      id: 'wikilink',
      icon: <Link2 className="w-3.5 h-3.5" />,
      label: 'Wikilink intern',
      cmd: '[[Notizname]]',
      action: () => insertSyntax('[[', ']]', 'Notiz-Titel'),
    },
    {
      id: 'table',
      icon: <Table className="w-3.5 h-3.5" />,
      label: 'Befehls-Tabelle / Cheat-Sheet',
      cmd: '| Befehl | Beschreibung |\n| :--- | :--- |',
      action: () => insertSyntax('\n| Befehl | Zweck | Kürzel |\n| :--- | :--- | :--- |\n| `docker compose up` | Starten | Alt+S |\n\n'),
    },
    {
      id: 'code',
      icon: <Code className="w-3.5 h-3.5" />,
      label: 'Codeblock',
      cmd: '```bash ... ```',
      action: () => insertSyntax('```bash\n', '\n```\n', 'echo "OchreNotes"'),
    },
    {
      id: 'youtube',
      icon: <Youtube className="w-3.5 h-3.5 text-red-500" />,
      label: 'YouTube Embed (mit Slider-Umschalter)',
      cmd: 'https://www.youtube.com/watch?v=VIDEO_ID',
      action: () => insertSyntax('\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n'),
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#161719] overflow-hidden select-text">
      {/* Read-only banner if shared with read permissions */}
      {isReadOnly && (
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Diese Notiz ist schreibgeschützt (nur Leserechte freigegeben).</span>
        </div>
      )}

      {/* Formatting Toolbar */}
      {!isReadOnly && (
        <div className="px-2 py-1.5 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1D1F23] flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          {toolbarButtons.map((btn, index) => {
            if (btn.type === 'divider') {
              return <div key={index} className="w-px h-4 bg-[#E5E3DC] dark:border-[#2F3136] mx-1 shrink-0" />;
            }

            return (
              <div key={btn.id} className="relative group shrink-0">
                <button
                  type="button"
                  onClick={btn.action}
                  onMouseEnter={() => setActiveTooltip(btn.id!)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="p-1.5 rounded text-neutral-600 dark:text-neutral-300 hover:bg-[#EAE8E1] dark:hover:bg-[#2A2C31] hover:text-[#C87D20] transition-colors"
                  aria-label={btn.label}
                >
                  {btn.icon}
                </button>

                {/* Markdown Command Syntax Tooltip */}
                {activeTooltip === btn.id && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-neutral-900 text-white text-[10px] whitespace-nowrap shadow-lg z-50 pointer-events-none flex flex-col items-center">
                    <span className="font-semibold">{btn.label}</span>
                    <span className="font-mono text-amber-300 text-[9px] mt-0.5">{btn.cmd}</span>
                    <div className="w-2 h-2 bg-neutral-900 rotate-45 absolute -top-1 left-1/2 -translate-x-1/2" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Textarea Area */}
      <div className="flex-1 relative overflow-hidden flex">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={isReadOnly}
          placeholder="Schreibe deine Gedanken, Aufgaben mit - [ ] oder formatiere in reinem Markdown..."
          spellCheck={false}
          className="w-full h-full p-4 resize-none outline-hidden font-mono text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-200 bg-transparent selection:bg-amber-200 dark:selection:bg-amber-900/40"
        />
      </div>

      {/* Status Bar */}
      <div className="h-7 px-3 border-t border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#1A1B1E] flex items-center justify-between text-[11px] text-neutral-400 select-none shrink-0">
        <div className="flex items-center gap-3">
          <span className="tabular-nums">{lineCount} Zeilen</span>
          <span>·</span>
          <span className="tabular-nums">{wordCount} Wörter</span>
          <span>·</span>
          <span className="tabular-nums">{charCount} Zeichen</span>
        </div>

        <div className="flex items-center gap-2">
          {lastSaved && (
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Clock className="w-3 h-3" />
              <span>Gespeichert</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
