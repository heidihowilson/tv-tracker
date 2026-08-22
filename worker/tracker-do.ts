/**
 * TrackerDO — the single Durable Object that owns all tracker state.
 *
 * worker/index.ts routes every non-asset request to one instance
 * (idFromName("tracker")), so this object is the app: its DO SQLite holds the
 * shows/seasons/episodes/watch_history tables, and it serves every dynamic
 * route by running the same remix router + controllers as the Bun server.
 *
 * Initialization order matters and is the whole trick:
 *
 *   1. On the first request, stash `ctx.storage.sql` and the env secrets on
 *      globalThis (and fetch the compiled CSS text for cache busting).
 *   2. Only then dynamically import worker/router.ts. That import evaluates
 *      the app graph: app/config.ts (redirected to worker/config.ts) captures
 *      the secrets, app/middleware/auth.ts derives COOKIE_VALUE from them,
 *      and app/data/db.ts opens "better-sqlite3" (redirected to the DO SQLite
 *      shim) and runs the frozen DDL against this object's storage.
 *
 * A static import would evaluate all of that at script load, before any env
 * exists — which is why the app graph must never be imported statically from
 * this file or worker/index.ts.
 *
 * celld constraints honored here (measured on the real node, v0.2.1):
 *   - no Response.redirect() (the app's redirects are hand-built Responses)
 *   - no crypto.subtle.timingSafeEqual (admin auth uses a hand-rolled XOR fold)
 *   - no WebSocketRequestResponsePair (no WebSockets in this app)
 */
import { constantTimeEqual } from "./shims/constant-time.ts";
import { parseDump, importDump, hasData, DUMP_FORMAT } from "./import.ts";

type AppRouter = { fetch(request: Request): Promise<Response> };

export class TrackerDO {
  #ctx: DurableObjectState;
  #env: TrackerEnv;
  #router: Promise<AppRouter> | null = null;

  constructor(ctx: DurableObjectState, env: TrackerEnv) {
    this.#ctx = ctx;
    this.#env = env;
    // Refresh the storage handle the better-sqlite3 shim resolves per call.
    // The runtime can re-instantiate this DO inside a still-living isolate
    // whose module-scope app graph (db.ts) survives; a handle captured once
    // at first evaluation would then belong to a dead instance and every
    // query would fail with "Cannot perform I/O on behalf of a different
    // Durable Object" (observed under workerd).
    (globalThis as Record<string, unknown>).__TV_DO_SQL__ = ctx.storage.sql;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Admin surface (celld/DO-only; not part of the app's URL contract).
    if (url.pathname === "/admin/import") {
      return this.#adminImport(request, url);
    }

    try {
      const router = await this.#getRouter();
      return await router.fetch(request);
    } catch (e) {
      console.error("TrackerDO request failed:", e);
      // 5xx (never 404) so celld-release's health probe correctly reports
      // unhealthy while the app is broken (404 counts as healthy there).
      return new Response("Internal error", { status: 500 });
    }
  }

  #getRouter(): Promise<AppRouter> {
    if (!this.#router) {
      this.#router = this.#initialize();
      // If init fails (bad deploy, storage error), allow the next request to retry.
      this.#router.catch(() => {
        this.#router = null;
      });
    }
    return this.#router;
  }

  async #initialize(): Promise<AppRouter> {
    const g = globalThis as Record<string, unknown>;
    g.__TV_DO_SQL__ = this.#ctx.storage.sql;
    g.__TV_ENV__ = { AUTH_TOKEN: this.#env.AUTH_TOKEN, API_KEY: this.#env.API_KEY };

    // Mirror the secrets into the process-env stub (worker/build.mjs's banner)
    // so app/middleware/auth.ts's "no AUTH_TOKEN set" warning — which logs the
    // auth link — stays silent whenever the fleet is actually configured.
    const proc = g.process as { env: Record<string, string | undefined> } | undefined;
    if (proc && this.#env.AUTH_TOKEN) proc.env.AUTH_TOKEN = this.#env.AUTH_TOKEN;

    // Real content hash for the stylesheet's ?v= cache buster: hand the
    // compiled CSS text to the node:fs shim so app/actions/render.tsx can hash
    // it exactly like the Bun path hashes the file. Non-fatal — on failure
    // render.tsx's own try/catch falls back to CSS_VERSION = "0".
    try {
      const res = await this.#env.ASSETS.fetch("https://assets.local/static/app.css");
      if (res.ok) g.__TV_CSS_TEXT__ = await res.text();
    } catch (e) {
      console.warn("CSS version probe failed (cache busting degrades to ?v=0):", e);
    }

    // Evaluates the app graph — config capture, COOKIE_VALUE derivation, DDL.
    const mod = await import("./router.ts");
    return mod.router as unknown as AppRouter;
  }

  /**
   * POST /admin/import — one-time migration of the Bun server's tracker.db.
   *
   * Guarded by env.ADMIN_TOKEN via `Authorization: Bearer <token>`, compared
   * with a hand-rolled constant-time XOR fold (crypto.subtle.timingSafeEqual
   * does not exist on celld). Disabled entirely (503) when ADMIN_TOKEN is
   * unset. Refuses to clobber existing data unless ?mode=replace.
   */
  async #adminImport(request: Request, url: URL): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405, headers: { Allow: "POST" } });
    }

    const adminToken = this.#env.ADMIN_TOKEN;
    if (!adminToken) {
      return Response.json({ error: "import disabled: ADMIN_TOKEN is not configured" }, { status: 503 });
    }
    const header = request.headers.get("Authorization") ?? "";
    const presented = header.replace(/^Bearer\s+/i, "");
    if (!constantTimeEqual(presented, adminToken)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "body must be JSON (see scripts/dump-tracker-db.ts)" }, { status: 400 });
    }
    const parsed = parseDump(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error, expected_format: DUMP_FORMAT }, { status: 400 });
    }

    // Ensure the schema exists (the app graph's DDL runs on first import).
    await this.#getRouter();

    const sql = this.#ctx.storage.sql;
    const replace = url.searchParams.get("mode") === "replace";
    if (!replace && hasData(sql)) {
      return Response.json(
        { error: "database already has shows; re-run with ?mode=replace to overwrite" },
        { status: 409 }
      );
    }

    try {
      const summary = importDump(sql, parsed.dump, replace);
      return Response.json({ ok: true, ...summary });
    } catch (e) {
      return Response.json({ error: `import failed: ${String(e)}` }, { status: 400 });
    }
  }
}
