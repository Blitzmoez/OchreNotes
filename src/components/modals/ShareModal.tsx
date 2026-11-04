import React, { useState, useEffect } from 'react';
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
  Shield, 
  UserPlus, 
  Trash2,
  Smartphone,
  FileText
} from 'lucide-react';
import { User, ShareRecord } from '../../types';
import { api } from '../../services/api';
import { exportToOdt } from '../../services/odtExport';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteTitle: string;
  notePath: string;
  noteContent: string;
  currentUser: User;
  allUsers: User[];
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  noteTitle,
  notePath,
  noteContent,
  currentUser,
  allUsers,
}) => {
  const [activeTab, setActiveTab] = useState<'inapp' | 'external'>('inapp');
  const [existingShares, setExistingShares] = useState<ShareRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Available recipients (exclude current user)
  const availableUsers = allUsers.filter((u) => u.id !== currentUser.id);

  // Load existing shares
  useEffect(() => {
    if (isOpen && notePath) {
      api.fetchSharesForNote(currentUser.username, notePath).then(setExistingShares);
    }
  }, [isOpen, notePath, currentUser.username]);

  if (!isOpen) return null;

  // Add in-app share
  const handleAddShare = async () => {
    if (!selectedUserId) return;
    setShareLoading(true);
    try {
      await api.shareNote(notePath, currentUser.username, selectedUserId, permission);
      const updated = await api.fetchSharesForNote(currentUser.username, notePath);
      setExistingShares(updated);
      setSelectedUserId('');
    } finally {
      setShareLoading(false);
    }
  };

  // Revoke in-app share
  const handleRevokeShare = async (shareId: string) => {
    await api.revokeShare(shareId);
    setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  // External share helpers
  const shareText = `${noteTitle}\n\n${noteContent.substring(0, 300)}...`;

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([noteContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${noteTitle || 'notiz'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOdt = () => {
    const blob = exportToOdt(noteTitle || 'Dokument', noteContent);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${noteTitle || 'dokument'}.odt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: noteTitle,
        text: noteContent,
      }).catch(() => {});
    }
  };

  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(`${noteTitle}\n\n${noteContent}`)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(noteTitle)}&body=${encodeURIComponent(noteContent)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#1E1F23] rounded-xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#C87D20]" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              Notiz teilen: <span className="text-[#C87D20]">{noteTitle}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#E5E3DC] dark:border-[#2F3136] bg-[#F4F3EF] dark:bg-[#18191B] text-xs">
          <button
            onClick={() => setActiveTab('inapp')}
            className={`flex-1 py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'inapp'
                ? 'bg-white dark:bg-[#1E1F23] text-[#C87D20] border-b-2 border-[#C87D20]'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>In-App Freigabe (Partner / Team)</span>
          </button>

          <button
            onClick={() => setActiveTab('external')}
            className={`flex-1 py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'external'
                ? 'bg-white dark:bg-[#1E1F23] text-[#C87D20] border-b-2 border-[#C87D20]'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Externes Quick-Share</span>
          </button>
        </div>

        {/* Tab 1: In-App User Sharing */}
        {activeTab === 'inapp' && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-neutral-500">
              Freigegebene Notizen erscheinen beim Empfänger in einer separaten, unaufdringlichen Rubrik in der Seitenleiste.
            </p>

            {/* Share Form */}
            <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-3">
              <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                Neue Freigabe hinzufügen
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

                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
                >
                  <option value="read">Nur Lesen</option>
                  <option value="write">Darf Bearbeiten</option>
                </select>

                <button
                  onClick={handleAddShare}
                  disabled={!selectedUserId || shareLoading}
                  className="px-3 py-1.5 rounded-md bg-[#C87D20] text-white text-xs font-medium hover:bg-[#b06c19] disabled:opacity-50 transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Freigeben</span>
                </button>
              </div>
            </div>

            {/* Existing Shares List */}
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
                        <Users className="w-3.5 h-3.5 text-[#C87D20]" />
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {share.sharedWithUsername}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                          {share.permission === 'write' ? 'Darf Bearbeiten' : 'Nur Lesen'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleRevokeShare(share.id)}
                        className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors"
                        title="Freigabe aufheben"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: External Quick-Share */}
        {activeTab === 'external' && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-neutral-500">
              Teile diese Notiz schnell über WhatsApp, E-Mail, Signal oder lade sie als Markdown herunter.
            </p>

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
                <span>Per WhatsApp</span>
              </a>

              {/* Mail */}
              <a
                href={mailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-blue-50 dark:hover:bg-blue-950/20 text-neutral-800 dark:text-neutral-200 hover:text-blue-700 transition-colors text-xs font-medium"
              >
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <span>Per E-Mail</span>
              </a>

              {/* Copy Markdown */}
              <button
                onClick={() => copyToClipboard(noteContent, 'markdown')}
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors text-xs font-medium"
              >
                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[#C87D20] flex items-center justify-center">
                  {copiedType === 'markdown' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </div>
                <span>{copiedType === 'markdown' ? 'Kopiert!' : 'Markdown kopieren'}</span>
              </button>

              {/* Download .md */}
              <button
                onClick={handleDownloadMd}
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors text-xs font-medium"
              >
                <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <span>.md Datei Download</span>
              </button>

              {/* Download .odt (OpenDocument Text) */}
              <button
                onClick={handleDownloadOdt}
                className="flex items-center gap-2 p-3 rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] hover:bg-amber-50 dark:hover:bg-amber-950/20 text-neutral-800 dark:text-neutral-200 hover:text-[#C87D20] transition-colors text-xs font-medium col-span-2"
              >
                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[#C87D20] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <span>Als .odt exportieren (LibreOffice / OpenOffice / Word)</span>
              </button>
            </div>

            {/* Mobile native share if available */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#C87D20] text-white text-xs font-medium hover:bg-[#b06c19] transition-colors"
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobiles Teilen-Menü öffnen</span>
              </button>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
