import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import net from 'net';
import mqtt, { type MqttClient } from 'mqtt';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment constraint: Dev server must run on port 3000. In production/Docker, allow process.env.PORT.
const PORT = process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const VAULT_PATH = process.env.VAULT_PATH || path.resolve(__dirname, 'vault_data');
// CONFIG_PATH can be mounted separately (e.g. /data/config or /srv/NASDRIVE/Files/OchreSuite/config)
const CONFIG_PATH = process.env.CONFIG_PATH || (fs.existsSync('/data/config') ? '/data/config' : VAULT_PATH);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// In-memory structured logs buffer
interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  source: string;
}

const systemLogs: SystemLogEntry[] = [];
const MAX_LOGS = 400;

function log(level: 'info' | 'warn' | 'error', message: string, source = 'SERVER') {
  const entry: SystemLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    source,
  };
  systemLogs.push(entry);
  if (systemLogs.length > MAX_LOGS) systemLogs.shift();

  const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[32m';
  console.log(`${color}[${entry.timestamp}] [${level.toUpperCase()}] [${source}]\x1b[0m ${message}`);
}

// Initial default users
interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: 'admin' | 'user' | 'family';
  description?: string;
  password?: string;
}

const DEFAULT_USERS: StoredUser[] = [
  {
    id: 'user_michael',
    username: 'michael',
    displayName: 'Michael',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'admin',
    description: 'Hauptbenutzer (Docker Admin & Notizen)',
  },
  {
    id: 'user_sarah',
    username: 'sarah',
    displayName: 'Sarah',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    role: 'family',
    description: 'Partnerin (Freigegebene Notizen & Familie)',
  },
  {
    id: 'user_alex',
    username: 'alex',
    displayName: 'Alex',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'user',
    description: 'Projekt-Team / Entwickler',
  },
];

interface ShareRecord {
  id: string;
  notePath: string; // relative to owner's vault
  ownerId: string;
  ownerUsername: string;
  ownerDisplayName: string;
  sharedWithUserId: string;
  sharedWithUsername: string;
  permission: 'read' | 'write';
  createdAt: number;
}

// Ensure vault directory exists and is writable (compatible with Docker UID:GID 2000:100)
try {
  process.umask(0o002);
} catch {}

export function getUserBaseDir(username: string): string {
  const userFolder = path.join(VAULT_PATH, 'User', username);
  const legacyFolder = path.join(VAULT_PATH, username);

  if (fs.existsSync(userFolder)) return userFolder;
  if (fs.existsSync(legacyFolder)) {
    try {
      const parent = path.join(VAULT_PATH, 'User');
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.renameSync(legacyFolder, userFolder);
      log('info', `Benutzer-Dateien migriert nach: ${userFolder}`, 'STORAGE');
      return userFolder;
    } catch {
      return legacyFolder;
    }
  }
  return userFolder;
}

export function ensureUserProfileStructure(username: string): { profile1: string; profile2: string; wiki: string; cookbook: string; cookbookRecipes: string; cookbookMedia: string } {
  const baseDir = getUserBaseDir(username);
  const p1Dir = path.join(baseDir, 'Profil_1');
  const p2Dir = path.join(baseDir, 'Profil_2');
  const wikiDir = path.join(baseDir, 'Wiki');
  const cookbookDir = path.join(baseDir, 'Cookbook');
  const cookbookRecipesDir = path.join(cookbookDir, 'Rezepte');
  const cookbookMediaDir = path.join(cookbookDir, 'Media');

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true, mode: 0o775 });
  }

  // One-time migration: if legacy notes/folders exist directly in User/<username>/, move them into Profil_1
  if (!fs.existsSync(p1Dir)) {
    fs.mkdirSync(p1Dir, { recursive: true, mode: 0o775 });
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'Profil_1' || entry.name === 'Profil_2' || entry.name === 'Wiki' || entry.name === 'Cookbook' || entry.name.startsWith('.')) {
          continue;
        }
        const src = path.join(baseDir, entry.name);
        const dest = path.join(p1Dir, entry.name);
        try {
          fs.renameSync(src, dest);
        } catch {}
      }
    } catch {}
  }

  if (!fs.existsSync(p2Dir)) {
    fs.mkdirSync(p2Dir, { recursive: true, mode: 0o775 });
  }

  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(wikiDir, { recursive: true, mode: 0o775 });
    fs.mkdirSync(path.join(wikiDir, 'assets'), { recursive: true, mode: 0o775 });
  }

  if (!fs.existsSync(cookbookDir)) {
    fs.mkdirSync(cookbookDir, { recursive: true, mode: 0o775 });
  }

  if (!fs.existsSync(cookbookRecipesDir)) {
    fs.mkdirSync(cookbookRecipesDir, { recursive: true, mode: 0o775 });
  }

  if (!fs.existsSync(cookbookMediaDir)) {
    fs.mkdirSync(cookbookMediaDir, { recursive: true, mode: 0o775 });
  }

  return {
    profile1: p1Dir,
    profile2: p2Dir,
    wiki: wikiDir,
    cookbook: cookbookDir,
    cookbookRecipes: cookbookRecipesDir,
    cookbookMedia: cookbookMediaDir,
  };
}

export function getUserVaultDir(username: string, profile: string = 'profile1'): string {
  const dirs = ensureUserProfileStructure(username);
  return profile === 'profile2' ? dirs.profile2 : dirs.profile1;
}

export function ensureWikiDirectories(username?: string): {
  wikiRoot: string;
  publicDir: string;
  publicAssets: string;
  privateDir: string;
  privateAssets: string;
} {
  const wikiRoot = path.join(VAULT_PATH, 'Wiki');
  const publicDir = path.join(wikiRoot, 'Public');
  const publicAssets = path.join(publicDir, 'assets');
  const safeUser = path.basename(username || 'michael');
  const privateDir = path.join(wikiRoot, safeUser);
  const privateAssets = path.join(privateDir, 'assets');

  for (const d of [wikiRoot, publicDir, publicAssets, privateDir, privateAssets]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true, mode: 0o775 });
    }
  }

  return { wikiRoot, publicDir, publicAssets, privateDir, privateAssets };
}

async function migrateLegacyWikiStorage() {
  try {
    const wikiDirs = ensureWikiDirectories('michael');
    const usersBase = path.join(VAULT_PATH, 'User');
    if (!fs.existsSync(usersBase)) return;

    const userEntries = await fsp.readdir(usersBase, { withFileTypes: true });
    for (const uEntry of userEntries) {
      if (!uEntry.isDirectory()) continue;
      const legacyWiki = path.join(usersBase, uEntry.name, 'Wiki');
      if (!fs.existsSync(legacyWiki)) continue;

      const legacyAssets = path.join(legacyWiki, 'assets');
      if (fs.existsSync(legacyAssets)) {
        const assetFiles = await fsp.readdir(legacyAssets).catch(() => []);
        for (const af of assetFiles) {
          const srcA = path.join(legacyAssets, af);
          const dstA = path.join(wikiDirs.publicAssets, af);
          if (fs.statSync(srcA).isFile() && !fs.existsSync(dstA)) {
            await fsp.copyFile(srcA, dstA).catch(() => {});
          }
        }
      }

      const mdFiles = (await fsp.readdir(legacyWiki).catch(() => [])).filter((f) => f.endsWith('.md'));
      for (const mf of mdFiles) {
        const srcMd = path.join(legacyWiki, mf);
        const dstMd = path.join(wikiDirs.publicDir, mf);
        if (!fs.existsSync(dstMd)) {
          let raw = await fsp.readFile(srcMd, 'utf-8');
          raw = raw.split(`/api/wiki/assets/${encodeURIComponent(uEntry.name)}/`).join('/api/wiki/assets/public/');
          raw = raw.split(`/api/wiki/assets/${uEntry.name}/`).join('/api/wiki/assets/public/');
          if (/^---\r?\n/.test(raw) && !/^visibility:/m.test(raw)) {
            raw = raw.replace(/^---\r?\n/, `---\nvisibility: "public"\nauthor: "${uEntry.name}"\n`);
          }
          await fsp.writeFile(dstMd, raw, 'utf-8');
        }
        await fsp.unlink(srcMd).catch(() => {});
      }
    }
  } catch (err: any) {
    log('warn', `Wiki-Migration Hinweis: ${err.message}`, 'WIKI');
  }
}

async function initVaultDirectory() {
  try {
    if (!fs.existsSync(VAULT_PATH)) {
      log('info', `Erstelle Vault-Verzeichnis unter: ${VAULT_PATH}`, 'STORAGE');
      await fsp.mkdir(VAULT_PATH, { recursive: true, mode: 0o775 });
    }

    if (CONFIG_PATH !== VAULT_PATH && !fs.existsSync(CONFIG_PATH)) {
      log('info', `Erstelle Config-Verzeichnis unter: ${CONFIG_PATH}`, 'STORAGE');
      await fsp.mkdir(CONFIG_PATH, { recursive: true, mode: 0o775 });
    }

    // Ensure User base directory exists for NAS / user volumes
    const userBase = path.join(VAULT_PATH, 'User');
    if (!fs.existsSync(userBase)) {
      await fsp.mkdir(userBase, { recursive: true, mode: 0o775 });
      log('info', `User-Verzeichnis angelegt für .md-Dateien: ${userBase}`, 'STORAGE');
    }

    // Write test for Docker volume verification
    const testFile = path.join(VAULT_PATH, '.write_test.tmp');
    await fsp.writeFile(testFile, `Docker write test at ${new Date().toISOString()}`);
    await fsp.unlink(testFile);
    log('info', `Docker Volume Schreibprüfung erfolgreich für: ${VAULT_PATH}`, 'DOCKER');

    // Users file (check CONFIG_PATH first, then VAULT_PATH)
    const usersFile = path.join(CONFIG_PATH, 'users.json');
    const legacyUsersFile = path.join(VAULT_PATH, 'users.json');
    if (!fs.existsSync(usersFile) && !fs.existsSync(legacyUsersFile)) {
      await fsp.writeFile(usersFile, JSON.stringify(DEFAULT_USERS, null, 2), 'utf-8');
      log('info', `Benutzerdatenbank initialisiert mit ${DEFAULT_USERS.length} Profilen.`, 'AUTH');
    }

    // Shares file
    const sharesFile = path.join(CONFIG_PATH, 'shares.json');
    const legacySharesFile = path.join(VAULT_PATH, 'shares.json');
    if (!fs.existsSync(sharesFile) && !fs.existsSync(legacySharesFile)) {
      const initialShares: ShareRecord[] = [
        {
          id: 'share_1',
          notePath: 'Projekte/Urlaubsplanung-2026.md',
          ownerId: 'user_michael',
          ownerUsername: 'michael',
          ownerDisplayName: 'Michael',
          sharedWithUserId: 'user_sarah',
          sharedWithUsername: 'sarah',
          permission: 'write',
          createdAt: Date.now(),
        },
      ];
      await fsp.writeFile(sharesFile, JSON.stringify(initialShares, null, 2), 'utf-8');
      log('info', `Freigabe-Datenbank initialisiert.`, 'SHARING');
    }

    // Migrate legacy User/*/Wiki/*.md into shared Wiki/Public/ safely
    await migrateLegacyWikiStorage();

    // Seed sample notes for Michael and Sarah (and ensure Profil_1 / Profil_2 / Wiki exist)
    await seedUserVault('michael', true);
    await seedUserVault('sarah', false);
    ensureUserProfileStructure('alex');
  } catch (err: any) {
    log('error', `Fehler beim Initialisieren des Vault-Verzeichnisses: ${err.message}`, 'STORAGE');
  }
}

async function seedUserVault(username: string, isMichael: boolean) {
  const dirs = ensureUserProfileStructure(username);
  const wikiDirs = ensureWikiDirectories(username);
  const userVault = dirs.profile1;
  const existingEntries = fs.readdirSync(userVault);

  // Seed initial Public Wiki article if Wiki/Public has no .md files yet
  const publicWikiFiles = fs.readdirSync(wikiDirs.publicDir).filter((f) => f.endsWith('.md'));
  if (publicWikiFiles.length === 0 && isMichael) {
    const sampleWiki = `---
title: "Docker & NAS Backup Anleitung"
category: "Server & Docker"
tags: ["docker", "nas", "anleitung"]
visibility: "public"
author: "michael"
updatedAt: "${new Date().toISOString()}"
---

Diese Wiki-Seite wird nach dem **offenen Markdown-Standard** mit YAML-Frontmatter direkt im Ordner \`Wiki/Public/\` gespeichert – zentral neben deinen Notizen.

1. Öffne das Terminal auf deinem NAS oder Docker-Host.
2. Prüfe die Berechtigungen für \`UID:GID 2000:100\`.
3. Führe das Backup-Kommando aus der Code-Ablage unten per Copy & Paste aus.

## 💻 Code-Ablage

### Docker Compose Volume Prüfung
\`\`\`yaml
services:
  ochresuite:
    image: ochrenotes:latest
    user: "2000:100"
    volumes:
      - /srv/NASDRIVE/Files/OchreSuite/User:/data/vault/User
      - /srv/NASDRIVE/Files/OchreSuite/Wiki:/data/vault/Wiki
      - /srv/NASDRIVE/Files/OchreSuite/config:/data/config
\`\`\`

### Berechtigungen auf NAS setzen
\`\`\`bash
chown -R 2000:100 /srv/NASDRIVE/Files/OchreSuite
chmod -R 775 /srv/NASDRIVE/Files/OchreSuite
\`\`\`
`;
    await fsp.writeFile(path.join(wikiDirs.publicDir, 'docker-nas-backup-anleitung.md'), sampleWiki, 'utf-8');
  }

  if (existingEntries.length > 0) return;

  log('info', `Erstelle Initial-Vault für Benutzer '${username}' in Profil_1 (Profil_2 bleibt leer)...`, 'SEED');
  await fsp.mkdir(path.join(userVault, 'Projekte'), { recursive: true });
  await fsp.mkdir(path.join(userVault, 'Journal'), { recursive: true });

  const today = new Date().toISOString().split('T')[0];

  if (isMichael) {
    // Welcome note
    const welcomeMd = `# Willkommen bei OchreNotes 📙

Eine moderne, Docker-fähige Obsidian-Alternative mit vollem Fokus auf Produktivität, Multitasking und Datensouveränität.

## ✨ Kernfunktionen auf einen Blick

- **Obsidian Tasks**: Checkboxen mit Fälligkeitsdaten und Prioritäten
- **Interaktiver Wissensgraph**: Visualisiere deine Gedanken und Verknüpfungen mit [[Wikilinks]]
- **In-App Notizfreigabe**: Notizen mit Partner/Team teilen – sauber in einer eigenen Seitenleisten-Rubrik
- **Multitasking Snap/Split**: Öffne Notizen nebeneinander mit frei verschiebbarer Trennlinie
- **YouTube Embed Slider**: Wähle direkt zwischen abspielbarem Player, Vorschaukarte oder Textlink
- **Command-Tabellen & Zitate**: Saubere Formatierung für Terminal-Befehle und Cheatsheets
- **A4-Druckoptimierung**: Perfekt auf DIN A4 ausgerichteter Ausdruck und PDF-Export

---

## 📅 Obsidian Tasks Demonstration

Hier sind Aufgaben mit beiden unterstützten Syntax-Formaten:

- [ ] Docker-Compose Volume auf dem Server prüfen 📅 ${today} ⏫ #docker #dev
- [ ] Sarah die Notiz für [[Urlaubsplanung-2026]] freigeben 📅 ${today} 🔼 #familie
- [ ] Offline-Synchronisation auf dem Tablet testen due:${today} #mobile
- [x] Obsidian Markdown Syntax Toolbar einbauen ✅ ${today}
- [ ] Backup-Archiv in den Einstellungen herunterladen 📅 2026-10-25 🔽 #backup

> [!TIP]
> Du kannst Aufgaben direkt hier in der Vorschau abhaken oder im globalen **Aufgaben-Dashboard** (oben in der Leiste) nach Status und Datum filtern!

---

## 📺 YouTube Embed mit Slider-Modus

Wenn du ein YouTube-Video einbindest, kannst du in der gerenderten Vorschau mit dem Slider direkt zwischen Player, Karte und Hyperlink umschalten:

https://www.youtube.com/watch?v=dQw4w9WgXcQ

---

## 💻 Terminal Command Cheat-Sheet

| Befehl | Zweck | Umgebung |
| :--- | :--- | :--- |
| \`docker compose up -d\` | Server im Hintergrund starten | Docker Host |
| \`docker compose logs -f\` | Echtzeit-Logs des Containers einsehen | Terminal |
| \`curl http://localhost:3000/api/system/health\` | Healthcheck abfragen | REST API |

\`\`\`bash
# Docker Container mit individuellem Port und Volume starten
docker run -d -p 8080:3000 -v /opt/notes_vault:/data/vault --name ochrenotes ochrenotes:latest
\`\`\`

---

## 🔗 Verknüpfungen & Wikilinks

Siehe auch:
- [[Urlaubsplanung-2026]] (Diese Notiz ist mit Sarah geteilt!)
- [[Docker-Setup]]
- Tag-Verweise: #produktivität #obsidian #docker
`;
    await fsp.writeFile(path.join(userVault, 'Willkommen.md'), welcomeMd, 'utf-8');

    // Urlaub note (shared)
    const urlaubMd = `# Urlaubsplanung 2026 🌴

> [!NOTE]
> Diese Notiz ist für **Sarah** mit Schreibrechten freigegeben. Beide können gleichzeitig daran arbeiten.

## 🏖️ Reiseziele in der Auswahl

1. **Alpen-Chalet & Wandern** (Südtirol)
2. **Kroatien Küsten-Roadtrip**
3. **Nordseeurlaub mit Fahrradtouren**

### Aufgaben & Vorbereitung

- [ ] Urlaubsantrag auf der Arbeit einreichen 📅 2026-10-22 ⏫ #orga
- [ ] Ferienhaus-Angebote vergleichen 📅 2026-10-28 🔼 #urlaub
- [ ] [[Packliste]] erstellen und vervollständigen due:2026-11-05 #vorbereitung
- [ ] Reisepässe auf Gültigkeit prüfen 📅 2026-11-15 #dokumente
`;
    await fsp.writeFile(path.join(userVault, 'Projekte', 'Urlaubsplanung-2026.md'), urlaubMd, 'utf-8');

    // Docker Setup note
    const dockerMd = `# Docker Setup & Host Konfiguration 🐳

Dokumentation für den Betrieb auf Heimserver, NAS oder Raspberry Pi.

## Docker Compose Konfiguration

\`\`\`yaml
services:
  ochrenotes:
    image: ochrenotes:latest
    container_name: ochrenotes_app
    restart: unless-stopped
    ports:
      - "\${PORT:-3000}:3000"
    volumes:
      - ./vault_data:/data/vault
    environment:
      - PORT=3000
      - VAULT_PATH=/data/vault
      - NODE_ENV=production
\`\`\`

### Wichtige Befehle

- [ ] Volume-Backup Cronjob einrichten 📅 2026-10-24 🔼 #server
- [x] Port 3000 in lokaler Firewall freigeben ✅ ${today}
`;
    await fsp.writeFile(path.join(userVault, 'Projekte', 'Docker-Setup.md'), dockerMd, 'utf-8');

    // Journal note
    const journalMd = `# Journal - ${today} ☕

- [x] Morgendliche Notizen und Tasks synchronisiert ✅ ${today}
- [ ] Wöchentlichen Sprint-Review vorbereiten 📅 ${today} ⏫ #arbeit
- [ ] Einkäufe für das Wochenende mit Sarah abstimmen 📅 ${today} #privat

Gedanken: Der Wissensgraph hilft ungemein, Verknüpfungen zwischen [[Urlaubsplanung-2026]] und Haushaltsaufgaben im Blick zu behalten.
`;
    await fsp.writeFile(path.join(userVault, 'Journal', `${today}.md`), journalMd, 'utf-8');
  } else {
    // Sarah's Vault
    const sarahWelcome = `# Sarahs persönliche Notizen 🌸

Willkommen im persönlichen Bereich!

## Eigene Aufgaben

- [ ] Yoga-Kurs Dienstags buchen 📅 2026-10-21 🔼 #fitness
- [ ] Einkaufsliste für Wochenende schreiben 📅 2026-10-23 #haushalt
- [ ] Buchclub Vorschläge ansehen due:2026-10-26 #lesen

> [!TIP]
> In der linken Seitenleiste unter **„👥 Für mich freigegeben"** findest du Notizen, die Michael mit dir geteilt hat (z. B. die [[Urlaubsplanung-2026]]), ohne dass sie deine eigenen Notizen durcheinanderbringen!
`;
    await fsp.writeFile(path.join(userVault, 'Willkommen.md'), sarahWelcome, 'utf-8');

    const einkaufMd = `# Einkaufsliste 🛒

- [ ] Bio-Hafermilch & Espressobohnen 📅 ${today} #einkauf
- [ ] Frisches Gemüse für Ratatouille 📅 ${today} #rezept
- [ ] Olivenöl & Gewürze
- [x] Vollkornbrot besorgen
`;
    await fsp.writeFile(path.join(userVault, 'Einkaufsliste.md'), einkaufMd, 'utf-8');
  }
}

function getConfigFile(filename: string): string {
  const inConfig = path.join(CONFIG_PATH, filename);
  if (fs.existsSync(inConfig)) return inConfig;
  const inVault = path.join(VAULT_PATH, filename);
  if (fs.existsSync(inVault)) return inVault;
  return inConfig;
}

async function getUsers(): Promise<StoredUser[]> {
  try {
    const file = getConfigFile('users.json');
    if (!fs.existsSync(file)) return DEFAULT_USERS;
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_USERS;
  }
}

async function saveUsers(users: StoredUser[]) {
  const file = getConfigFile('users.json');
  await fsp.writeFile(file, JSON.stringify(users, null, 2), 'utf-8');
}

async function getAppConfig(): Promise<{ appTitle: string }> {
  try {
    const file = getConfigFile('config.json');
    if (!fs.existsSync(file)) return { appTitle: 'OchreNotes' };
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { appTitle: 'OchreNotes' };
  }
}

async function saveAppConfig(config: { appTitle: string }) {
  const file = getConfigFile('config.json');
  await fsp.writeFile(file, JSON.stringify(config, null, 2), 'utf-8');
}

