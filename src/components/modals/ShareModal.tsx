import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Share2, 
  Users, 
  Send, 
  Mail, 
  MessageSquare, 
  Copy, 
  Download, 
  Check, 
  UserPlus, 
  Trash2,
  Smartphone,
  FileText,
  FileDown,
  Printer
} from 'lucide-react';
import { User, ShareRecord, WikiArticle, Recipe, SuiteModuleId } from '../../types';
import { api } from '../../services/api';
import { exportToOdt } from '../../services/odtExport';
import { PdfExportDocument, shareAsPdfFile } from '../../services/printService';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: SuiteModuleId | 'note' | 'wiki' | 'recipe' | 'project' | 'project_task';
  accentColor?: string;
  // Note mode props
  noteTitle: string;
  notePath: string;
  noteContent: string;
  // Wiki mode props
  wikiArticle?: WikiArticle | null;
  // Recipe mode props
  activeRecipe?: Recipe | null;
  recipesList?: Recipe[];
  // Generic / Module / RSS custom share props
  customTitle?: string;
  customContent?: string;
  pdfDocument?: PdfExportDocument;
  // Centralized DIN A4 Print callback
  onPrintA4?: () => void;
  printButtonLabel?: string;
  // Users
  currentUser: User;
  allUsers: User[];
}

