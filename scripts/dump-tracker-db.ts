/**
 * Dumps a tracker.db SQLite file to the JSON format POST /admin/import accepts
 * on the celld runtime (see worker/import.ts).
 *
 * Usage:
 *   npx tsx scripts/dump-tracker-db.ts [path/to/tracker.db] > dump.json
 *
 * Then, against the deployed worker:
 *   curl -sS -X POST "https://<host>/admin/import" \
 *     -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     --data-binary @dump.json
 *
 * (Add ?mode=replace to overwrite a non-empty database — also the right
 * recovery if a previous import failed partway.)
 */
import BetterSqlite3 from "better-sqlite3";

const dbPath = process.argv[2] ?? "tracker.db";
const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });

const all = (table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

const dump = {
  format: "tv-tracker-dump@1",
  exported_at: new Date().toISOString(),
  shows: all("shows"),
  seasons: all("seasons"),
  episodes: all("episodes"),
  watch_history: all("watch_history"),
};

db.close();
process.stdout.write(JSON.stringify(dump, null, 2) + "\n");
