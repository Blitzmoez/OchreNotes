import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
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
  const userVault = dirs.profile1;
  const existingEntries = fs.readdirSync(userVault);

  // Seed initial Wiki article if Wiki folder has no .md files yet
  const wikiFiles = fs.readdirSync(dirs.wiki).filter((f) => f.endsWith('.md'));
  if (wikiFiles.length === 0 && isMichael) {
    const sampleWiki = `---
title: "Docker & NAS Backup Anleitung"
category: "Server & Docker"
tags: ["docker", "nas", "anleitung"]
updatedAt: "${new Date().toISOString()}"
---

Diese Wiki-Seite wird nach dem **offenen Markdown-Standard** mit YAML-Frontmatter direkt im Ordner \`User/${username}/Wiki/\` gespeichert.

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
      - /srv/NASDRIVE/Files/OchreSuite/config:/data/config
\`\`\`

### Berechtigungen auf NAS setzen
\`\`\`bash
chown -R 2000:100 /srv/NASDRIVE/Files/OchreSuite
chmod -R 775 /srv/NASDRIVE/Files/OchreSuite
\`\`\`
`;
    await fsp.writeFile(path.join(dirs.wiki, 'docker-nas-backup-anleitung.md'), sampleWiki, 'utf-8');
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

    app.use(express.json({ limit: '20mb' }));

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
  // OPEN-STANDARD WIKI API (Standard Markdown + YAML Frontmatter + Local Assets)
  // =========================================================================
  function parseWikiMarkdown(slug: string, raw: string) {
    let title = slug;
    let category = 'Allgemein';
    let tags: string[] = [];
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

    // Split optional Fotos & Code-Ablage sections while keeping standard Markdown format
    let body = content;
    const images: Array<{ id: string; url: string; alt: string; caption?: string }> = [];
    const snippets: Array<{ id: string; title: string; language: string; code: string }> = [];

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

    // Parse images from imgSection
    if (imgSection) {
      const imgLines = imgSection.split(/\r?\n/);
      imgLines.forEach((line, i) => {
        const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\s*<!--\s*caption:(.*?)\s*-->)?/);
        if (m) {
          images.push({
            id: `img_${i}_${Date.now()}`,
            alt: m[1] || 'Foto',
            url: m[2],
            caption: m[3] ? m[3].trim() : undefined,
          });
        }
      });
    }

    // Parse code snippets from codeSection (### Title \n ```lang \n code \n ```)
    if (codeSection) {
      const snippetRegex = /###\s+([^\r\n]+)\r?\n```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
      let match;
      let idx = 0;
      while ((match = snippetRegex.exec(codeSection)) !== null) {
        snippets.push({
          id: `snip_${idx++}_${Date.now()}`,
          title: match[1].trim(),
          language: match[2].trim() || 'bash',
          code: match[3].replace(/\r?\n$/, ''),
        });
      }
    }

    return {
      slug,
      title,
      category,
      tags,
      updatedAt,
      body: body.trim(),
      images,
      snippets,
      rawMarkdown: raw,
    };
  }

  function serializeWikiMarkdown(article: any): string {
    const safeTitle = (article.title || 'Unbenannt').replace(/"/g, '\\"');
    const safeCategory = (article.category || 'Allgemein').replace(/"/g, '\\"');
    const tagsArr = Array.isArray(article.tags) ? article.tags : [];
    const tagsYaml = `[${tagsArr.map((t: string) => `"${String(t).replace(/"/g, '')}"`).join(', ')}]`;
    const updatedAt = article.updatedAt || new Date().toISOString();

    let md = `---\ntitle: "${safeTitle}"\ncategory: "${safeCategory}"\ntags: ${tagsYaml}\nupdatedAt: "${updatedAt}"\n---\n\n${(article.body || '').trim()}\n`;

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
    const username = (req.query.username as string) || 'michael';
    try {
      const dirs = ensureUserProfileStructure(username);
      const files = await fsp.readdir(dirs.wiki);
      const articles = [];
      for (const f of files) {
        if (f.endsWith('.md')) {
          const slug = f.replace(/\.md$/, '');
          const raw = await fsp.readFile(path.join(dirs.wiki, f), 'utf-8');
          articles.push(parseWikiMarkdown(slug, raw));
        }
      }
      articles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      res.json(articles);
    } catch (err: any) {
      log('error', `Fehler beim Laden der Wiki-Artikel: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/articles', async (req, res) => {
    const { username = 'michael', article, oldSlug } = req.body;
    if (!article || !article.title) {
      return res.status(400).json({ error: 'Artikel oder Titel fehlt' });
    }
    try {
      const dirs = ensureUserProfileStructure(username);
      const slugBase = (article.slug || article.title)
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9\-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || `wiki-${Date.now()}`;

      const updatedArticle = {
        ...article,
        slug: slugBase,
        updatedAt: new Date().toISOString(),
      };
      const mdContent = serializeWikiMarkdown(updatedArticle);
      const targetPath = path.join(dirs.wiki, `${slugBase}.md`);
      await fsp.writeFile(targetPath, mdContent, 'utf-8');

      if (oldSlug && oldSlug !== slugBase) {
        const oldPath = path.join(dirs.wiki, `${oldSlug}.md`);
        if (fs.existsSync(oldPath)) {
          await fsp.unlink(oldPath).catch(() => {});
        }
      }

      log('info', `Wiki-Artikel gespeichert (Markdown): '${username}/Wiki/${slugBase}.md'`, 'WIKI');
      res.json({ ...updatedArticle, rawMarkdown: mdContent });
    } catch (err: any) {
      log('error', `Fehler beim Speichern des Wiki-Artikels: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/wiki/articles', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    const slug = req.query.slug as string;
    if (!slug) return res.status(400).json({ error: 'Slug fehlt' });
    try {
      const dirs = ensureUserProfileStructure(username);
      const safeSlug = path.basename(slug);
      const fullPath = path.join(dirs.wiki, `${safeSlug}.md`);
      if (fs.existsSync(fullPath)) {
        await fsp.unlink(fullPath);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/upload', async (req, res) => {
    const { username = 'michael', filename = 'photo.png', dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Bilddaten fehlen' });
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
      };
      const ext = extMap[match[1].toLowerCase()] || 'png';
      const baseName = path.basename(filename, path.extname(filename))
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .slice(0, 40) || 'foto';
      const savedName = `${Date.now()}_${baseName}.${ext}`;

      const dirs = ensureUserProfileStructure(username);
      const assetsDir = path.join(dirs.wiki, 'assets');
      if (!fs.existsSync(assetsDir)) await fsp.mkdir(assetsDir, { recursive: true });

      const buffer = Buffer.from(match[2], 'base64');
      await fsp.writeFile(path.join(assetsDir, savedName), buffer);

      const url = `/api/wiki/assets/${encodeURIComponent(username)}/${encodeURIComponent(savedName)}`;
      log('info', `Wiki-Foto hochgeladen: ${savedName} (${buffer.length} Bytes)`, 'WIKI');
      res.json({ success: true, url, filename: savedName });
    } catch (err: any) {
      log('error', `Fehler beim Wiki-Fotoupload: ${err.message}`, 'WIKI');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/wiki/assets/:username/:filename', async (req, res) => {
    const { username, filename } = req.params;
    try {
      const dirs = ensureUserProfileStructure(path.basename(username));
      const safeFile = path.basename(filename);
      const fullPath = path.join(dirs.wiki, 'assets', safeFile);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).send('Asset not found');
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).send('Asset not found');
    }
  });

  // Share a Wiki article in-app to another user's Wiki folder (copying .md + local images)
  app.post('/api/wiki/share', async (req, res) => {
    const { fromUsername, toUsername, slug } = req.body;
    if (!fromUsername || !toUsername || !slug) {
      return res.status(400).json({ error: 'fromUsername, toUsername oder slug fehlt' });
    }
    try {
      const srcDirs = ensureUserProfileStructure(path.basename(fromUsername));
      const destDirs = ensureUserProfileStructure(path.basename(toUsername));
      const safeSlug = path.basename(slug);
      const srcFile = path.join(srcDirs.wiki, `${safeSlug}.md`);
      if (!fs.existsSync(srcFile)) {
        return res.status(404).json({ error: 'Wiki-Artikel nicht gefunden' });
      }
      let raw = await fsp.readFile(srcFile, 'utf-8');
      const assetPrefix = `/api/wiki/assets/${encodeURIComponent(fromUsername)}/`;
      const destAssetPrefix = `/api/wiki/assets/${encodeURIComponent(toUsername)}/`;
      // Copy referenced images if stored in sender's Wiki/assets
      const assetDirDest = path.join(destDirs.wiki, 'assets');
      if (!fs.existsSync(assetDirDest)) await fsp.mkdir(assetDirDest, { recursive: true });
      const regex = new RegExp(assetPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^)\\s]+)', 'g');
      let match;
      const toCopy = new Set<string>();
      while ((match = regex.exec(raw)) !== null) {
        toCopy.add(decodeURIComponent(match[1]));
      }
      for (const imgName of toCopy) {
        const srcImg = path.join(srcDirs.wiki, 'assets', path.basename(imgName));
        const destImg = path.join(assetDirDest, path.basename(imgName));
        if (fs.existsSync(srcImg)) {
          await fsp.copyFile(srcImg, destImg);
        }
      }
      raw = raw.split(assetPrefix).join(destAssetPrefix);
      const targetSlug = `${safeSlug}-von-${path.basename(fromUsername)}`;
      await fsp.writeFile(path.join(destDirs.wiki, `${targetSlug}.md`), raw, 'utf-8');
      log('info', `Wiki-Artikel '${safeSlug}' von '${fromUsername}' an '${toUsername}' geteilt`, 'WIKI');
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

  async function resolveUserLibraryContext(username: string): Promise<{
    library: MealPlanLibraryRecord | null;
    invitations: Array<{ libraryId: string; name: string; ownerUsername: string; ownerDisplayName: string; membersCount: number; createdAt: number }>;
    allLibraries: MealPlanLibraryRecord[];
  }> {
    const libs = await getMealLibraries();
    const activeLib = libs.find((l) => l.members.includes(username)) || null;
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
    return { library: activeLib, invitations, allLibraries: libs };
  }

  async function resolveCookbookDirsForKey(keyOrUsername: string): Promise<{ cookbook: string; cookbookRecipes: string; cookbookMedia: string; routeKey: string }> {
    const clean = path.basename(String(keyOrUsername || 'michael'));
    const libs = await getMealLibraries();
    const byId = libs.find((l) => l.id === clean);
    if (byId) {
      return getCookbookDirsFromStorageKey(byId.storageKey);
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
      const { library, invitations, allLibraries } = await resolveUserLibraryContext(username);
      const users = await getUsers();

      if (!library) {
        return res.json({
          hasLibrary: false,
          library: null,
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
        library: {
          id: library.id,
          name: library.name,
          ownerUsername: library.ownerUsername,
          ownerDisplayName: library.ownerDisplayName,
          visibility: library.visibility,
          invitedUsers: library.invitedUsers,
          members: library.members,
          createdAt: library.createdAt,
        },
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

      if (libraryId) {
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

      // Check if user is already member of a library — update instead or forbid duplicate
      const alreadyMember = libs.find((l) => l.members.includes(username));
      if (alreadyMember) {
        alreadyMember.name = cleanName;
        alreadyMember.visibility = cleanVisibility;
        alreadyMember.invitedUsers = cleanInvited.filter((u) => !alreadyMember.members.includes(u));
        await saveMealLibraries(libs);
        return res.json({ success: true, library: alreadyMember });
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
      log('info', `Neue Essensplan-Library '${cleanName}' (${cleanVisibility}) erstellt für '${username}'`, 'COOKBOOK');
      res.json({ success: true, library: newLib });
    } catch (err: any) {
      log('error', `Fehler bei Essensplan-Library: ${err.message}`, 'COOKBOOK');
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

      // Remove user from any other library membership first so each user has a clean active library
      for (const lib of libs) {
        if (lib.id !== libraryId && lib.members.includes(username) && lib.ownerUsername !== username) {
          lib.members = lib.members.filter((m) => m !== username);
        }
      }

      if (!target.members.includes(username)) {
        target.members.push(username);
      }
      target.invitedUsers = target.invitedUsers.filter((u) => u !== username);
      await saveMealLibraries(libs);
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
