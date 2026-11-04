# Docker-fähiger Obsidian Markdown Editor & Task Hub ("OchreNotes")

Eine produktionsreife, Docker-native Markdown-Knowledgebase und Aufgaben-Plattform im Stil von Obsidian. Die Anwendung speichert alle Notizen transparent als reine Markdown-Dateien in einem gemounteten Docker-Volume, bietet das vollständige "Obsidian Tasks"-System mit globalem Aufgaben-Dashboard, Multitasking durch Snap-Split-Panes, interaktive Graph-Ansicht, YouTube-Embed-Slider, In-App-Benutzerfreigaben, Quick-Share (WhatsApp, Signal, Mail), Vault-Backup/Restore und volle Vorbereitung für eine native Android-App via REST-API.

---

> [!IMPORTANT]
> **Aktualisierte & bestätigte Entscheidungen:**
> 1. **In-App Notizfreigabe zwischen Benutzern**: Notizen können direkt per Klick für andere Benutzer im System freigegeben werden (z. B. für den Partner/die Familie oder Kollegen) mit Lese- oder Schreibrechten.
> 2. **Getrennte, dezente Seitenleisten-Sektion**: Beim Empfänger landen freigegebene Notizen in einer separaten, einklappbaren Sektion *"Für mich freigegeben"*, sauber nach dem jeweiligen Absender gruppiert (z. B. *"Von Michael"*), damit der eigene Notizenbereich aufgeräumt bleibt.
> 3. **Schnelles externes Teilen (Quick Share)**: 1-Klick-Weiterleitung an WhatsApp, Signal, E-Mail, Text-Kopieren und direkter `.md`-Download.
> 4. **Interaktive Graph-Ansicht**: Obsidian-typischer Wissensgraph (Force-Directed Graph) für Notizen, Wikilinks (`[[Notiz]]`) und Tags (`#tag`).
> 5. **Vollständiges Vault-Backup**: Export/Import des gesamten Notiz- und Datenstamms als Archiv (`.zip`/JSON) in den Einstellungen.
> 6. **Command-Tabellen & gerahmte Snippet-Quotes**: Spezielles Styling für Terminal-Commands und Cheat-Sheets mit dezentem Rahmen und Kopier-Button.
> 7. **Docker & Android-Zukunftssicherheit**: Modulares Backend, `/data/vault` Volume-Mounting, Port-Freiheit (`process.env.PORT`) und REST-Sync-Protokoll.

---

## 1. Overview & Core Concept

- **Was die App leistet**: Eine webbasierte Notizen-, Wissens- und Aufgaben-Zentrale mit dem Look & Feel von Obsidian für den Docker-Einsatz. Eigene Notizen bleiben strikt im persönlichen Vault, können aber nahtlos und unaufdringlich für andere Haushalts- oder Teammitglieder freigegeben werden.
- **Zielgruppe**: Power-User, Paare, Familien und Teams, die Notizen unabhängig von proprietären Clouds auf dem eigenen Server / NAS / Docker hosten möchten.
- **Kernwert**: 100% datensouverän auf dem eigenen Docker-Host, keine versteckten Formate, nahtloses Teilen ohne Messenger-Zwang.

---

## 2. User Experience & Visual Design

### A. Visuelle Identität & Theme
- **Stilrichtung**: Warmer Minimalismus, inspiriert von hochwertigem Editorial-Design und handwerklichen Notizbüchern.
- **Farbpalette (60-30-10 Regel)**:
  - *Heller Modus*: Canvas in warmem Alabaster (`#FBFBFA`), strukturelle Pane-Flächen (`#F4F3EF`), subtile Trennlinien (`#E5E3DC`).
  - *Dunkler Modus*: Canvas in tiefem Anthrazit-Graphit (`#18191B`), Pane-Hintergründe (`#202225`), Border (`#2F3136`).
  - *Akzentfarbe (Ocker/Warm Bernstein)*: Warmes Ocker (`#C87D20` / `#D97706` im Light Mode, `#E09228` im Dark Mode) für aktive Tabs, Checkbox-Highlights, Terminerinnerungen und Graph-Knoten.
- **Typografie**:
  - *UI & Fließtext*: `Plus Jakarta Sans` / `DM Sans`.
  - *Code, Tasks & Daten*: `JetBrains Mono` / `tabular-nums` für Markdown-Code, Zeilennummern, Zeitstempel und Tastaturkürzel.
