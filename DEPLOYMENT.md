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
- **Build pack**: Dockerfile (docker-compose.yml is in repo for reference but Coolify uses Dockerfile)

### GitHub
- **Repo**: https://github.com/heidihowilson/tv-tracker (public)
- **Branch**: main

## Data Persistence

The SQLite database lives in a Coolify-managed Docker volume:
- **Volume name**: `t8gw8skk00cs8cowk8c8ooc8_tv-tracker-data`
- **Mount point**: `/data/tracker.db` inside the container
- **Host path on grove**: `/var/lib/docker/volumes/t8gw8skk00cs8cowk8c8ooc8_tv-tracker-data/_data/`

> **Note**: `custom_docker_run_options` in Coolify does NOT apply volume mounts
> for this Coolify version. The volume was created by an intermediate docker-compose
> deployment and is now managed by Coolify going forward. Do NOT delete this volume.

### Proxmox Backups
- Grove (VMID 204, PVE2) is backed up nightly to `usb-backup-nfs`
- Backups include the full Docker volume contents
- Recovery: extract VMA → mount ext4 partition → copy from `/var/lib/docker/volumes/`

## Deployment

### Quick Redeploy
```bash
COOLIFY_TOKEN=$(op item get 'Coolify API Key' --vault Wilson --format json --reveal | jq -r '.fields[] | select(.id=="notesPlain") | .value')
curl -s -X GET "http://100.123.69.76:8000/api/v1/deploy?uuid=t8gw8skk00cs8cowk8c8ooc8&force=true" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

### Push and Deploy
```bash
cd /home/wilson/.openclaw/workspace-dev/clawd/tv-tracker
git add -A && git commit -m "your message" && git push
# Then run quick redeploy command above
```

## Stack
- **Runtime**: Deno (alpine image)
- **Framework**: Hono
- **Database**: SQLite at `/data/tracker.db`
- **Auth**: HMAC cookie via `/auth/:token` magic link

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
sudo docker exec <container> deno eval "import {Database} from 'jsr:@db/sqlite@0.12'; const db = new Database('/data/tracker.db'); console.log(db.prepare('SELECT COUNT(*) as c FROM shows').get()); db.close();"
```

### Manual refresh all shows
```bash
# Via API (recommended)
curl "https://tv.sethgholson.com/api/refresh-all" -H "Authorization: Bearer c3cee061-b4d5-4c67-b6c9-1202be3a5fba"

# Or exec inside container
CONTAINER=$(ssh root@192.168.0.94 "ssh grove@192.168.0.8 'sudo docker ps --filter name=t8gw8skk --format \"{{.Names}}\" | head -1'")
ssh root@192.168.0.94 "ssh grove@192.168.0.8 'sudo docker exec $CONTAINER deno run -A tracker.ts refresh 2>&1'"
```
