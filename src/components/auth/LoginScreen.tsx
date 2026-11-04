import React, { useState } from 'react';
import { User } from '../../types';
import { UserCheck, Shield, ArrowRight, Lock, KeyRound, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface LoginScreenProps {
  users: User[];
  onSelectUser: (user: User) => void;
  onManualLogin?: (username: string, password?: string) => void;
  appTitle?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  users,
  onSelectUser,
  onManualLogin,
  appTitle = 'OchreNotes',
}) => {
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<User | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  const handleCardClick = async (user: User) => {
    setLoginError(null);
    if (user.hasPassword) {
      // User requires password
      setSelectedUserForPassword(user);
      setPasswordInput('');
    } else {
      // 1-Click login
      onSelectUser(user);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPassword) return;

    setLoginLoading(true);
    setLoginError(null);

    try {
      const loggedInUser = await api.login(selectedUserForPassword.username, passwordInput);
      onSelectUser(loggedInUser);
    } catch (err: any) {
      setLoginError(err.message || 'Falsches Passwort');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUsername.trim()) return;

    setLoginLoading(true);
    setLoginError(null);

    try {
      const user = await api.login(manualUsername.trim().toLowerCase(), manualPassword);
      onSelectUser(user);
    } catch (err: any) {
      setLoginError(err.message || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FBFBFA] dark:bg-[#18191B] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-[#C87D20] text-white flex items-center justify-center font-bold text-xl mx-auto shadow-md">
            {appTitle.charAt(0) || 'O'}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {appTitle}
          </h1>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            Docker Markdown Editor mit Obsidian Tasks & In-App Notizfreigabe
          </p>
        </div>

        {/* Quick Profile Selection */}
        <div className="bg-white dark:bg-[#202225] rounded-xl border border-[#E5E3DC] dark:border-[#2F3136] p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Profil-Schnellauswahl
            </span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              Benutzerkonto wählen
            </span>
          </div>

          <div className="space-y-2">
            {users.map((user) => {
              const isSelectedForPw = selectedUserForPassword?.id === user.id;

              return (
                <div
                  key={user.id}
                  className={`rounded-lg border transition-all overflow-hidden ${
                    isSelectedForPw
                      ? 'border-[#C87D20] bg-amber-50/30 dark:bg-amber-950/20 shadow-xs'
                      : 'border-[#E5E3DC] dark:border-[#2F3136] hover:border-[#C87D20] dark:hover:border-[#E09228] bg-white dark:bg-[#202225]'
                  }`}
                >
                  <button
                    onClick={() => handleCardClick(user)}
                    className="w-full flex items-center gap-3 p-2.5 text-left group"
                  >
                    <img
                      src={user.avatar}
                      alt={user.displayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-[#E5E3DC] dark:border-[#2F3136] group-hover:scale-105 transition-transform shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {user.displayName}
                        </span>
                        {user.hasPassword ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" />
                            <span>Passwort</span>
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            1-Klick
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-400 truncate block mt-0.5">
                        {user.description || `@${user.username}`}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-[#C87D20] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>

                  {/* Password Input Drawer for Password-Protected Users */}
                  {isSelectedForPw && (
                    <form onSubmit={handlePasswordSubmit} className="p-3 pt-0 border-t border-[#E5E3DC] dark:border-[#2F3136] space-y-2 mt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder={`Passwort für ${user.displayName}...`}
                          autoFocus
                          className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-[#161719] border border-[#E5E3DC] dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-hidden focus:border-[#C87D20]"
                        />
                        <button
                          type="submit"
                          disabled={!passwordInput || loginLoading}
                          className="px-3 py-1.5 rounded-md bg-[#C87D20] text-white text-xs font-medium hover:bg-[#b06c19] disabled:opacity-50 transition-colors"
                        >
                          {loginLoading ? 'Prüfe...' : 'Anmelden'}
                        </button>
                      </div>

                      {loginError && (
                        <div className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>{loginError}</span>
                        </div>
                      )}
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          {/* Manual Login Switch */}
          <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2F3136] text-center">
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="text-[11px] text-neutral-500 hover:text-[#C87D20] transition-colors"
            >
              {showManualForm ? 'Schnellauswahl bevorzugen' : 'Manuell per Benutzername & Passwort anmelden'}
            </button>
          </div>

          {showManualForm && (
            <form onSubmit={handleManualSubmit} className="pt-2 space-y-2">
              <input
                type="text"
                placeholder="Benutzername..."
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-md bg-[#F4F3EF] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-800 dark:text-neutral-200 outline-hidden focus:border-[#C87D20]"
              />
              <input
                type="password"
                placeholder="Passwort (falls eingerichtet)..."
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-md bg-[#F4F3EF] dark:bg-[#161719] border border-[#E5E3DC] dark:border-[#2F3136] text-neutral-800 dark:text-neutral-200 outline-hidden focus:border-[#C87D20]"
              />
              <button
                type="submit"
                disabled={!manualUsername.trim() || loginLoading}
                className="w-full py-1.5 rounded-md bg-[#C87D20] text-white text-xs font-medium hover:bg-[#b06c19] disabled:opacity-50 transition-colors"
              >
                {loginLoading ? 'Prüfe...' : 'Anmelden'}
              </button>
              {loginError && (
                <div className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1 justify-center">
                  <AlertCircle className="w-3 h-3" />
                  <span>{loginError}</span>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Docker Volume Notice */}
        <div className="text-center text-[11px] text-neutral-400 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#C87D20]" />
          <span>Sicher auf dem Docker-Volume persistiert.</span>
        </div>
      </div>
    </div>
  );
};
