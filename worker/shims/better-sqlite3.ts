/**
 * Bundle-time stand-in for `better-sqlite3`, backed by Durable Object SQLite.
 *
 * This is the move that lets the Worker build reuse app/data/db.ts — DDL,
 * migration, and all ~40 query helpers — completely unchanged: the esbuild
 * plugin (worker/build.mjs) rewrites `import BetterSqlite3 from
 * "better-sqlite3"` to this module, which implements the small synchronous
 * surface db.ts and remix's SqliteDatabaseAdapter actually use
 * (`prepare().all/get/run`, `exec`, `pragma`, `close`) on top of
 * `ctx.storage.sql` (see @remix-run/data-table-sqlite's SqliteDatabase
 * interface — it was designed for exactly this kind of client).
 *
 * TrackerDO stashes its `ctx.storage.sql` on `globalThis.__TV_DO_SQL__` before
 * the app graph is (dynamically) imported, so db.ts's module-scope
 * `new BetterSqlite3(DB_PATH)` binds to the DO's storage. There is exactly one
 * TrackerDO instance (idFromName("tracker")), so a process-wide handle is safe.
 *
 * Deliberate semantic differences, each contained:
 *
 *  - Transactions: the adapter drives transactions with literal
 *    `begin`/`commit`/`rollback`/`savepoint` statements. DO SQLite forbids
 *    explicit transaction control (every statement runs inside the storage
 *    engine's implicit transaction, and a DO request's synchronous writes are
 *    atomic under the output gate). Those statements are recognized and
 *    no-op'd here. Cost: `db.transaction(...)` blocks (markEpisodeWatched,
 *    batchMarkWatched — two synchronous writes each) lose rollback-on-error;
 *    they cannot interleave with other requests because the DO is
 *    single-threaded and the statements never await between writes.
 *
 *  - Pragmas: `journal_mode`/`foreign_keys` are managed by the runtime (DO
 *    SQLite enforces foreign keys, which the ON DELETE CASCADE/SET NULL
 *    schema relies on); pragma() is try-and-swallow.
 *
 *  - run() metadata: DO cursors do not expose changes/lastInsertRowid, so they
 *    are read back with `select changes(), last_insert_rowid()` — correct
 *    because the DO is single-threaded on one connection.
 */

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface PreparedStatement {
  reader: boolean;
  all(...values: unknown[]): unknown[];
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): RunResult;
}

/** Statements the remix sqlite adapter issues for transaction control. */
const TXN_CONTROL = /^\s*(begin|commit|rollback|savepoint\s|release\s)/i;

/** Statements that produce rows. Every query in app/data/db.ts is clear-cut. */
const READS = /^\s*(select|with|values|pragma|explain)\b/i;

function getDoSql(): SqlStorage {
  const sql = (globalThis as { __TV_DO_SQL__?: SqlStorage }).__TV_DO_SQL__;
  if (!sql) {
    throw new Error(
      "better-sqlite3 shim: globalThis.__TV_DO_SQL__ is not set. " +
        "The app graph must only be imported from inside TrackerDO (see worker/tracker-do.ts)."
    );
  }
  return sql;
}

function rows(cursor: SqlStorageCursor): SqlRow[] {
  return [...cursor];
}

export default class DurableObjectSqliteShim {
  /**
   * `path` is accepted for signature compatibility and ignored — storage is
   * the DO's. Deliberately NO handle is captured here: the runtime can
   * re-instantiate the Durable Object inside a still-living isolate (observed
   * under workerd — "Cannot perform I/O on behalf of a different Durable
   * Object"), and this module-scope db instance outlives the DO instance that
   * triggered its evaluation. Every call resolves the CURRENT instance's
   * SqlStorage from the global, which TrackerDO's constructor refreshes.
   */
  constructor(_path?: string) {
    getDoSql(); // fail fast at db.ts's module scope if the init order is wrong
  }

  prepare(text: string): PreparedStatement {
    const reader = READS.test(text);
    const execute = (values: unknown[]): SqlRow[] => {
      if (TXN_CONTROL.test(text)) return []; // see header: implicit DO transactions
      if (/^\s*pragma\s+table_info\s*\(\s*(\w+)\s*\)/i.test(text)) {
        return tableInfo(getDoSql(), text);
      }
      return rows(getDoSql().exec(text, ...values));
    };
    return {
      reader,
      all: (...values: unknown[]) => execute(values),
      get: (...values: unknown[]) => execute(values)[0],
      run: (...values: unknown[]): RunResult => {
        execute(values);
        const meta = rows(getDoSql().exec("select changes() as changes, last_insert_rowid() as id"))[0] as
          | { changes: number; id: number }
          | undefined;
        return { changes: meta?.changes ?? 0, lastInsertRowid: meta?.id ?? 0 };
      },
    };
  }

  /** Multi-statement scripts (the frozen DDL) and the adapter's txn verbs. */
  exec(script: string): void {
    if (TXN_CONTROL.test(script)) return; // see header: implicit DO transactions
    getDoSql().exec(script);
  }

  /** Runtime-managed on DO SQLite; attempt and swallow so db.ts's pragmas are harmless. */
  pragma(directive: string): unknown {
    try {
      return rows(getDoSql().exec(`PRAGMA ${directive}`));
    } catch {
      return [];
    }
  }

  close(): void {
    // DO storage has no user-facing close; lifetime is the object's.
  }
}

/**
 * `PRAGMA table_info(...)` (used by db.ts's image_url migration check). Some
 * embedded-SQLite authorizers reject the pragma statement but allow the
 * equivalent table-valued function; try both. If both are rejected, report the
 * image_url column as present: in the DO world the schema always comes from
 * the frozen DDL (or an import into it), which already includes image_url, so
 * "present" is the truthful answer and keeps the ALTER TABLE from re-running.
 */
function tableInfo(sql: SqlStorage, pragmaText: string): SqlRow[] {
  const table = /table_info\s*\(\s*(\w+)\s*\)/i.exec(pragmaText)![1];
  try {
    return rows(sql.exec(`PRAGMA table_info(${table})`));
  } catch {
    try {
      return rows(sql.exec(`SELECT * FROM pragma_table_info(?)`, table));
    } catch {
      return [{ name: "image_url" } as unknown as SqlRow];
    }
  }
}
