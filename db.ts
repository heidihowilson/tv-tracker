/**
 * TV Tracker Database Layer
 * SQLite backend for show/episode tracking
 */

import { Database } from "jsr:@db/sqlite@0.12";

const DB_PATH = Deno.env.get("DB_PATH") ?? new URL("./tracker.db", import.meta.url).pathname;

export interface Show {
  id: number;
  title: string;
  tvmaze_id: number | null;
  service: string | null;
  status: "watching" | "completed" | "dropped" | "queued";
  added_at: string;
  notes: string | null;
  image_url: string | null;
}

export interface Season {
  id: number;
  show_id: number;
  season_number: number;
  episode_count: number | null;
  premiered: string | null;
  ended: string | null;
}

export interface Episode {
  id: number;
  season_id: number;
  episode_number: number;
  title: string | null;
  air_date: string | null;
  runtime: number | null;
  watched: boolean;
  watched_at: string | null;
}

export interface WatchHistory {
  id: number;
  episode_id: number | null;
  show_id: number | null;
  watched_at: string;
  action: "watched" | "unwatched" | "completed" | "dropped";
  notes: string | null;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL;");
    _db.exec("PRAGMA foreign_keys = ON;");
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      tvmaze_id INTEGER UNIQUE,
      service TEXT,
      status TEXT NOT NULL DEFAULT 'watching' CHECK(status IN ('watching', 'completed', 'dropped', 'queued')),
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL,
      episode_count INTEGER,
      premiered TEXT,
      ended TEXT,
      UNIQUE(show_id, season_number)
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      episode_number INTEGER NOT NULL,
      title TEXT,
      air_date TEXT,
      runtime INTEGER,
      watched INTEGER NOT NULL DEFAULT 0,
      watched_at TEXT,
      UNIQUE(season_id, episode_number)
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      show_id INTEGER REFERENCES shows(id) ON DELETE SET NULL,
      watched_at TEXT NOT NULL DEFAULT (datetime('now')),
      action TEXT NOT NULL CHECK(action IN ('watched', 'unwatched', 'completed', 'dropped')),
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status);
    CREATE INDEX IF NOT EXISTS idx_shows_tvmaze ON shows(tvmaze_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_air_date ON episodes(air_date);
    CREATE INDEX IF NOT EXISTS idx_episodes_watched ON episodes(watched);
    CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history(watched_at);
  `);
}

// ============ SHOW OPERATIONS ============

export function addShow(
  title: string,
  options: {
    tvmaze_id?: number;
    service?: string;
    status?: Show["status"];
    notes?: string;
    added_at?: string;
    image_url?: string;
  } = {}
): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO shows (title, tvmaze_id, service, status, notes, added_at, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    title,
    options.tvmaze_id ?? null,
    options.service ?? null,
    options.status ?? "watching",
    options.notes ?? null,
    options.added_at ?? new Date().toISOString(),
    options.image_url ?? null
  );
  return db.lastInsertRowId;
}

export function getShow(id: number): Show | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM shows WHERE id = ?").get(id) as Show | undefined;
}

export function getShowByTitle(title: string): Show | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM shows WHERE title = ? COLLATE NOCASE").get(title) as Show | undefined;
}

export function getShowByTvmazeId(tvmazeId: number): Show | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM shows WHERE tvmaze_id = ?").get(tvmazeId) as Show | undefined;
}

export function getShowsByStatus(status: Show["status"]): Show[] {
  const db = getDb();
  return db.prepare("SELECT * FROM shows WHERE status = ? ORDER BY title").all(status) as Show[];
}

export function getAllShows(): Show[] {
  const db = getDb();
  return db.prepare("SELECT * FROM shows ORDER BY status, title").all() as Show[];
}

export function updateShowStatus(id: number, status: Show["status"]): void {
  const db = getDb();
  db.prepare("UPDATE shows SET status = ? WHERE id = ?").run(status, id);
}

const SHOW_COLUMNS = new Set(["title", "tvmaze_id", "service", "status", "added_at", "notes", "image_url"]);

export function updateShow(id: number, updates: Partial<Omit<Show, "id">>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!SHOW_COLUMNS.has(key)) continue; // skip unknown fields
    fields.push(`${key} = ?`);
    values.push(value as string | number | null);
  }

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE shows SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }
}

export function deleteShow(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM shows WHERE id = ?").run(id);
}

// ============ SEASON OPERATIONS ============

export function addSeason(
  showId: number,
  seasonNumber: number,
  options: { episode_count?: number; premiered?: string; ended?: string } = {}
): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO seasons (show_id, season_number, episode_count, premiered, ended)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(show_id, season_number) DO UPDATE SET
      episode_count = COALESCE(excluded.episode_count, episode_count),
      premiered = COALESCE(excluded.premiered, premiered),
      ended = COALESCE(excluded.ended, ended)
  `);
  stmt.run(
    showId,
    seasonNumber,
    options.episode_count ?? null,
    options.premiered ?? null,
    options.ended ?? null
  );
  return db.lastInsertRowId;
}

