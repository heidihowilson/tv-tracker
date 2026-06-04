# TV Tracker Deployment

## Live URL
https://tv.sethgholson.com

## Auth
- Token-based auth via magic link: `/auth/<AUTH_TOKEN>`
- HMAC cookie, 90-day rolling session
- `AUTH_TOKEN` is stored in Coolify env vars (not basic auth)

## Infrastructure

### Coolify
- **Instance**: http://100.123.69.76:8000 (arbor on Tailscale)
- **API Token**: 1Password → Wilson vault → "Coolify API Key"
- **Project**: TV Tracker (uuid: ssgg84scswksos8cc0wo84ow)
- **Application**: tv-tracker (uuid: t8gw8skk00cs8cowk8c8ooc8)
- **Server**: kind-koala (Grove @ PVE2)
- **Build pack**: **docker-compose** (`/docker-compose.yml`) — migrated from Dockerfile 2026-06-04 (#29) so the data volume is declared in-repo and honored by Coolify. The domain is set via `docker_compose_domains` (compose-pack apps ignore the `fqdn`/`domains` fields).

### GitHub
- **Repo**: https://github.com/heidihowilson/tv-tracker (public)
- **Branch**: main

## Data Persistence

The SQLite database lives in a Coolify-managed Docker volume:
- **Volume name**: `t8gw8skk00cs8cowk8c8ooc8_tv-tracker-data`
- **Mount point**: `/data/tracker.db` inside the container
- **Host path on grove**: `/var/lib/docker/volumes/t8gw8skk00cs8cowk8c8ooc8_tv-tracker-data/_data/`

> **Note (#29, resolved 2026-06-04)**: the volume is declared in `docker-compose.yml`
> (plain named volume `tv-tracker-data`, NOT `external: true`) and Coolify's compose
> build pack mounts it. The compose project name is the app uuid, so it resolves to
> the pre-existing `t8gw8skk00cs8cowk8c8ooc8_tv-tracker-data` volume — same data,
> no migration was needed. Do NOT delete this volume.
> `custom_docker_run_options` does NOT apply volume mounts on this Coolify version
> (4.0.0-beta.463) — never rely on it; the dead option was removed from the config.

### Proxmox Backups
- Grove (VMID 204, PVE2) is backed up nightly to `usb-backup-nfs`
- Backups include the full Docker volume contents
- Recovery: extract VMA → mount ext4 partition → copy from `/var/lib/docker/volumes/`

## Deployment

Coolify deploys the **configured branch** (should be `main`) using the **docker-compose**
build pack (`/docker-compose.yml`, which builds the local Dockerfile). The Dockerfile
runs `npm ci` + `npm run build:css` and starts `npm run serve`.

### Normal deploy (push to main, then redeploy)
```bash
cd /home/wilson/dev/tv-tracker
git checkout main && git pull
# ... merge your PR into main ...
# Then trigger a deploy in the Coolify UI (Application → Deploy / force rebuild).
```

> ℹ️ **API-token deploys work** (verified 2026-06-02). One-shot force deploy:
> ```bash
> COOLIFY_TOKEN=$(op item get 'Coolify API Key' --vault Wilson --format json --reveal | jq -r '.fields[] | select(.id=="notesPlain") | .value')
> curl -s -X GET "http://100.123.69.76:8000/api/v1/deploy?uuid=t8gw8skk00cs8cowk8c8ooc8&force=true" \
>   -H "Authorization: Bearer $COOLIFY_TOKEN"
> ```
>
> **About the "Allowed IPs for API Access" setting (Settings → Advanced):** leave it
> `0.0.0.0` (allow-all). It is *non-functional* on this install and must not be relied on
> as a security control. The Coolify app is published as `arbor:8000 -> container:8080`, a
> direct Docker port map (Traefik only fronts 80/443). Docker's userland-proxy masquerades
> every inbound `:8000` connection to the bridge gateway `10.0.1.1` *before* the app sees
> it, so `ApiAllowed.php`'s `$request->ip()` always returns `10.0.1.1` regardless of the
> real caller. A real-IP allowlist matches nothing; allowing `10.0.1.1` would allow
> everyone. The actual gate is the **root bearer token** plus network isolation (arbor:8000
> is LAN/tailnet-only, not public). A non-`0.0.0.0` value here returns
> `{"success":true,"message":"You are not allowed to access the API."}` on *every* endpoint
> — which previously looked like the token being disabled, but never was.

### Force a clean rebuild
A plain "Redeploy" can reuse cached image layers. After a Dockerfile change (e.g. a new
`COPY` or build step), use **Deploy with force rebuild** in the UI so the new layers run —
otherwise the change silently won't take effect.

### Rollback (no data loss)
The SQLite DB lives in the Docker volume, independent of the image, and the schema is
stable across the Deno↔Node versions — so rollback never loses data.
- **Fastest:** Coolify keeps recent per-commit images on the host
  (`sudo docker images t8gw8skk00cs8cowk8c8ooc8`). Use the **Rollback** button in the UI
  to swap straight to a prior image — near-instant, no rebuild.
- Or point the configured branch at a known-good commit and force-rebuild.

### Back up the DB before any deploy
The live `tracker.db` runs in WAL mode — most recent writes sit in `tracker.db-wal`, NOT
the main file, so a plain `cp tracker.db` can silently capture a stale snapshot. Back up
with all three files together, or fold the WAL in with a real SQLite backup:
```bash
# from a machine that can reach grove (jump via PVE1):
ssh root@192.168.0.94 "ssh grove@192.168.0.8 'sudo python3 - <<PY
import sqlite3
s=sqlite3.connect(\"/var/lib/docker/volumes/t8gw8skk00cs8cowk8c8ooc8_tv-tracker-data/_data/tracker.db\")
d=sqlite3.connect(\"/home/grove/tv-tracker-backups/tracker-merged.db\")
with d: s.backup(d)
print(\"shows\", s.execute(\"select count(*) from shows\").fetchone()[0])
PY'"
```
A verified backup from 2026-06-01 (16 shows / 148 episodes) is at
`/home/grove/tv-tracker-backups/` on grove and `/home/wilson/tv-tracker-backups/` locally.

## Stack
- **Runtime**: Node.js 22 (Debian slim image), TypeScript run via `tsx`
- **Framework**: Remix 3 (`@remix-run/fetch-router` + `node-fetch-server`); views in `@remix-run/ui` (JSX SSR)
- **Database**: SQLite (`better-sqlite3`) at `/data/tracker.db`
- **Auth**: HMAC cookie via `/auth/:token` magic link

> **Migrated Deno+Hono → Node+Remix 3 (May 2026).** The SQLite file carries over unchanged.
> Client interactivity moved from an inline `<script>` to `static/app.js` (the `@remix-run/ui`
> renderer escapes inline script bodies). Local dev: `npm install`, then `npm run dev`.

## Environment Variables
| Key | Description |
|-----|-------------|
| DB_PATH | /data/tracker.db (set in Dockerfile ENV) |
| PORT | 8000 (set in Dockerfile ENV) |
| AUTH_TOKEN | Magic link token for device auth |
| API_KEY | API key for programmatic access |
| SESSION_SECRET | HMAC secret for cookie signing |

## API Endpoints (API key required)
```bash
# Bearer token auth
curl "https://tv.sethgholson.com/api/today" -H "Authorization: Bearer $API_KEY"
curl "https://tv.sethgholson.com/api/upcoming?days=7" -H "Authorization: Bearer $API_KEY"
curl "https://tv.sethgholson.com/api/refresh-all" -H "Authorization: Bearer $API_KEY"
```

API_KEY: `c3cee061-b4d5-4c67-b6c9-1202be3a5fba` (also in Coolify env vars)

## Health Check
- Endpoint: `/health` (no auth required)
- Returns: `OK`

## Troubleshooting

### Check deployment status
```bash
COOLIFY_TOKEN=$(op item get 'Coolify API Key' --vault Wilson --format json --reveal | jq -r '.fields[] | select(.id=="notesPlain") | .value')
curl -s "http://100.123.69.76:8000/api/v1/applications/t8gw8skk00cs8cowk8c8ooc8" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq '{status, fqdn}'
```

### Access database on grove (from PVE1 as jump host)
```bash
ssh root@192.168.0.94
ssh grove@192.168.0.8
sudo docker ps --filter name=tv-tracker
sudo docker exec <container> node -e "const D=require('better-sqlite3');const db=new D('/data/tracker.db');console.log(db.prepare('SELECT COUNT(*) as c FROM shows').get());db.close();"
```

### Manual refresh all shows
```bash
# Via API (recommended)
curl "https://tv.sethgholson.com/api/refresh-all" -H "Authorization: Bearer c3cee061-b4d5-4c67-b6c9-1202be3a5fba"

# Or exec inside container
CONTAINER=$(ssh root@192.168.0.94 "ssh grove@192.168.0.8 'sudo docker ps --filter name=t8gw8skk --format \"{{.Names}}\" | head -1'")
ssh root@192.168.0.94 "ssh grove@192.168.0.8 'sudo docker exec $CONTAINER npm run cli -- refresh 2>&1'"
```