function recipeToMarkdown(recipe: Recipe): string {
  const ingLines = recipe.ingredients.map((i) => `- ${i.name}${i.amount ? ` (${i.amount})` : ''}`).join('\n');
  const stepLines = recipe.instructions.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
  return `# ${recipe.title}\n\nKategorie: ${recipe.category} · Dauer: ${recipe.prepTimeMinutes} Min · ${recipe.portions} Portionen\n\n> ${recipe.description}\n\n## Zutaten\n${ingLines}\n\n## Zubereitung\n${stepLines}\n`;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  mode = 'note',
  accentColor = '#C87D20',
  noteTitle,
  notePath,
  noteContent,
  wikiArticle,
  activeRecipe,
  recipesList = [],
  customTitle,
  customContent,
  pdfDocument,
  onPrintA4,
  printButtonLabel,
  currentUser,
  allUsers,
}) => {
  const hasCustomExport = Boolean(customTitle && customContent);
  const supportsInApp =
    !hasCustomExport &&
    (mode === 'note' || mode === 'notes' || mode === 'wiki' || mode === 'recipe' || mode === 'recipes');
  const normalizedInAppMode: 'note' | 'wiki' | 'recipe' | 'other' =
    hasCustomExport
      ? 'other'
      : mode === 'wiki'
      ? 'wiki'
      : mode === 'recipe' || mode === 'recipes'
      ? 'recipe'
      : mode === 'note' || mode === 'notes'
      ? 'note'
      : 'other';

  const [activeTab, setActiveTab] = useState<'inapp' | 'external'>(supportsInApp ? 'inapp' : 'external');
  const [existingShares, setExistingShares] = useState<ShareRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');

  // Available recipients (exclude current user)
  const availableUsers = allUsers.filter((u) => u.id !== currentUser.id);

  // Sync selected recipe & default tab when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setShareFeedback(null);
    setPdfFeedback(null);
    setActiveTab(supportsInApp ? 'inapp' : 'external');
    if (normalizedInAppMode === 'recipe') {
      setSelectedRecipeId(activeRecipe?.id || recipesList[0]?.id || '');
    }
  }, [isOpen, supportsInApp, normalizedInAppMode, activeRecipe, recipesList]);

  // Load existing shares for note mode
  useEffect(() => {
    if (isOpen && (mode === 'note' || mode === 'notes') && notePath) {
      api.fetchSharesForNote(currentUser.username, notePath).then(setExistingShares);
    }
  }, [isOpen, mode, notePath, currentUser.username]);

  const targetRecipe = useMemo(() => {
    if (normalizedInAppMode !== 'recipe') return null;
    if (selectedRecipeId) {
      return recipesList.find((r) => r.id === selectedRecipeId) || activeRecipe || recipesList[0] || null;
    }
    return activeRecipe || recipesList[0] || null;
  }, [normalizedInAppMode, selectedRecipeId, recipesList, activeRecipe]);

  if (!isOpen) return null;

  const displayTitle =
    hasCustomExport
      ? customTitle || 'Ochre Suite Export'
      : mode === 'wiki'
      ? wikiArticle?.title || 'Wiki-Artikel'
      : normalizedInAppMode === 'recipe'
      ? targetRecipe?.title || 'Rezept'
      : mode === 'note' || mode === 'notes'
      ? noteTitle || 'Notiz'
      : customTitle || 'Ochre Suite Export';

  const displayContent =
    hasCustomExport
      ? customContent || ''
      : mode === 'wiki'
      ? wikiArticle?.rawMarkdown || `# ${wikiArticle?.title || ''}\n\n${wikiArticle?.body || ''}`
      : normalizedInAppMode === 'recipe'
      ? targetRecipe
        ? recipeToMarkdown(targetRecipe)
        : ''
      : mode === 'note' || mode === 'notes'
      ? noteContent
      : customContent || '';

  const modalTitlePrefix =
    mode === 'wiki'
      ? 'Wiki-Artikel teilen'
      : normalizedInAppMode === 'recipe'
      ? 'Rezept teilen'
      : mode === 'recipes'
      ? 'Essensplan teilen'
      : mode === 'note' || mode === 'notes'
      ? 'Notiz teilen'
      : mode === 'project_task'
      ? 'Aufgabe teilen'
      : mode === 'projects' || mode === 'project'
      ? 'Projekt teilen'
      : mode === 'finance'
      ? 'Finanzen teilen'
      : mode === 'smarthome'
      ? 'Smarthome teilen'
      : mode === 'rss'
      ? 'Artikel teilen'
      : mode === 'dashboard'
      ? 'Dashboard teilen'
      : 'Inhalt teilen';

  const effectivePdfDocument: PdfExportDocument = pdfDocument
    ? { accentColor, ...pdfDocument }
    : normalizedInAppMode === 'recipe' && targetRecipe
    ? {
        title: targetRecipe.title,
        subtitle: `Kategorie: ${targetRecipe.category} · ${targetRecipe.prepTimeMinutes} Min · ${targetRecipe.portions} Portionen`,
        accentColor,
        heroImage: targetRecipe.images?.[0],
        sections: [
          ...(targetRecipe.description ? [{ heading: 'Beschreibung', lines: [targetRecipe.description] }] : []),
          {
            heading: `Zutaten (${targetRecipe.portions} Portionen)`,
            lines:
              targetRecipe.ingredients.length > 0
                ? targetRecipe.ingredients.map((i) => `• ${i.name}${i.amount ? ` (${i.amount})` : ''}`)
                : ['Keine Zutaten hinterlegt.'],
          },
          {
            heading: 'Zubereitung',
            lines:
              targetRecipe.instructions.length > 0
                ? targetRecipe.instructions.map((s, idx) => `${idx + 1}. ${s}`)
                : ['Keine Arbeitsschritte hinterlegt.'],
          },
        ],
      }
    : {
        title: displayTitle || 'Ochre Suite Export',
        subtitle: modalTitlePrefix,
        accentColor,
        sections: [
          {
            lines: (displayContent || displayTitle || 'Keine Inhalte vorhanden').split('\n'),
          },
        ],
      };

  // Add in-app share
  const handleAddShare = async () => {
    if (!selectedUserId) return;
    const recipient = allUsers.find((u) => u.id === selectedUserId);
    if (!recipient) return;

    setShareLoading(true);
    setShareFeedback(null);
    try {
      if (normalizedInAppMode === 'note') {
        await api.shareNote(notePath, currentUser.username, selectedUserId, permission);
        const updated = await api.fetchSharesForNote(currentUser.username, notePath);
        setExistingShares(updated);
        setSelectedUserId('');
        setShareFeedback(`Notiz für ${recipient.displayName} freigegeben.`);
      } else if (normalizedInAppMode === 'wiki' && wikiArticle) {
        await api.shareWikiArticle(currentUser.username, recipient.username, wikiArticle.slug);
        setSelectedUserId('');
        setShareFeedback(`Wiki-Artikel an ${recipient.displayName} gesendet.`);
      } else if (normalizedInAppMode === 'recipe' && targetRecipe) {
        await api.shareCookbookRecipe(currentUser.username, recipient.username, targetRecipe);
        setSelectedUserId('');
        setShareFeedback(`Rezept „${targetRecipe.title}“ an ${recipient.displayName} gesendet.`);
      }
    } catch (e: any) {
      setShareFeedback(`Fehler: ${e.message || 'Teilen fehlgeschlagen'}`);
    } finally {
      setShareLoading(false);
    }
  };

  // Revoke in-app share
  const handleRevokeShare = async (shareId: string) => {
    await api.revokeShare(shareId);
    setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([displayContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${displayTitle || 'dokument'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOdt = () => {
    const blob = exportToOdt(displayTitle || 'Dokument', displayContent);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${displayTitle || 'dokument'}.odt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSharePdf = async () => {
    setPdfLoading(true);
    setPdfFeedback(null);
    try {
      const res = await shareAsPdfFile(displayTitle || 'Ochre_Export', effectivePdfDocument);
      if (res.shared) {
        setPdfFeedback('PDF über das Teilen-Menü übergeben.');
      } else if (res.downloaded) {
        setPdfFeedback('PDF erstellt & heruntergeladen – kann jetzt z. B. direkt in WhatsApp angehängt werden.');
      }
    } catch (err: any) {
      setPdfFeedback(`PDF-Fehler: ${err?.message || 'Export fehlgeschlagen'}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: displayTitle,
          text: displayContent,
        })
        .catch(() => {});
    }
  };

  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(`${displayTitle}\n\n${displayContent}`)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(displayTitle)}&body=${encodeURIComponent(displayContent)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#1E1F23] rounded-xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Share2 className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {modalTitlePrefix}: <span style={{ color: accentColor }}>{displayTitle}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional Recipe Selector when in recipe mode */}
        {normalizedInAppMode === 'recipe' && recipesList.length > 0 && (
          <div className="px-4 py-2.5 border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#1A1C1F] flex items-center gap-2 text-xs">
            <span className="font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">Rezept wählen:</span>
            <select
              value={targetRecipe?.id || ''}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-800 dark:text-neutral-200 outline-hidden"
            >
              {recipesList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.category})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tab Switcher (only shown if In-App sharing is supported for this module) */}
        {supportsInApp && (
          <div className="flex border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] text-xs">
            <button
              onClick={() => setActiveTab('inapp')}
              style={activeTab === 'inapp' ? { color: accentColor, borderBottomColor: accentColor } : undefined}
              className={`flex-1 py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'inapp'
                  ? 'bg-white dark:bg-[#1E1F23] border-b-2'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>In-App Freigabe</span>
            </button>

            <button
              onClick={() => setActiveTab('external')}
              style={activeTab === 'external' ? { color: accentColor, borderBottomColor: accentColor } : undefined}
              className={`flex-1 py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'external'
                  ? 'bg-white dark:bg-[#1E1F23] border-b-2'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Extern &amp; PDF Teilen</span>
            </button>
          </div>
        )}

        {/* Tab 1: In-App User Sharing */}
        {supportsInApp && activeTab === 'inapp' && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-neutral-500">
              {mode === 'wiki'
                ? 'Sende diesen Wiki-Artikel inkl. Fotos direkt in den Wiki-Ordner eines anderen Benutzers.'
                : mode === 'recipe'
                ? 'Sende dieses Rezept direkt in den eigenen Katalog eines anderen Benutzers.'
                : 'Freigegebene Notizen erscheinen beim Empfänger in einer separaten Rubrik in der Seitenleiste.'}
            </p>

            {/* Share Form */}
            <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-3">
              <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                {mode === 'note' ? 'Neue Freigabe hinzufügen' : 'Empfänger auswählen'}
              </span>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
                >
                  <option value="">Benutzer auswählen...</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} ({user.role})
                    </option>
                  ))}
                </select>

                {mode === 'note' && (
                  <select
                    value={permission}
                    onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
                    className="text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
                  >
                    <option value="read">Nur Lesen</option>
                    <option value="write">Darf Bearbeiten</option>
                  </select>
                )}

                <button
                  onClick={handleAddShare}
                  disabled={!selectedUserId || shareLoading || (mode === 'wiki' && !wikiArticle) || (mode === 'recipe' && !targetRecipe)}
                  style={{ backgroundColor: accentColor }}
                  className="px-3 py-1.5 rounded-md text-white text-xs font-medium disabled:opacity-50 transition-opacity flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{mode === 'note' ? 'Freigeben' : 'Senden'}</span>
                </button>
              </div>

              {shareFeedback && (
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>{shareFeedback}</span>
                </div>
              )}
            </div>

            {/* Existing Shares List (Notes only) */}
            {normalizedInAppMode === 'note' && (
              <div>
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-2">
                  Aktive Freigaben für diese Notiz ({existingShares.length})
                </span>

                {existingShares.length === 0 ? (
                  <div className="p-3 text-center text-xs text-neutral-400 italic bg-neutral-50 dark:bg-neutral-900/40 rounded border border-dashed border-[#E5E3DC] dark:border-[#2F3136]">
                    Diese Notiz ist bisher rein privat und für niemanden freigegeben.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {existingShares.map((share) => (
                      <div
                        key={share.id}
                        className="flex items-center justify-between p-2 rounded bg-[#FBFBFA] dark:bg-[#18191B] border border-[#E5E3DC] dark:border-[#2F3136] text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" style={{ color: accentColor }} />
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {share.sharedWithUsername}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            {share.permission === 'write' ? 'Darf Bearbeiten' : 'Nur Lesen'}
                          </span>
                        </div>

                        <button
                          onClick={() => handleRevokeShare(share.id)}
                          className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Freigabe aufheben"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: External Quick-Share */}
        {activeTab === 'external' && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-neutral-500">
              Teile diesen Inhalt als PDF (ideal für WhatsApp &amp; Anhänge), per Nachricht/E-Mail oder als Markdown bzw. OpenDocument.
            </p>

            {/* Primary PDF Export & DIN A4 Print Actions */}
            <div className={`grid gap-2 ${onPrintA4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <button
                type="button"
                onClick={handleSharePdf}
                disabled={pdfLoading}
                style={{ backgroundColor: accentColor }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer active:scale-[0.99]"
              >
                <FileDown className="w-4 h-4 shrink-0" />
                <span>{pdfLoading ? 'Erstelle PDF...' : 'Als PDF teilen (WhatsApp / Datei)'}</span>
              </button>

              {onPrintA4 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.setTimeout(() => onPrintA4(), 80);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] bg-[#FAF9F5] dark:bg-[#23252A] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-xs font-bold shadow-2xs transition-all cursor-pointer active:scale-[0.99]"
                >
                  <Printer className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                  <span>{printButtonLabel || 'Als DIN A4 drucken'}</span>
                </button>
              )}
            </div>

            {pdfFeedback && (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{pdfFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              {/* WhatsApp */}
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-neutral-800 dark:text-neutral-200 hover:text-emerald-700 transition-colors text-xs font-medium"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <span>Text per WhatsApp</span>
              </a>

              {/* Mail */}
              <a
                href={mailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-amber-50 dark:hover:bg-amber-950/20 text-neutral-800 dark:text-neutral-200 transition-colors text-xs font-medium"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                >
                  <Mail className="w-4 h-4" />
                </div>
                <span>Per E-Mail</span>
              </a>

              {/* Copy Markdown */}
              <button
                onClick={() => copyToClipboard(displayContent, 'markdown')}
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors text-xs font-medium cursor-pointer"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                >
                  {copiedType === 'markdown' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </div>
                <span>{copiedType === 'markdown' ? 'Kopiert!' : 'Text / MD kopieren'}</span>
              </button>

              {/* Download .md */}
              <button
                onClick={handleDownloadMd}
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors text-xs font-medium cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <span>.md Datei Download</span>
              </button>

              {/* Download .odt */}
              <button
                onClick={handleDownloadOdt}
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-amber-50 dark:hover:bg-amber-950/20 text-neutral-800 dark:text-neutral-200 transition-colors text-xs font-medium col-span-2 cursor-pointer"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <span>Als .odt exportieren (LibreOffice / OpenOffice / Word)</span>
              </button>
            </div>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#25272C] text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-opacity hover:opacity-90 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobiles Text-Teilen-Menü öffnen</span>
              </button>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
