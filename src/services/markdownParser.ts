export interface ParsedBlock {
  type: 'heading' | 'paragraph' | 'task' | 'code' | 'callout' | 'table' | 'hr' | 'youtube' | 'list';
  level?: number;
  content?: string;
  raw?: string;
  lang?: string;
  // For tasks
  taskCompleted?: boolean;
  taskLineIndex?: number;
  taskDueDate?: string | null;
  taskPriority?: 'none' | 'low' | 'medium' | 'high';
  // For callouts
  calloutType?: string;
  calloutTitle?: string;
  // For YouTube
  youtubeId?: string;
  youtubeUrl?: string;
  // For tables
  tableHeaders?: string[];
  tableRows?: string[][];
  tableAlignments?: ('left' | 'center' | 'right')[];
}

// Extract YouTube ID from link
export function extractYouTubeId(url: string): string | null {
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

// Parse markdown text into structured blocks
export function parseMarkdown(markdown: string): ParsedBlock[] {
  const lines = markdown.split('\n');
  const blocks: ParsedBlock[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeBuffer: string[] = [];

  let inTable = false;
  let tableHeaderLines: string[] = [];
  let tableBodyLines: string[] = [];

  let inCallout = false;
  let calloutType = '';
  let calloutTitle = '';
  let calloutBuffer: string[] = [];

  function flushCodeBlock() {
    if (codeBuffer.length > 0) {
      blocks.push({
        type: 'code',
        lang: codeLang || 'text',
        content: codeBuffer.join('\n'),
      });
      codeBuffer = [];
      codeLang = '';
    }
  }

  function flushCallout() {
    if (calloutBuffer.length > 0 || calloutTitle) {
      blocks.push({
        type: 'callout',
        calloutType: calloutType || 'NOTE',
        calloutTitle: calloutTitle || calloutType,
        content: calloutBuffer.join('\n'),
      });
      calloutBuffer = [];
      calloutType = '';
      calloutTitle = '';
    }
  }

  function flushTable() {
    if (tableHeaderLines.length > 0) {
      const headers = tableHeaderLines[0]
        .split('|')
        .map((s) => s.trim())
        .filter((s, idx, arr) => !(idx === 0 && s === '') && !(idx === arr.length - 1 && s === ''));

      const alignments: ('left' | 'center' | 'right')[] = [];
      if (tableHeaderLines.length > 1) {
        const alignParts = tableHeaderLines[1]
          .split('|')
          .map((s) => s.trim())
          .filter((s, idx, arr) => !(idx === 0 && s === '') && !(idx === arr.length - 1 && s === ''));

        for (const p of alignParts) {
          if (p.startsWith(':') && p.endsWith(':')) alignments.push('center');
          else if (p.endsWith(':')) alignments.push('right');
          else alignments.push('left');
        }
      }

      const rows = tableBodyLines.map((row) =>
        row
          .split('|')
          .map((s) => s.trim())
          .filter((s, idx, arr) => !(idx === 0 && s === '') && !(idx === arr.length - 1 && s === ''))
      );

      blocks.push({
        type: 'table',
        tableHeaders: headers,
        tableRows: rows,
        tableAlignments: alignments,
      });

      tableHeaderLines = [];
      tableBodyLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        flushCodeBlock();
      } else {
        if (inCallout) {
          inCallout = false;
          flushCallout();
        }
        if (inTable) {
          inTable = false;
          flushTable();
        }
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Callout: > [!NOTE] or continuing >
    const calloutStartMatch = line.match(/^>[ \t]*\[!([a-zA-Z0-9_\-]+)\](.*)$/);
    if (calloutStartMatch) {
      if (inCallout) flushCallout();
      inCallout = true;
      calloutType = calloutStartMatch[1].toUpperCase();
      calloutTitle = calloutStartMatch[2].trim();
      continue;
    }

    if (inCallout) {
      if (line.startsWith('>')) {
        calloutBuffer.push(line.replace(/^>[ \t]?/, ''));
        continue;
      } else if (line.trim() === '') {
        // Empty line inside callout
        calloutBuffer.push('');
        continue;
      } else {
        // End of callout
        inCallout = false;
        flushCallout();
      }
    }

    // Table: starts with | and contains |
    if (line.trim().startsWith('|') && line.includes('|')) {
      if (!inTable) {
        inTable = true;
        tableHeaderLines.push(line);
      } else if (tableHeaderLines.length === 1) {
        tableHeaderLines.push(line); // alignment line
      } else {
        tableBodyLines.push(line);
      }
      continue;
    } else if (inTable) {
      inTable = false;
      flushTable();
    }

    // Horizontal rule --- or ***
    if (line.trim().match(/^(?:---|\*\*\*|___)$/)) {
      blocks.push({ type: 'hr' });
      continue;
    }

    // Standalone YouTube URL
    const trimmed = line.trim();
    const ytId = extractYouTubeId(trimmed);
    if (ytId && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
      blocks.push({
        type: 'youtube',
        youtubeId: ytId,
        youtubeUrl: trimmed,
      });
      continue;
    }

    // Headings # ## ###
    const headingMatch = line.match(/^(#{1,6})[ \t]+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      continue;
    }

    // Task checkbox: - [ ] or - [x]
    const taskMatch = line.match(/^[ \t]*- \[([ xX])\] (.*)$/);
    if (taskMatch) {
      const completed = taskMatch[1].toLowerCase() === 'x';
      const text = taskMatch[2];

      let dueDate: string | null = null;
      const d1 = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
      const d2 = text.match(/due:(\d{4}-\d{2}-\d{2})/i);
      const d3 = text.match(/@due\((\d{4}-\d{2}-\d{2})\)/i);
      if (d1) dueDate = d1[1];
      else if (d2) dueDate = d2[1];
      else if (d3) dueDate = d3[1];

      let priority: 'none' | 'low' | 'medium' | 'high' = 'none';
      if (text.includes('⏫') || text.match(/\b(prio:high|priority:high)\b/i)) priority = 'high';
      else if (text.includes('🔼') || text.match(/\b(prio:med|priority:med)\b/i)) priority = 'medium';
      else if (text.includes('🔽') || text.match(/\b(prio:low|priority:low)\b/i)) priority = 'low';

      blocks.push({
        type: 'task',
        taskCompleted: completed,
        taskLineIndex: i,
        content: text,
        taskDueDate: dueDate,
        taskPriority: priority,
      });
      continue;
    }

    // Regular paragraph or empty line
    if (line.trim() === '') {
      continue;
    }

    blocks.push({
      type: 'paragraph',
      content: line,
    });
  }

  // Flush remaining buffers
  if (inCodeBlock) flushCodeBlock();
  if (inCallout) flushCallout();
  if (inTable) flushTable();

  return blocks;
}

// Convert inline markdown elements (bold, italic, wikilinks, tags, code) to tokens
export interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'wikilink' | 'tag' | 'link' | 'dueDate' | 'priority' | 'completedTag';
  value: string;
  target?: string;
}

export function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Tokenize regex pattern
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|#[a-zA-Z0-9_\-\/]+|\[[^\]]+\]\([^)]+\)|📅\s*\d{4}-\d{2}-\d{2}|due:\d{4}-\d{2}-\d{2}|@due\(\d{4}-\d{2}-\d{2}\)|✅\s*\d{4}-\d{2}-\d{2}|[⏫🔼🔽])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        value: text.substring(lastIndex, match.index),
      });
    }

    const matchedStr = match[0];

    if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      tokens.push({ type: 'bold', value: matchedStr.slice(2, -2) });
    } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      tokens.push({ type: 'italic', value: matchedStr.slice(1, -1) });
    } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      tokens.push({ type: 'code', value: matchedStr.slice(1, -1) });
    } else if (matchedStr.startsWith('[[') && matchedStr.endsWith(']]')) {
      const inner = matchedStr.slice(2, -2);
      const [target, label] = inner.split('|');
      tokens.push({
        type: 'wikilink',
        target: target.trim(),
        value: (label || target).trim(),
      });
    } else if (matchedStr.startsWith('#')) {
      tokens.push({ type: 'tag', value: matchedStr });
    } else if (matchedStr.startsWith('[') && matchedStr.includes('](')) {
      const linkMatch = matchedStr.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        tokens.push({ type: 'link', value: linkMatch[1], target: linkMatch[2] });
      } else {
        tokens.push({ type: 'text', value: matchedStr });
      }
    } else if (matchedStr.includes('📅') || matchedStr.toLowerCase().startsWith('due:') || matchedStr.toLowerCase().startsWith('@due')) {
      tokens.push({ type: 'dueDate', value: matchedStr });
    } else if (matchedStr.startsWith('✅')) {
      tokens.push({ type: 'completedTag', value: matchedStr });
    } else if (['⏫', '🔼', '🔽'].includes(matchedStr)) {
      tokens.push({ type: 'priority', value: matchedStr });
    } else {
      tokens.push({ type: 'text', value: matchedStr });
    }

    lastIndex = match.index + matchedStr.length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      value: text.substring(lastIndex),
    });
  }

  return tokens;
}

