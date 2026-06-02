/**
 * Data-table schema — app-facing metadata for the persisted tables.
 *
 * IMPORTANT: `table()`/`column()` definitions do NOT create DDL by themselves.
 * The real CREATE TABLE statements live in db.ts and run at import time so the
 * existing tracker.db keeps working untouched (schema is frozen, no migration).
 * These definitions mirror the live columns for typed CRUD and as documentation.
 *
 * Note: `watched` is stored as INTEGER 0/1 (not boolean) because the live rows
 * and the upcoming/progress WHERE clauses compare against 0/1. Keep it integer.
 */
import { column as c, table } from "remix/data-table";
import type { TableRow } from "remix/data-table";

export const shows = table({
  name: "shows",
  columns: {
    id: c.integer().primaryKey().autoIncrement(),
    title: c.text().notNull(),
    tvmaze_id: c.integer().unique(),
    service: c.text(),
    status: c.enum(["watching", "completed", "dropped", "queued"]).notNull().default("watching"),
    added_at: c.text().notNull(),
    notes: c.text(),
    image_url: c.text(),
  },
});

export const seasons = table({
  name: "seasons",
  columns: {
    id: c.integer().primaryKey().autoIncrement(),
    show_id: c.integer().notNull().references("shows", "id").onDelete("cascade"),
    season_number: c.integer().notNull(),
    episode_count: c.integer(),
    premiered: c.text(),
    ended: c.text(),
  },
});

export const episodes = table({
  name: "episodes",
  columns: {
    id: c.integer().primaryKey().autoIncrement(),
    season_id: c.integer().notNull().references("seasons", "id").onDelete("cascade"),
    episode_number: c.integer().notNull(),
    title: c.text(),
    air_date: c.text(),
    runtime: c.integer(),
    watched: c.integer().notNull().default(0), // stored 0/1, NOT boolean
    watched_at: c.text(),
  },
});

export const watchHistory = table({
  name: "watch_history",
  columns: {
    id: c.integer().primaryKey().autoIncrement(),
    episode_id: c.integer().references("episodes", "id"),
    show_id: c.integer().references("shows", "id"),
    watched_at: c.text().notNull(),
    action: c.enum(["watched", "unwatched", "completed", "dropped"]).notNull(),
    notes: c.text(),
  },
});

export type Show = TableRow<typeof shows>;
export type Season = TableRow<typeof seasons>;
export type Episode = TableRow<typeof episodes>;
export type WatchHistoryRow = TableRow<typeof watchHistory>;
export type ShowStatus = Show["status"];

/** Aggregate read shapes (computed via raw joins in db.ts, not table rows). */
export interface UpcomingEpisode {
  show_title: string;
  show_id: number;
  season_number: number;
  episode_number: number;
  episode_title: string | null;
  air_date: string;
  service: string | null;
  image_url: string | null;
}

export interface ShowProgress {
  show_id: number;
  title: string;
  status: ShowStatus;
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
