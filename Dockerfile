FROM denoland/deno:alpine

WORKDIR /app

# Copy source files
COPY *.ts ./
COPY deno.json ./

# Copy seed data files (shows.json, history.json) if available
COPY show[s].json histor[y].json ./

# Copy static assets
COPY static/ ./static/

# Cache dependencies
RUN deno cache server.ts

# Create data directory for SQLite
RUN mkdir -p /data

# Environment
ENV DB_PATH=/data/tracker.db
ENV PORT=8000

EXPOSE 8000

# Install curl for health checks
RUN apk add --no-cache curl

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-ffi", "--unstable-ffi", "server.ts"]