export function getSeason(showId: number, seasonNumber: number): Season | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM seasons WHERE show_id = ? AND season_number = ?").get(showId, seasonNumber) as
    | Season
    | undefined;
}

export function getSeasons(showId: number): Season[] {
  const db = getDb();
  return db.prepare("SELECT * FROM seasons WHERE show_id = ? ORDER BY season_number").all(showId) as Season[];
}

// ============ EPISODE OPERATIONS ============

export function addEpisode(
  seasonId: number,
  episodeNumber: number,
  options: { title?: string; air_date?: string; runtime?: number } = {}
): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO episodes (season_id, episode_number, title, air_date, runtime)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(season_id, episode_number) DO UPDATE SET
      title = COALESCE(excluded.title, title),
      air_date = COALESCE(excluded.air_date, air_date),
      runtime = COALESCE(excluded.runtime, runtime)
  `);
  stmt.run(seasonId, episodeNumber, options.title ?? null, options.air_date ?? null, options.runtime ?? null);
  return db.lastInsertRowId;
}

export function getEpisode(seasonId: number, episodeNumber: number): Episode | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM episodes WHERE season_id = ? AND episode_number = ?").get(
    seasonId,
    episodeNumber
  ) as Episode | undefined;
}

export function getEpisodes(seasonId: number): Episode[] {
  const db = getDb();
  return db.prepare("SELECT * FROM episodes WHERE season_id = ? ORDER BY episode_number").all(seasonId) as Episode[];
}

export function getEpisodeById(id: number): Episode | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM episodes WHERE id = ?").get(id) as Episode | undefined;
}

export function markEpisodeWatched(episodeId: number, watched: boolean = true): void {
  const db = getDb();
  const watchedAt = watched ? new Date().toISOString() : null;
  db.prepare("UPDATE episodes SET watched = ?, watched_at = ? WHERE id = ?").run(watched ? 1 : 0, watchedAt, episodeId);

  // Log to history
  addWatchHistory({
    episode_id: episodeId,
    action: watched ? "watched" : "unwatched",
  });
}

export function markEpisodeWatchedByNumber(
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean = true
): boolean {
  const season = getSeason(showId, seasonNumber);
  if (!season) return false;

  const episode = getEpisode(season.id, episodeNumber);
  if (!episode) return false;

  markEpisodeWatched(episode.id, watched);
  return true;
}

export function batchMarkWatched(episodeIds: number[], watched: boolean = true): void {
  const db = getDb();
  const watchedAt = watched ? new Date().toISOString() : null;
  const stmt = db.prepare("UPDATE episodes SET watched = ?, watched_at = ? WHERE id = ?");

  db.exec("BEGIN TRANSACTION");
  try {
    for (const id of episodeIds) {
      stmt.run(watched ? 1 : 0, watchedAt, id);
      addWatchHistory({ episode_id: id, action: watched ? "watched" : "unwatched" });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ============ UPCOMING EPISODES ============

export interface UpcomingEpisode {
  show_title: string;
  show_id: number;
  season_number: number;
  episode_number: number;
  episode_title: string | null;
  air_date: string;
  service: string | null;
}

export function getUpcomingEpisodes(daysAhead: number = 14): UpcomingEpisode[] {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  return db
    .prepare(
      `
    SELECT 
      sh.title as show_title,
      sh.id as show_id,
      se.season_number,
      e.episode_number,
      e.title as episode_title,
      e.air_date,
      sh.service
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    JOIN shows sh ON se.show_id = sh.id
    WHERE sh.status IN ('watching', 'queued')
      AND e.air_date >= ? AND e.air_date <= ?
      AND e.watched = 0
    ORDER BY e.air_date, sh.title, se.season_number, e.episode_number
  `
    )
    .all(today, endDate) as UpcomingEpisode[];
}

export function getRecentlyAired(daysBehind: number = 7): UpcomingEpisode[] {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - daysBehind * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  return db
    .prepare(
      `
    SELECT 
      sh.title as show_title,
      sh.id as show_id,
      se.season_number,
      e.episode_number,
      e.title as episode_title,
      e.air_date,
      sh.service
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    JOIN shows sh ON se.show_id = sh.id
    WHERE sh.status IN ('watching', 'queued')
      AND e.air_date >= ? AND e.air_date <= ?
      AND e.watched = 0
    ORDER BY e.air_date DESC, sh.title, se.season_number, e.episode_number
  `
    )
    .all(startDate, today) as UpcomingEpisode[];
}

// ============ WATCH HISTORY ============

export function addWatchHistory(entry: {
  episode_id?: number;
  show_id?: number;
  action: WatchHistory["action"];
  notes?: string;
  watched_at?: string;
}): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO watch_history (episode_id, show_id, watched_at, action, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    entry.episode_id ?? null,
    entry.show_id ?? null,
    entry.watched_at ?? new Date().toISOString(),
    entry.action,
    entry.notes ?? null
  );
  return db.lastInsertRowId;
}

export function getWatchHistory(limit: number = 50): WatchHistory[] {
  const db = getDb();
  return db.prepare("SELECT * FROM watch_history ORDER BY watched_at DESC LIMIT ?").all(limit) as WatchHistory[];
}

// ============ PROGRESS TRACKING ============

export interface ShowProgress {
  show_id: number;
  title: string;
  status: Show["status"];
  service: string | null;
  total_episodes: number;
  watched_episodes: number;
  next_episode: {
    season: number;
    episode: number;
    title: string | null;
    air_date: string | null;
  } | null;
}

export function getShowProgress(showId: number): ShowProgress | null {
  const db = getDb();
  const show = getShow(showId);
  if (!show) return null;

  const stats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN e.watched = 1 THEN 1 ELSE 0 END) as watched
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    WHERE se.show_id = ?
  `
    )
    .get(showId) as { total: number; watched: number };

  const next = db
    .prepare(
      `
    SELECT 
      se.season_number as season,
      e.episode_number as episode,
      e.title,
      e.air_date
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    WHERE se.show_id = ? AND e.watched = 0
    ORDER BY se.season_number, e.episode_number
    LIMIT 1
  `
    )
    .get(showId) as { season: number; episode: number; title: string | null; air_date: string | null } | undefined;

  return {
    show_id: show.id,
    title: show.title,
    status: show.status,
    service: show.service,
    total_episodes: stats.total,
    watched_episodes: stats.watched,
    next_episode: next || null,
  };
}

