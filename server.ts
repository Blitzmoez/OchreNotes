import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const VAULT_PATH = process.env.VAULT_PATH || path.resolve(__dirname, 'vault_data');
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
const MAX_LOGS = 300;

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

export function getUserVaultDir(username: string): string {
  // Supports NAS volume mount: /srv/NASDRIVE/Files/OchreSuite/User -> /vault/User
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

async function initVaultDirectory() {
  try {
    if (!fs.existsSync(VAULT_PATH)) {
      log('info', `Erstelle Vault-Verzeichnis unter: ${VAULT_PATH}`, 'STORAGE');
      await fsp.mkdir(VAULT_PATH, { recursive: true, mode: 0o775 });
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

    // Users file
    const usersFile = path.join(VAULT_PATH, 'users.json');
    if (!fs.existsSync(usersFile)) {
      await fsp.writeFile(usersFile, JSON.stringify(DEFAULT_USERS, null, 2), 'utf-8');
      log('info', `Benutzerdatenbank initialisiert mit ${DEFAULT_USERS.length} Profilen.`, 'AUTH');
    }

    // Shares file
    const sharesFile = path.join(VAULT_PATH, 'shares.json');
    if (!fs.existsSync(sharesFile)) {
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

    // Seed sample notes for Michael and Sarah
    await seedUserVault('michael', true);
    await seedUserVault('sarah', false);
  } catch (err: any) {
    log('error', `Fehler beim Initialisieren des Vault-Verzeichnisses: ${err.message}`, 'STORAGE');
  }
}

async function seedUserVault(username: string, isMichael: boolean) {
  const userVault = getUserVaultDir(username);
  if (fs.existsSync(userVault)) return;

  log('info', `Erstelle Initial-Vault für Benutzer '${username}'...`, 'SEED');
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

async function getUsers(): Promise<StoredUser[]> {
  try {
    const file = path.join(VAULT_PATH, 'users.json');
    if (!fs.existsSync(file)) return DEFAULT_USERS;
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_USERS;
  }
}

async function saveUsers(users: StoredUser[]) {
  const file = path.join(VAULT_PATH, 'users.json');
  await fsp.writeFile(file, JSON.stringify(users, null, 2), 'utf-8');
}

async function getAppConfig(): Promise<{ appTitle: string }> {
  try {
    const file = path.join(VAULT_PATH, 'config.json');
    if (!fs.existsSync(file)) return { appTitle: 'OchreNotes' };
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { appTitle: 'OchreNotes' };
  }
}

async function saveAppConfig(config: { appTitle: string }) {
  const file = path.join(VAULT_PATH, 'config.json');
  await fsp.writeFile(file, JSON.stringify(config, null, 2), 'utf-8');
}

// Helper: read shares
async function getShares(): Promise<ShareRecord[]> {
  try {
    const file = path.join(VAULT_PATH, 'shares.json');
    if (!fs.existsSync(file)) return [];
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

// Helper: save shares
async function saveShares(shares: ShareRecord[]) {
  const file = path.join(VAULT_PATH, 'shares.json');
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
}

async function scanUserNotes(username: string): Promise<ScannedNote[]> {
  const userVault = getUserVaultDir(username);
  if (!fs.existsSync(userVault)) return [];

  const notes: ScannedNote[] = [];

  async function walk(dir: string, relFolder = '') {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
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
  await initVaultDirectory();

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Request logger middleware
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        if (res.statusCode >= 400) {
          log('warn', `${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`, 'HTTP');
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

  // Notes API for Current User
  app.get('/api/vault/notes', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    try {
      const notes = await scanUserNotes(username);
      res.json(notes);
    } catch (err: any) {
      log('error', `Fehler beim Laden der Notizen für '${username}': ${err.message}`, 'VAULT');
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
    const notePath = req.query.path as string;
    const isShared = req.query.isShared === 'true';
    const sharedFrom = req.query.sharedFrom as string;

    if (!notePath) return res.status(400).json({ error: 'Pfad fehlt' });

    try {
      const targetUser = isShared && sharedFrom ? sharedFrom : username;
      const fullPath = path.join(getUserVaultDir(targetUser), notePath);

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
    const { username, path: notePath, content, isShared, sharedFrom } = req.body;

    if (!username || !notePath || content === undefined) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const targetUser = isShared && sharedFrom ? sharedFrom : username;
      const fullPath = path.join(getUserVaultDir(targetUser), notePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        await fsp.mkdir(dir, { recursive: true });
      }

      await fsp.writeFile(fullPath, content, 'utf-8');
      const stat = await fsp.stat(fullPath);
      log('info', `Notiz gespeichert: '${targetUser}/${notePath}' (${stat.size} Bytes)`, 'VAULT');

      res.json({ success: true, mtime: stat.mtimeMs, size: stat.size });
    } catch (err: any) {
      log('error', `Fehler beim Speichern von '${notePath}': ${err.message}`, 'VAULT');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Note
  app.delete('/api/vault/notes', async (req, res) => {
    const username = req.query.username as string;
    const notePath = req.query.path as string;

    if (!username || !notePath) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const fullPath = path.join(getUserVaultDir(username), notePath);
      if (fs.existsSync(fullPath)) {
        await fsp.unlink(fullPath);
        log('info', `Notiz gelöscht: '${username}/${notePath}'`, 'VAULT');

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
    const { username, oldPath, newPath } = req.body;
    if (!username || !oldPath || !newPath) {
      return res.status(400).json({ error: 'Fehlende Parameter (username, oldPath, newPath)' });
    }

    try {
      const sourceFile = path.join(getUserVaultDir(username), oldPath);
      const targetFile = path.join(getUserVaultDir(username), newPath);

      if (!fs.existsSync(sourceFile)) {
        return res.status(404).json({ error: 'Ursprüngliche Notiz nicht gefunden' });
      }

      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        await fsp.mkdir(targetDir, { recursive: true });
      }

      await fsp.rename(sourceFile, targetFile);
      log('info', `Notiz verschoben: '${username}/${oldPath}' -> '${username}/${newPath}'`, 'VAULT');

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
    try {
      const userVault = getUserVaultDir(username);
      if (!fs.existsSync(userVault)) return res.json([]);

      const folderList: string[] = [];
      async function walkDirs(dir: string, relFolder = '') {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
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
    const { username, folderPath } = req.body;
    if (!username || !folderPath) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const targetDir = path.join(getUserVaultDir(username), folderPath);
      if (!fs.existsSync(targetDir)) {
        await fsp.mkdir(targetDir, { recursive: true });
        log('info', `Ordner erstellt: '${username}/${folderPath}'`, 'VAULT');
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
    const folderPath = req.query.folderPath as string;

    if (!username || !folderPath) {
      return res.status(400).json({ error: 'Fehlende Parameter (username, folderPath)' });
    }

    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    if (!cleanFolder) {
      return res.status(400).json({ error: 'Hauptordner kann nicht gelöscht werden' });
    }

    try {
      const targetDir = path.join(getUserVaultDir(username), cleanFolder);
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
      log('info', `Leerer Ordner gelöscht: '${username}/${cleanFolder}'`, 'VAULT');
      res.json({ success: true, folderPath: cleanFolder });
    } catch (err: any) {
      log('error', `Fehler beim Löschen des Ordners '${cleanFolder}': ${err.message}`, 'VAULT');
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
    try {
      const allTasks: ParsedTask[] = [];

      // Scan personal notes
      const notes = await scanUserNotes(username);
      for (const note of notes) {
        const fullPath = path.join(getUserVaultDir(username), note.path);
        if (fs.existsSync(fullPath)) {
          const content = await fsp.readFile(fullPath, 'utf-8');
          const noteTasks = parseTasksFromContent(content, note.path, note.title, false);
          allTasks.push(...noteTasks);
        }
      }

      // Also scan notes shared with this user
      const users = await getUsers();
      const currentUser = users.find((u) => u.username === username);
      if (currentUser) {
        const shares = await getShares();
        const myShares = shares.filter((s) => s.sharedWithUserId === currentUser.id);
        for (const share of myShares) {
          const fullPath = path.join(getUserVaultDir(share.ownerUsername), share.notePath);
          if (fs.existsSync(fullPath)) {
            const content = await fsp.readFile(fullPath, 'utf-8');
            const noteTasks = parseTasksFromContent(content, share.notePath, path.basename(share.notePath, '.md'), true, share.ownerDisplayName);
            allTasks.push(...noteTasks);
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
    const { username, notePath, lineIndex, completed, isShared, sharedFrom } = req.body;

    if (!notePath || lineIndex === undefined || completed === undefined) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
      const targetUser = isShared && sharedFrom ? sharedFrom : username;
      const fullPath = path.join(getUserVaultDir(targetUser), notePath);

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
        // Mark as completed: replace - [ ] with - [x] and optionally append completion date
        newLine = currentLine.replace(/^([ \t]*- \[)[ ](\])/, '$1x$2');
        if (!newLine.includes('✅')) {
          newLine = `${newLine} ✅ ${today}`;
        }
      } else {
        // Unmark: replace - [x] with - [ ] and remove completion tag
        newLine = currentLine.replace(/^([ \t]*- \[)[xX](\])/, '$1 $2').replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trimEnd();
      }

      lines[lineIndex] = newLine;
      await fsp.writeFile(fullPath, lines.join('\n'), 'utf-8');
      log('info', `Aufgabe in '${targetUser}/${notePath}' Zeile ${lineIndex + 1} auf ${completed ? 'ERLEDIGT' : 'OFFEN'} gesetzt`, 'TASKS');

      res.json({ success: true, updatedLine: newLine });
    } catch (err: any) {
      log('error', `Fehler beim Umschalten der Aufgabe: ${err.message}`, 'TASKS');
      res.status(500).json({ error: err.message });
    }
  });

  // Knowledge Graph Data
  app.get('/api/graph', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    try {
      const notes = await scanUserNotes(username);
      const nodes: any[] = [];
      const links: any[] = [];
      const nodeIds = new Set<string>();

      // Add note nodes
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

      // Scan for [[wikilinks]] and #tags
      for (const note of notes) {
        const fullPath = path.join(getUserVaultDir(username), note.path);
        if (fs.existsSync(fullPath)) {
          const content = await fsp.readFile(fullPath, 'utf-8');

          // Wikilinks: [[Target Note]]
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

          // Tags: #tag
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

  // Vault Backup & Restore
  app.get('/api/vault/backup', async (req, res) => {
    const username = (req.query.username as string) || 'michael';
    try {
      const notes = await scanUserNotes(username);
      const backupNotes: { path: string; content: string; mtime: number }[] = [];

      for (const note of notes) {
        const fullPath = path.join(getUserVaultDir(username), note.path);
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
        vaultPath: VAULT_PATH,
        notesCount: backupNotes.length,
        notes: backupNotes,
        shares: userShares,
      };

      log('info', `Backup für '${username}' erstellt mit ${backupNotes.length} Notizen`, 'BACKUP');
      res.setHeader('Content-Disposition', `attachment; filename="ochrenotes_backup_${username}_${Date.now()}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(payload);
    } catch (err: any) {
      log('error', `Fehler beim Erstellen des Backups: ${err.message}`, 'BACKUP');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vault/restore', async (req, res) => {
    const { username, backup } = req.body;
    if (!username || !backup || !Array.isArray(backup.notes)) {
      return res.status(400).json({ error: 'Ungültiges Backup-Format' });
    }

    try {
      const userVault = getUserVaultDir(username);
      let restoredCount = 0;

      for (const item of backup.notes) {
        if (item.path && item.content !== undefined) {
          const fullPath = path.join(userVault, item.path);
          await fsp.mkdir(path.dirname(fullPath), { recursive: true });
          await fsp.writeFile(fullPath, item.content, 'utf-8');
          restoredCount++;
        }
      }

      log('info', `Backup erfolgreich wiederhergestellt: ${restoredCount} Notizen für '${username}'`, 'RESTORE');
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
    res.json(systemLogs.slice(-100).reverse());
  });

  // Serve public directory (manifest.json, sw.js, icons)
  app.use(express.static(path.resolve(__dirname, 'public')));

  // Frontend mounting: Vite in development, static in production
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
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

  app.listen(PORT, '0.0.0.0', () => {
    log('info', `==========================================================`, 'STARTUP');
    log('info', `🚀 OchreNotes Server gestartet auf http://0.0.0.0:${PORT}`, 'STARTUP');
    log('info', `📂 Gemounteter Vault-Pfad: ${VAULT_PATH}`, 'STARTUP');
    log('info', `🌐 Modus: ${IS_PRODUCTION ? 'PRODUKTION' : 'ENTWICKLUNG (Vite)'}`, 'STARTUP');
    log('info', `==========================================================`, 'STARTUP');
  });
}

createServer().catch((err) => {
  console.error('\x1b[31m[FATAL] Serverabsturz beim Starten:\x1b[0m', err);
  process.exit(1);
});