// Helper: read shares
async function getShares(): Promise<ShareRecord[]> {
  try {
    const file = getConfigFile('shares.json');
    if (!fs.existsSync(file)) return [];
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

// Helper: save shares
async function saveShares(shares: ShareRecord[]) {
  const file = getConfigFile('shares.json');
  await fsp.writeFile(file, JSON.stringify(shares, null, 2), 'utf-8');
}

// Helper: scan notes recursively
interface ScannedNote {
  id: string;
  path: string;
  title: string;
  folder: string;
  mtime: number;
  size: number;
  tags: string[];
  tasksCount: number;
  completedTasksCount: number;
  isInbox?: boolean;
}

async function scanUserNotes(username: string, profile: string = 'profile1'): Promise<ScannedNote[]> {
  const userVault = getUserVaultDir(username, profile);
  if (!fs.existsSync(userVault)) return [];

  const notes: ScannedNote[] = [];

  async function walk(dir: string, relFolder = '') {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'Media' && !relFolder) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = relFolder ? `${relFolder}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const stat = await fsp.stat(fullPath);
          const content = await fsp.readFile(fullPath, 'utf-8');
          const title = entry.name.replace(/\.md$/, '');

          // Extract tags (#tag)
          const tagMatches = content.match(/#[a-zA-Z0-9_\-\/]+/g) || [];
          const uniqueTags = Array.from(new Set(tagMatches.map((t) => t.substring(1))));

          // Extract tasks
          const taskMatches = content.match(/^[ \t]*- \[[ xX]\]/gm) || [];
          const completedMatches = content.match(/^[ \t]*- \[[xX]\]/gm) || [];

          // Detect Inbox quick notes: root-level notes marked inbox: true or named "Schnelle Notiz..."
          const hasInboxFrontmatter = /^---\s*[\r\n]+[\s\S]*?\binbox:\s*true\b[\s\S]*?---/i.test(content);
          const isInbox = !relFolder && (hasInboxFrontmatter || title.toLowerCase().startsWith('schnelle notiz'));

          notes.push({
            id: `${username}:${relPath}`,
            path: relPath,
            title,
            folder: relFolder || '/',
            mtime: stat.mtimeMs,
            size: stat.size,
            tags: uniqueTags,
            tasksCount: taskMatches.length,
            completedTasksCount: completedMatches.length,
            isInbox,
          });
        } catch (err) {
          log('warn', `Fehler beim Lesen der Notiz ${fullPath}: ${err}`, 'SCAN');
        }
      }
    }
  }

  await walk(userVault);
  return notes.sort((a, b) => b.mtime - a.mtime);
}

// Parse Obsidian Tasks from markdown content
interface ParsedTask {
  id: string;
  notePath: string;
  noteTitle: string;
  lineIndex: number;
  rawText: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  isOverdue: boolean;
  isDueToday: boolean;
  priority: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
  recurrence?: string;
  isShared?: boolean;
  sharedFrom?: string;
}

function parseTasksFromContent(content: string, notePath: string, noteTitle: string, isShared = false, sharedFrom = ''): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  lines.forEach((line, lineIndex) => {
    const taskMatch = line.match(/^[ \t]*- \[([ xX])\] (.*)$/);
    if (!taskMatch) return;

    const completed = taskMatch[1].toLowerCase() === 'x';
    const rawRest = taskMatch[2];

    // Due date extraction (both formats: 📅 YYYY-MM-DD or due:YYYY-MM-DD or @due(YYYY-MM-DD))
    let dueDate: string | null = null;
    const dateMatch1 = rawRest.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
    const dateMatch2 = rawRest.match(/due:(\d{4}-\d{2}-\d{2})/i);
    const dateMatch3 = rawRest.match(/@due\((\d{4}-\d{2}-\d{2})\)/i);

    if (dateMatch1) dueDate = dateMatch1[1];
    else if (dateMatch2) dueDate = dateMatch2[1];
    else if (dateMatch3) dueDate = dateMatch3[1];

    let isOverdue = false;
    let isDueToday = false;
    if (dueDate && !completed) {
      if (dueDate < todayStr) isOverdue = true;
      if (dueDate === todayStr) isDueToday = true;
    }

    // Priority extraction
    let priority: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (rawRest.includes('⏫') || rawRest.match(/\b(prio:high|priority:high)\b/i)) {
      priority = 'high';
    } else if (rawRest.includes('🔼') || rawRest.match(/\b(prio:med|priority:med)\b/i)) {
      priority = 'medium';
    } else if (rawRest.includes('🔽') || rawRest.match(/\b(prio:low|priority:low)\b/i)) {
      priority = 'low';
    }

    // Tags extraction
    const tagMatches = rawRest.match(/#[a-zA-Z0-9_\-\/]+/g) || [];
    const tags = Array.from(new Set(tagMatches.map((t) => t.substring(1))));

    // Clean title for dashboard display
    let cleanTitle = rawRest
      .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
      .replace(/due:\d{4}-\d{2}-\d{2}/gi, '')
      .replace(/@due\(\d{4}-\d{2}-\d{2}\)/gi, '')
      .replace(/[⏫🔼🔽]/g, '')
      .replace(/\b(prio|priority):(high|med|low)\b/gi, '')
      .replace(/#[a-zA-Z0-9_\-\/]+/g, '')
      .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '')
      .trim();

    tasks.push({
      id: `${notePath}:${lineIndex}`,
      notePath,
      noteTitle,
      lineIndex,
      rawText: line,
      title: cleanTitle || rawRest,
      completed,
      dueDate,
      isOverdue,
      isDueToday,
      priority,
      tags,
      isShared,
      sharedFrom,
    });
  });

  return tasks;
}

// Start Express Server
async function createServer() {
  const app = express();
  let initDone = false;

  const readyPromise = (async () => {
    const viteImportPromise = !IS_PRODUCTION ? import('vite') : Promise.resolve(null);
    await initVaultDirectory();

    app.use(express.json({ limit: '50mb' }));

  // Request & error logger middleware
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        if (res.statusCode >= 500) {
          log('error', `${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`, 'HTTP');
        } else if (res.statusCode >= 400) {
          log('warn', `${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`, 'HTTP');
        } else if (
          req.method !== 'GET' &&
          !req.path.startsWith('/api/system/') &&
          ms > 150
        ) {
          log('info', `${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`, 'HTTP');
        }
      });
    }
    next();
  });

  // Auth Endpoints
  app.get('/api/auth/users', async (req, res) => {
    try {
      const users = await getUsers();
      // Omit plain passwords, provide hasPassword flag
      const safeUsers = users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        role: u.role,
        description: u.description,
        hasPassword: !!u.password,
      }));
      res.json(safeUsers);
    } catch (err: any) {
      log('error', `Fehler beim Abrufen der Benutzer: ${err.message}`, 'AUTH');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await getUsers();
    const user = users.find((u) => u.username === username);
    if (!user) {
      log('warn', `Ungültiger Anmeldeversuch für '${username}'`, 'AUTH');
      return res.status(401).json({ error: 'Benutzer nicht gefunden' });
    }

    // Verify password if user has one configured
    if (user.password && user.password.trim() !== '') {
      if (!password || password !== user.password) {
        log('warn', `Falsches Passwort für '${username}'`, 'AUTH');
        return res.status(401).json({ error: 'Falsches Passwort' });
      }
    }

    log('info', `Benutzer '${user.displayName}' erfolgreich angemeldet`, 'AUTH');
    const safeUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      description: user.description,
      hasPassword: !!user.password,
    };
    res.json({ success: true, user: safeUser });
  });

  // Serve uploaded user avatars cleanly
  app.get('/api/auth/avatars/:filename', (req, res) => {
    try {
      const safeFile = path.basename(req.params.filename);
      const inConfig = path.join(CONFIG_PATH, 'avatars', safeFile);
      const inVault = path.join(VAULT_PATH, 'avatars', safeFile);
      const fullPath = fs.existsSync(inConfig) ? inConfig : inVault;
      if (!fs.existsSync(fullPath)) {
        return res.status(404).send('Avatar not found');
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).send('Avatar not found');
    }
  });

  async function saveAvatarDataUrl(username: string, dataUrl: string): Promise<string> {
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!match) throw new Error('Ungültiges Bildformat für Profilbild');
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    const avatarsDir = path.join(CONFIG_PATH, 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      await fsp.mkdir(avatarsDir, { recursive: true, mode: 0o775 });
    }
    const filename = `${username}_${Date.now()}.${ext}`;
    await fsp.writeFile(path.join(avatarsDir, filename), buffer);
    return `/api/auth/avatars/${encodeURIComponent(filename)}`;
  }

  // Create new user
  app.post('/api/auth/users', async (req, res) => {
    const { username: rawUsername, displayName, role = 'user', description = '', password, avatarDataUrl, avatarUrl } = req.body;
    const cleanUsername = (rawUsername || displayName || '')
      .toLowerCase()
      .trim()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9_-]/g, '');

    if (!cleanUsername) {
      return res.status(400).json({ error: 'Bitte einen gültigen Benutzernamen angeben' });
    }
    const cleanDisplayName = (displayName || cleanUsername).trim();

    try {
      const users = await getUsers();
      if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
        return res.status(409).json({ error: `Benutzername '@${cleanUsername}' existiert bereits` });
      }

      let finalAvatar =
        avatarUrl ||
        `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(cleanDisplayName)}&backgroundColor=c87d20`;
      if (avatarDataUrl && typeof avatarDataUrl === 'string' && avatarDataUrl.startsWith('data:image/')) {
        finalAvatar = await saveAvatarDataUrl(cleanUsername, avatarDataUrl);
      }

      const validRole: StoredUser['role'] =
        role === 'admin' || role === 'family' || role === 'user' ? role : 'user';

      const newUser: StoredUser = {
        id: `user_${cleanUsername}_${Date.now().toString(36)}`,
        username: cleanUsername,
        displayName: cleanDisplayName,
        avatar: finalAvatar,
        role: validRole,
        description: description.trim() || undefined,
        password: password && password.trim() ? password.trim() : undefined,
      };

      users.push(newUser);
      await saveUsers(users);
      ensureUserProfileStructure(cleanUsername);

      log('info', `Neuer Benutzer '@${cleanUsername}' (${cleanDisplayName}) angelegt`, 'AUTH');
      const safeUser = {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        avatar: newUser.avatar,
        role: newUser.role,
        description: newUser.description,
        hasPassword: !!newUser.password,
      };
      res.status(201).json({ success: true, user: safeUser });
    } catch (err: any) {
      log('error', `Fehler beim Erstellen des Benutzers: ${err.message}`, 'AUTH');
      res.status(500).json({ error: err.message });
    }
  });

  // Update existing user (displayName, role, description, avatar)
  app.patch('/api/auth/users/:username', async (req, res) => {
    const targetUsername = req.params.username;
    const { displayName, role, description, avatarDataUrl, avatarUrl, clearAvatar } = req.body;

    try {
      const users = await getUsers();
      const user = users.find((u) => u.username === targetUsername);
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

      if (typeof displayName === 'string' && displayName.trim()) {
        user.displayName = displayName.trim();
      }
      if (role === 'admin' || role === 'family' || role === 'user') {
        user.role = role;
      }
      if (typeof description === 'string') {
        user.description = description.trim() || undefined;
      }
      if (avatarDataUrl && typeof avatarDataUrl === 'string' && avatarDataUrl.startsWith('data:image/')) {
        user.avatar = await saveAvatarDataUrl(user.username, avatarDataUrl);
      } else if (typeof avatarUrl === 'string' && avatarUrl.trim()) {
        user.avatar = avatarUrl.trim();
      } else if (clearAvatar) {
        user.avatar = '';
      }

      await saveUsers(users);
      log('info', `Benutzerprofil '@${user.username}' aktualisiert`, 'AUTH');
      const safeUser = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        description: user.description,
        hasPassword: !!user.password,
      };
      res.json({ success: true, user: safeUser });
    } catch (err: any) {
      log('error', `Fehler beim Aktualisieren des Benutzers: ${err.message}`, 'AUTH');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete user (protects last remaining user)
  app.delete('/api/auth/users/:username', async (req, res) => {
    const targetUsername = req.params.username;
    try {
      const users = await getUsers();
      if (users.length <= 1) {
        return res.status(400).json({ error: 'Der letzte verbleibende Benutzer kann nicht gelöscht werden' });
      }
      const next = users.filter((u) => u.username !== targetUsername);
      if (next.length === users.length) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
      }
      await saveUsers(next);
      log('info', `Benutzer '@${targetUsername}' entfernt (Vault-Dateien bleiben erhalten)`, 'AUTH');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/set-password', async (req, res) => {
    const { username, password } = req.body;
    if (!username) return res.status(400).json({ error: 'Benutzername fehlt' });

    try {
      const users = await getUsers();
      const user = users.find((u) => u.username === username);
      if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

      user.password = password && password.trim() ? password.trim() : undefined;
      await saveUsers(users);
      log('info', `Passwort für '${username}' ${user.password ? 'aktualisiert' : 'entfernt'}`, 'AUTH');
      const safeUser = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        description: user.description,
        hasPassword: !!user.password,
      };
      res.json({ success: true, hasPassword: !!user.password, user: safeUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // App Title / Branding Config
  app.get('/api/system/config', async (req, res) => {
    const config = await getAppConfig();
    res.json(config);
  });

  app.post('/api/system/config', async (req, res) => {
    const { appTitle } = req.body;
    if (!appTitle || !appTitle.trim()) return res.status(400).json({ error: 'Titel darf nicht leer sein' });
    const config = { appTitle: appTitle.trim() };
    await saveAppConfig(config);
    log('info', `App-Name geändert auf: '${config.appTitle}'`, 'CONFIG');
    res.json(config);
  });

  // Per-User Suite Profile & Module Settings
  app.get('/api/system/profile-settings', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    try {
      const file = getConfigFile('profile_settings.json');
      if (!fs.existsSync(file)) return res.json(null);
      const raw = await fsp.readFile(file, 'utf-8');
      const all = JSON.parse(raw);
      res.json(all[username] || null);
    } catch {
      res.json(null);
    }
  });

  app.post('/api/system/profile-settings', async (req, res) => {
    const { username, profileSettings, enabledModules, dashboardSettings } = req.body;
    if (!username) return res.status(400).json({ error: 'Benutzername fehlt' });
    try {
      const file = getConfigFile('profile_settings.json');
      let all: Record<string, any> = {};
      if (fs.existsSync(file)) {
        try {
          all = JSON.parse(await fsp.readFile(file, 'utf-8'));
        } catch {}
      }
      const existing = all[username] || {};
      all[username] = {
        ...existing,
        ...(profileSettings !== undefined ? { profileSettings } : {}),
        ...(enabledModules !== undefined ? { enabledModules } : {}),
        ...(dashboardSettings !== undefined ? { dashboardSettings } : {}),
      };
      await fsp.writeFile(file, JSON.stringify(all, null, 2), 'utf-8');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Notes API for Current User & Profile
  app.get('/api/vault/notes', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    try {
      const notes = await scanUserNotes(username, profile);
      res.json(notes);
    } catch (err: any) {
      log('error', `Fehler beim Laden der Notizen für '${username}' (${profile}): ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Notes Shared with Current User
  app.get('/api/vault/shared-with-me', async (req, res) => {
    const username = (req.query.username as string) || 'sarah';
    try {
      const users = await getUsers();
      const currentUser = users.find((u) => u.username === username);
      if (!currentUser) return res.json([]);

      const shares = await getShares();
      const myShares = shares.filter((s) => s.sharedWithUserId === currentUser.id);

      const sharedNotes: any[] = [];
      for (const share of myShares) {
        const ownerVault = getUserVaultDir(share.ownerUsername);
        const noteFullPath = path.join(ownerVault, share.notePath);

        if (fs.existsSync(noteFullPath)) {
          const stat = await fsp.stat(noteFullPath);
          const content = await fsp.readFile(noteFullPath, 'utf-8');
          const title = path.basename(share.notePath, '.md');
          const tagMatches = content.match(/#[a-zA-Z0-9_\-\/]+/g) || [];
          const taskMatches = content.match(/^[ \t]*- \[[ xX]\]/gm) || [];
          const completedMatches = content.match(/^[ \t]*- \[[xX]\]/gm) || [];

          sharedNotes.push({
            id: `shared:${share.ownerUsername}:${share.notePath}`,
            path: share.notePath,
            title,
            folder: path.dirname(share.notePath),
            mtime: stat.mtimeMs,
            size: stat.size,
            tags: Array.from(new Set(tagMatches.map((t) => t.substring(1)))),
            tasksCount: taskMatches.length,
            completedTasksCount: completedMatches.length,
            isShared: true,
            sharedFromUser: share.ownerUsername,
            sharedFromDisplayName: share.ownerDisplayName,
            permission: share.permission,
            shareId: share.id,
          });
        }
      }

      res.json(sharedNotes);
    } catch (err: any) {
      log('error', `Fehler beim Abrufen geteilter Notizen: ${err.message}`, 'SHARING');
      res.status(500).json({ error: err.message });
    }
  });

  // Read single note
  app.get('/api/vault/notes/read', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    const notePath = req.query.path as string;
    const isShared = req.query.isShared === 'true';
    const sharedFrom = req.query.sharedFrom as string;

    if (!notePath) return res.status(400).json({ error: 'Pfad fehlt' });

    try {
      const targetUser = isShared && sharedFrom ? sharedFrom : username;
      const targetProfile = isShared ? 'profile1' : profile;
      const fullPath = path.join(getUserVaultDir(targetUser, targetProfile), notePath);

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Notiz nicht gefunden' });
      }

      const stat = await fsp.stat(fullPath);
      const content = await fsp.readFile(fullPath, 'utf-8');
      const title = path.basename(notePath, '.md');

      res.json({
        path: notePath,
        title,
        content,
        mtime: stat.mtimeMs,
        size: stat.size,
        isShared: isShared,
        sharedFromUser: isShared ? targetUser : undefined,
      });
    } catch (err: any) {
      log('error', `Fehler beim Lesen der Notiz '${notePath}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Vault SSE Live Sync Clients
  const vaultSseClients = new Set<{ res: express.Response; username: string }>();

  function broadcastVaultEvent(payload: {
    type: 'note_saved' | 'note_deleted' | 'note_moved' | 'tasks_toggled' | 'vault_changed';
    username: string;
    profile?: string;
    path?: string;
    mtime?: number;
  }) {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of vaultSseClients) {
      try {
        client.res.write(msg);
      } catch {}
    }
  }

  app.get('/api/vault/stream', (req, res) => {
    const username = String(req.query.username || '');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const entry = { res, username };
    vaultSseClients.add(entry);
    const keepalive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 25000);

    req.on('close', () => {
      clearInterval(keepalive);
      vaultSseClients.delete(entry);
    });
  });

  // Save / Update Note
  app.post('/api/vault/notes', async (req, res) => {
    const { username, profile = 'profile1', path: notePath, content, isShared, sharedFrom } = req.body;

    if (!username || !notePath || content === undefined) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const targetUser = isShared && sharedFrom ? sharedFrom : username;
      const targetProfile = isShared ? 'profile1' : profile;
      const fullPath = path.join(getUserVaultDir(targetUser, targetProfile), notePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        await fsp.mkdir(dir, { recursive: true });
      }

      await fsp.writeFile(fullPath, content, 'utf-8');
      const stat = await fsp.stat(fullPath);
      log('info', `Notiz gespeichert: '${targetUser}/${targetProfile}/${notePath}' (${stat.size} Bytes)`, 'VAULT');

      broadcastVaultEvent({
        type: 'note_saved',
        username: targetUser,
        profile: targetProfile,
        path: notePath,
        mtime: stat.mtimeMs,
      });

      res.json({ success: true, mtime: stat.mtimeMs, size: stat.size });
    } catch (err: any) {
      log('error', `Fehler beim Speichern von '${notePath}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Note
  app.delete('/api/vault/notes', async (req, res) => {
    const username = req.query.username as string;
    const profile = (req.query.profile as string) || 'profile1';
    const notePath = req.query.path as string;

    if (!username || !notePath) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const fullPath = path.join(getUserVaultDir(username, profile), notePath);
      if (fs.existsSync(fullPath)) {
        await fsp.unlink(fullPath);
        log('info', `Notiz gelöscht: '${username}/${profile}/${notePath}'`, 'VAULT');

        // Also remove any shares for this note
        const shares = await getShares();
        const updatedShares = shares.filter((s) => !(s.ownerUsername === username && s.notePath === notePath));
        if (shares.length !== updatedShares.length) {
          await saveShares(updatedShares);
        }

        broadcastVaultEvent({
          type: 'note_deleted',
          username,
          profile,
          path: notePath,
          mtime: Date.now(),
        });

        return res.json({ success: true });
      }
      res.status(404).json({ error: 'Notiz nicht gefunden' });
    } catch (err: any) {
      log('error', `Fehler beim Löschen von '${notePath}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Move / Rename Note (Drag & Drop support in Vault Explorer)
  app.post('/api/vault/notes/move', async (req, res) => {
    const { username, profile = 'profile1', oldPath, newPath } = req.body;
    if (!username || !oldPath || !newPath) {
      return res.status(400).json({ error: 'Fehlende Parameter (username, oldPath, newPath)' });
    }

    try {
      const sourceFile = path.join(getUserVaultDir(username, profile), oldPath);
      const targetFile = path.join(getUserVaultDir(username, profile), newPath);

      if (!fs.existsSync(sourceFile)) {
        return res.status(404).json({ error: 'Ursprüngliche Notiz nicht gefunden' });
      }

      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        await fsp.mkdir(targetDir, { recursive: true });
      }

      await fsp.rename(sourceFile, targetFile);
      // If note was sorted into a folder, clear inbox: true from frontmatter cleanly
      if (newPath.includes('/')) {
        try {
          const movedRaw = await fsp.readFile(targetFile, 'utf-8');
          if (/^---\s*[\r\n]+[\s\S]*?\binbox:\s*true\b[\s\S]*?---/i.test(movedRaw)) {
            let cleaned = movedRaw.replace(/^[ \t]*inbox:\s*true[ \t]*\r?\n?/gim, '');
            cleaned = cleaned.replace(/^---\s*[\r\n]+---\s*[\r\n]*/m, '');
            await fsp.writeFile(targetFile, cleaned, 'utf-8');
          }
        } catch {}
      }
      log('info', `Notiz verschoben: '${username}/${profile}/${oldPath}' -> '${username}/${profile}/${newPath}'`, 'VAULT');

      // Keep Media/<NoteName> folder synchronized on note rename
      try {
        const oldNoteName = path.basename(oldPath, '.md').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
        const newNoteName = path.basename(newPath, '.md').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
        if (oldNoteName && newNoteName && oldNoteName !== newNoteName) {
          const vaultBase = getUserVaultDir(username, profile);
          const oldMediaDir = path.join(vaultBase, 'Media', oldNoteName);
          const newMediaDir = path.join(vaultBase, 'Media', newNoteName);
          if (fs.existsSync(oldMediaDir) && !fs.existsSync(newMediaDir)) {
            await fsp.rename(oldMediaDir, newMediaDir);
            const movedRaw = await fsp.readFile(targetFile, 'utf-8');
            const oldSeg = `/${encodeURIComponent(oldNoteName)}/`;
            const newSeg = `/${encodeURIComponent(newNoteName)}/`;
            if (movedRaw.includes(oldSeg)) {
              await fsp.writeFile(targetFile, movedRaw.split(oldSeg).join(newSeg), 'utf-8');
            }
          }
        }
      } catch {}

      // Update any shares
      const shares = await getShares();
      let updated = false;
      const newShares = shares.map((s) => {
        if (s.ownerUsername === username && s.notePath === oldPath) {
          updated = true;
          return { ...s, notePath: newPath };
        }
        return s;
      });
      if (updated) {
        await saveShares(newShares);
      }

      broadcastVaultEvent({
        type: 'note_moved',
        username,
        profile,
        path: newPath,
        mtime: Date.now(),
      });

      res.json({ success: true, newPath });
    } catch (err: any) {
      log('error', `Fehler beim Verschieben von '${oldPath}' nach '${newPath}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // List all folders in Vault (including empty folders)
  app.get('/api/vault/folders', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    try {
      const userVault = getUserVaultDir(username, profile);
      if (!fs.existsSync(userVault)) return res.json([]);

      const folderList: string[] = [];
      async function walkDirs(dir: string, relFolder = '') {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          if (entry.name === 'Media' && !relFolder) continue;
          if (entry.isDirectory()) {
            const relPath = relFolder ? `${relFolder}/${entry.name}` : entry.name;
            folderList.push(relPath);
            await walkDirs(path.join(dir, entry.name), relPath);
          }
        }
      }
      await walkDirs(userVault);
      res.json(folderList);
    } catch (err: any) {
      log('error', `Fehler beim Abrufen der Ordner für '${username}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Create Folder in Vault
  app.post('/api/vault/folders', async (req, res) => {
    const { username, profile = 'profile1', folderPath } = req.body;
    if (!username || !folderPath) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const targetDir = path.join(getUserVaultDir(username, profile), folderPath);
      if (!fs.existsSync(targetDir)) {
        await fsp.mkdir(targetDir, { recursive: true });
        log('info', `Ordner erstellt: '${username}/${profile}/${folderPath}'`, 'VAULT');
      }
      res.json({ success: true, folderPath });
    } catch (err: any) {
      log('error', `Fehler beim Erstellen des Ordners '${folderPath}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Folder in Vault (Safety: only if 0 notes inside)
  app.delete('/api/vault/folders', async (req, res) => {
    const username = req.query.username as string;
    const profile = (req.query.profile as string) || 'profile1';
    const folderPath = req.query.folderPath as string;

    if (!username || !folderPath) {
      return res.status(400).json({ error: 'Fehlende Parameter (username, folderPath)' });
    }

    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    if (!cleanFolder) {
      return res.status(400).json({ error: 'Hauptordner kann nicht gelöscht werden' });
    }

    try {
      const targetDir = path.join(getUserVaultDir(username, profile), cleanFolder);
      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Ordner nicht gefunden' });
      }

      // Check if any .md files exist recursively inside this folder
      let hasMdFiles = false;
      async function checkForFiles(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await checkForFiles(full);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            hasMdFiles = true;
            return;
          }
        }
      }

      await checkForFiles(targetDir);

      if (hasMdFiles) {
        return res.status(400).json({
          error: 'Ordner enthält noch Notizen. Bitte löschen oder verschieben Sie zuerst alle Notizen.',
        });
      }

      await fsp.rm(targetDir, { recursive: true, force: true });
      log('info', `Leerer Ordner gelöscht: '${username}/${profile}/${cleanFolder}'`, 'VAULT');
      res.json({ success: true, folderPath: cleanFolder });
    } catch (err: any) {
      log('error', `Fehler beim Löschen des Ordners '${cleanFolder}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Per-Note Media Folder Helper & Endpoints (stored under <UserVault>/Media/<NoteName>/)
  const resolveNoteMediaLocation = (
    username: string,
    profile: string = 'profile1',
    notePath: string,
    isShared = false,
    sharedFrom = ''
  ) => {
    const owner = path.basename(String(isShared && sharedFrom ? sharedFrom : username || 'michael'));
    const targetProfile = isShared ? 'profile1' : profile === 'profile2' ? 'profile2' : 'profile1';
    const vaultDir = getUserVaultDir(owner, targetProfile);
    const rawName = path.basename(String(notePath || 'Notiz').replace(/\.md$/i, ''));
    const safeNoteName = rawName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Notiz';
    const mediaRoot = path.join(vaultDir, 'Media');
    const mediaDir = path.join(mediaRoot, safeNoteName);
    return { owner, targetProfile, vaultDir, safeNoteName, mediaRoot, mediaDir };
  };

  const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|webp|gif|svg|avif|heic)$/i;

  app.get('/api/notes/media/list', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    const notePath = (req.query.notePath as string) || '';
    const isShared = req.query.isShared === 'true';
    const sharedFrom = (req.query.sharedFrom as string) || '';

    if (!notePath) return res.json([]);

    try {
      const { owner, targetProfile, safeNoteName, mediaDir } = resolveNoteMediaLocation(
        username,
        profile,
        notePath,
        isShared,
        sharedFrom
      );
      if (!fs.existsSync(mediaDir)) return res.json([]);

      const entries = await fsp.readdir(mediaDir, { withFileTypes: true });
      const items: Array<{ filename: string; url: string; size: number; mtime: number }> = [];
      for (const entry of entries) {
        if (!entry.isFile() || !IMAGE_EXT_REGEX.test(entry.name)) continue;
        const full = path.join(mediaDir, entry.name);
        const stat = await fsp.stat(full);
        items.push({
          filename: entry.name,
          url: `/api/notes/media/file/${encodeURIComponent(owner)}/${encodeURIComponent(targetProfile)}/${encodeURIComponent(safeNoteName)}/${encodeURIComponent(entry.name)}`,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
      res.json(items.sort((a, b) => b.mtime - a.mtime));
    } catch (err: any) {
      log('error', `Fehler beim Laden der Notiz-Medien: ${err.message}`, 'MEDIA');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notes/media/upload', async (req, res) => {
    const {
      username = 'michael',
      profile = 'profile1',
      notePath,
      filename = 'bild.png',
      dataUrl,
      isShared = false,
      sharedFrom = '',
    } = req.body;

    if (!notePath || !dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Notizpfad oder Bilddaten fehlen' });
    }

    try {
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Ungültiges Bildformat' });
      }
      const extMap: Record<string, string> = {
        jpeg: 'jpg',
        jpg: 'jpg',
        png: 'png',
        webp: 'webp',
        gif: 'gif',
        'svg+xml': 'svg',
        avif: 'avif',
        heic: 'heic',
      };
      const ext = extMap[match[1].toLowerCase()] || 'png';
      const baseName =
        path
          .basename(filename, path.extname(filename))
          .replace(/[^a-zA-Z0-9\-_äöüÄÖÜß]/g, '_')
          .slice(0, 48) || 'bild';
      const savedName = `${Date.now()}_${baseName}.${ext}`;

      const { owner, targetProfile, safeNoteName, mediaDir } = resolveNoteMediaLocation(
        username,
        profile,
        notePath,
        Boolean(isShared),
        sharedFrom
      );
      if (!fs.existsSync(mediaDir)) {
        await fsp.mkdir(mediaDir, { recursive: true, mode: 0o775 });
      }

      const buffer = Buffer.from(match[2], 'base64');
      const fullPath = path.join(mediaDir, savedName);
      await fsp.writeFile(fullPath, buffer);
      const stat = await fsp.stat(fullPath);

      const url = `/api/notes/media/file/${encodeURIComponent(owner)}/${encodeURIComponent(targetProfile)}/${encodeURIComponent(safeNoteName)}/${encodeURIComponent(savedName)}`;
      log('info', `Notiz-Bild gespeichert in Media/${safeNoteName}/${savedName} (${buffer.length} Bytes)`, 'MEDIA');

      res.json({
        success: true,
        item: {
          filename: savedName,
          url,
          size: stat.size,
          mtime: stat.mtimeMs,
        },
      });
    } catch (err: any) {
      log('error', `Fehler beim Speichern des Notiz-Bildes: ${err.message}`, 'MEDIA');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/notes/media/file/:username/:profile/:noteName/:filename', async (req, res) => {
    const { username, profile, noteName, filename } = req.params;
    try {
      const owner = path.basename(username);
      const targetProfile = profile === 'profile2' ? 'profile2' : 'profile1';
      const vaultDir = getUserVaultDir(owner, targetProfile);
      const safeNoteName = path.basename(noteName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      const safeFile = path.basename(filename);
      const fullPath = path.resolve(path.join(vaultDir, 'Media', safeNoteName, safeFile));
      const allowedRoot = path.resolve(path.join(vaultDir, 'Media'));
      if (!fullPath.startsWith(allowedRoot + path.sep) || !fs.existsSync(fullPath)) {
        return res.status(404).send('Media not found');
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).send('Media not found');
    }
  });

  app.delete('/api/notes/media/file', async (req, res) => {
    const {
      username = 'michael',
      profile = 'profile1',
      notePath,
      filename,
      isShared = false,
      sharedFrom = '',
    } = req.body;

    if (!notePath || !filename) {
      return res.status(400).json({ error: 'notePath oder filename fehlt' });
    }

    try {
      const { mediaDir } = resolveNoteMediaLocation(
        username,
        profile,
        notePath,
        Boolean(isShared),
        sharedFrom
      );
      const safeFile = path.basename(filename);
      const fullPath = path.join(mediaDir, safeFile);
      if (fs.existsSync(fullPath)) {
        await fsp.unlink(fullPath);
        try {
          const remaining = await fsp.readdir(mediaDir);
          if (remaining.length === 0) {
            await fsp.rmdir(mediaDir);
          }
        } catch {}
      }
      res.json({ success: true });
    } catch (err: any) {
      log('error', `Fehler beim Löschen des Notiz-Bildes: ${err.message}`, 'MEDIA');
      res.status(500).json({ error: err.message });
    }
  });

  // In-App Note Sharing
  app.get('/api/vault/shares-for-note', async (req, res) => {
    const ownerUsername = req.query.owner as string;
    const notePath = req.query.path as string;

    if (!ownerUsername || !notePath) return res.json([]);
    const shares = await getShares();
    const noteShares = shares.filter((s) => s.ownerUsername === ownerUsername && s.notePath === notePath);
    res.json(noteShares);
  });

  app.post('/api/vault/share', async (req, res) => {
    const { notePath, ownerUsername, sharedWithUserId, permission } = req.body;
    if (!notePath || !ownerUsername || !sharedWithUserId) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const users = await getUsers();
      const owner = users.find((u) => u.username === ownerUsername);
      const recipient = users.find((u) => u.id === sharedWithUserId);

      if (!owner || !recipient) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
      }

      const shares = await getShares();
      // Remove existing share for this pair if present
      const filtered = shares.filter(
        (s) => !(s.notePath === notePath && s.ownerUsername === ownerUsername && s.sharedWithUserId === sharedWithUserId)
      );

      const newShare: ShareRecord = {
        id: `share_${Date.now()}`,
        notePath,
        ownerId: owner.id,
        ownerUsername: owner.username,
        ownerDisplayName: owner.displayName,
        sharedWithUserId: recipient.id,
        sharedWithUsername: recipient.username,
        permission: permission || 'read',
        createdAt: Date.now(),
      };

      filtered.push(newShare);
      await saveShares(filtered);
      log('info', `Notiz '${notePath}' von '${owner.displayName}' für '${recipient.displayName}' freigegeben (${newShare.permission})`, 'SHARING');

      res.json({ success: true, share: newShare });
    } catch (err: any) {
      log('error', `Fehler beim Erstellen der Freigabe: ${err.message}`, 'SHARING');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/vault/share', async (req, res) => {
    const { shareId } = req.body;
    if (!shareId) return res.status(400).json({ error: 'shareId fehlt' });

    try {
      const shares = await getShares();
      const updated = shares.filter((s) => s.id !== shareId);
      await saveShares(updated);
      log('info', `Freigabe ${shareId} aufgehoben`, 'SHARING');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global Tasks Hub
  app.get('/api/tasks', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    try {
      const allTasks: ParsedTask[] = [];

      // Scan personal notes for active profile
      const notes = await scanUserNotes(username, profile);
      for (const note of notes) {
        const fullPath = path.join(getUserVaultDir(username, profile), note.path);
        if (fs.existsSync(fullPath)) {
          const content = await fsp.readFile(fullPath, 'utf-8');
          const noteTasks = parseTasksFromContent(content, note.path, note.title, false);
          allTasks.push(...noteTasks);
        }
      }

      // Also scan notes shared with this user (on profile1)
      if (profile === 'profile1') {
        const users = await getUsers();
        const currentUser = users.find((u) => u.username === username);
        if (currentUser) {
          const shares = await getShares();
          const myShares = shares.filter((s) => s.sharedWithUserId === currentUser.id);
          for (const share of myShares) {
            const fullPath = path.join(getUserVaultDir(share.ownerUsername, 'profile1'), share.notePath);
            if (fs.existsSync(fullPath)) {
              const content = await fsp.readFile(fullPath, 'utf-8');
              const noteTasks = parseTasksFromContent(content, share.notePath, path.basename(share.notePath, '.md'), true, share.ownerDisplayName);
              allTasks.push(...noteTasks);
            }
          }
        }
      }

      res.json(allTasks);
    } catch (err: any) {
      log('error', `Fehler beim Extrahieren der Aufgaben: ${err.message}`, 'TASKS');
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle Task line in Markdown file
  app.patch('/api/tasks/toggle', async (req, res) => {
    const { username, profile = 'profile1', notePath, lineIndex, completed, isShared, sharedFrom } = req.body;

    if (!notePath || lineIndex === undefined || completed === undefined) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const targetUser = isShared && sharedFrom ? sharedFrom : username;
      const targetProfile = isShared ? 'profile1' : profile;
      const fullPath = path.join(getUserVaultDir(targetUser, targetProfile), notePath);

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Notizdatei nicht gefunden' });
      }

      const content = await fsp.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      if (lineIndex < 0 || lineIndex >= lines.length) {
        return res.status(400).json({ error: 'Zeilenindex außerhalb des Bereichs' });
      }

      const currentLine = lines[lineIndex];
      const today = new Date().toISOString().split('T')[0];

      let newLine = currentLine;
      if (completed) {
        newLine = currentLine.replace(/^([ \t]*- \[)[ ](\])/, '$1x$2');
        if (!newLine.includes('✅')) {
          newLine = `${newLine} ✅ ${today}`;
        }
      } else {
        newLine = currentLine.replace(/^([ \t]*- \[)[xX](\])/, '$1 $2').replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trimEnd();
      }

      lines[lineIndex] = newLine;
      await fsp.writeFile(fullPath, lines.join('\n'), 'utf-8');
      log('info', `Aufgabe in '${targetUser}/${targetProfile}/${notePath}' Zeile ${lineIndex + 1} auf ${completed ? 'ERLEDIGT' : 'OFFEN'} gesetzt`, 'TASKS');

      broadcastVaultEvent({
        type: 'tasks_toggled',
        username: targetUser,
        profile: targetProfile,
        path: notePath,
        mtime: Date.now(),
      });

      res.json({ success: true, updatedLine: newLine });
    } catch (err: any) {
      log('error', `Fehler beim Umschalten der Aufgabe: ${err.message}`, 'TASKS');
      res.status(500).json({ error: err.message });
    }
  });

  // Knowledge Graph Data
  app.get('/api/graph', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    try {
      const notes = await scanUserNotes(username, profile);
      const nodes: any[] = [];
      const links: any[] = [];
      const nodeIds = new Set<string>();

      for (const note of notes) {
        nodeIds.add(note.title);
        nodes.push({
          id: note.title,
          label: note.title,
          type: 'note',
          folder: note.folder,
          val: Math.max(8, (note.tasksCount || 0) * 2 + 8),
        });
      }

      for (const note of notes) {
        const fullPath = path.join(getUserVaultDir(username, profile), note.path);
        if (fs.existsSync(fullPath)) {
          const content = await fsp.readFile(fullPath, 'utf-8');

          const wikiMatches = content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || [];
          for (const raw of wikiMatches) {
            const targetTitle = raw.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
            if (targetTitle && targetTitle !== note.title) {
              if (!nodeIds.has(targetTitle)) {
                nodeIds.add(targetTitle);
                nodes.push({
                  id: targetTitle,
                  label: targetTitle,
                  type: 'note',
                  val: 6,
                });
              }
              links.push({
                source: note.title,
                target: targetTitle,
              });
            }
          }

          for (const tag of note.tags) {
            const tagNodeId = `#${tag}`;
            if (!nodeIds.has(tagNodeId)) {
              nodeIds.add(tagNodeId);
              nodes.push({
                id: tagNodeId,
                label: `#${tag}`,
                type: 'tag',
                val: 5,
              });
            }
            links.push({
              source: note.title,
              target: tagNodeId,
            });
          }
        }
      }

      res.json({ nodes, links });
    } catch (err: any) {
      log('error', `Fehler beim Erzeugen des Wissensgraphen: ${err.message}`, 'GRAPH');
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // OPEN-STANDARD WIKI API (Modular Ordered Blocks in Standard Markdown + Assets)
  // =========================================================================
  interface ServerWikiBlock {
    id: string;
    type: 'text' | 'media' | 'code';
    title?: string;
    content?: string;
    mediaUrl?: string;
    mediaKind?: 'image' | 'video';
    alt?: string;
    caption?: string;
    language?: string;
    code?: string;
    collapsible?: boolean;
    defaultCollapsed?: boolean;
  }

  function inferMediaKindFromUrl(url: string): 'image' | 'video' {
    const clean = (url || '').split('?')[0].toLowerCase();
    if (
      /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i.test(clean) ||
      /youtube\.com|youtu\.be|vimeo\.com/i.test(url || '')
    ) {
      return 'video';
    }
    return 'image';
  }

  function parseWikiMarkdown(
    slug: string,
    raw: string,
    defaultVisibility: 'public' | 'private' = 'public',
    defaultAuthor = 'michael',
    storagePath = ''
  ) {
    let title = slug;
    let category = 'Allgemein';
    let tags: string[] = [];
    let visibility: 'public' | 'private' = defaultVisibility;
    let author = defaultAuthor;
    let updatedAt = new Date().toISOString();
    let content = raw;

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (fmMatch) {
      const fmBlock = fmMatch[1];
      content = raw.slice(fmMatch[0].length);
      const tMatch = fmBlock.match(/^title:\s*"?([^"\n]+)"?/m);
      if (tMatch) title = tMatch[1].trim();
      const cMatch = fmBlock.match(/^category:\s*"?([^"\n]+)"?/m);
      if (cMatch) category = cMatch[1].trim();
      const vMatch = fmBlock.match(/^visibility:\s*"?([^"\n]+)"?/m);
      if (vMatch && (vMatch[1].trim() === 'private' || vMatch[1].trim() === 'public')) {
        visibility = vMatch[1].trim() as 'public' | 'private';
      }
      const aMatch = fmBlock.match(/^author:\s*"?([^"\n]+)"?/m);
      if (aMatch) author = aMatch[1].trim();
      const uMatch = fmBlock.match(/^updatedAt:\s*"?([^"\n]+)"?/m);
      if (uMatch) updatedAt = uMatch[1].trim();
      const tagsMatch = fmBlock.match(/^tags:\s*\[(.*)\]/m);
      if (tagsMatch) {
        tags = tagsMatch[1]
          .split(',')
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    }

    const blocks: ServerWikiBlock[] = [];
    const blockMarkerRegex = /<!--\s*wiki-block:(\{[^\n]*?\})\s*-->\r?\n?/g;

    if (blockMarkerRegex.test(content)) {
      blockMarkerRegex.lastIndex = 0;
      const matches: Array<{ meta: any; start: number; end: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = blockMarkerRegex.exec(content)) !== null) {
        try {
          const meta = JSON.parse(m[1]);
          matches.push({ meta, start: m.index, end: m.index + m[0].length });
        } catch {}
      }

      for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const nextStart = i + 1 < matches.length ? matches[i + 1].start : content.length;
        let chunk = content.slice(cur.end, nextStart).trim();
        const meta = cur.meta || {};
        const blockId = meta.id || `wb_${i}_${Date.now()}`;

        // Strip optional <details ...><summary>...</summary> ... </details> wrapper for clean inner parsing
        let isDetails = meta.collapsible === true;
        let defaultCollapsed = meta.defaultCollapsed === true;
        const detailsMatch = chunk.match(/^<details(\s+open)?\s*>\s*\r?\n<summary>[\s\S]*?<\/summary>\s*\r?\n([\s\S]*?)\r?\n<\/details>$/i);
        if (detailsMatch) {
          isDetails = true;
          defaultCollapsed = !detailsMatch[1];
          chunk = detailsMatch[2].trim();
        }

        if (meta.type === 'code') {
          let blockTitle = meta.title || '';
          const hMatch = chunk.match(/^###\s+([^\r\n]+)\r?\n+/);
          if (hMatch) {
            if (!blockTitle) blockTitle = hMatch[1].trim();
            chunk = chunk.slice(hMatch[0].length);
          }
          const fenceMatch = chunk.match(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/);
          blocks.push({
            id: blockId,
            type: 'code',
            title: blockTitle || 'Code-Block',
            language: fenceMatch?.[1]?.trim() || meta.language || 'bash',
            content: fenceMatch ? fenceMatch[2].replace(/\r?\n$/, '') : chunk,
            collapsible: isDetails,
            defaultCollapsed,
          });
        } else if (meta.type === 'media') {
          const imgM = chunk.match(/!\[([^\]]*)\]\(([^)]+)\)(?:\s*<!--\s*caption:(.*?)\s*-->)?/);
          const vidHtmlM = chunk.match(/<video[^>]*src=["']([^"']+)["'][^>]*><\/video>/i);
          const vidLinkM = chunk.match(/\[(?:🎥\s*)?([^\]]*)\]\(([^)]+)\)/);
          const mediaUrl = imgM?.[2] || vidHtmlM?.[1] || vidLinkM?.[2] || meta.mediaUrl || '';
          const alt = imgM?.[1] || vidLinkM?.[1] || meta.alt || meta.title || '';
          let caption = imgM?.[3]?.trim() || meta.caption || '';
          if (!caption) {
            const capItalic = chunk.match(/\r?\n\*([^\n*]+)\*\s*$/);
            if (capItalic) caption = capItalic[1].trim();
          }
          blocks.push({
            id: blockId,
            type: 'media',
            title: meta.title || undefined,
            mediaUrl,
            mediaKind: meta.mediaKind || inferMediaKindFromUrl(mediaUrl),
            alt,
            caption: caption || undefined,
            collapsible: isDetails,
            defaultCollapsed,
          });
        } else {
          blocks.push({
            id: blockId,
            type: 'text',
            title: meta.title || undefined,
            content: chunk,
            collapsible: isDetails || undefined,
            defaultCollapsed: defaultCollapsed || undefined,
          });
        }
      }
    } else {
      // Legacy / external plain Markdown compatibility
      let body = content;
      const imgSectionMarker = '\n## 📸 Fotos & Abbildungen\n';
      const codeSectionMarker = '\n## 💻 Code-Ablage\n';

      const codeIdx = body.indexOf(codeSectionMarker);
      let codeSection = '';
      if (codeIdx !== -1) {
        codeSection = body.slice(codeIdx + codeSectionMarker.length);
        body = body.slice(0, codeIdx);
      }

      const imgIdx = body.indexOf(imgSectionMarker);
      let imgSection = '';
      if (imgIdx !== -1) {
        imgSection = body.slice(imgIdx + imgSectionMarker.length);
        body = body.slice(0, imgIdx);
      }

      if (body.trim()) {
        blocks.push({
          id: `wb_txt_${Date.now()}`,
          type: 'text',
          content: body.trim(),
        });
      }

      if (imgSection) {
        const imgLines = imgSection.split(/\r?\n/);
        imgLines.forEach((line, i) => {
          const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\s*<!--\s*caption:(.*?)\s*-->)?/);
          if (m) {
            blocks.push({
              id: `wb_img_${i}_${Date.now()}`,
              type: 'media',
              mediaUrl: m[2],
              mediaKind: inferMediaKindFromUrl(m[2]),
              alt: m[1] || 'Foto',
              caption: m[3] ? m[3].trim() : undefined,
            });
          }
        });
      }

      if (codeSection) {
        const snippetRegex = /###\s+([^\r\n]+)\r?\n```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
        let match;
        let idx = 0;
        while ((match = snippetRegex.exec(codeSection)) !== null) {
          blocks.push({
            id: `wb_code_${idx++}_${Date.now()}`,
            type: 'code',
            title: match[1].trim(),
            language: match[2].trim() || 'bash',
            content: match[3].replace(/\r?\n$/, ''),
          });
        }
      }

      if (blocks.length === 0) {
        blocks.push({
          id: `wb_txt_empty_${Date.now()}`,
          type: 'text',
          content: '',
        });
      }
    }

    // Aggregate legacy fields cleanly from blocks for search, Dashboard counters & compatibility
    const body = blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b.title ? `## ${b.title}\n\n${b.content || ''}` : b.content || ''))
      .filter(Boolean)
      .join('\n\n');

    const images = blocks
      .filter((b) => b.type === 'media' && b.mediaUrl)
      .map((b) => ({
        id: b.id,
        url: b.mediaUrl || '',
        alt: b.alt || b.title || 'Medien',
        caption: b.caption,
      }));

    const snippets = blocks
      .filter((b) => b.type === 'code')
      .map((b) => ({
        id: b.id,
        title: b.title || 'Code-Block',
        language: b.language || 'bash',
        code: b.content || '',
        collapsible: b.collapsible,
        defaultCollapsed: b.defaultCollapsed,
      }));

    return {
      slug,
      title,
      category,
      tags,
      visibility,
      author,
      storagePath,
      updatedAt,
      body: body.trim(),
      images,
      snippets,
      blocks,
      rawMarkdown: raw,
    };
  }

  function serializeWikiMarkdown(article: any): string {
    const safeTitle = (article.title || 'Unbenannt').replace(/"/g, '\\"');
    const safeCategory = (article.category || 'Allgemein').replace(/"/g, '\\"');
    const visibility: 'public' | 'private' = article.visibility === 'private' ? 'private' : 'public';
    const safeAuthor = String(article.author || 'michael').replace(/"/g, '');
    const tagsArr = Array.isArray(article.tags) ? article.tags : [];
    const tagsYaml = `[${tagsArr.map((t: string) => `"${String(t).replace(/"/g, '')}"`).join(', ')}]`;
    const updatedAt = article.updatedAt || new Date().toISOString();

    let md = `---\ntitle: "${safeTitle}"\ncategory: "${safeCategory}"\ntags: ${tagsYaml}\nvisibility: "${visibility}"\nauthor: "${safeAuthor}"\nupdatedAt: "${updatedAt}"\n---\n\n`;

    if (Array.isArray(article.blocks) && article.blocks.length > 0) {
      for (const blk of article.blocks as ServerWikiBlock[]) {
        const meta: Record<string, any> = { id: blk.id, type: blk.type };
        if (blk.title) meta.title = blk.title;
        if (blk.collapsible) meta.collapsible = true;
        if (blk.defaultCollapsed) meta.defaultCollapsed = true;
        if (blk.type === 'media') {
          if (blk.mediaKind) meta.mediaKind = blk.mediaKind;
          if (blk.mediaUrl) meta.mediaUrl = blk.mediaUrl;
          if (blk.alt) meta.alt = blk.alt;
          if (blk.caption) meta.caption = blk.caption;
        }
        if (blk.type === 'code' && blk.language) {
          meta.language = blk.language;
        }
        md += `<!-- wiki-block:${JSON.stringify(meta)} -->\n`;

        if (blk.type === 'text') {
          md += `${(blk.content || '').trim()}\n\n`;
        } else if (blk.type === 'media') {
          const kind = blk.mediaKind || inferMediaKindFromUrl(blk.mediaUrl || '');
          const label = blk.alt || blk.title || (kind === 'video' ? 'Video' : 'Abbildung');
          const url = blk.mediaUrl || '';
          const isDirectVideo =
            kind === 'video' &&
            (/\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(url) || url.startsWith('/api/wiki/assets/'));
          const innerMedia = isDirectVideo
            ? `<video src="${url}" controls></video>`
            : kind === 'video'
            ? `[🎥 ${label}](${url})`
            : `![${label}](${url})${blk.caption ? ` <!-- caption:${blk.caption} -->` : ''}`;
          const captionLine = blk.caption && kind === 'video' ? `\n*${blk.caption}*` : '';

          if (blk.collapsible) {
            const openAttr = blk.defaultCollapsed ? '' : ' open';
            md += `<details${openAttr}>\n<summary>${kind === 'video' ? '🎬' : '🖼️'} ${blk.title || label}</summary>\n\n${innerMedia}${captionLine}\n\n</details>\n\n`;
          } else {
            md += `${innerMedia}${captionLine}\n\n`;
          }
        } else if (blk.type === 'code') {
          const lang = blk.language || 'bash';
          const codeTitle = blk.title || 'Code-Block';
          const codeFence = `\`\`\`${lang}\n${blk.code ?? blk.content ?? ''}\n\`\`\``;
          if (blk.collapsible) {
            const openAttr = blk.defaultCollapsed ? '' : ' open';
            md += `<details${openAttr}>\n<summary>💻 ${codeTitle} (${lang})</summary>\n\n${codeFence}\n\n</details>\n\n`;
          } else {
            md += `### ${codeTitle}\n${codeFence}\n\n`;
          }
        }
      }
      return md.trimEnd() + '\n';
    }

    md += `${(article.body || '').trim()}\n`;

    if (Array.isArray(article.images) && article.images.length > 0) {
      md += `\n## 📸 Fotos & Abbildungen\n\n`;
      for (const img of article.images) {
        const capComment = img.caption ? ` <!-- caption:${img.caption} -->` : '';
        md += `![${img.alt || 'Anleitungsfoto'}](${img.url})${capComment}\n`;
      }
    }

    if (Array.isArray(article.snippets) && article.snippets.length > 0) {
      md += `\n## 💻 Code-Ablage\n`;
      for (const snip of article.snippets) {
        md += `\n### ${snip.title || 'Code-Snippet'}\n\`\`\`${snip.language || 'bash'}\n${snip.code || ''}\n\`\`\`\n`;
      }
    }

    return md;
  }

  app.get('/api/wiki/articles', async (req, res) => {
    const username = path.basename((req.query.username as string) || 'michael');
    try {
      const wikiDirs = ensureWikiDirectories(username);
      const articles: any[] = [];
      const seenSlugs = new Set<string>();

      // 1. Public Wiki articles (Wiki/Public/*.md)
      const publicFiles = (await fsp.readdir(wikiDirs.publicDir).catch(() => [])).filter((f) => f.endsWith('.md'));
      for (const f of publicFiles) {
        const slug = f.replace(/\.md$/, '');
        const raw = await fsp.readFile(path.join(wikiDirs.publicDir, f), 'utf-8');
        const parsed = parseWikiMarkdown(slug, raw, 'public', 'michael', `Wiki/Public/${f}`);
        parsed.visibility = 'public';
        parsed.storagePath = `Wiki/Public/${f}`;
        articles.push(parsed);
        seenSlugs.add(`public:${slug}`);
      }

      // 2. Private Wiki articles (Wiki/<username>/*.md)
      const privateFiles = (await fsp.readdir(wikiDirs.privateDir).catch(() => [])).filter((f) => f.endsWith('.md'));
      for (const f of privateFiles) {
        const slug = f.replace(/\.md$/, '');
        const raw = await fsp.readFile(path.join(wikiDirs.privateDir, f), 'utf-8');
        const parsed = parseWikiMarkdown(slug, raw, 'private', username, `Wiki/${username}/${f}`);
        parsed.visibility = 'private';
        parsed.author = parsed.author || username;
        parsed.storagePath = `Wiki/${username}/${f}`;
        articles.push(parsed);
        seenSlugs.add(`private:${slug}`);
      }

      articles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      res.json(articles);
    } catch (err: any) {
      log('error', `Fehler beim Laden der Wiki-Artikel: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/articles', async (req, res) => {
    const { username = 'michael', article, oldSlug, oldVisibility } = req.body;
    if (!article || !article.title) {
      return res.status(400).json({ error: 'Artikel oder Titel fehlt' });
    }
    try {
      const safeUser = path.basename(username);
      const wikiDirs = ensureWikiDirectories(safeUser);
      const visibility: 'public' | 'private' = article.visibility === 'private' ? 'private' : 'public';
      const targetDir = visibility === 'public' ? wikiDirs.publicDir : wikiDirs.privateDir;
      const targetAssetsDir = visibility === 'public' ? wikiDirs.publicAssets : wikiDirs.privateAssets;
      const targetScope = visibility === 'public' ? 'public' : safeUser;

      const slugBase = (article.slug || article.title)
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9\-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || `wiki-${Date.now()}`;

      // Copy & rewrite asset URLs if switching between Public and Private scope
      const fromScope = visibility === 'public' ? safeUser : 'public';
      const fromAssetsDir = visibility === 'public' ? wikiDirs.privateAssets : wikiDirs.publicAssets;
      const rewriteUrlScope = async (url?: string) => {
        if (!url) return url;
        const prefix = `/api/wiki/assets/${encodeURIComponent(fromScope)}/`;
        if (url.startsWith(prefix)) {
          const fname = decodeURIComponent(url.slice(prefix.length));
          const srcA = path.join(fromAssetsDir, path.basename(fname));
          const dstA = path.join(targetAssetsDir, path.basename(fname));
          if (fs.existsSync(srcA) && !fs.existsSync(dstA)) {
            await fsp.copyFile(srcA, dstA).catch(() => {});
          }
          return `/api/wiki/assets/${encodeURIComponent(targetScope)}/${encodeURIComponent(fname)}`;
        }
        return url;
      };

      const rewrittenBlocks = Array.isArray(article.blocks)
        ? await Promise.all(
            article.blocks.map(async (b: any) =>
              b.type === 'media' && b.mediaUrl
                ? { ...b, mediaUrl: await rewriteUrlScope(b.mediaUrl) }
                : b
            )
          )
        : article.blocks;

      const storagePath = visibility === 'public' ? `Wiki/Public/${slugBase}.md` : `Wiki/${safeUser}/${slugBase}.md`;
      const updatedArticle = {
        ...article,
        slug: slugBase,
        visibility,
        author: article.author || safeUser,
        storagePath,
        blocks: rewrittenBlocks,
        updatedAt: new Date().toISOString(),
      };
      const mdContent = serializeWikiMarkdown(updatedArticle);
      const targetPath = path.join(targetDir, `${slugBase}.md`);
      await fsp.writeFile(targetPath, mdContent, 'utf-8');

      // Remove old file if slug OR visibility changed
      const prevSlug = oldSlug || slugBase;
      const prevVis: 'public' | 'private' = oldVisibility === 'private' ? 'private' : oldVisibility === 'public' ? 'public' : visibility;
      if (prevSlug !== slugBase || prevVis !== visibility) {
        const prevDir = prevVis === 'public' ? wikiDirs.publicDir : wikiDirs.privateDir;
        const oldPath = path.join(prevDir, `${path.basename(prevSlug)}.md`);
        if (fs.existsSync(oldPath) && oldPath !== targetPath) {
          await fsp.unlink(oldPath).catch(() => {});
        }
      }

      log('info', `Wiki-Artikel gespeichert (Markdown): '${storagePath}'`, 'WIKI');
      res.json({ ...updatedArticle, rawMarkdown: mdContent });
    } catch (err: any) {
      log('error', `Fehler beim Speichern des Wiki-Artikels: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/wiki/articles', async (req, res) => {
    const username = path.basename((req.query.username as string) || 'michael');
    const slug = req.query.slug as string;
    const visibility = req.query.visibility as string | undefined;
    if (!slug) return res.status(400).json({ error: 'Slug fehlt' });
    try {
      const wikiDirs = ensureWikiDirectories(username);
      const safeSlug = path.basename(slug);
      const candidates =
        visibility === 'private'
          ? [path.join(wikiDirs.privateDir, `${safeSlug}.md`)]
          : visibility === 'public'
          ? [path.join(wikiDirs.publicDir, `${safeSlug}.md`)]
          : [path.join(wikiDirs.privateDir, `${safeSlug}.md`), path.join(wikiDirs.publicDir, `${safeSlug}.md`)];

      for (const fp of candidates) {
        if (fs.existsSync(fp)) {
          await fsp.unlink(fp);
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/upload', async (req, res) => {
    const { username = 'michael', filename = 'media.png', dataUrl, visibility = 'public' } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Mediendaten fehlen' });
    }
    try {
      const match = dataUrl.match(/^data:(image|video)\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Ungültiges Foto- oder Videoformat' });
      }
      const mediaKind = match[1].toLowerCase() === 'video' ? 'video' : 'image';
      const extMap: Record<string, string> = {
        jpeg: 'jpg',
        jpg: 'jpg',
        png: 'png',
        webp: 'webp',
        gif: 'gif',
        'svg+xml': 'svg',
        mp4: 'mp4',
        webm: 'webm',
        quicktime: 'mov',
        ogg: 'ogv',
        'x-matroska': 'mkv',
      };
      const ext = extMap[match[2].toLowerCase()] || (mediaKind === 'video' ? 'mp4' : 'png');
      const baseName = path.basename(filename, path.extname(filename))
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .slice(0, 40) || (mediaKind === 'video' ? 'video' : 'foto');
      const savedName = `${Date.now()}_${baseName}.${ext}`;

      const safeUser = path.basename(username);
      const wikiDirs = ensureWikiDirectories(safeUser);
      const isPrivate = visibility === 'private';
      const assetsDir = isPrivate ? wikiDirs.privateAssets : wikiDirs.publicAssets;
      const scope = isPrivate ? safeUser : 'public';
      if (!fs.existsSync(assetsDir)) await fsp.mkdir(assetsDir, { recursive: true });

      const buffer = Buffer.from(match[3], 'base64');
      await fsp.writeFile(path.join(assetsDir, savedName), buffer);

      const url = `/api/wiki/assets/${encodeURIComponent(scope)}/${encodeURIComponent(savedName)}`;
      log('info', `Wiki-${mediaKind === 'video' ? 'Video' : 'Foto'} hochgeladen (${scope}): ${savedName} (${buffer.length} Bytes)`, 'WIKI');
      res.json({ success: true, url, filename: savedName, mediaKind });
    } catch (err: any) {
      log('error', `Fehler beim Wiki-Medienupload: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/wiki/assets/:scope/:filename', async (req, res) => {
    const { scope, filename } = req.params;
    try {
      const safeScope = path.basename(scope);
      const safeFile = path.basename(filename);
      const wikiDirs = ensureWikiDirectories(safeScope === 'public' ? 'michael' : safeScope);

      const candidates = [
        safeScope === 'public'
          ? path.join(wikiDirs.publicAssets, safeFile)
          : path.join(wikiDirs.privateAssets, safeFile),
        path.join(wikiDirs.publicAssets, safeFile),
        path.join(VAULT_PATH, 'User', safeScope, 'Wiki', 'assets', safeFile),
      ];

      const fullPath = candidates.find((p) => fs.existsSync(p));
      if (!fullPath) {
        return res.status(404).send('Asset not found');
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).send('Asset not found');
    }
  });

  // Share / copy a Wiki article directly to another user's private Wiki folder
  app.post('/api/wiki/share', async (req, res) => {
    const { fromUsername, toUsername, slug, visibility = 'public' } = req.body;
    if (!fromUsername || !toUsername || !slug) {
      return res.status(400).json({ error: 'fromUsername, toUsername oder slug fehlt' });
    }
    try {
      const safeFrom = path.basename(fromUsername);
      const safeTo = path.basename(toUsername);
      const fromDirs = ensureWikiDirectories(safeFrom);
      const toDirs = ensureWikiDirectories(safeTo);
      const safeSlug = path.basename(slug);

      const candidates =
        visibility === 'private'
          ? [path.join(fromDirs.privateDir, `${safeSlug}.md`), path.join(fromDirs.publicDir, `${safeSlug}.md`)]
          : [path.join(fromDirs.publicDir, `${safeSlug}.md`), path.join(fromDirs.privateDir, `${safeSlug}.md`)];
      const srcFile = candidates.find((p) => fs.existsSync(p));
      if (!srcFile) {
        return res.status(404).json({ error: 'Wiki-Artikel nicht gefunden' });
      }

      let raw = await fsp.readFile(srcFile, 'utf-8');
      const srcScope = srcFile.startsWith(fromDirs.publicDir) ? 'public' : safeFrom;
      const srcAssetsDir = srcScope === 'public' ? fromDirs.publicAssets : fromDirs.privateAssets;
      const assetPrefix = `/api/wiki/assets/${encodeURIComponent(srcScope)}/`;
      const destAssetPrefix = `/api/wiki/assets/${encodeURIComponent(safeTo)}/`;

      const regex = new RegExp(assetPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^)"\'\\s]+)', 'g');
      let match;
      const toCopy = new Set<string>();
      while ((match = regex.exec(raw)) !== null) {
        toCopy.add(decodeURIComponent(match[1]));
      }
      for (const imgName of toCopy) {
        const srcImg = path.join(srcAssetsDir, path.basename(imgName));
        const destImg = path.join(toDirs.privateAssets, path.basename(imgName));
        if (fs.existsSync(srcImg)) {
          await fsp.copyFile(srcImg, destImg);
        }
      }
      raw = raw.split(assetPrefix).join(destAssetPrefix);
      raw = raw.replace(/^visibility:\s*".*"$/m, 'visibility: "private"');
      const targetSlug = `${safeSlug}-von-${safeFrom}`;
      await fsp.writeFile(path.join(toDirs.privateDir, `${targetSlug}.md`), raw, 'utf-8');
      log('info', `Wiki-Artikel '${safeSlug}' von '${safeFrom}' an '${safeTo}' (Wiki/${safeTo}/) geteilt`, 'WIKI');
      res.json({ success: true, targetSlug });
    } catch (err: any) {
      log('error', `Fehler beim Teilen des Wiki-Artikels: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // ESSENSPLAN (OPEN-STANDARD MEAL LIBRARIES & RECIPES API)
  // =========================================================================
  const DEFAULT_COOKBOOK_CATEGORIES = ['Frühstück', 'Mittagessen', 'Abendessen', 'Snack', 'Dessert', 'Vegetarisch', 'Schnelle Küche'];
  const DEFAULT_MEAL_SECTIONS = [
    { id: 'mittag', label: 'Mittag' },
    { id: 'abend', label: 'Abend' },
  ];
  const DEFAULT_WEEKDAY_COLORS: Record<string, string> = {
    '1': '#C87D20',
    '2': '#B87333',
    '3': '#A67C21',
    '4': '#C26D2D',
    '5': '#6E7F4F',
    '6': '#8E6126',
    '0': '#B45309',
  };

  interface MealPlanLibraryRecord {
    id: string;
    name: string;
    ownerUsername: string;
    ownerDisplayName: string;
    visibility: 'private' | 'shared';
    invitedUsers: string[];
    members: string[];
    storageKey: string; // Either 'user:<username>' or 'lib:<libraryId>'
    createdAt: number;
  }

  function sanitizeRecipeMediaDir(rawName: string): string {
    return (
      String(rawName || 'rezept')
        .replace(/ä/gi, 'ae')
        .replace(/ö/gi, 'oe')
        .replace(/ü/gi, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64) || 'rezept'
    );
  }

  function recipeFileSlug(recipe: any): string {
    const cleanTitle = sanitizeRecipeMediaDir(recipe.title || 'rezept').toLowerCase();
    const cleanId = String(recipe.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return cleanId ? `${cleanTitle}__${cleanId}` : cleanTitle;
  }

  function getRecipeMediaDirName(recipe: any): string {
    if (recipe.mediaDir) return sanitizeRecipeMediaDir(recipe.mediaDir);
    return sanitizeRecipeMediaDir(`${recipe.title || 'rezept'}_${recipe.id || ''}`);
  }

  function serializeRecipeMarkdown(recipe: any): string {
    const safeTitle = String(recipe.title || 'Unbenanntes Gericht').replace(/"/g, '\\"');
    const safeCategory = String(recipe.category || 'Mittagessen').replace(/"/g, '\\"');
    const tagsArr = Array.isArray(recipe.tags) ? recipe.tags : [];
    const tagsYaml = `[${tagsArr.map((t: string) => `"${String(t).replace(/"/g, '')}"`).join(', ')}]`;
    const mealTypesArr = Array.isArray(recipe.mealTypes) ? recipe.mealTypes : [];
    const mealTypesYaml = `[${mealTypesArr.map((t: string) => `"${String(t).replace(/"/g, '')}"`).join(', ')}]`;
    const mediaDir = getRecipeMediaDirName(recipe);

    let fm = `---\n`;
    fm += `id: "${String(recipe.id || `r_${Date.now()}`).replace(/"/g, '')}"\n`;
    fm += `title: "${safeTitle}"\n`;
    fm += `category: "${safeCategory}"\n`;
    if (mealTypesArr.length > 0) {
      fm += `mealTypes: ${mealTypesYaml}\n`;
    }
    fm += `prepTimeMinutes: ${Number(recipe.prepTimeMinutes) || 20}\n`;
    fm += `portions: ${Math.max(1, Number(recipe.portions) || 2)}\n`;
    fm += `tags: ${tagsYaml}\n`;
    fm += `mediaDir: "${mediaDir}"\n`;
    if (recipe.sharedFrom) {
      fm += `sharedFrom: "${String(recipe.sharedFrom).replace(/"/g, '\\"')}"\n`;
    }
    if (recipe.color) {
      fm += `color: "${String(recipe.color).replace(/"/g, '')}"\n`;
    }
    fm += `---\n\n`;

    let md = fm;
    md += `# ${recipe.title || 'Unbenanntes Gericht'}\n\n`;
    if (recipe.description) {
      md += `${String(recipe.description).trim()}\n\n`;
    }

    md += `## Zutaten\n\n`;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    for (const ing of ingredients) {
      const name = String(ing.name || '').trim();
      const amount = String(ing.amount || '').trim();
      if (!name && !amount) continue;
      md += amount ? `- ${name} | ${amount}\n` : `- ${name}\n`;
    }

    md += `\n## Zubereitung\n\n`;
    const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
    instructions.forEach((step: string, idx: number) => {
      const clean = String(step || '').replace(/^\d+\.\s*/, '').trim();
      if (clean) md += `${idx + 1}. ${clean}\n`;
    });

    const images = Array.isArray(recipe.images) ? recipe.images : [];
    if (images.length > 0) {
      md += `\n## Bilder\n\n`;
      images.forEach((imgUrl: string, idx: number) => {
        md += `![${recipe.title || 'Gericht'} ${idx + 1}](${imgUrl})\n`;
      });
    }

    return md;
  }

  function parseRecipeMarkdown(filename: string, raw: string) {
    const fallbackId = filename.replace(/\.md$/i, '');
    let id = fallbackId;
    let title = fallbackId;
    let category = 'Mittagessen';
    let mealTypes: string[] = [];
    let prepTimeMinutes = 20;
    let portions = 2;
    let tags: string[] = [];
    let mediaDir = '';
    let sharedFrom: string | undefined;
    let color: string | undefined;
    let content = raw;

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (fmMatch) {
      const fm = fmMatch[1];
      content = raw.slice(fmMatch[0].length);
      const getStr = (key: string) => {
        const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\r\\n]+)"?`, 'm'));
        return m ? m[1].trim().replace(/\\"/g, '"') : undefined;
      };
      id = getStr('id') || id;
      title = getStr('title') || title;
      category = getStr('category') || category;
      mediaDir = getStr('mediaDir') || '';
      sharedFrom = getStr('sharedFrom');
      color = getStr('color');

      const pTime = fm.match(/^prepTimeMinutes:\s*(\d+)/m);
      if (pTime) prepTimeMinutes = parseInt(pTime[1], 10) || 20;
      const pPortions = fm.match(/^portions:\s*(\d+)/m);
      if (pPortions) portions = Math.max(1, parseInt(pPortions[1], 10) || 2);
      const tMatch = fm.match(/^tags:\s*\[(.*)\]/m);
      if (tMatch) {
        tags = tMatch[1]
          .split(',')
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
      const mtMatch = fm.match(/^mealTypes:\s*\[(.*)\]/m);
      if (mtMatch) {
        mealTypes = mtMatch[1]
          .split(',')
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    }

    // Parse sections: # Title, description, ## Zutaten, ## Zubereitung, ## Bilder
    const lines = content.split(/\r?\n/);
    let section: 'desc' | 'ingredients' | 'instructions' | 'images' = 'desc';
    const descLines: string[] = [];
    const ingredients: Array<{ id: string; name: string; amount: string }> = [];
    const instructions: string[] = [];
    const images: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#\s+/.test(trimmed) && section === 'desc' && descLines.length === 0) {
        if (title === fallbackId) title = trimmed.replace(/^#\s+/, '').trim();
        continue;
      }
      if (/^##\s+Zutaten/i.test(trimmed)) {
        section = 'ingredients';
        continue;
      }
      if (/^##\s+Zubereitung/i.test(trimmed)) {
        section = 'instructions';
        continue;
      }
      if (/^##\s+Bilder/i.test(trimmed)) {
        section = 'images';
        continue;
      }

      if (section === 'desc') {
        descLines.push(line);
      } else if (section === 'ingredients') {
        const m = trimmed.match(/^[-*]\s+(.+)$/);
        if (m) {
          const parts = m[1].split('|');
          const name = (parts[0] || '').trim();
          const amount = parts.slice(1).join('|').trim();
          if (name) {
            ingredients.push({
              id: `ing_${id}_${ingredients.length}`,
              name,
              amount,
            });
          }
        }
      } else if (section === 'instructions') {
        const m = trimmed.match(/^(?:\d+\.|[-*])\s+(.+)$/);
        if (m) {
          instructions.push(m[1].trim());
        } else if (trimmed) {
          instructions.push(trimmed);
        }
      } else if (section === 'images') {
        const imgM = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)/);
        if (imgM) {
          images.push(imgM[1].trim());
        }
      }
    }

    const recipe: any = {
      id,
      title,
      category,
      mealTypes,
      prepTimeMinutes,
      portions,
      description: descLines.join('\n').trim(),
      instructions,
      ingredients,
      tags,
      mediaDir: mediaDir || sanitizeRecipeMediaDir(`${title}_${id}`),
      images,
    };
    if (sharedFrom) recipe.sharedFrom = sharedFrom;
    if (color) recipe.color = color;
    return recipe;
  }

  function getCookbookDirsFromStorageKey(storageKey: string): { cookbook: string; cookbookRecipes: string; cookbookMedia: string; routeKey: string } {
    if (storageKey.startsWith('lib:')) {
      const libId = path.basename(storageKey.slice(4));
      const base = path.join(VAULT_PATH, 'Essensplan', libId);
      const recipesDir = path.join(base, 'Rezepte');
      const mediaDir = path.join(base, 'Media');
      for (const d of [base, recipesDir, mediaDir]) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true, mode: 0o775 });
      }
      return { cookbook: base, cookbookRecipes: recipesDir, cookbookMedia: mediaDir, routeKey: libId };
    }
    const uname = path.basename(storageKey.startsWith('user:') ? storageKey.slice(5) : storageKey || 'michael');
    const dirs = ensureUserProfileStructure(uname);
    return {
      cookbook: dirs.cookbook,
      cookbookRecipes: dirs.cookbookRecipes,
      cookbookMedia: dirs.cookbookMedia,
      routeKey: uname,
    };
  }

  async function getMealLibraries(): Promise<MealPlanLibraryRecord[]> {
    const file = getConfigFile('meal_libraries.json');
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(await fsp.readFile(file, 'utf-8'));
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }

    // One-time seamless migration ONLY for users who already have .md recipes on disk (e.g. Michael)
    const users = await getUsers();
    const seeded: MealPlanLibraryRecord[] = [];
    for (const u of users) {
      const userCookbookRecipes = path.join(getUserBaseDir(u.username), 'Cookbook', 'Rezepte');
      if (fs.existsSync(userCookbookRecipes)) {
        const mdFiles = fs.readdirSync(userCookbookRecipes).filter((f) => f.endsWith('.md'));
        if (mdFiles.length > 0) {
          seeded.push({
            id: `lib_${u.username}`,
            name: `${u.displayName}s Essensplan`,
            ownerUsername: u.username,
            ownerDisplayName: u.displayName,
            visibility: 'private',
            invitedUsers: [],
            members: [u.username],
            storageKey: `user:${u.username}`,
            createdAt: Date.now(),
          });
        }
      }
    }
    await fsp.writeFile(file, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
  }

  async function saveMealLibraries(libs: MealPlanLibraryRecord[]) {
    const file = getConfigFile('meal_libraries.json');
    await fsp.writeFile(file, JSON.stringify(libs, null, 2), 'utf-8');
  }

  async function getUserLibraryPrefs(): Promise<Record<string, string>> {
    const file = getConfigFile('meal_library_prefs.json');
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(await fsp.readFile(file, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
    return {};
  }

  async function setUserActiveLibraryId(username: string, libraryId: string | null) {
    const prefs = await getUserLibraryPrefs();
    if (libraryId) prefs[username] = libraryId;
    else delete prefs[username];
    const file = getConfigFile('meal_library_prefs.json');
    await fsp.writeFile(file, JSON.stringify(prefs, null, 2), 'utf-8');
  }

  async function resolveUserLibraryContext(username: string): Promise<{
    library: MealPlanLibraryRecord | null;
    userLibraries: MealPlanLibraryRecord[];
    invitations: Array<{ libraryId: string; name: string; ownerUsername: string; ownerDisplayName: string; membersCount: number; createdAt: number }>;
    allLibraries: MealPlanLibraryRecord[];
  }> {
    const libs = await getMealLibraries();
    const userLibraries = libs.filter((l) => l.members.includes(username));
    const prefs = await getUserLibraryPrefs();
    const preferredId = prefs[username];
    const activeLib =
      (preferredId ? userLibraries.find((l) => l.id === preferredId) : null) ||
      userLibraries[0] ||
      null;
    const invitations = libs
      .filter((l) => l.visibility === 'shared' && l.invitedUsers.includes(username) && !l.members.includes(username))
      .map((l) => ({
        libraryId: l.id,
        name: l.name,
        ownerUsername: l.ownerUsername,
        ownerDisplayName: l.ownerDisplayName,
        membersCount: l.members.length,
        createdAt: l.createdAt,
      }));
    return { library: activeLib, userLibraries, invitations, allLibraries: libs };
  }

  async function resolveCookbookDirsForKey(keyOrUsername: string): Promise<{ cookbook: string; cookbookRecipes: string; cookbookMedia: string; routeKey: string }> {
    const clean = path.basename(String(keyOrUsername || 'michael'));
    const libs = await getMealLibraries();
    const byId = libs.find((l) => l.id === clean);
    if (byId) {
      return getCookbookDirsFromStorageKey(byId.storageKey);
    }
    const prefs = await getUserLibraryPrefs();
    const prefId = prefs[clean];
    if (prefId) {
      const prefLib = libs.find((l) => l.id === prefId && l.members.includes(clean));
      if (prefLib) {
        return getCookbookDirsFromStorageKey(prefLib.storageKey);
      }
    }
    const byMember = libs.find((l) => l.members.includes(clean));
    if (byMember) {
      return getCookbookDirsFromStorageKey(byMember.storageKey);
    }
    return getCookbookDirsFromStorageKey(`user:${clean}`);
  }

  async function syncCookbookMarkdownFilesForDirs(
    dirs: { cookbook: string; cookbookRecipes: string; cookbookMedia: string; routeKey: string },
    recipes: any[]
  ) {
    const keepFiles = new Set<string>();

    for (const r of recipes) {
      const mDir = getRecipeMediaDirName(r);
      const enriched = { ...r, mediaDir: mDir };
      const slug = recipeFileSlug(enriched);
      const fileName = `${slug}.md`;
      keepFiles.add(fileName);
      await fsp.writeFile(path.join(dirs.cookbookRecipes, fileName), serializeRecipeMarkdown(enriched), 'utf-8');
    }

    if (fs.existsSync(dirs.cookbookRecipes)) {
      const existing = await fsp.readdir(dirs.cookbookRecipes);
      for (const f of existing) {
        if (f.endsWith('.md') && !keepFiles.has(f)) {
          await fsp.unlink(path.join(dirs.cookbookRecipes, f)).catch(() => {});
        }
      }
    }

    await fsp.writeFile(path.join(dirs.cookbook, 'recipes.json'), JSON.stringify(recipes, null, 2), 'utf-8');
  }

  async function syncCookbookMarkdownFiles(username: string, recipes: any[]) {
    const dirs = await resolveCookbookDirsForKey(username);
    await syncCookbookMarkdownFilesForDirs(dirs, recipes);
  }

  function getDefaultRecipesForUser(username: string) {
    if (username !== 'michael') return [];
    return [
      {
        id: 'r_1',
        title: 'Cremiges Kichererbsen-Curry mit Kokos',
        category: 'Mittagessen',
        prepTimeMinutes: 25,
        portions: 3,
        description: 'Aromatisches Curry mit Kokosmilch, frischem Spinat und Limette. Perfekt für Meal-Prep.',
        instructions: [
          'Zwiebeln, Knoblauch und Ingwer fein würfeln und in Kokosöl anbraten.',
          'Currypulver, Kreuzkümmel und Kurkuma kurz mitrösten.',
          'Kichererbsen und stückige Tomaten sowie Kokosmilch dazugeben, 15 Min köcheln lassen.',
          'Frischen Blattspinat unterheben bis er zusammenfällt, mit Limettensaft und Salz abschmecken.'
        ],
        ingredients: [
          { id: 'i1', name: 'Kichererbsen (Dose)', amount: '1 Dose (400g)' },
          { id: 'i2', name: 'Kokosmilch', amount: '250ml' },
          { id: 'i3', name: 'Babyspinat', amount: '150g' },
          { id: 'i4', name: 'Basmatireis', amount: '200g' }
        ],
        tags: ['vegetarisch', 'schnell', 'meal-prep'],
      },
      {
        id: 'r_2',
        title: 'Mediterrane Ofengemüse-Bowl mit Feta',
        category: 'Abendessen',
        prepTimeMinutes: 30,
        portions: 2,
        description: 'Buntes Blechgemüse mit Rosmarin, Olivenöl und goldbraun gebackenem Feta.',
        instructions: [
          'Backofen auf 200°C Ober-/Unterhitze vorheizen.',
          'Zucchini, Paprika und rote Zwiebeln in mundgerechte Stücke schneiden.',
          'Mit Olivenöl, Rosmarin, Salz und Pfeffer auf einem Blech verteilen.',
          'Feta in die Mitte legen und 25-30 Minuten im Ofen backen.'
        ],
        ingredients: [
          { id: 'i5', name: 'Feta', amount: '200g' },
          { id: 'i6', name: 'Zucchini', amount: '1 Stück' },
          { id: 'i7', name: 'Paprika (rot & gelb)', amount: '2 Stück' },
          { id: 'i8', name: 'Olivenöl extra vergine', amount: '3 EL' }
        ],
        tags: ['mediterran', 'low-carb', 'ofen'],
      },
      {
        id: 'r_3',
        title: 'Overnight Oats mit Beeren & Chiasamen',
        category: 'Frühstück',
        prepTimeMinutes: 5,
        portions: 1,
        description: 'Energiespendendes Frühstück, am Vorabend zusammengerührt.',
        instructions: [
          'Haferflocken, Chiasamen und Mandelmilch in einem Glas verrühren.',
          'Mit einer Prise Zimt und Ahornsirup verfeinern.',
          'Über Nacht im Kühlschrank quellen lassen.',
          'Morgens mit frischen Beeren und Nüssen garnieren.'
        ],
        ingredients: [
          { id: 'i9', name: 'Zarte Haferflocken', amount: '60g' },
          { id: 'i10', name: 'Mandelmilch', amount: '140ml' },
          { id: 'i11', name: 'Chiasamen', amount: '1 EL' },
          { id: 'i12', name: 'Waldbeeren', amount: '50g' }
        ],
        tags: ['frühstück', 'protein', 'vegan'],
      },
      {
        id: 'r_4',
        title: 'Pasta mit Tomaten-Basilikum-Sugo',
        category: 'Schnelle Küche',
        prepTimeMinutes: 20,
        portions: 2,
        description: 'Klassische italienische Pasta mit sonnengereiften Tomaten und frischem Parmesan.',
        instructions: [
          'Nudeln in reichlich Salzwasser al dente kochen.',
          'Knoblauch in Olivenöl sanft anbraten, gehackte Tomaten hinzugeben.',
          '10 Minuten köcheln lassen, frischen Basilikum einrühren.',
          'Pasta untermengen und mit frisch geriebenem Parmesan servieren.'
        ],
        ingredients: [
          { id: 'i13', name: 'Spaghetti oder Penne', amount: '250g' },
          { id: 'i14', name: 'San Marzano Tomaten', amount: '1 Dose' },
          { id: 'i15', name: 'Frischer Basilikum', amount: '1 Bund' },
          { id: 'i16', name: 'Parmigiano Reggiano', amount: '40g' }
        ],
        tags: ['italienisch', 'klassiker', 'schnell'],
      }
    ];
  }

  function getDefaultCycleForUser(username: string, defaultPortions = 2) {
    const startDate = new Date().toISOString().split('T')[0];
    if (username === 'michael') {
      return {
        id: 'c_default',
        name: 'Standard-Wochenzyklus',
        cycleLengthDays: 7,
        startDate,
        defaultPortions,
        days: [
          { dayIndex: 0, label: 'Tag 1 (Mo)', recipeIds: ['r_1'], portions: defaultPortions },
          { dayIndex: 1, label: 'Tag 2 (Di)', recipeIds: ['r_2'], portions: defaultPortions },
          { dayIndex: 2, label: 'Tag 3 (Mi)', recipeIds: ['r_4'], portions: defaultPortions },
          { dayIndex: 3, label: 'Tag 4 (Do)', recipeIds: ['r_1'], portions: defaultPortions },
          { dayIndex: 4, label: 'Tag 5 (Fr)', recipeIds: ['r_2'], portions: defaultPortions },
          { dayIndex: 5, label: 'Tag 6 (Sa)', recipeIds: ['r_3', 'r_4'], portions: defaultPortions },
          { dayIndex: 6, label: 'Tag 7 (So)', recipeIds: ['r_2'], portions: defaultPortions },
        ],
      };
    }
    return {
      id: `c_${username}`,
      name: 'Mein Essenszyklus',
      cycleLengthDays: 7,
      startDate,
      defaultPortions,
      days: Array.from({ length: 7 }, (_, i) => ({
        dayIndex: i,
        label: `Tag ${i + 1}`,
        recipeIds: [],
        portions: defaultPortions,
      })),
    };
  }

  async function readRecipeMediaUrls(storageRouteKey: string, mediaDirName: string): Promise<string[]> {
    const dirs = await resolveCookbookDirsForKey(storageRouteKey);
    const safeDir = sanitizeRecipeMediaDir(mediaDirName);
    const fullDir = path.join(dirs.cookbookMedia, safeDir);
    if (!fs.existsSync(fullDir)) return [];
    const entries = await fsp.readdir(fullDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && IMAGE_EXT_REGEX.test(e.name))
      .map((e) => `/api/cookbook/media/file/${encodeURIComponent(dirs.routeKey)}/${encodeURIComponent(safeDir)}/${encodeURIComponent(e.name)}`);
  }

  async function readCookbookDataFromDirs(dirs: { cookbook: string; cookbookRecipes: string; cookbookMedia: string; routeKey: string }, cycleIdHint: string) {
    const recipesFile = path.join(dirs.cookbook, 'recipes.json');
    const categoriesFile = path.join(dirs.cookbook, 'categories.json');
    const cycleFile = path.join(dirs.cookbook, 'cycle.json');
    const overridesFile = path.join(dirs.cookbook, 'overrides.json');
    const sharingFile = path.join(dirs.cookbook, 'sharing.json');
    const settingsFile = path.join(dirs.cookbook, 'settings.json');
    const ingredientsFile = path.join(dirs.cookbook, 'ingredients.json');

    const DEFAULT_MEAL_UNITS = ['Gramm', 'KG', 'Liter', 'ml', 'Päckchen', 'Stück', 'EL', 'TL', 'Bund', 'Prise', 'Dose', 'Becher'];
    let settings: any = {
      defaultCyclePortions: 2,
      enableShoppingList: true,
      enableCycle: true,
      mealSections: [...DEFAULT_MEAL_SECTIONS],
      weekdayColors: { ...DEFAULT_WEEKDAY_COLORS },
      units: [...DEFAULT_MEAL_UNITS],
    };
    if (fs.existsSync(settingsFile)) {
      try {
        const parsedSettings = JSON.parse(await fsp.readFile(settingsFile, 'utf-8'));
        settings = {
          ...settings,
          ...parsedSettings,
          mealSections:
            Array.isArray(parsedSettings?.mealSections) && parsedSettings.mealSections.length > 0
              ? parsedSettings.mealSections
              : settings.mealSections,
          weekdayColors: {
            ...DEFAULT_WEEKDAY_COLORS,
            ...(parsedSettings?.weekdayColors || {}),
          },
          units:
            Array.isArray(parsedSettings?.units) && parsedSettings.units.length > 0
              ? parsedSettings.units
              : settings.units,
        };
      } catch {}
    } else {
      await fsp.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    }

    let ingredientData: { ingredientMeta: Record<string, any>; dismissedDuplicates: string[] } = {
      ingredientMeta: {},
      dismissedDuplicates: [],
    };
    if (fs.existsSync(ingredientsFile)) {
      try {
        const parsedIng = JSON.parse(await fsp.readFile(ingredientsFile, 'utf-8'));
        ingredientData = {
          ingredientMeta: parsedIng?.ingredientMeta && typeof parsedIng.ingredientMeta === 'object' ? parsedIng.ingredientMeta : {},
          dismissedDuplicates: Array.isArray(parsedIng?.dismissedDuplicates) ? parsedIng.dismissedDuplicates : [],
        };
      } catch {}
    }

    let recipes: any[] = [];
    const mdFiles = fs.existsSync(dirs.cookbookRecipes)
      ? (await fsp.readdir(dirs.cookbookRecipes)).filter((f) => f.endsWith('.md'))
      : [];

    if (mdFiles.length > 0) {
      for (const f of mdFiles) {
        const raw = await fsp.readFile(path.join(dirs.cookbookRecipes, f), 'utf-8');
        recipes.push(parseRecipeMarkdown(f, raw));
      }
    } else if (fs.existsSync(recipesFile)) {
      recipes = JSON.parse(await fsp.readFile(recipesFile, 'utf-8'));
      if (recipes.length > 0) {
        await syncCookbookMarkdownFilesForDirs(dirs, recipes);
      }
    }

    for (let i = 0; i < recipes.length; i++) {
      const mDir = getRecipeMediaDirName(recipes[i]);
      const diskImgs = await readRecipeMediaUrls(dirs.routeKey, mDir);
      const existingImgs = Array.isArray(recipes[i].images) ? recipes[i].images : [];
      const merged = Array.from(new Set([...diskImgs, ...existingImgs]));
      recipes[i] = { ...recipes[i], mediaDir: mDir, images: merged };
    }

    let categories: string[] = [...DEFAULT_COOKBOOK_CATEGORIES];
    if (fs.existsSync(categoriesFile)) {
      categories = JSON.parse(await fsp.readFile(categoriesFile, 'utf-8'));
    } else {
      await fsp.writeFile(categoriesFile, JSON.stringify(categories, null, 2), 'utf-8');
    }

    let cycle: any;
    if (fs.existsSync(cycleFile)) {
      cycle = JSON.parse(await fsp.readFile(cycleFile, 'utf-8'));
    } else {
      cycle = getDefaultCycleForUser(cycleIdHint, settings.defaultCyclePortions || 2);
      await fsp.writeFile(cycleFile, JSON.stringify(cycle, null, 2), 'utf-8');
    }

    let overrides: Record<string, any> = {};
    if (fs.existsSync(overridesFile)) {
      overrides = JSON.parse(await fsp.readFile(overridesFile, 'utf-8'));
    } else {
      await fsp.writeFile(overridesFile, JSON.stringify(overrides, null, 2), 'utf-8');
    }

    let sharing = {
      shareCatalog: false,
      catalogSharedWith: ['*'],
      shareCycleAndCalendar: false,
      cycleSharedWith: ['*'],
    };
    if (fs.existsSync(sharingFile)) {
      sharing = { ...sharing, ...JSON.parse(await fsp.readFile(sharingFile, 'utf-8')) };
    } else {
      await fsp.writeFile(sharingFile, JSON.stringify(sharing, null, 2), 'utf-8');
    }

    return {
      recipes,
      categories,
      cycle,
      overrides,
      sharing,
      settings,
      ingredientMeta: ingredientData.ingredientMeta,
      dismissedDuplicates: ingredientData.dismissedDuplicates,
    };
  }

  function buildEmptyCookbookPayload(username: string) {
    return {
      recipes: [],
      categories: [...DEFAULT_COOKBOOK_CATEGORIES],
      cycle: getDefaultCycleForUser(username, 2),
      overrides: {},
      sharing: {
        shareCatalog: false,
        catalogSharedWith: ['*'],
        shareCycleAndCalendar: false,
        cycleSharedWith: ['*'],
      },
      settings: {
        defaultCyclePortions: 2,
        enableShoppingList: true,
        enableCycle: true,
        mealSections: [...DEFAULT_MEAL_SECTIONS],
        weekdayColors: { ...DEFAULT_WEEKDAY_COLORS },
      },
      ingredientMeta: {},
      dismissedDuplicates: [],
    };
  }

  app.get('/api/cookbook', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    try {
      const { library, userLibraries, invitations, allLibraries } = await resolveUserLibraryContext(username);
      const users = await getUsers();

      const serializeLibMeta = (l: MealPlanLibraryRecord) => ({
        id: l.id,
        name: l.name,
        ownerUsername: l.ownerUsername,
        ownerDisplayName: l.ownerDisplayName,
        visibility: l.visibility,
        invitedUsers: l.invitedUsers,
        members: l.members,
        createdAt: l.createdAt,
      });

      if (!library) {
        return res.json({
          hasLibrary: false,
          library: null,
          libraries: userLibraries.map(serializeLibMeta),
          invitations,
          ...buildEmptyCookbookPayload(username),
          sharedCatalogs: [],
          sharedPlans: [],
        });
      }

      const dirs = getCookbookDirsFromStorageKey(library.storageKey);
      const ownData = await readCookbookDataFromDirs(dirs, library.ownerUsername || username);

      const sharedCatalogs: any[] = [];
      const sharedPlans: any[] = [];

      // Legacy user-level sharing compatibility (for users who have distinct libraries)
      const checkedKeys = new Set<string>([library.id]);
      for (const lib of allLibraries) {
        if (checkedKeys.has(lib.id)) continue;
        checkedKeys.add(lib.id);
        const ownerUser = users.find((u) => u.username === lib.ownerUsername);
        const otherDirs = getCookbookDirsFromStorageKey(lib.storageKey);
        const other = await readCookbookDataFromDirs(otherDirs, lib.ownerUsername);

        const catalogAllowed =
          other.sharing.shareCatalog &&
          (other.sharing.catalogSharedWith.includes('*') || other.sharing.catalogSharedWith.includes(username));
        if (catalogAllowed) {
          sharedCatalogs.push({
            ownerUsername: lib.ownerUsername,
            ownerDisplayName: ownerUser?.displayName || lib.ownerDisplayName || lib.ownerUsername,
            recipes: other.recipes.map((r: any) => ({ ...r, sharedFrom: ownerUser?.displayName || lib.ownerDisplayName })),
            categories: other.categories,
          });
        }

        const planAllowed =
          other.sharing.shareCycleAndCalendar &&
          (other.sharing.cycleSharedWith.includes('*') || other.sharing.cycleSharedWith.includes(username));
        if (planAllowed) {
          sharedPlans.push({
            ownerUsername: lib.ownerUsername,
            ownerDisplayName: ownerUser?.displayName || lib.ownerDisplayName || lib.ownerUsername,
            cycle: other.cycle,
            overrides: other.overrides,
            recipes: other.recipes,
          });
        }
      }

      res.json({
        hasLibrary: true,
        library: serializeLibMeta(library),
        libraries: userLibraries.map(serializeLibMeta),
        invitations,
        ...ownData,
        sharedCatalogs,
        sharedPlans,
      });
    } catch (err: any) {
      log('error', `Fehler beim Laden des Essensplans: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  // Create or update an Essensplan Library
  app.post('/api/cookbook/library', async (req, res) => {
    const {
      username = 'michael',
      libraryId,
      name = 'Mein Essensplan',
      visibility = 'private',
      invitedUsers = [],
      createNew = false,
    } = req.body;

    try {
      const users = await getUsers();
      const actor = users.find((u) => u.username === username);
      const libs = await getMealLibraries();
      const cleanVisibility: 'private' | 'shared' = visibility === 'shared' ? 'shared' : 'private';
      const cleanName = String(name || 'Mein Essensplan').trim() || 'Mein Essensplan';
      const cleanInvited = cleanVisibility === 'shared' && Array.isArray(invitedUsers)
        ? Array.from(new Set(invitedUsers.map((u: any) => String(u).trim()).filter((u) => u && u !== username)))
        : [];

      if (libraryId && !createNew) {
        const idx = libs.findIndex((l) => l.id === libraryId);
        if (idx === -1) {
          return res.status(404).json({ error: 'Essensplan-Library nicht gefunden' });
        }
        const existing = libs[idx];
        const filteredInvites = cleanInvited.filter((u) => !existing.members.includes(u));
        const nextMembers =
          cleanVisibility === 'private'
            ? [existing.ownerUsername]
            : existing.members;
        libs[idx] = {
          ...existing,
          name: cleanName,
          visibility: cleanVisibility,
          invitedUsers: filteredInvites,
          members: nextMembers,
        };
        await saveMealLibraries(libs);
        log('info', `Essensplan-Library '${cleanName}' (${cleanVisibility}) aktualisiert von '${username}'`, 'COOKBOOK');
        return res.json({ success: true, library: libs[idx] });
      }

      if (!createNew) {
        const alreadyMember = libs.find((l) => l.members.includes(username));
        if (alreadyMember && !libraryId) {
          alreadyMember.name = cleanName;
          alreadyMember.visibility = cleanVisibility;
          alreadyMember.invitedUsers = cleanInvited.filter((u) => !alreadyMember.members.includes(u));
          await saveMealLibraries(libs);
          return res.json({ success: true, library: alreadyMember });
        }
      }

      const newId = `lib_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newLib: MealPlanLibraryRecord = {
        id: newId,
        name: cleanName,
        ownerUsername: username,
        ownerDisplayName: actor?.displayName || username,
        visibility: cleanVisibility,
        invitedUsers: cleanInvited,
        members: [username],
        storageKey: `lib:${newId}`,
        createdAt: Date.now(),
      };
      // Ensure directory exists & start completely empty
      const dirs = getCookbookDirsFromStorageKey(newLib.storageKey);
      await fsp.writeFile(path.join(dirs.cookbook, 'recipes.json'), '[]', 'utf-8');
      await fsp.writeFile(path.join(dirs.cookbook, 'categories.json'), JSON.stringify(DEFAULT_COOKBOOK_CATEGORIES, null, 2), 'utf-8');
      await fsp.writeFile(path.join(dirs.cookbook, 'cycle.json'), JSON.stringify(getDefaultCycleForUser(username, 2), null, 2), 'utf-8');
      await fsp.writeFile(path.join(dirs.cookbook, 'overrides.json'), '{}', 'utf-8');
      await fsp.writeFile(
        path.join(dirs.cookbook, 'settings.json'),
        JSON.stringify(
          {
            defaultCyclePortions: 2,
            enableShoppingList: true,
            enableCycle: true,
            mealSections: DEFAULT_MEAL_SECTIONS,
            weekdayColors: DEFAULT_WEEKDAY_COLORS,
            units: ['Gramm', 'KG', 'Liter', 'ml', 'Päckchen', 'Stück', 'EL', 'TL', 'Bund', 'Prise', 'Dose', 'Becher'],
          },
          null,
          2
        ),
        'utf-8'
      );

      libs.push(newLib);
      await saveMealLibraries(libs);
      await setUserActiveLibraryId(username, newLib.id);
      log('info', `Neue Essensplan-Library '${cleanName}' (${cleanVisibility}) erstellt für '${username}'`, 'COOKBOOK');
      res.json({ success: true, library: newLib });
    } catch (err: any) {
      log('error', `Fehler bei Essensplan-Library: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/library/select', async (req, res) => {
    const { username, libraryId } = req.body;
    if (!username || !libraryId) {
      return res.status(400).json({ error: 'username oder libraryId fehlt' });
    }
    try {
      const libs = await getMealLibraries();
      const target = libs.find((l) => l.id === libraryId && l.members.includes(username));
      if (!target) {
        return res.status(404).json({ error: 'Bibliothek nicht gefunden oder kein Zugriff' });
      }
      await setUserActiveLibraryId(username, target.id);
      res.json({ success: true, library: target });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/cookbook/library', async (req, res) => {
    const username = String(req.query.username || '');
    const libraryId = String(req.query.libraryId || '');
    if (!username || !libraryId) {
      return res.status(400).json({ error: 'username oder libraryId fehlt' });
    }
    try {
      const libs = await getMealLibraries();
      const idx = libs.findIndex((l) => l.id === libraryId);
      if (idx === -1) return res.status(404).json({ error: 'Bibliothek nicht gefunden' });
      const target = libs[idx];
      if (target.ownerUsername !== username) {
        return res.status(403).json({ error: 'Nur der Eigentümer darf diese Bibliothek löschen' });
      }

      if (target.storageKey.startsWith('lib:')) {
        const cleanId = path.basename(target.storageKey.slice(4));
        const libDir = path.join(VAULT_PATH, 'Essensplan', cleanId);
        if (fs.existsSync(libDir)) {
          await fsp.rm(libDir, { recursive: true, force: true });
        }
      } else {
        const dirs = getCookbookDirsFromStorageKey(target.storageKey);
        if (fs.existsSync(dirs.cookbookRecipes)) {
          const entries = await fsp.readdir(dirs.cookbookRecipes);
          for (const f of entries) {
            if (f.endsWith('.md')) await fsp.unlink(path.join(dirs.cookbookRecipes, f)).catch(() => {});
          }
        }
        for (const f of ['recipes.json', 'cycle.json', 'overrides.json', 'categories.json', 'settings.json', 'ingredient_meta.json', 'dismissed_duplicates.json']) {
          await fsp.unlink(path.join(dirs.cookbook, f)).catch(() => {});
        }
      }

      const remaining = libs.filter((l) => l.id !== libraryId);
      await saveMealLibraries(remaining);

      // Update active library preference for any user pointing to the deleted library
      const prefs = await getUserLibraryPrefs();
      let prefsChanged = false;
      for (const [u, prefLibId] of Object.entries(prefs)) {
        if (prefLibId === libraryId) {
          const fallback = remaining.find((l) => l.members.includes(u));
          if (fallback) prefs[u] = fallback.id;
          else delete prefs[u];
          prefsChanged = true;
        }
      }
      if (prefsChanged) {
        await fsp.writeFile(getConfigFile('meal_library_prefs.json'), JSON.stringify(prefs, null, 2), 'utf-8');
      }

      log('info', `Essensplan-Bibliothek '${target.name}' (${libraryId}) gelöscht von '${username}'`, 'COOKBOOK');
      res.json({ success: true });
    } catch (err: any) {
      log('error', `Fehler beim Löschen der Bibliothek: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/library/join', async (req, res) => {
    const { username, libraryId } = req.body;
    if (!username || !libraryId) {
      return res.status(400).json({ error: 'username oder libraryId fehlt' });
    }
    try {
      const libs = await getMealLibraries();
      const idx = libs.findIndex((l) => l.id === libraryId);
      if (idx === -1) return res.status(404).json({ error: 'Library nicht gefunden' });

      const target = libs[idx];
      if (target.visibility !== 'shared' || (!target.invitedUsers.includes(username) && !target.members.includes(username))) {
        return res.status(403).json({ error: 'Keine Einladung für diese Library vorhanden' });
      }

      if (!target.members.includes(username)) {
        target.members.push(username);
      }
      target.invitedUsers = target.invitedUsers.filter((u) => u !== username);
      await saveMealLibraries(libs);
      await setUserActiveLibraryId(username, target.id);
      log('info', `'${username}' ist Essensplan-Library '${target.name}' beigetreten`, 'COOKBOOK');
      res.json({ success: true, library: target });
    } catch (err: any) {
      log('error', `Fehler beim Beitreten zur Library: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/library/decline', async (req, res) => {
    const { username, libraryId } = req.body;
    if (!username || !libraryId) {
      return res.status(400).json({ error: 'username oder libraryId fehlt' });
    }
    try {
      const libs = await getMealLibraries();
      const idx = libs.findIndex((l) => l.id === libraryId);
      if (idx === -1) return res.status(404).json({ error: 'Library nicht gefunden' });

      libs[idx].invitedUsers = libs[idx].invitedUsers.filter((u) => u !== username);
      await saveMealLibraries(libs);
      log('info', `'${username}' hat Einladung zu '${libs[idx].name}' abgelehnt`, 'COOKBOOK');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/library/leave', async (req, res) => {
    const { username, libraryId } = req.body;
    if (!username || !libraryId) {
      return res.status(400).json({ error: 'username oder libraryId fehlt' });
    }
    try {
      const libs = await getMealLibraries();
      const idx = libs.findIndex((l) => l.id === libraryId);
      if (idx === -1) return res.status(404).json({ error: 'Library nicht gefunden' });
      const target = libs[idx];
      if (target.ownerUsername === username) {
        return res.status(400).json({ error: 'Eigentümer können ihre eigene Library nicht verlassen' });
      }
      target.members = target.members.filter((m) => m !== username);
      await saveMealLibraries(libs);
      const prefs = await getUserLibraryPrefs();
      if (prefs[username] === libraryId) {
        const nextLib = libs.find((l) => l.members.includes(username));
        await setUserActiveLibraryId(username, nextLib?.id || null);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/save', async (req, res) => {
    const {
      username = 'michael',
      recipes,
      categories,
      cycle,
      overrides,
      sharing,
      settings,
      ingredientMeta,
      dismissedDuplicates,
    } = req.body;
    try {
      const { library } = await resolveUserLibraryContext(username);
      if (!library) {
        return res.status(400).json({ error: 'Bitte zuerst eine Essensplan-Library erstellen oder einer Einladung beitreten' });
      }
      const dirs = getCookbookDirsFromStorageKey(library.storageKey);

      if (recipes !== undefined) {
        await syncCookbookMarkdownFilesForDirs(dirs, recipes);
      }
      if (categories !== undefined) {
        await fsp.writeFile(path.join(dirs.cookbook, 'categories.json'), JSON.stringify(categories, null, 2), 'utf-8');
      }
      if (cycle !== undefined) {
        await fsp.writeFile(path.join(dirs.cookbook, 'cycle.json'), JSON.stringify(cycle, null, 2), 'utf-8');
      }
      if (overrides !== undefined) {
        await fsp.writeFile(path.join(dirs.cookbook, 'overrides.json'), JSON.stringify(overrides, null, 2), 'utf-8');
      }
      if (sharing !== undefined) {
        await fsp.writeFile(path.join(dirs.cookbook, 'sharing.json'), JSON.stringify(sharing, null, 2), 'utf-8');
      }
      if (settings !== undefined) {
        const settingsFile = path.join(dirs.cookbook, 'settings.json');
        let currentSettings: Record<string, any> = {
          defaultCyclePortions: 2,
          enableShoppingList: true,
          enableCycle: true,
          mealSections: [...DEFAULT_MEAL_SECTIONS],
          weekdayColors: { ...DEFAULT_WEEKDAY_COLORS },
          units: ['Gramm', 'KG', 'Liter', 'ml', 'Päckchen', 'Stück', 'EL', 'TL', 'Bund', 'Prise', 'Dose', 'Becher'],
        };
        if (fs.existsSync(settingsFile)) {
          try {
            currentSettings = { ...currentSettings, ...JSON.parse(await fsp.readFile(settingsFile, 'utf-8')) };
          } catch {}
        }
        const mergedSettings = { ...currentSettings, ...settings };
        await fsp.writeFile(settingsFile, JSON.stringify(mergedSettings, null, 2), 'utf-8');
      }
      if (ingredientMeta !== undefined || dismissedDuplicates !== undefined) {
        const ingredientsFile = path.join(dirs.cookbook, 'ingredients.json');
        let currentIngData: { ingredientMeta: Record<string, any>; dismissedDuplicates: string[] } = {
          ingredientMeta: {},
          dismissedDuplicates: [],
        };
        if (fs.existsSync(ingredientsFile)) {
          try {
            const parsed = JSON.parse(await fsp.readFile(ingredientsFile, 'utf-8'));
            currentIngData = {
              ingredientMeta: parsed?.ingredientMeta || {},
              dismissedDuplicates: Array.isArray(parsed?.dismissedDuplicates) ? parsed.dismissedDuplicates : [],
            };
          } catch {}
        }
        const nextIngData = {
          ingredientMeta: ingredientMeta !== undefined ? ingredientMeta : currentIngData.ingredientMeta,
          dismissedDuplicates:
            dismissedDuplicates !== undefined ? dismissedDuplicates : currentIngData.dismissedDuplicates,
        };
        await fsp.writeFile(ingredientsFile, JSON.stringify(nextIngData, null, 2), 'utf-8');
      }
      res.json({ success: true });
    } catch (err: any) {
      log('error', `Fehler beim Speichern des Essensplans: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/share-recipe', async (req, res) => {
    const { fromUsername, toUsername, recipe } = req.body;
    if (!fromUsername || !toUsername || !recipe) {
      return res.status(400).json({ error: 'fromUsername, toUsername oder recipe fehlt' });
    }
    try {
      const senderUsers = await getUsers();
      const sender = senderUsers.find((u) => u.username === fromUsername);
      const srcDirs = await resolveCookbookDirsForKey(fromUsername);
      const destDirs = await resolveCookbookDirsForKey(toUsername);
      const destData = await readCookbookDataFromDirs(destDirs, toUsername);
      const newId = `r_shared_${Date.now()}`;
      const newMediaDir = sanitizeRecipeMediaDir(`${recipe.title || 'rezept'}_${newId}`);
      const copiedImages: string[] = [];

      if (Array.isArray(recipe.images) && recipe.images.length > 0) {
        const srcMediaDir = path.join(srcDirs.cookbookMedia, getRecipeMediaDirName(recipe));
        const destMediaDir = path.join(destDirs.cookbookMedia, newMediaDir);

        if (fs.existsSync(srcMediaDir)) {
          await fsp.mkdir(destMediaDir, { recursive: true, mode: 0o775 });
          const files = await fsp.readdir(srcMediaDir, { withFileTypes: true });
          for (const entry of files) {
            if (entry.isFile() && IMAGE_EXT_REGEX.test(entry.name)) {
              await fsp.copyFile(path.join(srcMediaDir, entry.name), path.join(destMediaDir, entry.name));
              copiedImages.push(
                `/api/cookbook/media/file/${encodeURIComponent(destDirs.routeKey)}/${encodeURIComponent(newMediaDir)}/${encodeURIComponent(entry.name)}`
              );
            }
          }
        }
      }

      const copiedRecipe = {
        ...recipe,
        id: newId,
        mediaDir: newMediaDir,
        images: copiedImages.length > 0 ? copiedImages : recipe.images || [],
        sharedFrom: sender?.displayName || fromUsername,
      };
      const updatedRecipes = [...destData.recipes, copiedRecipe];
      await syncCookbookMarkdownFilesForDirs(destDirs, updatedRecipes);

      if (recipe.category && !destData.categories.includes(recipe.category)) {
        const updatedCats = [...destData.categories, recipe.category];
        await fsp.writeFile(path.join(destDirs.cookbook, 'categories.json'), JSON.stringify(updatedCats, null, 2), 'utf-8');
      }

      log('info', `Rezept '${recipe.title}' von '${fromUsername}' an '${toUsername}' geteilt`, 'COOKBOOK');
      res.json({ success: true, recipe: copiedRecipe });
    } catch (err: any) {
      log('error', `Fehler beim Teilen des Rezepts: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  // Per-Recipe Media Endpoints (resolves active library or user cookbook)
  app.get('/api/cookbook/media/list', async (req, res) => {
    const username = path.basename(String(req.query.username || 'michael'));
    const recipeDir = String(req.query.recipeDir || '');
    if (!recipeDir) return res.json([]);

    try {
      const dirs = await resolveCookbookDirsForKey(username);
      const safeDir = sanitizeRecipeMediaDir(recipeDir);
      const mediaDir = path.join(dirs.cookbookMedia, safeDir);
      if (!fs.existsSync(mediaDir)) return res.json([]);

      const entries = await fsp.readdir(mediaDir, { withFileTypes: true });
      const items: Array<{ filename: string; url: string; size: number; mtime: number }> = [];
      for (const entry of entries) {
        if (!entry.isFile() || !IMAGE_EXT_REGEX.test(entry.name)) continue;
        const full = path.join(mediaDir, entry.name);
        const stat = await fsp.stat(full);
        items.push({
          filename: entry.name,
          url: `/api/cookbook/media/file/${encodeURIComponent(dirs.routeKey)}/${encodeURIComponent(safeDir)}/${encodeURIComponent(entry.name)}`,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
      res.json(items.sort((a, b) => b.mtime - a.mtime));
    } catch (err: any) {
      log('error', `Fehler beim Laden der Rezept-Medien: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cookbook/media/upload', async (req, res) => {
    const {
      username = 'michael',
      recipeDir,
      recipeId,
      filename = 'gericht.png',
      dataUrl,
    } = req.body;

    if (!recipeDir || !dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Rezept-Ordner oder Bilddaten fehlen' });
    }

    try {
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Ungültiges Bildformat' });
      }
      const extMap: Record<string, string> = {
        jpeg: 'jpg',
        jpg: 'jpg',
        png: 'png',
        webp: 'webp',
        gif: 'gif',
        'svg+xml': 'svg',
        avif: 'avif',
        heic: 'heic',
      };
      const ext = extMap[match[1].toLowerCase()] || 'png';
      const baseName =
        path
          .basename(filename, path.extname(filename))
          .replace(/[^a-zA-Z0-9\-_äöüÄÖÜß]/g, '_')
          .slice(0, 48) || 'gericht';
      const savedName = `${Date.now()}_${baseName}.${ext}`;

      const safeUser = path.basename(String(username || 'michael'));
      const dirs = await resolveCookbookDirsForKey(safeUser);
      const safeDir = sanitizeRecipeMediaDir(recipeDir);
      const mediaDir = path.join(dirs.cookbookMedia, safeDir);
      if (!fs.existsSync(mediaDir)) {
        await fsp.mkdir(mediaDir, { recursive: true, mode: 0o775 });
      }

      const buffer = Buffer.from(match[2], 'base64');
      const fullPath = path.join(mediaDir, savedName);
      await fsp.writeFile(fullPath, buffer);
      const stat = await fsp.stat(fullPath);

      const url = `/api/cookbook/media/file/${encodeURIComponent(dirs.routeKey)}/${encodeURIComponent(safeDir)}/${encodeURIComponent(savedName)}`;

      if (recipeId) {
        try {
          const data = await readCookbookDataFromDirs(dirs, safeUser);
          const nextRecipes = data.recipes.map((r: any) =>
            r.id === recipeId
              ? {
                  ...r,
                  mediaDir: safeDir,
                  images: Array.from(new Set([...(r.images || []), url])),
                }
              : r
          );
          await syncCookbookMarkdownFilesForDirs(dirs, nextRecipes);
        } catch {}
      }

      log('info', `Rezept-Bild gespeichert in Essensplan/Media/${safeDir}/${savedName} (${buffer.length} Bytes)`, 'COOKBOOK');
      res.json({
        success: true,
        item: {
          filename: savedName,
          url,
          size: stat.size,
          mtime: stat.mtimeMs,
        },
      });
    } catch (err: any) {
      log('error', `Fehler beim Speichern des Rezept-Bildes: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cookbook/media/file/:username/:recipeDir/:filename', async (req, res) => {
    const { username, recipeDir, filename } = req.params;
    try {
      const owner = path.basename(username);
      const dirs = await resolveCookbookDirsForKey(owner);
      const safeDir = sanitizeRecipeMediaDir(recipeDir);
      const safeFile = path.basename(filename);
      const fullPath = path.resolve(path.join(dirs.cookbookMedia, safeDir, safeFile));
      const allowedRoot = path.resolve(dirs.cookbookMedia);
      if (!fullPath.startsWith(allowedRoot + path.sep) || !fs.existsSync(fullPath)) {
        return res.status(404).send('Media not found');
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).send('Media not found');
    }
  });

  app.delete('/api/cookbook/media/file', async (req, res) => {
    const { username = 'michael', recipeDir, recipeId, filename } = req.body;
    if (!recipeDir || !filename) {
      return res.status(400).json({ error: 'recipeDir oder filename fehlt' });
    }
    try {
      const safeUser = path.basename(String(username));
      const dirs = await resolveCookbookDirsForKey(safeUser);
      const safeDir = sanitizeRecipeMediaDir(recipeDir);
      const safeFile = path.basename(filename);
      const mediaDir = path.join(dirs.cookbookMedia, safeDir);
      const fullPath = path.join(mediaDir, safeFile);

      if (fs.existsSync(fullPath)) {
        await fsp.unlink(fullPath);
        try {
          const remaining = await fsp.readdir(mediaDir);
          if (remaining.length === 0) {
            await fsp.rmdir(mediaDir);
          }
        } catch {}
      }

      if (recipeId) {
        try {
          const targetUrl = `/api/cookbook/media/file/${encodeURIComponent(dirs.routeKey)}/${encodeURIComponent(safeDir)}/${encodeURIComponent(safeFile)}`;
          const data = await readCookbookDataFromDirs(dirs, safeUser);
          const nextRecipes = data.recipes.map((r: any) =>
            r.id === recipeId
              ? {
                  ...r,
                  images: (r.images || []).filter((u: string) => u !== targetUrl && !u.endsWith(`/${encodeURIComponent(safeFile)}`)),
                }
              : r
          );
          await syncCookbookMarkdownFilesForDirs(dirs, nextRecipes);
        } catch {}
      }

      res.json({ success: true });
    } catch (err: any) {
      log('error', `Fehler beim Löschen des Rezept-Bildes: ${err.message}`, 'COOKBOOK');
      res.status(500).json({ error: err.message });
    }
  });

  // Vault Backup & Restore
  app.get('/api/vault/backup', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const profile = (req.query.profile as string) || 'profile1';
    try {
      const notes = await scanUserNotes(username, profile);
      const backupNotes: { path: string; content: string; mtime: number }[] = [];

      for (const note of notes) {
        const fullPath = path.join(getUserVaultDir(username, profile), note.path);
        if (fs.existsSync(fullPath)) {
          const content = await fsp.readFile(fullPath, 'utf-8');
          backupNotes.push({ path: note.path, content, mtime: note.mtime });
        }
      }

      const shares = await getShares();
      const userShares = shares.filter((s) => s.ownerUsername === username || s.sharedWithUsername === username);

      const payload = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        username,
        profile,
        vaultPath: VAULT_PATH,
        notesCount: backupNotes.length,
        notes: backupNotes,
        shares: userShares,
      };

      log('info', `Backup für '${username}' (${profile}) erstellt mit ${backupNotes.length} Notizen`, 'BACKUP');
      res.setHeader('Content-Disposition', `attachment; filename="ochrenotes_backup_${username}_${profile}_${Date.now()}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(payload);
    } catch (err: any) {
      log('error', `Fehler beim Erstellen des Backups: ${err.message}`, 'BACKUP');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vault/restore', async (req, res) => {
    const { username, profile = 'profile1', backup } = req.body;
    if (!username || !backup || !Array.isArray(backup.notes)) {
      return res.status(400).json({ error: 'Ungültiges Backup-Format' });
    }

    try {
      const userVault = getUserVaultDir(username, profile);
      let restoredCount = 0;

      for (const item of backup.notes) {
        if (item.path && item.content !== undefined) {
          const fullPath = path.join(userVault, item.path);
          await fsp.mkdir(path.dirname(fullPath), { recursive: true });
          await fsp.writeFile(fullPath, item.content, 'utf-8');
          restoredCount++;
        }
      }

      log('info', `Backup erfolgreich wiederhergestellt: ${restoredCount} Notizen für '${username}' (${profile})`, 'RESTORE');
      res.json({ success: true, restoredCount });
    } catch (err: any) {
      log('error', `Fehler beim Wiederherstellen des Backups: ${err.message}`, 'RESTORE');
      res.status(500).json({ error: err.message });
    }
  });

  // System Diagnostics & Docker Status
  app.get('/api/system/health', async (req, res) => {
    try {
      let volumeWritable = false;
      const testFile = path.join(VAULT_PATH, '.health_check.tmp');
      try {
        await fsp.writeFile(testFile, 'ok');
        await fsp.unlink(testFile);
        volumeWritable = true;
      } catch (e) {
        volumeWritable = false;
      }

      // Check if running in Docker
      const dockerDetected = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv') || process.env.DOCKER_CONTAINER === 'true';

      const mem = process.memoryUsage();
      const notes = await scanUserNotes('michael');

      res.json({
        status: volumeWritable ? 'healthy' : 'degraded',
        uptimeSeconds: Math.floor(process.uptime()),
        vaultPath: VAULT_PATH,
        volumeWritable,
        notesCount: notes.length,
        tasksCount: notes.reduce((acc, n) => acc + n.tasksCount, 0),
        memoryMb: Math.round(mem.rss / (1024 * 1024)),
        dockerDetected,
        port: PORT,
        logsCount: systemLogs.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Diagnostic Logs API
  app.get('/api/system/logs', (req, res) => {
    res.json(systemLogs.slice(-200).reverse());
  });

  // =========================================================================
  // OPENGRAPH LINK PREVIEW API (with 30-minute in-memory cache)
  // =========================================================================
  const ogCache = new Map<string, { data: any; expiresAt: number }>();

  function decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
      .trim();
  }

  function extractMetaTag(html: string, keys: string[]): string | undefined {
    for (const key of keys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
      const m1 = html.match(r1);
      if (m1?.[1]) return decodeHtmlEntities(m1[1]);
      const r2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
      const m2 = html.match(r2);
      if (m2?.[1]) return decodeHtmlEntities(m2[1]);
    }
    return undefined;
  }

  app.get('/api/og-preview', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'url fehlt' });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'Nur HTTP/HTTPS URLs erlaubt' });
      }
    } catch {
      return res.status(400).json({ error: 'Ungültige URL' });
    }

    const cached = ogCache.get(parsedUrl.toString());
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const fallbackData = {
      url: parsedUrl.toString(),
      title: parsedUrl.hostname.replace(/^www\./, ''),
      description: parsedUrl.pathname !== '/' ? parsedUrl.pathname : parsedUrl.hostname,
      siteName: parsedUrl.hostname.replace(/^www\./, ''),
      favicon: `${parsedUrl.origin}/favicon.ico`,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OchreSuiteBot/1.0; +https://ochresuite.local)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        ogCache.set(parsedUrl.toString(), { data: fallbackData, expiresAt: Date.now() + 30 * 60 * 1000 });
        return res.json(fallbackData);
      }

      const rawText = (await response.text()).slice(0, 260000);
      const titleTag = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const title =
        extractMetaTag(rawText, ['og:title', 'twitter:title']) ||
        (titleTag ? decodeHtmlEntities(titleTag) : '') ||
        fallbackData.title;
      const description =
        extractMetaTag(rawText, ['og:description', 'twitter:description', 'description']) || undefined;
      const siteName =
        extractMetaTag(rawText, ['og:site_name']) || parsedUrl.hostname.replace(/^www\./, '');
      let image = extractMetaTag(rawText, ['og:image', 'twitter:image', 'og:image:url']);
      if (image) {
        try {
          image = new URL(image, parsedUrl.origin).toString();
        } catch {}
      }

      const iconHref =
        rawText.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ||
        '/favicon.ico';
      let favicon = fallbackData.favicon;
      try {
        favicon = new URL(iconHref, parsedUrl.origin).toString();
      } catch {}

      const data = {
        url: parsedUrl.toString(),
        title: title.slice(0, 140),
        description: description?.slice(0, 260),
        image,
        siteName,
        favicon,
      };
      ogCache.set(parsedUrl.toString(), { data, expiresAt: Date.now() + 30 * 60 * 1000 });
      return res.json(data);
    } catch {
      ogCache.set(parsedUrl.toString(), { data: fallbackData, expiresAt: Date.now() + 10 * 60 * 1000 });
      return res.json(fallbackData);
    }
  });

  // =========================================================================
  // PROJEKTE MODULE API (Open-Standard JSON under vault_data/Projects/)
  // =========================================================================
  function getProjectsDir(): string {
    const dir = path.join(VAULT_PATH, 'Projects');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o775 });
    }
    return dir;
  }

  async function ensureInitialProjectSeed() {
    const dir = getProjectsDir();
    const existing = (await fsp.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'));
    if (existing.length > 0) return;

    const today = new Date();
    const isoOffset = (days: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const seedProject = {
      id: 'proj_nas_setup',
      title: 'Heimserver & NAS Optimierung',
      description: 'Zentrales Projekt für Docker-Volumes, Datensicherung und Notiz-Dokumentation.',
      ownerUsername: 'michael',
      visibility: 'shared',
      sharedWithUsers: ['sarah', 'alex'],
      status: 'active',
      color: '#C87D20',
      startDate: isoOffset(-3),
      dueDate: isoOffset(14),
      linkedNotePaths: ['Projekte/Docker-Setup.md'],
      linkedWikiSlugs: ['docker-nas-backup-anleitung'],
      tasks: [
        {
          id: 'pt_1',
          title: 'Docker Compose Permissions prüfen',
          description: 'UID:GID 2000:100 auf dem NAS testen',
          status: 'done',
          priority: 'high',
          assignee: 'Michael',
          startDate: isoOffset(-3),
          dueDate: isoOffset(-1),
          createdAt: Date.now() - 86400000 * 3,
        },
        {
          id: 'pt_2',
          title: 'Wöchentliches Backup-Skript verifizieren',
          description: 'Automated Snapshot auf Zweit-Festplatte',
          status: 'in_progress',
          priority: 'high',
          assignee: 'Alex',
          startDate: isoOffset(-1),
          dueDate: isoOffset(4),
          createdAt: Date.now() - 86400000 * 2,
        },
        {
          id: 'pt_3',
          title: 'Handwerker / Elektriker Termin für USV-Steckdose',
          description: 'Externer Ansprechpartner für Keller-Rack',
          status: 'todo',
          priority: 'medium',
          assignee: 'Elektro Meier (Extern)',
          startDate: isoOffset(2),
          dueDate: isoOffset(9),
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'pt_4',
          title: 'Familien-Freigaben gemeinsam testen',
          status: 'review',
          priority: 'low',
          assignee: 'Sarah',
          startDate: isoOffset(5),
          dueDate: isoOffset(12),
          createdAt: Date.now(),
        },
      ],
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now(),
    };

    await fsp.writeFile(path.join(dir, `${seedProject.id}.json`), JSON.stringify(seedProject, null, 2), 'utf-8');
  }
  await ensureInitialProjectSeed();

  app.get('/api/projects', async (req, res) => {
    const username = path.basename((req.query.username as string) || 'michael');
    try {
      const dir = getProjectsDir();
      const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
      const result: any[] = [];
      for (const file of files) {
        try {
          const raw = await fsp.readFile(path.join(dir, file), 'utf-8');
          const proj = JSON.parse(raw);
          const isOwner = proj.ownerUsername === username;
          const isSharedWithUser =
            proj.visibility === 'shared' &&
            Array.isArray(proj.sharedWithUsers) &&
            proj.sharedWithUsers.includes(username);
          if (isOwner || isSharedWithUser) {
            result.push(proj);
          }
        } catch {}
      }
      result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json(result);
    } catch (err: any) {
      log('error', `Fehler beim Laden der Projekte: ${err.message}`, 'PROJECTS');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/projects', async (req, res) => {
    const project = req.body;
    if (!project || !project.title) {
      return res.status(400).json({ error: 'Projektdaten oder Titel fehlen' });
    }
    try {
      const dir = getProjectsDir();
      const safeId =
        String(project.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
          .replace(/[^a-zA-Z0-9_-]/g, '_');
      const now = Date.now();
      const normTasks = Array.isArray(project.tasks)
        ? project.tasks.map((t: any) => {
            const assignees = Array.isArray(t.assignees)
              ? t.assignees.map((a: any) => String(a || '').trim()).filter(Boolean)
              : t.assignee
                ? [String(t.assignee).trim()].filter(Boolean)
                : [];
            return {
              ...t,
              assignees,
              assignee: assignees[0] || t.assignee || '',
            };
          })
        : [];
      const saved = {
        ...project,
        id: safeId,
        profile: project.profile === 'profile2' ? 'profile2' : 'profile1',
        visibility: project.visibility === 'shared' ? 'shared' : 'private',
        sharedWithUsers: Array.isArray(project.sharedWithUsers) ? project.sharedWithUsers : [],
        linkedNotePaths: Array.isArray(project.linkedNotePaths) ? project.linkedNotePaths : [],
        linkedWikiSlugs: Array.isArray(project.linkedWikiSlugs) ? project.linkedWikiSlugs : [],
        columns: Array.isArray(project.columns) && project.columns.length > 0 ? project.columns : undefined,
        tasks: normTasks,
        createdAt: project.createdAt || now,
        updatedAt: now,
      };
      await fsp.writeFile(path.join(dir, `${safeId}.json`), JSON.stringify(saved, null, 2), 'utf-8');
      log('info', `Projekt gespeichert: '${saved.title}' (${saved.id})`, 'PROJECTS');
      res.json({ success: true, project: saved });
    } catch (err: any) {
      log('error', `Fehler beim Speichern des Projekts: ${err.message}`, 'PROJECTS');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/projects', async (req, res) => {
    const id = String(req.query.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!id) return res.status(400).json({ error: 'Projekt-ID fehlt' });
    try {
      const dir = getProjectsDir();
      const fp = path.join(dir, `${id}.json`);
      if (fs.existsSync(fp)) {
        await fsp.unlink(fp);
        log('info', `Projekt gelöscht: ${id}`, 'PROJECTS');
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // SMARTHOME VIEWER BACKEND (MQTT Client Pool + Influx v1/v2 + HTTP Poller + SSE)
  // =========================================================================
  interface ServerSmarthomeState {
    brokers: any[];
    dbSources: any[];
    tiles: any[];
  }

  function getSmarthomeConfigPath(): string {
    const dir = path.join(VAULT_PATH, 'Smarthome');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o775 });
    }
    return path.join(dir, 'config.json');
  }

  async function loadSmarthomeConfig(): Promise<ServerSmarthomeState> {
    const fp = getSmarthomeConfigPath();
    if (!fs.existsSync(fp)) {
      const initial: ServerSmarthomeState = { brokers: [], dbSources: [], tiles: [] };
      await fsp.writeFile(fp, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    try {
      const parsed = JSON.parse(await fsp.readFile(fp, 'utf-8'));
      return {
        brokers: Array.isArray(parsed.brokers) ? parsed.brokers : [],
        dbSources: Array.isArray(parsed.dbSources) ? parsed.dbSources : [],
        tiles: Array.isArray(parsed.tiles) ? parsed.tiles : [],
      };
    } catch {
      return { brokers: [], dbSources: [], tiles: [] };
    }
  }

  async function saveSmarthomeConfig(state: ServerSmarthomeState) {
    const fp = getSmarthomeConfigPath();
    await fsp.writeFile(fp, JSON.stringify(state, null, 2), 'utf-8');
  }

  const mqttClientPool = new Map<string, MqttClient>();
  const mqttBrokerStatus = new Map<string, 'connected' | 'connecting' | 'disconnected' | 'error'>();
  const mqttDiscoveredTopics = new Map<
    string,
    { brokerId: string; topic: string; lastPayload: string; numericValue?: number; timestamp: number }
  >();
  const smarthomeLiveValues = new Map<
    string,
    {
      key: string;
      value: string;
      rawValue?: string;
      numericValue?: number;
      referenceValue?: number;
      timestamp: number;
      history: number[];
      series?: Array<{ t: number; v: number }>;
    }
  >();
  const smarthomeSseClients = new Set<express.Response>();

  function broadcastSmarthomeEvent(payload: any) {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of smarthomeSseClients) {
      try {
        client.write(line);
      } catch {}
    }
  }

  // Safe recursive-descent arithmetic evaluator (no eval / no Function)
  function evaluateSafeFormula(formula: string, vars: Record<string, number>): number | null {
    const expr = (formula || '').trim();
    if (!expr) return null;

    type Tok =
      | { kind: 'num'; val: number }
      | { kind: 'id'; name: string }
      | { kind: 'op'; ch: string }
      | { kind: 'paren'; ch: '(' | ')' };

    const tokens: Tok[] = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let numStr = '';
        while (i < expr.length && /[0-9.,]/.test(expr[i])) {
          numStr += expr[i] === ',' ? '.' : expr[i];
          i++;
        }
        const n = Number(numStr);
        if (!Number.isFinite(n)) return null;
        tokens.push({ kind: 'num', val: n });
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        let id = '';
        while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
          id += expr[i];
          i++;
        }
        tokens.push({ kind: 'id', name: id.toLowerCase() });
        continue;
      }
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        tokens.push({ kind: 'op', ch });
        i++;
        continue;
      }
      if (ch === '(' || ch === ')') {
        tokens.push({ kind: 'paren', ch });
        i++;
        continue;
      }
      return null;
    }

    let pos = 0;
    function parseExpr(): number | null {
      let left = parseTerm();
      if (left === null) return null;
      while (pos < tokens.length) {
        const tok = tokens[pos];
        if (tok.kind === 'op' && (tok.ch === '+' || tok.ch === '-')) {
          pos++;
          const right = parseTerm();
          if (right === null) return null;
          left = tok.ch === '+' ? left + right : left - right;
        } else {
          break;
        }
      }
      return left;
    }
    function parseTerm(): number | null {
      let left = parseFactor();
      if (left === null) return null;
      while (pos < tokens.length) {
        const tok = tokens[pos];
        if (tok.kind === 'op' && (tok.ch === '*' || tok.ch === '/')) {
          pos++;
          const right = parseFactor();
          if (right === null) return null;
          if (tok.ch === '/') {
            if (right === 0) return null;
            left = left / right;
          } else {
            left = left * right;
          }
        } else {
          break;
        }
      }
      return left;
    }
    function parseFactor(): number | null {
      if (pos >= tokens.length) return null;
      const tok = tokens[pos];
      if (tok.kind === 'op' && (tok.ch === '+' || tok.ch === '-')) {
        pos++;
        const inner = parseFactor();
        if (inner === null) return null;
        return tok.ch === '-' ? -inner : inner;
      }
      if (tok.kind === 'num') {
        pos++;
        return tok.val;
      }
      if (tok.kind === 'id') {
        pos++;
        const val = vars[tok.name];
        return typeof val === 'number' && Number.isFinite(val) ? val : null;
      }
      if (tok.kind === 'paren' && tok.ch === '(') {
        pos++;
        const inner = parseExpr();
        if (inner === null) return null;
        const close = tokens[pos];
        if (!close || close.kind !== 'paren' || close.ch !== ')') return null;
        pos++;
        return inner;
      }
      return null;
    }

    const result = parseExpr();
    if (result === null || pos !== tokens.length || !Number.isFinite(result)) return null;
    return result;
  }

  function applyTileCalculation(
    tile: any,
    rawLatestStr: string,
    latestNum: number | undefined,
    refNum: number | undefined
  ): { displayValue: string; numericValue?: number } {
    const calc = tile?.calculation;
    const decimals = typeof calc?.decimals === 'number' && calc.decimals >= 0 ? Math.min(6, calc.decimals) : 2;
    if (calc?.formula && calc.formula.trim() && typeof latestNum === 'number' && Number.isFinite(latestNum)) {
      const refVal = typeof refNum === 'number' && Number.isFinite(refNum) ? refNum : 0;
      const diffVal = latestNum - refVal;
      const computed = evaluateSafeFormula(calc.formula, {
        latest: latestNum,
        value: latestNum,
        x: latestNum,
        ref: refVal,
        diff: diffVal,
        delta: diffVal,
      });
      if (computed !== null && Number.isFinite(computed)) {
        const rounded = Number(computed.toFixed(decimals));
        return { displayValue: rounded.toFixed(decimals).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m)), numericValue: rounded };
      }
    }
    if (typeof latestNum === 'number' && Number.isFinite(latestNum) && calc?.referenceTimestamp && typeof refNum === 'number' && Number.isFinite(refNum)) {
      const diff = Number((latestNum - refNum).toFixed(decimals));
      return { displayValue: String(diff), numericValue: diff };
    }
    return { displayValue: rawLatestStr, numericValue: latestNum };
  }

  function parseNumericString(raw: string): number | undefined {
    const cleaned = raw.trim();
    if (!cleaned) return undefined;
    const numeric = Number(cleaned.replace(',', '.'));
    return !Number.isNaN(numeric) && Number.isFinite(numeric) ? numeric : undefined;
  }

  function recordSmarthomeValue(
    key: string,
    rawVal: string,
    extra?: {
      rawValue?: string;
      numericOverride?: number;
      referenceValue?: number;
      series?: Array<{ t: number; v: number }>;
    }
  ) {
    const cleaned = rawVal.trim();
    const parsedNum = extra?.numericOverride !== undefined ? extra.numericOverride : parseNumericString(cleaned);
    const isNum = typeof parsedNum === 'number' && Number.isFinite(parsedNum);
    const prev = smarthomeLiveValues.get(key);
    let history = prev?.history ? [...prev.history] : [];
    if (extra?.series && extra.series.length > 0) {
      history = extra.series.slice(-48).map((p) => p.v);
    } else if (isNum) {
      history.push(parsedNum!);
      if (history.length > 48) history.shift();
    }
    const entry = {
      key,
      value: cleaned,
      rawValue: extra?.rawValue ?? prev?.rawValue ?? cleaned,
      numericValue: isNum ? parsedNum : prev?.numericValue,
      referenceValue: extra?.referenceValue !== undefined ? extra.referenceValue : prev?.referenceValue,
      timestamp: Date.now(),
      history,
      series: extra?.series ?? prev?.series,
    };
    smarthomeLiveValues.set(key, entry);
    broadcastSmarthomeEvent({ type: 'live_value', entry });
  }

  function recordMqttDiscoveredTopic(brokerId: string, topic: string, payloadText: string) {
    const num = parseNumericString(payloadText);
    const key = `${brokerId}::${topic}`;
    mqttDiscoveredTopics.set(key, {
      brokerId,
      topic,
      lastPayload: payloadText.length > 200 ? payloadText.slice(0, 200) + '…' : payloadText,
      numericValue: num,
      timestamp: Date.now(),
    });
    // Cap per-broker cache cleanly at 500 topics
    let countForBroker = 0;
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of mqttDiscoveredTopics.entries()) {
      if (v.brokerId === brokerId) {
        countForBroker++;
        if (v.timestamp < oldestTs) {
          oldestTs = v.timestamp;
          oldestKey = k;
        }
      }
    }
    if (countForBroker > 500 && oldestKey) {
      mqttDiscoveredTopics.delete(oldestKey);
    }
  }

  function extractJsonPathValue(obj: any, jsonPath?: string): string {
    if (obj === null || obj === undefined) return '';
    if (!jsonPath || !jsonPath.trim()) {
      return typeof obj === 'object' ? JSON.stringify(obj) : String(obj);
    }
    const parts = jsonPath.split('.').map((p) => p.trim()).filter(Boolean);
    let cur: any = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined) return '';
      cur = cur[part];
    }
    if (cur === null || cur === undefined) return '';
    return typeof cur === 'object' ? JSON.stringify(cur) : String(cur);
  }

  function downsampleSeries(points: Array<{ t: number; v: number }>, maxPoints = 120): Array<{ t: number; v: number }> {
    if (points.length <= maxPoints) return points;
    const step = (points.length - 1) / (maxPoints - 1);
    const out: Array<{ t: number; v: number }> = [];
    for (let i = 0; i < maxPoints; i++) {
      const idx = Math.min(points.length - 1, Math.round(i * step));
      out.push(points[idx]);
    }
    return out;
  }

  function resolveTimeRangeMs(timeRange?: string): number {
    switch (timeRange) {
      case '1h':
        return 3600_000;
      case '6h':
        return 6 * 3600_000;
      case '7d':
        return 7 * 86400_000;
      case '30d':
        return 30 * 86400_000;
      case 'ytd': {
        const jan1 = new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
        return Math.max(3600_000, Date.now() - jan1);
      }
      case '24h':
      default:
        return 24 * 3600_000;
    }
  }

  function resolveFluxDuration(timeRange?: string): string {
    switch (timeRange) {
      case '1h':
        return '-1h';
      case '6h':
        return '-6h';
      case '7d':
        return '-7d';
      case '30d':
        return '-30d';
      case 'ytd':
        return `${new Date().getFullYear()}-01-01T00:00:00Z`;
      case '24h':
      default:
        return '-24h';
    }
  }

  function resolveInfluxWindowInterval(timeRange?: string): string {
    switch (timeRange) {
      case '1h':
        return '1m';
      case '6h':
        return '5m';
      case '7d':
        return '1h';
      case '30d':
        return '6h';
      case 'ytd':
        return '1d';
      case '24h':
      default:
        return '15m';
    }
  }

  function parseCsvRow(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseInfluxV2CsvSeries(csvText: string): Array<{ t: number; v: number }> {
    const lines = csvText.split(/\r?\n/);
    let headerCols: string[] = [];
    let timeIdx = -1;
    let valIdx = -1;
    const points: Array<{ t: number; v: number }> = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        headerCols = [];
        timeIdx = -1;
        valIdx = -1;
        continue;
      }
      if (line.startsWith('#')) continue;
      const cols = parseCsvRow(line);
      if (cols.includes('_time') && cols.includes('_value')) {
        headerCols = cols;
        timeIdx = cols.indexOf('_time');
        valIdx = cols.indexOf('_value');
        continue;
      }
      if (headerCols.length === 0 || timeIdx < 0 || valIdx < 0) continue;
      if (cols[timeIdx] === '_time') continue;
      const ts = Date.parse(cols[timeIdx]);
      const val = Number(cols[valIdx]);
      if (Number.isFinite(ts) && Number.isFinite(val)) {
        points.push({ t: ts, v: val });
      }
    }
    points.sort((a, b) => a.t - b.t);
    return points;
  }

  async function queryInfluxV1Tile(src: any, tile: any): Promise<{
    series: Array<{ t: number; v: number }>;
    latestNum?: number;
    latestStr: string;
    refNum?: number;
  } | null> {
    const baseUrl = String(src.url || '').replace(/\/+$/, '');
    const db = String(src.database || '').trim();
    if (!baseUrl || !db) return null;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (src.authHeader) {
      headers['Authorization'] = src.authHeader;
    } else if (src.username || src.password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${src.username || ''}:${src.password || ''}`).toString('base64');
    }

    const runInfluxQl = async (q: string) => {
      const params = new URLSearchParams({ db, q, epoch: 'ms' });
      if (src.retentionPolicy) params.set('rp', String(src.retentionPolicy));
      if (src.username && !src.authHeader) params.set('u', String(src.username));
      if (src.password && !src.authHeader) params.set('p', String(src.password));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(`${baseUrl}/query?${params.toString()}`, { headers, signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) return null;
        return await resp.json();
      } catch {
        clearTimeout(timer);
        return null;
      }
    };

    const parseSeriesResult = (json: any, preferredField?: string): Array<{ t: number; v: number }> => {
      const s = json?.results?.[0]?.series?.[0];
      if (!s || !Array.isArray(s.columns) || !Array.isArray(s.values)) return [];
      const cols: string[] = s.columns;
      const tIdx = cols.indexOf('time');
      let vIdx = -1;
      if (preferredField) {
        vIdx = cols.findIndex((c) => c === preferredField || c === `mean_${preferredField}` || c === `last_${preferredField}`);
      }
      if (vIdx < 0) {
        vIdx = cols.findIndex((c, idx) => idx !== tIdx && s.values.some((row: any[]) => typeof row[idx] === 'number'));
      }
      if (vIdx < 0) vIdx = tIdx === 0 ? 1 : 0;
      const pts: Array<{ t: number; v: number }> = [];
      for (const row of s.values) {
        const ts = Number(row[tIdx >= 0 ? tIdx : 0]);
        const val = Number(row[vIdx]);
        if (Number.isFinite(ts) && Number.isFinite(val)) {
          pts.push({ t: ts, v: val });
        }
      }
      pts.sort((a, b) => a.t - b.t);
      return pts;
    };

    const rawTopic = String(tile.topicOrPath || '').trim();
    const preferredField = tile.jsonPath?.trim() || (rawTopic.includes('.') && !rawTopic.toUpperCase().startsWith('SELECT ') ? rawTopic.split('.').slice(1).join('.') : '');
    const measurement = rawTopic.includes('.') && !rawTopic.toUpperCase().startsWith('SELECT ') ? rawTopic.split('.')[0] : rawTopic;

    const rangeMs = resolveTimeRangeMs(tile.timeRange);
    const startMs = Date.now() - rangeMs;
    const windowStr = resolveInfluxWindowInterval(tile.timeRange);

    let seriesQuery = '';
    if (rawTopic.toUpperCase().startsWith('SELECT ')) {
      seriesQuery = rawTopic;
    } else {
      const fieldExpr = preferredField ? `"${preferredField}"` : '*';
      const safeMeas = `"${measurement.replace(/"/g, '')}"`;
      if (tile.displayMode === 'chart' || tile.displayMode === 'both') {
        seriesQuery = `SELECT MEAN(${fieldExpr}) FROM ${safeMeas} WHERE time >= ${startMs}ms GROUP BY time(${windowStr}) fill(none)`;
      } else {
        seriesQuery = `SELECT ${fieldExpr} FROM ${safeMeas} WHERE time >= ${startMs}ms ORDER BY time DESC LIMIT 60`;
      }
    }

    const mainJson = await runInfluxQl(seriesQuery);
    let points = parseSeriesResult(mainJson, preferredField || undefined);

    // Fallback to raw LIMIT if GROUP BY yielded nothing (e.g. non-numeric or sparse)
    if (points.length === 0 && !rawTopic.toUpperCase().startsWith('SELECT ')) {
      const safeMeas = `"${measurement.replace(/"/g, '')}"`;
      const fieldExpr = preferredField ? `"${preferredField}"` : '*';
      const fallbackJson = await runInfluxQl(`SELECT ${fieldExpr} FROM ${safeMeas} ORDER BY time DESC LIMIT 60`);
      points = parseSeriesResult(fallbackJson, preferredField || undefined);
    }

    let latestNum: number | undefined = points.length > 0 ? points[points.length - 1].v : undefined;
    // Fetch exact newest point for precision
    if (!rawTopic.toUpperCase().startsWith('SELECT ')) {
      const safeMeas = `"${measurement.replace(/"/g, '')}"`;
      const fieldExpr = preferredField ? `"${preferredField}"` : '*';
      const latestJson = await runInfluxQl(`SELECT ${fieldExpr} FROM ${safeMeas} ORDER BY time DESC LIMIT 1`);
      const latestPts = parseSeriesResult(latestJson, preferredField || undefined);
      if (latestPts.length > 0) {
        latestNum = latestPts[latestPts.length - 1].v;
      }
    }

    let refNum: number | undefined;
    const refTsStr = tile.calculation?.referenceTimestamp?.trim();
    if (refTsStr && !rawTopic.toUpperCase().startsWith('SELECT ')) {
      const parsedRefMs = Date.parse(refTsStr);
      if (Number.isFinite(parsedRefMs)) {
        const safeMeas = `"${measurement.replace(/"/g, '')}"`;
        const fieldExpr = preferredField ? `"${preferredField}"` : '*';
        const refJson = await runInfluxQl(
          `SELECT ${fieldExpr} FROM ${safeMeas} WHERE time >= ${parsedRefMs}ms ORDER BY time ASC LIMIT 1`
        );
        let refPts = parseSeriesResult(refJson, preferredField || undefined);
        if (refPts.length === 0) {
          const prevRefJson = await runInfluxQl(
            `SELECT ${fieldExpr} FROM ${safeMeas} WHERE time <= ${parsedRefMs}ms ORDER BY time DESC LIMIT 1`
          );
          refPts = parseSeriesResult(prevRefJson, preferredField || undefined);
        }
        if (refPts.length > 0) refNum = refPts[0].v;
      }
    }

    const downsampled = downsampleSeries(points, 120);
    return {
      series: downsampled,
      latestNum,
      latestStr: latestNum !== undefined ? String(latestNum) : '',
      refNum,
    };
  }

  async function queryInfluxV2Tile(src: any, tile: any): Promise<{
    series: Array<{ t: number; v: number }>;
    latestNum?: number;
    latestStr: string;
    refNum?: number;
  } | null> {
    const baseUrl = String(src.url || '').replace(/\/+$/, '');
    const org = String(src.org || '').trim();
    const bucket = String(src.bucket || src.database || '').trim();
    if (!baseUrl) return null;

    const rawAuth = String(src.authHeader || src.password || '').trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/vnd.flux',
      Accept: 'application/csv',
    };
    if (rawAuth) {
      headers['Authorization'] = rawAuth.toLowerCase().startsWith('token ') || rawAuth.toLowerCase().startsWith('bearer ')
        ? rawAuth
        : `Token ${rawAuth}`;
    }

    const runFlux = async (flux: string): Promise<Array<{ t: number; v: number }>> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const qs = org ? `?org=${encodeURIComponent(org)}` : '';
        const resp = await fetch(`${baseUrl}/api/v2/query${qs}`, {
          method: 'POST',
          headers,
          body: flux,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return [];
        const text = await resp.text();
        return parseInfluxV2CsvSeries(text);
      } catch {
        clearTimeout(timer);
        return [];
      }
    };

    const rawTopic = String(tile.topicOrPath || '').trim();
    let points: Array<{ t: number; v: number }> = [];
    const preferredField = tile.jsonPath?.trim() || (rawTopic.includes('.') && !rawTopic.includes('from(') ? rawTopic.split('.').slice(1).join('.') : '');
    const measurement = rawTopic.includes('.') && !rawTopic.includes('from(') ? rawTopic.split('.')[0] : rawTopic;

    if (rawTopic.includes('from(')) {
      points = await runFlux(rawTopic);
    } else if (bucket) {
      const startExpr = resolveFluxDuration(tile.timeRange);
      const winEvery = resolveInfluxWindowInterval(tile.timeRange);
      const fieldFilter = preferredField ? `\n  |> filter(fn: (r) => r._field == "${preferredField}")` : '';
      const windowPipe =
        tile.displayMode === 'chart' || tile.displayMode === 'both'
          ? `\n  |> aggregateWindow(every: ${winEvery}, fn: mean, createEmpty: false)`
          : `\n  |> tail(n: 60)`;
      const flux = `from(bucket: "${bucket}")
  |> range(start: ${startExpr})
  |> filter(fn: (r) => r._measurement == "${measurement}")${fieldFilter}${windowPipe}`;
      points = await runFlux(flux);
    }

    let latestNum: number | undefined = points.length > 0 ? points[points.length - 1].v : undefined;
    if (!rawTopic.includes('from(') && bucket) {
      const fieldFilter = preferredField ? `\n  |> filter(fn: (r) => r._field == "${preferredField}")` : '';
      const latestPts = await runFlux(`from(bucket: "${bucket}")\n  |> range(start: -30d)\n  |> filter(fn: (r) => r._measurement == "${measurement}")${fieldFilter}\n  |> last()`);
      if (latestPts.length > 0) latestNum = latestPts[latestPts.length - 1].v;
    }

    let refNum: number | undefined;
    const refTsStr = tile.calculation?.referenceTimestamp?.trim();
    if (refTsStr && !rawTopic.includes('from(') && bucket) {
      const parsedRefMs = Date.parse(refTsStr);
      if (Number.isFinite(parsedRefMs)) {
        const refIso = new Date(parsedRefMs).toISOString();
        const fieldFilter = preferredField ? `\n  |> filter(fn: (r) => r._field == "${preferredField}")` : '';
        let refPts = await runFlux(
          `from(bucket: "${bucket}")\n  |> range(start: ${refIso})\n  |> filter(fn: (r) => r._measurement == "${measurement}")${fieldFilter}\n  |> first()`
        );
        if (refPts.length === 0) {
          refPts = await runFlux(
            `from(bucket: "${bucket}")\n  |> range(start: -5y, stop: ${refIso})\n  |> filter(fn: (r) => r._measurement == "${measurement}")${fieldFilter}\n  |> last()`
          );
        }
        if (refPts.length > 0) refNum = refPts[0].v;
      }
    }

    return {
      series: downsampleSeries(points, 120),
      latestNum,
      latestStr: latestNum !== undefined ? String(latestNum) : '',
      refNum,
    };
  }

  async function queryPrometheusTile(src: any, tile: any): Promise<{
    series: Array<{ t: number; v: number }>;
    latestNum?: number;
    latestStr: string;
  } | null> {
    const baseUrl = String(src.url || '').replace(/\/+$/, '');
    const expr = String(tile.topicOrPath || '').trim();
    if (!baseUrl || !expr) return null;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (src.authHeader) headers['Authorization'] = src.authHeader;

    const endSec = Math.floor(Date.now() / 1000);
    const spanSec = Math.floor(resolveTimeRangeMs(tile.timeRange) / 1000);
    const startSec = endSec - spanSec;
    const step = Math.max(15, Math.floor(spanSec / 100));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const resp = await fetch(
        `${baseUrl}/api/v1/query_range?query=${encodeURIComponent(expr)}&start=${startSec}&end=${endSec}&step=${step}`,
        { headers, signal: controller.signal }
      );
      clearTimeout(timer);
      if (!resp.ok) return null;
      const json = await resp.json();
      const values = json?.data?.result?.[0]?.values;
      if (!Array.isArray(values)) return null;
      const pts: Array<{ t: number; v: number }> = [];
      for (const pair of values) {
        const ts = Number(pair[0]) * 1000;
        const val = Number(pair[1]);
        if (Number.isFinite(ts) && Number.isFinite(val)) pts.push({ t: ts, v: val });
      }
      const latestNum = pts.length > 0 ? pts[pts.length - 1].v : undefined;
      return {
        series: downsampleSeries(pts, 120),
        latestNum,
        latestStr: latestNum !== undefined ? String(latestNum) : '',
      };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  async function syncMqttConnections() {
    const cfg = await loadSmarthomeConfig();
    const activeIds = new Set(cfg.brokers.filter((b) => b.enabled !== false).map((b) => b.id));

    // Disconnect removed/disabled brokers
    for (const [id, client] of mqttClientPool.entries()) {
      if (!activeIds.has(id)) {
        try {
          client.end(true);
        } catch {}
        mqttClientPool.delete(id);
        mqttBrokerStatus.set(id, 'disconnected');
      }
    }

    // Connect active brokers
    for (const broker of cfg.brokers) {
      if (broker.enabled === false) {
        mqttBrokerStatus.set(broker.id, 'disconnected');
        continue;
      }
      if (mqttClientPool.has(broker.id)) continue;

      const protocol = broker.protocol === 'mqtts' || broker.protocol === 'ws' ? broker.protocol : 'mqtt';
      const url = `${protocol}://${broker.host}:${Number(broker.port) || 1883}`;
      mqttBrokerStatus.set(broker.id, 'connecting');
      broadcastSmarthomeEvent({ type: 'broker_status', brokerId: broker.id, status: 'connecting' });

      try {
        const client = mqtt.connect(url, {
          username: broker.username || undefined,
          password: broker.password || undefined,
          reconnectPeriod: 8000,
          connectTimeout: 5000,
          clientId: `ochresuite_${broker.id}_${Math.random().toString(36).slice(2, 6)}`,
        });

        mqttClientPool.set(broker.id, client);

        client.on('connect', () => {
          mqttBrokerStatus.set(broker.id, 'connected');
          broadcastSmarthomeEvent({ type: 'broker_status', brokerId: broker.id, status: 'connected' });
          log('info', `MQTT verbunden: ${broker.name} (${url})`, 'SMARTHOME');
          // Always subscribe wildcard '#' so live topic auto-discovery works seamlessly
          client.subscribe('#', { qos: 0 }, () => {});
        });

        client.on('message', async (topic, payload) => {
          const text = payload.toString('utf-8');
          recordMqttDiscoveredTopic(broker.id, topic, text);
          recordSmarthomeValue(`${broker.id}::${topic}`, text);

          // Update any MQTT tile on this broker/topic that uses jsonPath or formula calculations
          try {
            const latestCfg = await loadSmarthomeConfig();
            const matching = latestCfg.tiles.filter(
              (t) => t.sourceType === 'mqtt' && t.sourceId === broker.id && t.topicOrPath === topic
            );
            for (const tile of matching) {
              let effectiveRaw = text;
              if (tile.jsonPath && text.trim().startsWith('{')) {
                try {
                  const parsed = JSON.parse(text);
                  const extracted = extractJsonPathValue(parsed, tile.jsonPath);
                  if (extracted !== '') effectiveRaw = extracted;
                } catch {}
              }
              const parsedNum = parseNumericString(effectiveRaw);
              const { displayValue, numericValue } = applyTileCalculation(tile, effectiveRaw, parsedNum, undefined);
              if (tile.jsonPath || tile.calculation?.formula) {
                recordSmarthomeValue(`tile:${tile.id}`, displayValue, {
                  rawValue: effectiveRaw,
                  numericOverride: numericValue,
                });
              }
            }
          } catch {}
        });

        client.on('error', (err) => {
          mqttBrokerStatus.set(broker.id, 'error');
          broadcastSmarthomeEvent({
            type: 'broker_status',
            brokerId: broker.id,
            status: 'error',
            error: err.message,
          });
        });

        client.on('close', () => {
          if (mqttBrokerStatus.get(broker.id) !== 'error') {
            mqttBrokerStatus.set(broker.id, 'disconnected');
            broadcastSmarthomeEvent({ type: 'broker_status', brokerId: broker.id, status: 'disconnected' });
          }
        });
      } catch (err: any) {
        mqttBrokerStatus.set(broker.id, 'error');
      }
    }
  }

  async function pollAllDbSources(onlySourceId?: string) {
    const cfg = await loadSmarthomeConfig();
    const sources = onlySourceId ? cfg.dbSources.filter((s) => s.id === onlySourceId) : cfg.dbSources;
    for (const src of sources) {
      if (src.enabled === false) continue;
      const matchingTiles = cfg.tiles.filter((tile) => tile.sourceType === 'db' && tile.sourceId === src.id);
      if (matchingTiles.length === 0) continue;

      try {
        if (src.kind === 'influx-v1' || src.kind === 'influx-v2' || src.kind === 'prometheus') {
          for (const tile of matchingTiles) {
            const resData =
              src.kind === 'influx-v1'
                ? await queryInfluxV1Tile(src, tile)
                : src.kind === 'influx-v2'
                  ? await queryInfluxV2Tile(src, tile)
                  : await queryPrometheusTile(src, tile);
            if (!resData) continue;
            src.lastSyncAt = Date.now();
            const refNum =
              'refNum' in resData && typeof (resData as { refNum?: unknown }).refNum === 'number'
                ? (resData as { refNum?: number }).refNum
                : undefined;
            const { displayValue, numericValue } = applyTileCalculation(
              tile,
              resData.latestStr,
              resData.latestNum,
              refNum
            );
            recordSmarthomeValue(`tile:${tile.id}`, displayValue || resData.latestStr, {
              rawValue: resData.latestStr,
              numericOverride: numericValue,
              referenceValue: refNum,
              series: resData.series,
            });
            if (resData.latestStr !== '') {
              recordSmarthomeValue(`${src.id}::${tile.topicOrPath}`, resData.latestStr, {
                numericOverride: resData.latestNum,
                referenceValue: refNum,
                series: resData.series,
              });
            }
          }
          continue;
        }

        // Default HTTP JSON source
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3500);
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (src.authHeader) {
          headers['Authorization'] = src.authHeader;
        }
        const resp = await fetch(src.url, { headers, signal: controller.signal });
        clearTimeout(t);
        if (!resp.ok) continue;
        const json = await resp.json();
        src.lastSyncAt = Date.now();

        for (const tile of matchingTiles) {
          const extracted = extractJsonPathValue(json, tile.jsonPath || tile.topicOrPath);
          if (extracted !== '') {
            const num = parseNumericString(extracted);
            const { displayValue, numericValue } = applyTileCalculation(tile, extracted, num, undefined);
            recordSmarthomeValue(`${src.id}::${tile.topicOrPath}`, extracted);
            if (tile.calculation?.formula) {
              recordSmarthomeValue(`tile:${tile.id}`, displayValue, {
                rawValue: extracted,
                numericOverride: numericValue,
              });
            }
          }
        }
      } catch {}
    }
  }

  // Initialize MQTT pool cleanly in background & poll HTTP/DB sources periodically
  syncMqttConnections().catch(() => {});
  setInterval(() => {
    pollAllDbSources().catch(() => {});
  }, 30000);

  async function probeMqttHostPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {}
        resolve(ok);
      };
      socket.setTimeout(900);
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host, () => {
        // Send minimal MQTT 3.1.1 CONNECT packet and verify CONNACK (0x20)
        const connectPacket = Buffer.from([
          0x10, 0x0e, 0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c, 0x00, 0x02, 0x6f, 0x73,
        ]);
        socket.write(connectPacket);
      });
      socket.once('data', (chunk) => {
        done(chunk.length >= 2 && chunk[0] === 0x20);
      });
    });
  }

  app.get('/api/smarthome/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    smarthomeSseClients.add(res);
    const keepalive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 25000);

    req.on('close', () => {
      clearInterval(keepalive);
      smarthomeSseClients.delete(res);
    });
  });

  app.get('/api/smarthome/state', async (req, res) => {
    const username = path.basename((req.query.username as string) || 'michael');
    try {
      const cfg = await loadSmarthomeConfig();
      const brokers = cfg.brokers.map((b) => ({
        ...b,
        status: mqttBrokerStatus.get(b.id) || (b.enabled ? 'connecting' : 'disconnected'),
      }));
      const tiles = cfg.tiles.filter(
        (t) => t.ownerUsername === username || t.isAdminPreset === true
      );
      const values: Record<string, any> = {};
      for (const [k, v] of smarthomeLiveValues.entries()) {
        values[k] = v;
      }
      res.json({
        brokers,
        dbSources: cfg.dbSources,
        tiles,
        values,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthome/mqtt-topics', async (req, res) => {
    const brokerId = req.query.brokerId ? String(req.query.brokerId) : '';
    const topics = Array.from(mqttDiscoveredTopics.values())
      .filter((t) => !brokerId || t.brokerId === brokerId)
      .sort((a, b) => b.timestamp - a.timestamp);
    res.json({ topics });
  });

  app.post('/api/smarthome/discover', async (_req, res) => {
    try {
      const hostCandidates = ['localhost', '127.0.0.1', 'mosquitto', 'iobroker', 'homeassistant'];
      const portCandidates = [1883, 1884, 9001];
      const checks: Array<Promise<{ host: string; port: number; kind: 'mqtt'; label: string } | null>> = [];

      for (const host of hostCandidates) {
        for (const port of portCandidates) {
          checks.push(
            probeMqttHostPort(host, port).then((ok) =>
              ok ? { host, port, kind: 'mqtt', label: `MQTT Broker (${host}:${port})` } : null
            )
          );
        }
      }

      const settled = await Promise.all(checks);
      const found = settled.filter((item): item is NonNullable<typeof item> => item !== null);
      res.json({ discovered: found });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthome/brokers', async (req, res) => {
    const broker = req.body;
    if (!broker || !broker.host) {
      return res.status(400).json({ error: 'Host fehlt' });
    }
    try {
      const cfg = await loadSmarthomeConfig();
      const id = broker.id || `mqtt_${Date.now()}`;
      const record = {
        id,
        name: broker.name || broker.host,
        host: broker.host.trim(),
        port: Number(broker.port) || 1883,
        protocol: broker.protocol || 'mqtt',
        username: broker.username || '',
        password: broker.password || '',
        enabled: broker.enabled !== false,
      };
      const idx = cfg.brokers.findIndex((b) => b.id === id);
      if (idx >= 0) {
        const old = mqttClientPool.get(id);
        if (old) {
          try {
            old.end(true);
          } catch {}
          mqttClientPool.delete(id);
        }
        cfg.brokers[idx] = record;
      } else {
        cfg.brokers.push(record);
      }
      await saveSmarthomeConfig(cfg);
      await syncMqttConnections();
      res.json({ success: true, broker: { ...record, status: mqttBrokerStatus.get(id) || 'connecting' } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthome/brokers', async (req, res) => {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Broker-ID fehlt' });
    try {
      const cfg = await loadSmarthomeConfig();
      cfg.brokers = cfg.brokers.filter((b) => b.id !== id);
      await saveSmarthomeConfig(cfg);
      await syncMqttConnections();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthome/db-sources', async (req, res) => {
    const src = req.body;
    if (!src || !src.url) return res.status(400).json({ error: 'Datenbank / JSON URL fehlt' });
    try {
      const cfg = await loadSmarthomeConfig();
      const id = src.id || `db_${Date.now()}`;
      const record = {
        id,
        name: src.name || 'Telemetrie-Quelle',
        kind: src.kind || 'http-json',
        url: src.url.trim(),
        pollIntervalSec: Math.max(5, Number(src.pollIntervalSec) || 30),
        authHeader: src.authHeader || undefined,
        database: src.database ? String(src.database).trim() : undefined,
        retentionPolicy: src.retentionPolicy ? String(src.retentionPolicy).trim() : undefined,
        org: src.org ? String(src.org).trim() : undefined,
        bucket: src.bucket ? String(src.bucket).trim() : undefined,
        username: src.username ? String(src.username).trim() : undefined,
        password: src.password || undefined,
        enabled: src.enabled !== false,
        lastSyncAt: src.lastSyncAt || undefined,
      };
      const idx = cfg.dbSources.findIndex((s) => s.id === id);
      if (idx >= 0) cfg.dbSources[idx] = record;
      else cfg.dbSources.push(record);
      await saveSmarthomeConfig(cfg);
      await pollAllDbSources(id);
      res.json({ success: true, source: record });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthome/db-sources', async (req, res) => {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Source-ID fehlt' });
    try {
      const cfg = await loadSmarthomeConfig();
      cfg.dbSources = cfg.dbSources.filter((s) => s.id !== id);
      await saveSmarthomeConfig(cfg);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthome/db-sources/poll', async (req, res) => {
    const sourceId = req.body?.sourceId;
    try {
      await pollAllDbSources(sourceId);
      const values: Record<string, any> = {};
      for (const [k, v] of smarthomeLiveValues.entries()) values[k] = v;
      res.json({ success: true, values });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthome/tiles', async (req, res) => {
    const tile = req.body;
    if (!tile || !tile.title || !tile.topicOrPath) {
      return res.status(400).json({ error: 'Titel oder Topic/Pfad fehlt' });
    }
    try {
      const cfg = await loadSmarthomeConfig();
      const id = tile.id || `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const record = {
        ...tile,
        id,
        size: tile.size === 'wide' || tile.size === 'lg' ? tile.size : 'sm',
        displayMode: tile.displayMode || 'value',
        tab: tile.tab ? String(tile.tab).trim() : undefined,
        group: tile.group ? String(tile.group).trim() : undefined,
        timeRange: tile.timeRange || '24h',
        calculation: tile.calculation || undefined,
        isAdminPreset: Boolean(tile.isAdminPreset),
      };
      const idx = cfg.tiles.findIndex((t) => t.id === id);
      if (idx >= 0) cfg.tiles[idx] = record;
      else cfg.tiles.push(record);
      await saveSmarthomeConfig(cfg);

      // Subscribe active MQTT client immediately & evaluate DB/formula immediately
      if (record.sourceType === 'mqtt') {
        const client = mqttClientPool.get(record.sourceId);
        if (client?.connected) {
          client.subscribe(record.topicOrPath, { qos: 0 }, () => {});
        }
        const existingRaw = smarthomeLiveValues.get(`${record.sourceId}::${record.topicOrPath}`);
        if (existingRaw && (record.jsonPath || record.calculation?.formula)) {
          let effectiveRaw = existingRaw.value;
          if (record.jsonPath && effectiveRaw.trim().startsWith('{')) {
            try {
              const extracted = extractJsonPathValue(JSON.parse(effectiveRaw), record.jsonPath);
              if (extracted !== '') effectiveRaw = extracted;
            } catch {}
          }
          const num = parseNumericString(effectiveRaw);
          const { displayValue, numericValue } = applyTileCalculation(record, effectiveRaw, num, undefined);
          recordSmarthomeValue(`tile:${record.id}`, displayValue, {
            rawValue: effectiveRaw,
            numericOverride: numericValue,
          });
        }
      } else if (record.sourceType === 'db') {
        await pollAllDbSources(record.sourceId);
      }

      res.json({ success: true, tile: record });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthome/tiles', async (req, res) => {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Tile-ID fehlt' });
    try {
      const cfg = await loadSmarthomeConfig();
      cfg.tiles = cfg.tiles.filter((t) => t.id !== id);
      smarthomeLiveValues.delete(`tile:${id}`);
      await saveSmarthomeConfig(cfg);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthome/tiles/adopt', async (req, res) => {
    const { presetId, username } = req.body;
    if (!presetId || !username) {
      return res.status(400).json({ error: 'presetId oder username fehlt' });
    }
    try {
      const cfg = await loadSmarthomeConfig();
      const preset = cfg.tiles.find((t) => t.id === presetId && t.isAdminPreset);
      if (!preset) return res.status(404).json({ error: 'Admin-Vorlage nicht gefunden' });

      const copy = {
        ...preset,
        id: `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerUsername: path.basename(username),
        isAdminPreset: false,
      };
      cfg.tiles.push(copy);
      await saveSmarthomeConfig(cfg);
      res.json({ success: true, tile: copy });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // SYSTEM CHANGELOG (/UPDATE File)
  // =========================================================================
  app.get('/api/system/changelog', async (_req, res) => {
    try {
      const updateFile = path.resolve(__dirname, 'UPDATE');
      if (!fs.existsSync(updateFile)) {
        return res.json({ versions: [], raw: '', updatedAt: 0 });
      }
      const stat = await fsp.stat(updateFile);
      const raw = await fsp.readFile(updateFile, 'utf-8');
      const lines = raw.split(/\r?\n/);

      const versions: Array<{
        version: string;
        date: string;
        sections: Array<{ title: string; items: string[] }>;
      }> = [];
      let currentVer: (typeof versions)[number] | null = null;
      let currentSec: { title: string; items: string[] } | null = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('## ')) {
          const rest = line.slice(3).trim();
          const parts = rest.split(/\s+[–-]\s+/);
          currentVer = {
            version: parts[0]?.trim() || rest,
            date: parts[1]?.trim() || '',
            sections: [],
          };
          versions.push(currentVer);
          currentSec = null;
        } else if (line.startsWith('### ') && currentVer) {
          currentSec = { title: line.slice(4).trim(), items: [] };
          currentVer.sections.push(currentSec);
        } else if (line.startsWith('- ') && currentVer) {
          if (!currentSec) {
            currentSec = { title: 'Allgemein', items: [] };
            currentVer.sections.push(currentSec);
          }
          currentSec.items.push(line.slice(2).trim());
        }
      }

      res.json({ versions, raw, updatedAt: stat.mtimeMs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve public directory (manifest.json, sw.js, icons)
  app.use(express.static(path.resolve(__dirname, 'public')));

  // Frontend mounting: Vite in development, static in production
  if (!IS_PRODUCTION) {
    const viteModule = await viteImportPromise;
    const createViteServer = viteModule!.createServer;
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api/')) return next();
      try {
        let template = await fsp.readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        log('error', `Fehler beim Rendern von index.html: ${e.message}`, 'VITE');
        next(e);
      }
    });
    log('info', `Vite Middleware im Entwicklungsmodus eingebunden (HMR deaktiviert)`, 'VITE');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
      log('info', `Statische Dateien aus ${distPath} ausgeliefert`, 'STATIC');
    }
  }

  initDone = true;
  })();

  // Register readiness guard first so early requests wait cleanly while routes & Vite finish mounting
  app.use(async (_req, res, next) => {
    if (!initDone) {
      try {
        await readyPromise;
      } catch (err: any) {
        return res.status(500).send(`Server initialization failed: ${err?.message || 'Unknown error'}`);
      }
    }
    next();
  });

  app.listen(PORT, '0.0.0.0', () => {
    log('info', `==========================================================`, 'STARTUP');
    log('info', `🚀 OchreNotes Server gestartet auf http://0.0.0.0:${PORT}`, 'STARTUP');
    log('info', `📂 Gemounteter Vault-Pfad: ${VAULT_PATH}`, 'STARTUP');
    log('info', `🌐 Modus: ${IS_PRODUCTION ? 'PRODUKTION' : 'ENTWICKLUNG (Vite)'}`, 'STARTUP');
    log('info', `==========================================================`, 'STARTUP');
  });

  await readyPromise;
}

createServer().catch((err) => {
  console.error('\x1b[31m[FATAL] Serverabsturz beim Starten:\x1b[0m', err);
  process.exit(1);
});
