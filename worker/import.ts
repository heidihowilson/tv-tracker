/**
 * One-time data import: loads a JSON dump of the Bun server's tracker.db into
 * the Durable Object's SQLite.
 *
 * Producer: scripts/dump-tracker-db.ts (run it against the live tracker.db,
 * POST the output to /admin/import — see worker/MIGRATION.md).
 *
 * Rows are inserted with their original ids so every foreign key and every
 * /show/:id URL survives the move; SQLite's AUTOINCREMENT sequence follows the
 * max inserted rowid automatically, so post-import inserts don't collide.
 */

const TABLES = [
  { name: "shows", columns: ["id", "title", "tvmaze_id", "service", "status", "added_at", "notes", "image_url"] },
  { name: "seasons", columns: ["id", "show_id", "season_number", "episode_count", "premiered", "ended"] },
  {
    name: "episodes",
    columns: ["id", "season_id", "episode_number", "title", "air_date", "runtime", "watched", "watched_at"],
  },
  { name: "watch_history", columns: ["id", "episode_id", "show_id", "watched_at", "action", "notes"] },
] as const;

export const DUMP_FORMAT = "tv-tracker-dump@1";

export interface TrackerDump {
  format: string;
  exported_at?: string;
  shows: Record<string, unknown>[];
  seasons: Record<string, unknown>[];
  episodes: Record<string, unknown>[];
  watch_history: Record<string, unknown>[];
}

export interface ImportSummary {
  imported: Record<string, number>;
  replaced: boolean;
}

/** Narrow an unknown JSON body to a TrackerDump, or explain why not. */
export function parseDump(body: unknown): { ok: true; dump: TrackerDump } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.format !== DUMP_FORMAT) {
    return { ok: false, error: `expected format "${DUMP_FORMAT}", got ${JSON.stringify(b.format)}` };
  }
  for (const { name } of TABLES) {
    if (!Array.isArray(b[name])) return { ok: false, error: `"${name}" must be an array of row objects` };
  }
  return { ok: true, dump: b as unknown as TrackerDump };
}

function cell(row: Record<string, unknown>, column: string): string | number | null {
  const v = row[column];
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  throw new Error(`unsupported value type for column "${column}": ${typeof v}`);
}

/**
 * Imports the dump. Assumes the schema already exists (TrackerDO initializes
 * the app graph — which runs the frozen DDL — before calling this).
 *
 * When `replace` is set, existing rows are deleted first (children before
 * parents, so foreign keys never dangle mid-import). The DO is single-threaded
 * and this function never awaits, so the wipe+insert is not interleaved with
 * other requests.
 */
export function importDump(sql: SqlStorage, dump: TrackerDump, replace: boolean): ImportSummary {
  if (replace) {
    for (const { name } of [...TABLES].reverse()) {
      sql.exec(`DELETE FROM ${name}`);
    }
  }

  const imported: Record<string, number> = {};
  for (const { name, columns } of TABLES) {
    const rows = (dump as unknown as Record<string, Record<string, unknown>[]>)[name];
    const insert = `INSERT INTO ${name} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    let count = 0;
    for (const row of rows) {
      sql.exec(insert, ...columns.map((c) => cell(row, c)));
      count++;
    }
    imported[name] = count;
  }
  return { imported, replaced: replace };
}

/** True when the shows table already holds data (guards accidental double import). */
export function hasData(sql: SqlStorage): boolean {
  const row = [...sql.exec("SELECT COUNT(*) AS n FROM shows")][0] as { n: number } | undefined;
  return (row?.n ?? 0) > 0;
}