- **A4-Druckoptimierung**: Spezielles `@media print`-CSS, das UI, Toolbars und Navigationsleisten verbirgt, saubere Seitenumbrüche vor H1/H2 erzwingt und Ränder auf DIN A4 ausrichtet.

### B. Schlüssel-Workflows
1. **Benutzer-Schnellauswahl & Login**:
   - Startseite mit Profil-Karten (Avatar, Name, Rolle) für 1-Klick-Anmeldung ohne mühsames Tippen, plus Option für Passwort/OAuth.
2. **In-App Notizfreigabe ("Mit Partner/Team teilen")**:
   - Im Editor klickt der Nutzer auf *"Freigeben"* -> wählt den Benutzer aus (z. B. *"Sarah"*) und legt die Berechtigung fest (*Nur Lesen* oder *Darf Bearbeiten*).
   - In Sarahs Benutzeroberfläche erscheint in der linken Seitenleiste unter ihren eigenen Notizen eine dezente, einklappbare Rubrik:
     ```
     📂 Meine Notizen
        ├── Projekte/
        └── Einkaufsliste.md
     ────────────────────────
     👥 Für mich freigegeben
        ▼ Von Michael
           ├── Urlaubsplanung-2026.md [Bearbeitbar]
           └── Haus-Wartungsplan.md [Nur Lesen]
     ```
   - Freigegebene Notizen können parallel geöffnet, gelesen oder bearbeitet werden, ohne Sarahs eigene Ordnerstruktur zu verunreinigen.
3. **Multitasking Workspace (Snap & Split)**:
   - Split Horizontal (`Alt+H`) und Split Vertikal (`Alt+V`) mit stufenlosem Schieberegler.
   - Jedes Pane kann flexibel umschalten zwischen: Markdown-Editor, Live-Vorschau, Aufgaben-Dashboard oder Wissensgraph.
4. **Formatierungs-Toolbar mit Syntax-Tooltips**:
   - Toolbar über dem Editor mit Buttons für H1–H3, Bold, Italic, Tasks, Datum, Callouts, Wikilinks, Command-Tabellen, Code und YouTube-Embed.
   - Bei Hover erscheint ein dezenter Tooltip mit dem Markdown-Befehl (z. B. `**Fett** (Strg+B)` oder `| Command | Beschreibung |`).
5. **Command-Tabellen & gerahmte Snippet-Quotes**:
   - Eigens gestaltete Block-Container mit dezentem Rahmen, sanft abgesetztem Hintergrund und integriertem "In Zwischenablage kopieren"-Button für Terminal-Commands und Cheat-Sheets.
6. **YouTube Embed mit interaktivem Slider/Umschalter**:
   - Umschalten zwischen: *Vollständiger Player* (abspielbar), *Thumbnail-Vorschaukarte* oder *Schlichter Hyperlink*.
7. **Quick-Share Funktion (Extern)**:
   - Schnell-Teilen-Dialog für externe Weitergabe: WhatsApp (`wa.me`), Signal, E-Mail (`mailto:`), Zwischenablage oder direkter `.md`-Download.
8. **Interaktive Obsidian-Graph-Ansicht**:
   - 2D-Canvas-Visualisierung des Wissensnetzes mit physikbasierter Kräfte-Simulation (Force Graph).
   - Verknüpfungen durch `[[Wikilinks]]` und Tags `#themen`.
9. **Globales Task-Dashboard ("Obsidian Tasks")**:
   - Automatische Erkennung beider Syntaxen: `- [ ] Aufgabe 📅 2026-10-25 ⏫` sowie `- [ ] Aufgabe due:2026-10-25`.
   - Filter nach: *Überfällig*, *Heute*, *Diese Woche*, *Erledigt*, nach Tag, Notiz oder Freigabe-Status.
   - Abhaken synchronisiert direkt die Markdown-Datei.
10. **Vault-Backup & Restore**:
    - Einstellungsmenü mit 1-Klick-Backup-Download und Wiederherstellung.
11. **Docker-Diagnose & System-Log-Konsole**:
    - "Server Status & Logs"-Dialog in der UI mit Volume-Berechtigungsprüfungen, RAM-Auslastung und Echtzeit-Logstream.

---

