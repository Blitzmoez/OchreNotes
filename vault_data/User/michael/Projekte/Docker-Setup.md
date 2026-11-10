# Docker Setup & Host Konfiguration 🐳

Dokumentation für den Betrieb auf Heimserver, NAS oder Raspberry Pi.

## Docker Compose Konfiguration

```yaml
services:
  ochrenotes:
    image: ochrenotes:latest
    container_name: ochrenotes_app
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./vault_data:/data/vault
    environment:
      - PORT=3000
      - VAULT_PATH=/data/vault
      - NODE_ENV=production
```

### Wichtige Befehle

- [ ] Volume-Backup Cronjob einrichten 📅 2026-10-24 🔼 #server
- [x] Port 3000 in lokaler Firewall freigeben ✅ 2026-11-10
