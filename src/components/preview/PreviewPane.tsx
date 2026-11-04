import React, { useState } from 'react';
import { 
  parseMarkdown, 
  parseInlineTokens, 
  ParsedBlock, 
  InlineToken 
} from '../../services/markdownParser';
import { 
  Check, 
  Copy, 
  ExternalLink, 
  Play, 
  Tv, 
  Link as LinkIcon, 
  Calendar, 
  AlertCircle, 
  Info, 
  Lightbulb, 
  Terminal,
  Clock
} from 'lucide-react';
import { YouTubeDisplayMode } from '../../types';

interface PreviewPaneProps {
  content: string;
  onToggleTask?: (lineIndex: number, completed: boolean) => void;
  onWikilinkClick?: (target: string) => void;
  onTagClick?: (tag: string) => void;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  content,
  onToggleTask,
  onWikilinkClick,
  onTagClick,
}) => {
  // Store display mode per video URL/Id
  const [videoModes, setVideoModes] = useState<Record<string, YouTubeDisplayMode>>({});
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const blocks = parseMarkdown(content);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Render inline token elements
  const renderInline = (tokens: InlineToken[]) => {
    return tokens.map((token, idx) => {
      switch (token.type) {
        case 'bold':
          return <strong key={idx} className="font-semibold text-neutral-900 dark:text-neutral-100">{token.value}</strong>;
        case 'italic':
          return <em key={idx} className="italic text-neutral-800 dark:text-neutral-200">{token.value}</em>;
        case 'code':
          return (
            <code key={idx} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[12px] text-amber-700 dark:text-amber-400 border border-neutral-200 dark:border-neutral-700">
              {token.value}
            </code>
          );
        case 'wikilink':
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onWikilinkClick && onWikilinkClick(token.target || token.value)}
              className="inline-flex items-center gap-0.5 text-[#C87D20] dark:text-[#E09228] underline underline-offset-2 hover:text-[#9e5e11] dark:hover:text-[#f3a436] font-medium cursor-pointer"
              title={`Öffne verknüpfte Notiz: [[${token.target || token.value}]]`}
            >
              <span>[[{token.value}]]</span>
            </button>
          );
        case 'tag':
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onTagClick && onTagClick(token.value.replace(/^#/, ''))}
              className="inline-flex items-center text-xs font-mono text-amber-700 dark:text-amber-400 hover:underline mr-1"
            >
              {token.value}
            </button>
          );
        case 'dueDate':
          return (
            <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 ml-1">
              <Calendar className="w-3 h-3" />
              <span>{token.value}</span>
            </span>
          );
        case 'completedTag':
          return (
            <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 ml-1">
              <Check className="w-3 h-3" />
              <span>{token.value}</span>
            </span>
          );
        case 'priority':
          return (
            <span key={idx} className="text-xs ml-1 font-bold" title="Priorität">
              {token.value}
            </span>
          );
        case 'link':
          return (
            <a
              key={idx}
              href={token.target}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C87D20] underline underline-offset-2 hover:text-[#9e5e11] inline-flex items-center gap-0.5"
            >
              <span>{token.value}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          );
        default:
          return <span key={idx}>{token.value}</span>;
      }
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 bg-[#FBFBFA] dark:bg-[#18191B] text-neutral-800 dark:text-neutral-200 print:p-0 print:bg-white print:text-black">
      <div className="max-w-3xl mx-auto space-y-4 print:max-w-none print:space-y-3">
        {blocks.map((block, idx) => {
          switch (block.type) {
            case 'heading': {
              const tokens = parseInlineTokens(block.content || '');
              if (block.level === 1) {
                return (
                  <h1 key={idx} className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white pt-2 pb-1 border-b border-[#E5E3DC] dark:border-[#2F3136]">
                    {renderInline(tokens)}
                  </h1>
                );
              }
              if (block.level === 2) {
                return (
                  <h2 key={idx} className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white pt-3 pb-1 border-b border-[#E5E3DC]/60 dark:border-[#2F3136]/60">
                    {renderInline(tokens)}
                  </h2>
                );
              }
              if (block.level === 3) {
                return (
                  <h3 key={idx} className="text-lg font-semibold text-neutral-900 dark:text-white pt-2">
                    {renderInline(tokens)}
                  </h3>
                );
              }
              return (
                <h4 key={idx} className="text-base font-semibold text-neutral-900 dark:text-white pt-1">
                  {renderInline(tokens)}
                </h4>
              );
            }

            case 'task': {
              const tokens = parseInlineTokens(block.content || '');
              const completed = !!block.taskCompleted;
              const lineIndex = block.taskLineIndex ?? 0;

              return (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 py-1 px-1 rounded hover:bg-neutral-100/50 dark:hover:bg-neutral-800/40 transition-colors group"
                >
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={() => onToggleTask && onToggleTask(lineIndex, !completed)}
                    className="mt-1 w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-[#C87D20] focus:ring-[#C87D20] cursor-pointer accent-[#C87D20]"
                  />
                  <div className={`flex-1 text-sm leading-relaxed ${completed ? 'line-through text-neutral-400 dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-200'}`}>
                    {renderInline(tokens)}
                  </div>
                </div>
              );
            }

            case 'callout': {
              const type = (block.calloutType || 'NOTE').toUpperCase();
              let icon = <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
              let borderColor = 'border-blue-300 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20';

              if (type === 'WARNING') {
                icon = <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
                borderColor = 'border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20';
              } else if (type === 'TIP') {
                icon = <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
                borderColor = 'border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20';
              } else if (type === 'COMMAND') {
                icon = <Terminal className="w-4 h-4 text-[#C87D20]" />;
                borderColor = 'border-amber-300 dark:border-amber-900/60 bg-[#F4F3EF] dark:bg-[#1F2125]';
              }

              return (
                <div key={idx} className={`p-3.5 rounded-lg border ${borderColor} my-2`}>
                  <div className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase mb-1">
                    {icon}
                    <span>{block.calloutTitle || type}</span>
                  </div>
                  <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap pl-6">
                    {block.content}
                  </div>
                </div>
              );
            }

            case 'table': {
              return (
                <div key={idx} className="overflow-x-auto my-3 border border-[#E5E3DC] dark:border-[#2F3136] rounded-lg">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#F4F3EF] dark:bg-[#202225] border-b border-[#E5E3DC] dark:border-[#2F3136]">
                      <tr>
                        {block.tableHeaders?.map((h, hIdx) => (
                          <th key={hIdx} className="px-3 py-2 font-semibold text-neutral-800 dark:text-neutral-200">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E3DC] dark:divide-[#2F3136]">
                      {block.tableRows?.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-2 font-mono text-[12px] text-neutral-700 dark:text-neutral-300">
                              {renderInline(parseInlineTokens(cell))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            case 'code': {
              const codeId = `code_${idx}`;
              return (
                <div key={idx} className="rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#1E1E20] text-neutral-100 overflow-hidden my-3">
                  <div className="px-3 py-1.5 bg-[#18181A] border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400 font-mono">
                    <span>{block.lang || 'code'}</span>
                    <button
                      onClick={() => copyToClipboard(block.content || '', codeId)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
                      title="Befehl in Zwischenablage kopieren"
                    >
                      {copiedCodeId === codeId ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-[11px] text-emerald-400">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[11px]">Kopieren</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed">
                    <code>{block.content}</code>
                  </pre>
                </div>
              );
            }

            case 'youtube': {
              const ytId = block.youtubeId || '';
              const mode = videoModes[ytId] || 'player';

              return (
                <div key={idx} className="my-4 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF]/60 dark:bg-[#1E2024]/60">
                  {/* Mode Slider / Segmented Control */}
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#E5E3DC]/60 dark:border-[#2F3136]/60">
                    <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-red-600" />
                      <span>YouTube Video</span>
                    </span>

                    <div className="flex items-center gap-1 p-0.5 bg-neutral-200/80 dark:bg-neutral-800 rounded-md text-[11px]">
                      <button
                        type="button"
                        onClick={() => setVideoModes((prev) => ({ ...prev, [ytId]: 'player' }))}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          mode === 'player'
                            ? 'bg-white dark:bg-neutral-900 text-[#C87D20] font-medium shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                        }`}
                        title="Vollwertiger abspielbarer Player"
                      >
                        Player
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoModes((prev) => ({ ...prev, [ytId]: 'card' }))}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          mode === 'card'
                            ? 'bg-white dark:bg-neutral-900 text-[#C87D20] font-medium shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                        }`}
                        title="Thumbnail-Vorschaukarte"
                      >
                        Vorschaukarte
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoModes((prev) => ({ ...prev, [ytId]: 'link' }))}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          mode === 'link'
                            ? 'bg-white dark:bg-neutral-900 text-[#C87D20] font-medium shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                        }`}
                        title="Schlichter Textlink"
                      >
                        Nur Link
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: Interactive Player */}
                  {mode === 'player' && (
                    <div className="relative aspect-video rounded-md overflow-hidden bg-black shadow-xs">
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    </div>
                  )}

                  {/* Mode 2: Card Preview */}
                  {mode === 'card' && (
                    <div className="flex flex-col sm:flex-row items-center gap-3 p-2 bg-white dark:bg-[#161719] rounded-md border border-[#E5E3DC] dark:border-[#2F3136]">
                      <div className="relative w-full sm:w-44 aspect-video rounded overflow-hidden bg-neutral-900 shrink-0">
                        <img
                          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                          alt="Video Thumbnail"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => setVideoModes((prev) => ({ ...prev, [ytId]: 'player' }))}
                          className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg cursor-pointer"
                          title="Jetzt im Player abspielen"
                        >
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0 py-1 text-center sm:text-left">
                        <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block truncate">
                          YouTube Video ({ytId})
                        </span>
                        <a
                          href={`https://www.youtube.com/watch?v=${ytId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#C87D20] hover:underline inline-flex items-center gap-1 mt-1"
                        >
                          <span>Auf YouTube öffnen</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Mode 3: Text Link */}
                  {mode === 'link' && (
                    <div className="p-2 flex items-center gap-2 text-xs">
                      <LinkIcon className="w-4 h-4 text-[#C87D20]" />
                      <a
                        href={block.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#C87D20] underline hover:text-[#9e5e11] truncate"
                      >
                        {block.youtubeUrl}
                      </a>
                    </div>
                  )}
                </div>
              );
            }

            case 'hr': {
              return <hr key={idx} className="my-6 border-[#E5E3DC] dark:border-[#2F3136]" />;
            }

            default: {
              const tokens = parseInlineTokens(block.content || '');
              return (
                <p key={idx} className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                  {renderInline(tokens)}
                </p>
              );
            }
          }
        })}
      </div>
    </div>
  );
};
