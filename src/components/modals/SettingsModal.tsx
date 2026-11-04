import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Download, 
  Upload, 
  Database, 
  Check, 
  AlertCircle, 
  Smartphone, 
  Lock,
  KeyRound,
  FileDown,
  Edit2,
  Languages,
  Server,
  Copy
} from 'lucide-react';
import { User } from '../../types';
import { api } from '../../services/api';
import { useTranslation, Language } from '../../services/i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onRefreshVault: () => void;
  appTitle: string;
  onUpdateAppTitle: (newTitle: string) => void;
  activeNoteTitle?: string;
  activeNoteContent?: string;
  onUpdateUser?: (user: User) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRefreshVault,
  appTitle,
  onUpdateAppTitle,
  activeNoteTitle,
  activeNoteContent,
  onUpdateUser,
}) => {
  const { language, setLanguage, t } = useTranslation();
  const [exportLoading, setExportLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  // App Name state
  const [nameInput, setNameInput] = useState(appTitle);
  const [titleSaved, setTitleSaved] = useState(false);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  // Docker copy state
  const [copiedDocker, setCopiedDocker] = useState(false);

  useEffect(() => {
    setNameInput(appTitle);
  }, [appTitle]);

  if (!isOpen) return null;

  const handleSaveAppTitle = async () => {
    if (!nameInput.trim()) return;
    await api.saveAppConfig(nameInput.trim());
    onUpdateAppTitle(nameInput.trim());
    setTitleSaved(true);
    setTimeout(() => setTitleSaved(false), 2000);
  };

  const handleSetPassword = async () => {
    try {
      const res = await api.setPassword(currentUser.username, passwordInput);
      const updatedUser: User = res.user || {
        ...currentUser,
        hasPassword: !!passwordInput.trim(),
      };
      if (onUpdateUser) {
        onUpdateUser(updatedUser);
      }
      setPasswordStatus(passwordInput.trim() ? t.passwordSaved : t.passwordRemoved);
      setPasswordInput('');
      onRefreshVault();
      setTimeout(() => setPasswordStatus(null), 3500);
    } catch (e: any) {
      setPasswordStatus(`Fehler: ${e.message}`);
    }
  };

  const handleDownloadBackup = async () => {
    setExportLoading(true);
    try {
      const blob = await api.exportBackup(currentUser.username);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appTitle.toLowerCase().replace(/\s+/g, '_')}_backup_${currentUser.username}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreLoading(true);
    setRestoreStatus(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const result = await api.restoreBackup(currentUser.username, json);
        setRestoreStatus(`Erfolg: ${result.restoredCount} Notizen erfolgreich wiederhergestellt!`);
        onRefreshVault();
      } catch (err: any) {
        setRestoreStatus(`Fehler: ${err.message || 'Ungültige Backup-Datei'}`);
      } finally {
        setRestoreLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#1E1F23] rounded-xl shadow-2xl border border-[#E5E3DC] dark:border-[#2F3136] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#E5E3DC] dark:border-[#2F3136] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#C87D20]" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Einstellungen & Vault
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 text-xs text-neutral-700 dark:text-neutral-300 overflow-y-auto">
          {/* 1. App Title Branding Configuration */}
          <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
              <Edit2 className="w-3.5 h-3.5 text-[#C87D20]" />
              <span>Anwendungs-Name & Branding</span>
            </div>
            <p className="text-[11px] text-neutral-500">
              Passe den angezeigten Namen (z. B. "Familien-Vault", "HomeNotes") an:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Name der App..."
                className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
              />
              <button
                onClick={handleSaveAppTitle}
                className="px-3 py-1.5 rounded-md bg-[#C87D20] text-white font-medium hover:bg-[#b06c19] transition-colors flex items-center gap-1"
              >
                {titleSaved ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{titleSaved ? 'Gespeichert' : 'Speichern'}</span>
              </button>
            </div>
          </div>

          {/* 2. User & Password Protection Section */}
          <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                <Lock className="w-3.5 h-3.5 text-[#C87D20]" />
                <span>Passwort-Schutz für @{currentUser.username}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                currentUser.hasPassword
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              }`}>
                {currentUser.hasPassword ? 'Geschützt' : 'Kein Passwort'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">
              Sichere diesen Benutzer mit einem Passwort oder PIN beim Startbildschirm ab:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={currentUser.hasPassword ? 'Neues Passwort (leer lassen zum Entfernen)...' : 'Passwort festlegen...'}
                className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden"
              />
              <button
                onClick={handleSetPassword}
                className="px-3 py-1.5 rounded-md bg-[#C87D20] text-white font-medium hover:bg-[#b06c19] transition-colors"
              >
                Festlegen
              </button>
            </div>
            {passwordStatus && (
              <span className="text-[11px] text-[#C87D20] font-medium block">
                {passwordStatus}
              </span>
            )}
          </div>

          {/* 3. Language Selection Section (Dropdown / Overlay Menu) */}
          <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                <Languages className="w-3.5 h-3.5 text-[#C87D20]" />
                <span>{t.languageSelect}</span>
              </div>
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                {language === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">
              Wähle deine bevorzugte Sprache für die Benutzeroberfläche:
            </p>
            <div className="relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#202225] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden focus:border-[#C87D20] cursor-pointer shadow-2xs font-medium"
              >
                <option value="de" className="bg-white dark:bg-[#202225] py-1">🇩🇪 Deutsch (Standard)</option>
                <option value="en" className="bg-white dark:bg-[#202225] py-1">🇬🇧 English (International)</option>
                <option value="es" disabled className="bg-white dark:bg-[#202225] text-neutral-400 py-1">🇪🇸 Español (In Vorbereitung)</option>
                <option value="fr" disabled className="bg-white dark:bg-[#202225] text-neutral-400 py-1">🇫🇷 Français (In Vorbereitung)</option>
              </select>
            </div>
          </div>

          {/* 4. Docker & NAS Volume Configuration (user: "2000:100") */}
          <div className="p-3 bg-[#F4F3EF] dark:bg-[#18191B] rounded-lg border border-[#E5E3DC] dark:border-[#2F3136] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                <Server className="w-3.5 h-3.5 text-[#C87D20]" />
                <span>Docker & NAS Storage (UID:GID 2000:100)</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-[#C87D20] font-mono">
                user: 2000:100
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Für dein NAS ist die Rechte-Verwaltung auf ID 2000:100 ausgelegt (umask 0002). Die Markdown-Dateien der einzelnen Benutzer liegen isoliert im <span className="font-mono text-neutral-700 dark:text-neutral-300 font-semibold">User/</span> Verzeichnis.
            </p>
            <div className="relative">
              <pre className="text-[10px] p-2.5 rounded-lg bg-neutral-900 text-neutral-200 font-mono overflow-x-auto select-all leading-relaxed border border-neutral-700">
{`services:
  ochrenotes:
    image: ochrenotes:latest
    restart: unless-stopped
    user: "2000:100"
    ports:
      - "3000:3000"
    environment:
      - VAULT_PATH=/data/vault
      - NODE_ENV=production
    volumes:
      - /srv/NASDRIVE/Files/OchreSuite/User:/data/vault/User
      - /srv/NASDRIVE/Files/OchreSuite/config:/data/vault`}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`services:\n  ochrenotes:\n    image: ochrenotes:latest\n    restart: unless-stopped\n    user: "2000:100"\n    ports:\n      - "3000:3000"\n    environment:\n      - VAULT_PATH=/data/vault\n      - NODE_ENV=production\n    volumes:\n      - /srv/NASDRIVE/Files/OchreSuite/User:/data/vault/User\n      - /srv/NASDRIVE/Files/OchreSuite/config:/data/vault`);
                  setCopiedDocker(true);
                  setTimeout(() => setCopiedDocker(false), 2000);
                }}
                className="absolute top-2 right-2 p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title="Compose-Auszug kopieren"
              >
                {copiedDocker ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 5. Backup & Restore Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
              <Database className="w-4 h-4 text-[#C87D20]" />
              <span>Vault-Datensicherung (Backup & Restore)</span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Exportiere all deine Notizen, Aufgaben und Freigaben als JSON-Archivdatei. Diese kann jederzeit auf einem neuen Docker-Host oder nach einer Migration eingespielt werden.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <button
                onClick={handleDownloadBackup}
                disabled={exportLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#C87D20] text-white font-medium hover:bg-[#b06c19] disabled:opacity-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportLoading ? 'Wird gepackt...' : 'Vault-Backup herunterladen'}</span>
              </button>

              <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#F4F3EF] dark:bg-[#2A2C31] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-700 dark:text-neutral-300 font-medium hover:border-[#C87D20] cursor-pointer transition-colors text-center">
                <Upload className="w-3.5 h-3.5" />
                <span>{restoreLoading ? 'Lade hoch...' : 'Backup einspielen'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  disabled={restoreLoading}
                  className="hidden"
                />
              </label>
            </div>

            {restoreStatus && (
              <div className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                restoreStatus.startsWith('Erfolg')
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
              }`}>
                {restoreStatus.startsWith('Erfolg') ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{restoreStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E3DC] dark:border-[#2F3136] bg-[#FBFBFA] dark:bg-[#18191B] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
