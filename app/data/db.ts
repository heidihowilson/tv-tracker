/**
 * Data access layer.
 *
 * Sets up the better-sqlite3 connection, runs the frozen DDL at import time,
 * exposes the data-table `Database` instance, and ports every query helper from
 * the original db.ts. Single-table CRUD goes through the data-table query API;
 * UPSERTs, case-insensitive lookups, and multi-table joins use the raw `sql`
 * escape hatch (`db.exec(sql\`...\`)` returns `{ rows }`).
 *
 * The schema is intentionally unchanged — `initDb()` is the source of truth for
 * the real DDL (the table() defs in schema.ts are app-facing metadata only).
 */
import BetterSqlite3 from "better-sqlite3";
import { createDatabase, sql } from "remix/data-table";
import { createSqliteDatabaseAdapter } from "remix/data-table/sqlite";

import { DB_PATH } from "../config.ts";
import { shows, seasons, episodes, watchHistory } from "./schema.ts";
import type {
  Show,
  Season,
  Episode,
  WatchHistoryRow,
  UpcomingEpisode,
  ShowProgress,
  ShowListItem,
  WatchHistoryEntry,
} from "./schema.ts";

export { shows, seasons, episodes, watchHistory };
export type { Show, Season, Episode, WatchHistoryRow, UpcomingEpisode, ShowProgress };

// ============ CONNECTION ============

