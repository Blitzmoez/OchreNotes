---
title: "Docker & NAS Backup Anleitung"
category: "Server & Docker"
tags: ["docker", "nas", "anleitung"]
updatedAt: "2026-11-14T09:44:44.099Z"
---

Diese Wiki-Seite wird nach dem **offenen Markdown-Standard** mit YAML-Frontmatter direkt im Ordner `User/michael/Wiki/` gespeichert.

1. Öffne das Terminal auf deinem NAS oder Docker-Host.
2. Prüfe die Berechtigungen für `UID:GID 2000:100`.
3. Führe das Backup-Kommando aus der Code-Ablage unten per Copy & Paste aus.

## 💻 Code-Ablage

### Docker Compose Volume Prüfung
```yaml
services:
  ochresuite:
    image: ochrenotes:latest
    user: "2000:100"
    volumes:
      - /srv/NASDRIVE/Files/OchreSuite/User:/data/vault/User
      - /srv/NASDRIVE/Files/OchreSuite/config:/data/config
```

### Berechtigungen auf NAS setzen
```bash
chown -R 2000:100 /srv/NASDRIVE/Files/OchreSuite
chmod -R 775 /srv/NASDRIVE/Files/OchreSuite
```
