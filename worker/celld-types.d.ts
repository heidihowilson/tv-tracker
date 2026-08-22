/**
 * Minimal ambient types for the Cloudflare-Workers/Durable-Object surface the
 * worker actually uses, so the project does not need @cloudflare/workers-types
 * (whose global DOM-overlap would fight the root tsconfig's DOM lib).
 *
 * Only what worker/*.ts touches is declared here. Shapes follow the public
 * Workers runtime API; celld implements the same surface.
 */

/** A single row returned from DO SQLite. */
type SqlRow = Record<string, number | string | ArrayBuffer | null>;

interface SqlStorageCursor extends Iterable<SqlRow> {
  toArray?(): SqlRow[];
}

interface SqlStorage {
  /**
   * Executes SQL. Multiple semicolon-separated statements are allowed only
   * when no bindings are passed.
   */
  exec(query: string, ...bindings: unknown[]): SqlStorageCursor;
  databaseSize?: number;
}

interface DurableObjectStorage {
  sql: SqlStorage;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  waitUntil?(promise: Promise<unknown>): void;
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface AssetsFetcher {
  fetch(request: Request | string | URL): Promise<Response>;
}

/** Bindings + secrets this worker receives (secrets arrive as CELLD_VAR_* env on the node). */
interface TrackerEnv {
  TRACKER: DurableObjectNamespace;
  ASSETS: AssetsFetcher;
  /** Magic-link token; same contract as the Bun server's AUTH_TOKEN env var. */
  AUTH_TOKEN?: string;
  /** Machine API key; same contract as the Bun server's API_KEY env var. */
  API_KEY?: string;
  /** Guards POST /admin/import. Import is disabled entirely when unset. */
  ADMIN_TOKEN?: string;
}