export const sqlite = new BetterSqlite3(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const adapter = createSqliteDatabaseAdapter(sqlite);
export const db = createDatabase(adapter);

export function closeDb(): void {
  sqlite.close();
}

// ============ DDL (frozen — raw SQL, runs at import) ============

export function initDb(): void {
  sqlite.exec(`
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

/** image_url migration preserved verbatim from the original. */
function runMigrations(): void {
  const cols = sqlite.prepare("PRAGMA table_info(shows)").all() as { name: string }[];
  if (!cols.some((col) => col.name === "image_url")) {
    console.log("Adding image_url column to shows table...");
    sqlite.exec("ALTER TABLE shows ADD COLUMN image_url TEXT");
  }
}

initDb();
runMigrations();

// ============ SHOW OPERATIONS ============

export interface AddShowOptions {
  tvmaze_id?: number;
  service?: string;
  status?: Show["status"];
  notes?: string;
  added_at?: string;
  image_url?: string;
}

export async function addShow(title: string, options: AddShowOptions = {}): Promise<number> {
  const row = await db.create(
    shows,
    {
      title,
      tvmaze_id: options.tvmaze_id,
      service: options.service,
      status: options.status ?? "watching",
      notes: options.notes,
      added_at: options.added_at ?? new Date().toISOString(),
      image_url: options.image_url,
    },
    { returnRow: true }
  );
  return row.id;
}

export function getShow(id: number): Promise<Show | undefined> {
  return db.find(shows, id) as Promise<Show | undefined>;
}

/** Case-insensitive lookup — the predicate builder can't express COLLATE NOCASE. */
export async function getShowByTitle(title: string): Promise<Show | undefined> {
  const result = await db.exec(sql`SELECT * FROM shows WHERE title = ${title} COLLATE NOCASE LIMIT 1`);
  return (result.rows ?? [])[0] as Show | undefined;
}

export function getShowByTvmazeId(tvmazeId: number): Promise<Show | undefined> {
  return db.findOne(shows, { where: { tvmaze_id: tvmazeId } }) as Promise<Show | undefined>;
}

export function getShowsByStatus(status: Show["status"]): Promise<Show[]> {
  return db.findMany(shows, { where: { status }, orderBy: ["title", "asc"] }) as Promise<Show[]>;
}

export function getAllShows(): Promise<Show[]> {
  return db.findMany(shows, {
    orderBy: [
      ["status", "asc"],
      ["title", "asc"],
    ],
  }) as Promise<Show[]>;
}

/**
 * Every show with its watched/total episode counts in one query (#3, /shows page).
 * A single grouped LEFT JOIN beats calling getShowProgress() per row. Optionally
 * narrowed to one status.
 */
export async function getShowsWithProgress(status?: Show["status"]): Promise<ShowListItem[]> {
  // Null-guard param so one query serves both "all" and a single-status filter
  // (avoids embedding a conditional sql fragment).
  const st = status ?? null;
  const result = await db.exec(sql`
    SELECT
      sh.*,
      COUNT(e.id) AS total_episodes,
      COALESCE(SUM(e.watched), 0) AS watched_episodes
    FROM shows sh
    LEFT JOIN seasons se ON se.show_id = sh.id
    LEFT JOIN episodes e ON e.season_id = se.id
    WHERE (${st} IS NULL OR sh.status = ${st})
    GROUP BY sh.id
    ORDER BY sh.status ASC, sh.title ASC
  `);
  return (result.rows ?? []).map((r) => {
    const { total_episodes, watched_episodes, ...show } = r as Record<string, unknown>;
    return {
      show: show as unknown as Show,
      total: Number(total_episodes) || 0,
      watched: Number(watched_episodes) || 0,
    };
  });
}

export async function updateShowStatus(id: number, status: Show["status"]): Promise<void> {
  await db.update(shows, id, { status });
}

export async function deleteShow(id: number): Promise<void> {
  await db.delete(shows, id);
}

export async function updateShowImage(id: number, imageUrl: string | null): Promise<void> {
  // Raw SQL so a null image_url is written faithfully (TableRow types omit null).
  await db.exec(sql`UPDATE shows SET image_url = ${imageUrl} WHERE id = ${id}`);
}

export async function updateShowTvmazeId(id: number, tvmazeId: number): Promise<void> {
  await db.update(shows, id, { tvmaze_id: tvmazeId });
}

export async function updateShowDetails(id: number, notes: string | null, service: string | null): Promise<void> {
  // One UPDATE so a notes+service edit is atomic (both columns persist or neither).
  // Raw SQL so empty fields clear the columns to NULL faithfully (TableRow omits null).
  await db.exec(sql`UPDATE shows SET notes = ${notes}, service = ${service} WHERE id = ${id}`);
}

export async function getShowCount(): Promise<number> {
  return db.count(shows);
}

// ============ SEASON OPERATIONS ============

/** UPSERT with COALESCE — raw SQL, kept verbatim. */
export async function addSeason(
  showId: number,
  seasonNumber: number,
  options: { episode_count?: number; premiered?: string; ended?: string } = {}
): Promise<number> {
  await db.exec(sql`
    INSERT INTO seasons (show_id, season_number, episode_count, premiered, ended)
    VALUES (${showId}, ${seasonNumber}, ${options.episode_count ?? null}, ${options.premiered ?? null}, ${options.ended ?? null})
    ON CONFLICT(show_id, season_number) DO UPDATE SET
      episode_count = COALESCE(excluded.episode_count, episode_count),
      premiered = COALESCE(excluded.premiered, premiered),
      ended = COALESCE(excluded.ended, ended)
  `);
  const season = await getSeason(showId, seasonNumber);
  return season!.id;
}

export function getSeason(showId: number, seasonNumber: number): Promise<Season | undefined> {
  return db.findOne(seasons, { where: { show_id: showId, season_number: seasonNumber } }) as Promise<Season | undefined>;
}

export function getSeasons(showId: number): Promise<Season[]> {
  return db.findMany(seasons, { where: { show_id: showId }, orderBy: ["season_number", "asc"] }) as Promise<Season[]>;
}

// ============ EPISODE OPERATIONS ============

/** UPSERT with COALESCE — raw SQL, kept verbatim. */
export async function addEpisode(
  seasonId: number,
  episodeNumber: number,
  options: { title?: string; air_date?: string; runtime?: number } = {}
): Promise<number> {
  await db.exec(sql`
    INSERT INTO episodes (season_id, episode_number, title, air_date, runtime)
    VALUES (${seasonId}, ${episodeNumber}, ${options.title ?? null}, ${options.air_date ?? null}, ${options.runtime ?? null})
    ON CONFLICT(season_id, episode_number) DO UPDATE SET
      title = COALESCE(excluded.title, title),
      air_date = COALESCE(excluded.air_date, air_date),
      runtime = COALESCE(excluded.runtime, runtime)
  `);
  const episode = await getEpisode(seasonId, episodeNumber);
  return episode!.id;
}

export function getEpisode(seasonId: number, episodeNumber: number): Promise<Episode | undefined> {
  return db.findOne(episodes, { where: { season_id: seasonId, episode_number: episodeNumber } }) as Promise<
    Episode | undefined
  >;
}

export function getEpisodes(seasonId: number): Promise<Episode[]> {
  return db.findMany(episodes, { where: { season_id: seasonId }, orderBy: ["episode_number", "asc"] }) as Promise<
    Episode[]
  >;
}

export function getEpisodeById(id: number): Promise<Episode | undefined> {
  return db.find(episodes, id) as Promise<Episode | undefined>;
}

export async function markEpisodeWatched(episodeId: number, watched: boolean = true): Promise<void> {
  const watchedAt = watched ? new Date().toISOString() : null;
  await db.transaction(async (tx) => {
    // Raw SQL so watched_at is explicitly set to NULL when unwatching.
    await tx.exec(
      sql`UPDATE episodes SET watched = ${watched ? 1 : 0}, watched_at = ${watchedAt} WHERE id = ${episodeId}`
    );
    await tx.create(watchHistory, {
      episode_id: episodeId,
      watched_at: watchedAt ?? new Date().toISOString(),
      action: watched ? "watched" : "unwatched",
    });
  });
}

export async function markEpisodeWatchedByNumber(
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean = true
): Promise<boolean> {
  const season = await getSeason(showId, seasonNumber);
  if (!season) return false;
  const episode = await getEpisode(season.id, episodeNumber);
  if (!episode) return false;
  await markEpisodeWatched(episode.id, watched);
  return true;
}

export async function batchMarkWatched(episodeIds: number[], watched: boolean = true): Promise<void> {
  const watchedAt = watched ? new Date().toISOString() : null;
  await db.transaction(async (tx) => {
    for (const id of episodeIds) {
      await tx.exec(sql`UPDATE episodes SET watched = ${watched ? 1 : 0}, watched_at = ${watchedAt} WHERE id = ${id}`);
      await tx.create(watchHistory, {
        episode_id: id,
        watched_at: watchedAt ?? new Date().toISOString(),
        action: watched ? "watched" : "unwatched",
      });
    }
  });
}

// ============ WATCH HISTORY ============

export async function addWatchHistory(entry: {
  episode_id?: number;
  show_id?: number;
  action: WatchHistoryRow["action"];
  notes?: string;
  watched_at?: string;
}): Promise<number> {
  const row = await db.create(
    watchHistory,
    {
      episode_id: entry.episode_id,
      show_id: entry.show_id,
      watched_at: entry.watched_at ?? new Date().toISOString(),
      action: entry.action,
      notes: entry.notes,
    },
    { returnRow: true }
  );
  return row.id;
}

export async function getWatchHistory(limit: number = 50): Promise<WatchHistoryRow[]> {
  const result = await db.exec(sql`SELECT * FROM watch_history ORDER BY watched_at DESC LIMIT ${limit}`);
  return (result.rows ?? []) as unknown as WatchHistoryRow[];
}

/** Watch history joined to show/episode details for the /history page (#4). */
export async function getWatchHistoryDetailed(limit: number = 50): Promise<WatchHistoryEntry[]> {
  const result = await db.exec(sql`
    SELECT
      wh.id,
      wh.action,
      wh.watched_at,
      sh.id AS show_id,
      sh.title AS show_title,
      se.season_number,
      e.episode_number,
      e.title AS episode_title
    FROM watch_history wh
    LEFT JOIN shows sh ON wh.show_id = sh.id
    LEFT JOIN episodes e ON wh.episode_id = e.id
    LEFT JOIN seasons se ON e.season_id = se.id
    ORDER BY wh.watched_at DESC
    LIMIT ${limit}
  `);
  return (result.rows ?? []) as unknown as WatchHistoryEntry[];
}

// ============ UPCOMING / RECENTLY AIRED (raw joins) ============

export async function getUpcomingEpisodes(daysAhead: number = 14): Promise<UpcomingEpisode[]> {
  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const result = await db.exec(sql`
    SELECT
      sh.title AS show_title,
      sh.id AS show_id,
      se.season_number,
      e.episode_number,
      e.title AS episode_title,
      e.air_date,
      sh.service,
      sh.image_url
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    JOIN shows sh ON se.show_id = sh.id
    WHERE sh.status IN ('watching', 'queued')
      AND e.air_date >= ${today} AND e.air_date <= ${endDate}
      AND e.watched = 0
    ORDER BY e.air_date, sh.title, se.season_number, e.episode_number
  `);
  return (result.rows ?? []) as unknown as UpcomingEpisode[];
}

export async function getRecentlyAired(daysBehind: number = 7): Promise<UpcomingEpisode[]> {
  const today = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - daysBehind * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const result = await db.exec(sql`
    SELECT
      sh.title AS show_title,
      sh.id AS show_id,
      se.season_number,
      e.episode_number,
      e.title AS episode_title,
      e.air_date,
      sh.service,
      sh.image_url
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    JOIN shows sh ON se.show_id = sh.id
    WHERE sh.status IN ('watching', 'queued')
      AND e.air_date >= ${startDate} AND e.air_date <= ${today}
      AND e.watched = 0
    ORDER BY e.air_date DESC, sh.title, se.season_number, e.episode_number
  `);
  return (result.rows ?? []) as unknown as UpcomingEpisode[];
}

// ============ PROGRESS (raw aggregates) ============

export async function getShowProgress(showId: number): Promise<ShowProgress | null> {
  const show = await getShow(showId);
  if (!show) return null;

  const statsResult = await db.exec(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN e.watched = 1 THEN 1 ELSE 0 END) AS watched
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    WHERE se.show_id = ${showId}
  `);
  const stats = (statsResult.rows ?? [])[0] as { total: number; watched: number };

  const nextResult = await db.exec(sql`
    SELECT
      se.season_number AS season,
      e.episode_number AS episode,
      e.title,
      e.air_date
    FROM episodes e
    JOIN seasons se ON e.season_id = se.id
    WHERE se.show_id = ${showId} AND e.watched = 0
    ORDER BY se.season_number, e.episode_number
    LIMIT 1
  `);
  const next = (nextResult.rows ?? [])[0] as
    | { season: number; episode: number; title: string | null; air_date: string | null }
    | undefined;

  return {
    show_id: show.id,
    title: show.title,
    status: show.status,
    service: show.service,
    total_episodes: stats.total,
    watched_episodes: stats.watched ?? 0,
    next_episode: next ?? null,
  };
}

export async function getAllProgress(): Promise<ShowProgress[]> {
  const result = await db.exec(sql`SELECT id FROM shows WHERE status = 'watching'`);
  const ids = ((result.rows ?? []) as { id: number }[]).map((r) => r.id);
  const progress = await Promise.all(ids.map((id) => getShowProgress(id)));
  return progress.filter((p): p is ShowProgress => p !== null);
}

/**
 * Dashboard read model: each currently-watching show's progress paired with its
 * full row, assembled here in the data layer (no N+1 getShow loop in the
 * controller). One query for the watching rows, then progress per row.
 */
export async function getDashboard(): Promise<Array<{ progress: ShowProgress; show: Show }>> {
  const rows = (await db.findMany(shows, {
    where: { status: "watching" },
    orderBy: ["title", "asc"],
  })) as Show[];
  const items = await Promise.all(
    rows.map(async (show) => {
      const progress = await getShowProgress(show.id);
      return progress ? { progress, show } : null;
    })
  );
  return items.filter((i): i is { progress: ShowProgress; show: Show } => i !== null);
}
