FROM denoland/deno:alpine

WORKDIR /app

# Copy source files
COPY *.ts ./
COPY deno.json ./

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
  CMD deno eval "fetch('http://localhost:8000/').then(r => r.ok ? Deno.exit(0) : Deno.exit(1)).catch(() => Deno.exit(1))"

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-ffi", "--unstable-ffi", "server.ts"]