export function parseMarkdownToHtml(markdown: string): string {
  const blocks = parseMarkdown(markdown);
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading': {
        const lvl = b.level || 1;
        return `<h${lvl}>${escapeHtml(b.content || '')}</h${lvl}>`;
      }
      case 'paragraph':
        return `<p>${renderInlineHtml(b.content || '')}</p>`;
      case 'task':
        return `<p class="task-line"><span class="task-box ${b.taskCompleted ? 'task-checked' : ''}">${b.taskCompleted ? '✓' : ''}</span> ${renderInlineHtml(b.content || '')}</p>`;
      case 'code':
        return `<pre><code>${escapeHtml(b.content || '')}</code></pre>`;
      case 'callout':
        return `<blockquote><strong>${escapeHtml(b.calloutTitle || 'Info')}</strong><p>${renderInlineHtml(b.content || '')}</p></blockquote>`;
      case 'hr':
        return `<hr/>`;
      case 'table': {
        const headers = (b.tableHeaders || []).map((h) => `<th>${escapeHtml(h)}</th>`).join('');
        const rows = (b.tableRows || []).map((r) => `<tr>${r.map((c) => `<td>${renderInlineHtml(c)}</td>`).join('')}</tr>`).join('');
        return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
      }
      case 'youtube':
        return `<p><a href="${escapeHtml(b.youtubeUrl || '')}">${escapeHtml(b.youtubeUrl || '')}</a></p>`;
      case 'list':
        return `<ul><li>${renderInlineHtml(b.content || '')}</li></ul>`;
      default:
        return `<p>${escapeHtml(b.content || '')}</p>`;
    }
  }).join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInlineHtml(text: string): string {
  const tokens = parseInlineTokens(text);
  return tokens.map((t) => {
    switch (t.type) {
      case 'bold':
        return `<strong>${escapeHtml(t.value)}</strong>`;
      case 'italic':
        return `<em>${escapeHtml(t.value)}</em>`;
      case 'code':
        return `<code>${escapeHtml(t.value)}</code>`;
      case 'wikilink':
        return `<u>[[${escapeHtml(t.value)}]]</u>`;
      case 'tag':
        return `<code>${escapeHtml(t.value)}</code>`;
      case 'link':
        return `<a href="${escapeHtml(t.target || '')}">${escapeHtml(t.value)}</a>`;
      case 'dueDate':
      case 'completedTag':
      case 'priority':
        return `<span style="color:#C87D20; font-weight:600;">${escapeHtml(t.value)}</span>`;
      default:
        return escapeHtml(t.value);
    }
  }).join('');
}
