# OchreNotes 📙 – Selbst-gehosteter Docker Obsidian Markdown & Task Hub

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Docker](https://img.shields.io/badge/Docker-Compatible-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

OchreNotes ist eine Docker-native Knowledgebase- und Aufgaben-Plattform im Look & Feel von Obsidian. Alle Daten werden als transparente `.md`-Dateien in einem gemounteten Docker-Volume gespeichert.

Unterliegt der **GNU Affero General Public License (AGPLv3)**: Frei nutzbar und quelloffen für alle, schützt vor geschlossener kommerzieller Aneignung („Cloud-SaaS-Lock-in“ ohne Code-Rückgabe).

---

## 🚀 Schnellstart mit Docker Compose

### 1. Repository klonen oder Dateien bereitstellen
Stelle sicher, dass `Dockerfile` und `docker-compose.yml` vorhanden sind.

### 2. Container starten
```bash
# Auf beliebigem Port starten (z.B. 3000 oder 8080)
PORT=3000 docker compose up -d
```

Der Server ist nun erreichbar unter: `http://localhost:3000`

### 3. Logs in Echtzeit überwachen
```bash
docker compose logs -f ochrenotes
```
Falls ein Dateisystem-Fehler oder Port-Konflikt vorliegt, zeigt das System die Ursache sofort farbig und formatiert in der Konsole sowie direkt in der Web-UI unter dem Server-Icon an.

---

## 📂 Docker-Volume & Datenspeicherung

Alle Notizen werden als **reine Markdown-Dateien** im gemounteten Verzeichnis `./vault_data` abgelegt:

```
./vault_data/
├── users.json                # Registrierte Benutzerkonten
├── shares.json               # In-App Freigaben mit Berechtigungen
├── michael/                  # Persönlicher Vault von Michael
│   ├── Willkommen.md
│   ├── Projekte/
│   │   ├── Urlaubsplanung-2026.md
│   │   └── Docker-Setup.md
│   └── Journal/
└── sarah/                    # Persönlicher Vault von Sarah
    ├── Willkommen.md
    └── Einkaufsliste.md
```

- Du kannst jederzeit Backups über die Webapp in den **Einstellungen** per 1-Klick als `.json` exportieren oder das Verzeichnis `./vault_data` mit Standard-Tools (`tar`, `rsync`, Restic) sichern.

---

## 👥 Multi-User & In-App Notizfreigabe

- **1-Klick Profil-Schnellauswahl**: Auf dem Anmeldebildschirm kann direkt per Avatar-Klick zwischen Profilen (z. B. Michael, Sarah, Team) gewechselt werden, ohne Passwörter tippen zu müssen.
- **Dezente Seitenleisten-Rubrik**: Notizen, die für einen anderen Benutzer freigegeben werden, landen beim Empfänger in der Rubrik **„👥 Für mich freigegeben"**, sauber nach Absender gruppiert. So bleibt der persönliche Notizenbereich aufgeräumt.
- **Berechtigungen**: Jede Freigabe kann auf *„Nur Lesen"* oder *„Darf Bearbeiten"* eingestellt werden.

---

## 📅 Obsidian Tasks Syntax

Das integrierte Aufgaben-Dashboard erkennt beide gängigen Obsidian-Formate:
- Standard-Format: `- [ ] Aufgabe 📅 2026-10-25 ⏫ #projekt`
- Tag-Format: `- [ ] Aufgabe due:2026-10-25 @due(2026-10-25)`
- Prioritäten: `⏫` (Hoch), `🔼` (Mittel), `🔽` (Niedrig)
- Erledigung: `- [x] Aufgabe ✅ 2026-10-18`

Aufgaben können direkt in der Notiz oder im globalen **Aufgaben-Dashboard** abgehakt werden. Die Änderung wird sofort in die entsprechende Markdown-Datei zurückgeschrieben.

---

## 📺 YouTube Embed mit Slider-Umschalter

Eingebundene YouTube-Links erhalten in der gerenderten Vorschau einen Schieberegler mit drei Modi:
1. **Player**: Direkt abspielbares responsive YouTube-Video
2. **Vorschaukarte**: Thumbnail mit Videotitel und Klick zum Öffnen
3. **Nur Link**: Schlichter Hyperlink im Fließtext

---

## 📱 Vorbereitung für die Android App

Die Backend-Architektur ist für mobile Clients optimiert:
- **Entkoppelte REST-API**:
  - `GET /api/vault/notes`
  - `GET /api/vault/notes/read?path=...`
  - `POST /api/vault/notes`
  - `GET /api/tasks`
  - `PATCH /api/tasks/toggle`
- **Offline-First Sync**: Bei Verbindungsverlust werden Notizänderungen lokal in IndexedDB / LocalStorage gepuffert und bei Wiederverbindung automatisch hochgeladen.
- **Capacitor Integration**: Du kannst das Web-Frontend mit einem Befehl in eine native Android APK kompilieren:
  ```bash
  npm install @capacitor/core @capacitor/cli @capacitor/android
  npx cap init OchreNotes com.ochrenotes.app
  npm run build
  npx cap add android
  npx cap copy
  npx cap open android
  ```

---

## 🖨️ DIN A4 Druck & PDF-Export

Klicke in der oberen Menüleiste auf das Drucker-Symbol (oder drücke `Strg+P`). Die Notiz wird ohne störende Menüs, Schaltflächen oder Seitenleisten perfekt für DIN A4 formatiert, inklusive sauberer Seitenumbrüche und Tabellen-Layout.

---

## 📜 Lizenz & Open-Source-Schutz

Dieses Projekt steht unter der **GNU Affero General Public License v3.0 (AGPLv3)**.
- **Freie Nutzung:** Privat, für Vereine, Familien und Open-Source-Teams vollkommen frei.
- **Copyleft-Schutz:** Niemand darf den Quellcode schließen, als proprietäre Cloud-Software (SaaS) vermarkten oder modifizieren, ohne die Änderungen wieder frei und öffentlich unter derselben AGPLv3-Lizenz bereitzustellen.

### Zu GitHub pushen
```bash
git add .
git commit -m "feat: add AGPLv3 license, Docker UID 2000:100 NAS volume split and mobile gestures"
git push origin main
```
