# Cutover runbook: Coolify/Bun → celld (Durable Objects)

Status: **fleet live, DNS flip pending.** Provisioned 2026-08-21 on celld-1
(CT 113): bucket `tv-tracker`, scoped user/policy `tv-tracker-rw`,
`/etc/celld/tv-tracker.env`, `celld-tv-tracker.service` on port 8088 with the
tincan-style memory drop-in (MemoryHigh=768M/MemoryMax=1G). Version
`4712ee84f2269fdd` deployed via `celld-release`; smoke-tested on the node:
`/` and `/health` 200 through the DO, admin import of a 7-show dump succeeded,
and data survived `systemctl restart` (recovered in 2 s). No bare repo yet —
deploys run `celld-release deploy` directly, like the design/sprites fleets.

Remaining before DNS moves: copy prod `AUTH_TOKEN`/`API_KEY` from the Coolify
env into `/etc/celld/tv-tracker.env` (placeholders live there now), re-import
a fresh dump of the live tracker.db, add the tunnel ingress + proxied CNAME,
then prove the cutover with a stop-test. The Bun/Coolify deployment stays
authoritative until then.

## What runs where

- **Worker entry** (`worker/index.ts`): `/static/*` and `/favicon.ico` from the
  assets binding; everything else to the single `TrackerDO`
  (`idFromName("tracker")`).
- **TrackerDO** (`worker/tracker-do.ts`): the whole app — same remix router,
  controllers, and data layer as the Bun server, with better-sqlite3 swapped
  for DO SQLite at bundle time (`worker/build.mjs`). All tracker state lives in
  the DO's SQLite, which celld persists to the fleet bucket.
- **URL contract**: identical to the Bun server. `html_handling: "none"`; no
  HTML in assets; no trailing-slash aliasing (`/shows/` 404s on both runtimes).

## Secrets

No `vars` in wrangler.jsonc (manifest vars are plaintext in the bucket).
On the node, in `/etc/celld/<fleet>.env` (mode 600):

```
CELLD_VAR_AUTH_TOKEN=...   # magic-link token (same value as the Coolify env)
CELLD_VAR_API_KEY=...      # machine API key (same value as the Coolify env)
CELLD_VAR_ADMIN_TOKEN=...  # NEW: guards POST /admin/import; long random value
```

Keep AUTH_TOKEN/API_KEY identical to production so existing `tv_auth` cookies
(HMAC-derived from AUTH_TOKEN) and API clients keep working across the flip.
Rotation later = edit env + `systemctl restart celld-<fleet>`.

## Build and deploy

```sh
npm ci
npm run build:worker          # assembles dist/: worker.js + wrangler.jsonc + assets/
# on the node (or via the fleet's post-receive hook):
CELLD_FLEET=tv-tracker celld-release deploy dist
```

Health URL for the fleet env: use `/health` — it is served **through the DO**,
so it returns 5xx (not 404) while DO routing is still recovering after a
restart. Expect the usual ~10 s DO-routing outage on every deploy
(single-node fleet; measured behavior).

## Data migration

One-time, after the fleet is up but before DNS moves:

```sh
# on the box that has the live tracker.db (stop writes first, or copy the db):
npm run dump:db -- /path/to/tracker.db > dump.json

curl -sS -X POST "https://<fleet-host>/admin/import" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @dump.json
```

- Refuses (409) if the DO already has shows; `?mode=replace` wipes and
  re-imports — also the correct recovery if an import failed partway.
- Row ids are preserved, so `/show/:id` bookmarks and all FKs survive.
- Verify: `GET /api/upcoming?key=$API_KEY` matches the old server's output;
  spot-check `/shows` and one `/show/:id` in a browser (auth via the magic
  link `/auth/$AUTH_TOKEN`).

## DNS flip

Specific proxied CNAME on the celld tunnel beats the wildcard — same procedure
as the beta/prod/tincan cutovers (self-service via the Cloudflare API token).
Prove it with a stop test, not a status code: `systemctl stop
celld-<fleet>.service` must break the hostname (502); start restores it.

Rollback = revert the DNS record; the Coolify container remains a pure
standby until it is retired.

## Known deltas vs the Bun runtime (accepted for cutover)

- **Refresh-all is best-effort in the DO.** The background loop
  (`app/data/refresh-job.ts`) runs inside the DO without an alarm; if the DO
  is evicted mid-run the run stops (the progress banner will show it stalled;
  re-trigger it). The dashboard poll traffic keeps the DO alive in practice.
  Wiring it to a DO alarm is a follow-up.
- **`db.transaction(...)` blocks are not rollback-atomic** — DO SQLite forbids
  explicit BEGIN/COMMIT, so the shim no-ops them. The affected blocks
  (markEpisodeWatched, batchMarkWatched) do only synchronous writes in a
  single-threaded DO, so no interleaving is possible; only rollback-on-error
  is lost.
- **No compression middleware** (edge handles content-encoding); no request
  logger.
- **Import is not transactional** — a mid-import failure leaves partial rows;
  re-run with `?mode=replace`.

## Before trusting it live (celld-specific, cannot be proven off-node)

- Smoke the deployed fleet: `/health`, `/` (unauthed landing), auth link,
  one watch toggle, `/api/upcoming?key=...`, and an `/admin/import` dry run
  with the wrong token (401 expected). The XOR-fold token compares avoid
  `crypto.subtle.timingSafeEqual` (absent on celld) by construction.
- Confirm `PRAGMA table_info(shows)` works under celld's SQLite (the shim has
  fallbacks, see worker/shims/better-sqlite3.ts).
- Confirm the DO survives restart with state intact (`celld-release deploy`
  twice; data must persist).
