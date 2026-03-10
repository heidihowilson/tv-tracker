FROM denoland/deno:2.0.0

WORKDIR /app

# Copy dependency files first for caching
COPY deno.json deno.lock ./

# Copy source files
COPY *.ts ./

# Cache dependencies
RUN deno cache server.ts

# Create data directory for SQLite
RUN mkdir -p /data

# Environment
ENV DB_PATH=/data/tracker.db
ENV PORT=8000

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/ || exit 1

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "server.ts"]
