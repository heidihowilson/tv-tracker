# TV Tracker Deployment

## Live URL
https://tv.sethgholson.com

## Credentials
- **Username**: seth
- **Password**: tvtracker2026
- Stored in Coolify env vars

## Infrastructure

### Coolify
- **Instance**: http://100.123.69.76:8000 (arbor on Tailscale)
- **API Token**: 1Password → Wilson vault → "Coolify API Key"
- **Project**: TV Tracker (uuid: ssgg84scswksos8cc0wo84ow)
- **Application**: tv-tracker (uuid: t8gw8skk00cs8cowk8c8ooc8)
- **Server**: kind-koala (Grove @ PVE2)

### GitHub
- **Repo**: https://github.com/heidihowilson/tv-tracker (public)
- **Branch**: main

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
- **Database**: SQLite (file-based)
- **Auth**: Basic auth via Hono middleware

## Volume Mount
- SQLite data stored at `/data/tracker.db` in container
- Uses `custom_docker_run_options: "-v tv-tracker-data:/data"` for persistence

## Environment Variables
| Key | Value | Description |
|-----|-------|-------------|
| DB_PATH | /data/tracker.db | SQLite database path |
| PORT | 8000 | Server port |
| AUTH_USER | seth | Basic auth username |
| AUTH_PASS | tvtracker2026 | Basic auth password |

## Health Check
- Endpoint: `/health` (no auth required)
- Returns: `OK`
- Used by Docker healthcheck

## Troubleshooting

### Check deployment status
```bash
COOLIFY_TOKEN=$(op item get 'Coolify API Key' --vault Wilson --format json --reveal | jq -r '.fields[] | select(.id=="notesPlain") | .value')
curl -s "http://100.123.69.76:8000/api/v1/applications/t8gw8skk00cs8cowk8c8ooc8" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq '.status, .fqdn'
```

### View deployment logs
```bash
# Get latest deployment UUID first
curl -s "http://100.123.69.76:8000/api/v1/applications/t8gw8skk00cs8cowk8c8ooc8/deployments" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq '.[0].deployment_uuid'

# Then get logs
curl -s "http://100.123.69.76:8000/api/v1/deployments/DEPLOY_UUID" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq -r '.logs' | jq -r '.[] | .output'
```

## Migration Notes
- Original JSON files (shows.json, history.json) were migrated to SQLite
- Run `deno task cli` locally for CLI operations
- Web UI at https://tv.sethgholson.com for browser access
