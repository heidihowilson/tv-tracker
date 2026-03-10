# TV Tracker

SQLite-backed TV show tracking system with TVMaze integration.

## Quick Start

```bash
# Run migration (import existing shows.json/history.json)
deno task migrate

# Start web UI
deno task serve      # http://localhost:8000

# Or use the CLI
deno task cli <command>
```

## CLI Commands

```bash
# Add a show from TVMaze search
deno task cli add "The Pitt"

# Search TVMaze without adding
deno task cli search "breaking bad"

# Mark episode as watched
deno task cli watch "The Pitt" S01E05
deno task cli watch "The Pitt" 1 5

# Mark all episodes through S1E5 as watched
deno task cli watched-through "The Pitt" 1 5

# Change show status
deno task cli status "The Pitt" completed

# View upcoming episodes (next 14 days by default)
deno task cli upcoming
deno task cli upcoming 30

# View unwatched episodes (last 7 days by default)
deno task cli unwatched

# View watching progress
deno task cli progress

# List shows by status
deno task cli list watching
deno task cli list queued

# Refresh episode data from TVMaze
deno task cli refresh "The Pitt"
deno task cli refresh  # refresh all

# Show detailed info
deno task cli info "The Pitt"
```

## Web UI

Start with `deno task serve` (or `deno task dev` for auto-reload).

Features:
- Dashboard with watching progress and unwatched episodes
- Upcoming episodes calendar
- Show browser with filtering
- Mark episodes watched with one click
- Search and add shows from TVMaze

## Database Schema

- `shows` - Core show info (title, TVMaze ID, service, status)
- `seasons` - Season metadata
- `episodes` - Episode details with watch status
- `watch_history` - Log of all watch actions

Data stored in `tracker.db` (SQLite).

## Files

- `db.ts` - Database schema, migrations, query helpers
- `tvmaze.ts` - TVMaze API client
- `tracker.ts` - Main CLI and library functions
- `migrate.ts` - Import existing JSON data
- `server.ts` - Web UI (Hono)

## Environment

- `PORT` - Web server port (default: 8000)
