# TV Tracker

SQLite-backed TV show tracking system with TVMaze integration.

## Quick Start

```bash
# Run migration (import existing shows.json/history.json)
npm run migrate

# Start web UI
npm run serve      # http://localhost:8000

# Or use the CLI
npm run cli -- <command>
```

## CLI Commands

```bash
# Add a show from TVMaze search
npm run cli -- add "The Pitt"

# Search TVMaze without adding
npm run cli -- search "breaking bad"

# Mark episode as watched
npm run cli -- watch "The Pitt" S01E05
npm run cli -- watch "The Pitt" 1 5

# Mark all episodes through S1E5 as watched
npm run cli -- watched-through "The Pitt" 1 5

# Change show status
npm run cli -- status "The Pitt" completed

# View upcoming episodes (next 14 days by default)
npm run cli -- upcoming
npm run cli -- upcoming 30

# View unwatched episodes (last 7 days by default)
npm run cli -- unwatched

# View watching progress
npm run cli -- progress

# List shows by status
npm run cli -- list watching
npm run cli -- list queued

# Refresh episode data from TVMaze
npm run cli -- refresh "The Pitt"
npm run cli -- refresh  # refresh all

# Show detailed info
npm run cli -- info "The Pitt"
```

## Web UI

Start with `npm run serve` (or `npm run dev` for auto-reload).

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
