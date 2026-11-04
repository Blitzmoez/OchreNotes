# ========================================================
# OchreNotes - Multi-Stage Production Dockerfile
# ========================================================

# Stage 1: Build the Vite frontend application
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source files
COPY . .

# Build production assets (Vite outputs to /app/dist)
RUN npm run build

# ========================================================
# Stage 2: Minimal Production Runtime
# ========================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV VAULT_PATH=/data/vault
ENV CONFIG_PATH=/data/config

# Install runtime dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install -g tsx

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server script
COPY server.ts ./
COPY tsconfig.json ./

# Create default directories and give full write access so any UID (e.g. 2000:100) can run
RUN mkdir -p /data/vault /data/config /app && chmod -R 777 /data /app

# Declare persistence volumes
VOLUME ["/data/vault", "/data/config"]

# Expose configurable port (default 3000)
EXPOSE 3000

# Built-in healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/system/health || exit 1

# Start full-stack server
CMD ["tsx", "server.ts"]