## 3. Technische Architektur & Systemdesign

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DOCKER CONTAINER (Node.js)                      │
│                                                                        │
│   PORT: process.env.PORT || 3000 (Konfigurierbar, z.B. 8080/3000)      │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                 Express Backend (server.ts)                    │   │
│   │  - REST API: /api/vault/*, /api/tasks/*, /api/shares/*         │   │
│   │  - Backup Engine: /api/vault/backup (Export/Import)            │   │
│   │  - Sharing & Access Control: Lese-/Schreibrechte pro Notiz     │   │
│   │  - Structured Logger (Console stdout/stderr mit Fehlerprüfung) │   │
│   │  - System Health & Diagnostics: /api/system/health, /logs      │   │
│   │  - Incremental Sync API (ETags/Timestamps für Android Client)  │   │
│   └───────────────────────┬───────────────────────┬────────────────┘   │
│                           │                       │                    │
│                           ▼                       ▼                    │
│   ┌───────────────────────────────┐   ┌────────────────────────────┐   │
│   │   Docker Volume: /data/vault  │   │ SQLite / Fast Memory Cache │   │
│   │   - user_1/Notizen/*.md       │   │ - Task Aggregation Index   │   │
│   │   - user_2/Notizen/*.md       │   │ - Sharing Index            │   │
│   │   - shares.json               │   │ - Wikilink Backlinks Graph │   │
│   │   (Reine Markdown-Dateien)    │   │ - Tag & Fulltext-Suche     │   │
│   └───────────────────────────────┘   └────────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Vite + React 19 Frontend Webapp                     │
│                                                                        │
│  ┌───────────────────────┐ ┌────────────────────────────────────────┐  │
│  │   Auth & User Switch  │ │        Snap / Split Workspace          │  │
│  │  - Profil-Schnellwahl │ │  - Pane A: Markdown Editor (Toolbar)   │  │
│  │  - Multi-User Session │ │  - Pane B: Live HTML / YouTube Slider  │  │
│  └───────────────────────┘ │  - Pane C: Global Tasks Dashboard      │  │
│  ┌───────────────────────┐ │  - Pane D: Interaktiver Wissensgraph   │  │
│  │  Sidebar Navigation   │ └────────────────────────────────────────┘  │
│  │  - Eigene Notizen     │ ┌────────────────────────────────────────┐  │
│  │  - "Für mich geteilt" │ │        Quick Share & Freigaben         │  │
│  │    (nach User getrennt│ │  - In-App Freigabe mit Rechten         │  │
│  └───────────────────────┘ │  - WhatsApp / Signal / Mail / .md      │  │
│  ┌───────────────────────┐ │  - A4 Print / PDF / Vault Backup       │  │
│  │  Offline & PWA Cache  │ └────────────────────────────────────────┘  │
│  │  - IndexedDB Storage  │                                             │
│  │  - Auto-Sync onOnline │                                             │
│  └───────────────────────┘                                             │
└────────────────────────────────────────────────────────────────────────┘
```

### A. Modulare Code-Architektur
- `src/types/`: Schnittstellen für Notizen, Tasks, Benutzer, Freigaben (Shares), Graph-Knoten.
- `src/services/api.ts`: Zentraler API-Client mit Freigabe-Endpunkten und Offline-Queue.
- `src/services/markdownParser.ts`: Markdown-Parser für Tasks, Wikilinks, Callouts, Command-Quotes, YouTube-Slider.
- `src/components/sidebar/`: Eigene Notizen-Hierarchie + separate, dezente "Für mich freigegeben"-Sektion nach Benutzern gegliedert.
- `src/components/workspace/`: Snap/Split-Pane Manager, Resizer, Multi-Tab-Leiste.
- `src/components/editor/`: Markdown-Editor, Syntax-Toolbar mit Tooltips, In-App-Freigabe & Quick-Share Modals.
- `src/components/preview/`: Live-HTML-Vorschau mit YouTube-Slider und Command-Boxen.
- `src/components/tasks/`: Obsidian Tasks Dashboard mit Filtern und direktem Abhaken.
- `src/components/graph/`: Interaktiver Canvas-Wissensgraph.
- `src/components/settings/`: Backup/Restore, Benutzerverwaltung, System-Diagnose und Docker-Logs.

### B. REST API Endpunkte (Android & Sync)
- `GET /api/vault/notes`: Eigene Notizen des Benutzers.
- `GET /api/vault/shared`: Für den angemeldeten Benutzer freigegebene Notizen (inkl. Absender-Info und Berechtigung `read` / `write`).
- `POST /api/vault/share`: Notiz für einen anderen Benutzer freigeben oder Berechtigung ändern.
- `DELETE /api/vault/share`: Freigabe aufheben.
- `GET /api/vault/notes/:path`: Notizinhalt laden (prüft Besitz oder Lese-/Schreibfreigabe).
- `PUT /api/vault/notes/:path`: Speichern (prüft Besitz oder Schreibfreigabe).
- `DELETE /api/vault/notes/:path`: Notiz entfernen (nur Besitzer).
- `GET /api/tasks`: Aggregierte Aufgaben (eigene + optional freigegebene Notizen).
- `PATCH /api/tasks/toggle`: Gezieltes Umschalten einer Aufgaben-Zeile.
- `GET /api/graph`: Graph-Daten für eigene und freigegebene Notizen.
- `GET /api/vault/backup`: Archiv des Benutzer-Vaults herunterladen.
- `POST /api/vault/restore`: Backup-Archiv wiederherstellen.
- `GET /api/system/health`: Docker-Status, Volume-Mount-Prüfung, Speicherplatz.
- `GET /api/system/logs`: Formatierte Konsolen-Logs des Servers.
- `POST /api/auth/login` & `GET /api/auth/users`: Authentifizierung und Profilauswahl.

### C. Docker Deployment Dateien
- `Dockerfile`: Multi-Stage Build (Node 22 LTS Alpine), baut das Frontend und startet den Express-Server.
- `docker-compose.yml`: Definiert Service, Volume (`./vault_data:/data/vault`), Port-Mapping (`${PORT:-3000}:3000`), Neustart-Policy und Log-Rotation.
- `README.md`: Umfassende Dokumentation für Docker-Compose, Berechtigungen, Reverse-Proxy und Android-Anbindung via Capacitor.

---

## 4. Schrittweise Implementierungsstrategie

1. **Backend & Volume-Storage mit Multi-User Sharing (`server.ts`)**:
   - Robuste Dateisystem-Operationen für `/data/vault`, rekursive Ordner, Markdown-Parsing.
   - Benutzer-Vaults und `shares.json` für In-App-Freigaben mit Lese-/Schreibrechten.
   - Tasks- und Wikilink-Graph-Indexer.
   - Backup-Download und Upload-Endpunkte.
   - Diagnostisches Konsolen-Logging mit Farbkodierung und System-Health-Checks.
2. **Auth & Multi-User Switcher**:
   - Benutzerprofile mit Avataren für schnellen 1-Klick-Login und Login-Formular.
3. **Sidebar mit getrennter Freigabe-Sektion**:
   - Eigene Notizen oben.
   - Separate, einklappbare Sektion *"Für mich freigegeben"*, sauber nach Benutzer/Partner gruppiert, mit Kennzeichnung der Berechtigungen.
4. **Workspace & Snap/Split-Panes**:
   - Multitasking-Layout: Beliebiges Teilen von Panes (Horizontal / Vertikal), Drag-Resizer, Tab-Management.
5. **Markdown-Editor, Toolbar & Preview**:
   - Syntax-Toolbar mit Tooltips für alle Markdown-Befehle.
   - YouTube-Slider (Player vs. Thumbnail vs. Link).
   - Command-Tabellen und gerahmte Snippet-Boxen mit Kopier-Button.
   - A4-Druck-CSS und PDF-Vorbereitung.
6. **In-App Sharing & Quick Share**:
   - Modal zum Teilen innerhalb der App mit Benutzer-Auswahl und Berechtigungs-Toggle.
   - Externes Quick-Share (WhatsApp, Signal, E-Mail, Zwischenablage, `.md`-Download).
7. **Obsidian Tasks Dashboard**:
   - Globales Aggregieren aller Aufgaben, Fälligkeitsfilter (Überfällig, Heute, etc.), Direktes Abhaken.
8. **Interaktive Graph-Ansicht**:
   - Canvas-basierter 2D Force-Graph mit Notizen-Knoten und Wikilink-Kanten.
9. **Vault-Backup & Restore**:
   - Backup-Export/Import in den Einstellungen.
10. **PWA/Android & Docker-Artefakte**:
    - IndexedDB Offline-Cache mit Sync-Queue.
    - `Dockerfile`, `docker-compose.yml` und `README.md`.