export function getAllProgress(): ShowProgress[] {
  const db = getDb();
  const shows = db.prepare("SELECT id FROM shows WHERE status = 'watching'").all() as { id: number }[];
  return shows.map((s) => getShowProgress(s.id)!).filter(Boolean);
}

// ============ UTILITY FUNCTIONS ============

export function getShowCount(): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM shows").get() as { count: number };
  return result.count;
}

export function updateShowImage(id: number, imageUrl: string | null): void {
  const db = getDb();
  db.prepare("UPDATE shows SET image_url = ? WHERE id = ?").run(imageUrl, id);
}

export function updateShowTvmazeId(id: number, tvmazeId: number): void {
  const db = getDb();
  db.prepare("UPDATE shows SET tvmaze_id = ? WHERE id = ?").run(tvmazeId, id);
}

// Run migrations for schema updates
function runMigrations(): void {
  const db = getDb();
  
  // Check if image_url column exists, if not add it
  const tableInfo = db.prepare("PRAGMA table_info(shows)").all() as { name: string }[];
  const hasImageUrl = tableInfo.some(col => col.name === "image_url");
  
  if (!hasImageUrl) {
    console.log("Adding image_url column to shows table...");
    db.exec("ALTER TABLE shows ADD COLUMN image_url TEXT");
  }
}

// Initialize on import
initDb();
runMigrations();
