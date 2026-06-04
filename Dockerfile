# syntax=docker/dockerfile:1

# Use Debian-based slim (glibc) so better-sqlite3 uses prebuilt binaries;
# build tools are present as a fallback if it has to compile from source.
# node:24 — remix@3 requires node >=24.3.0 (engines); node:22 only warns but is unsupported.
FROM node:24-slim

WORKDIR /app

# curl for the healthcheck; build deps as a fallback for native modules
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer caching). tsx is used to run TS at runtime,
# so we keep all deps (no --omit=dev).
COPY package.json package-lock.json ./
RUN npm ci

# Application code. tsconfig.json is REQUIRED at runtime: tsx/esbuild reads
# `jsxImportSource: "remix/ui"` from it to compile JSX to the Remix runtime
# (without it, JSX falls back to React.createElement and the views crash).
COPY tsconfig.json ./
COPY *.ts *.tsx ./
COPY app ./app
COPY public ./public
COPY styles ./styles

# Precompile the stylesheet (sethmakes design system + Tailwind utilities) into
# public/static/app.css — and copy its webfonts — so the browser gets a real
# stylesheet before first paint (no in-browser Tailwind compile = no flash).
RUN npm run build:css

# SQLite data directory (mounted as a volume in production)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/tracker.db
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Runs `tsx server.ts` (see package.json scripts)
CMD ["npm", "run", "serve"]
