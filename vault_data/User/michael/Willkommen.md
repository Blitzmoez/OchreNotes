# Willkommen bei OchreNotes 📙

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

- [ ] Docker-Compose Volume auf dem Server prüfen 📅 2026-11-10 ⏫ #docker #dev
- [ ] Sarah die Notiz für [[Urlaubsplanung-2026]] freigeben 📅 2026-11-10 🔼 #familie
- [ ] Offline-Synchronisation auf dem Tablet testen due:2026-11-10 #mobile
- [x] Obsidian Markdown Syntax Toolbar einbauen ✅ 2026-11-10
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
| `docker compose up -d` | Server im Hintergrund starten | Docker Host |
| `docker compose logs -f` | Echtzeit-Logs des Containers einsehen | Terminal |
| `curl http://localhost:3000/api/system/health` | Healthcheck abfragen | REST API |

```bash
# Docker Container mit individuellem Port und Volume starten
docker run -d -p 8080:3000 -v /opt/notes_vault:/data/vault --name ochrenotes ochrenotes:latest
```

---

## 🔗 Verknüpfungen & Wikilinks

Siehe auch:
- [[Urlaubsplanung-2026]] (Diese Notiz ist mit Sarah geteilt!)
- [[Docker-Setup]]
- Tag-Verweise: #produktivität #obsidian #docker
