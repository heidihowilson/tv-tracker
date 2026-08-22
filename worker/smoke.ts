/**
 * Smoke test for the celld/Workers runtime — runs the REAL bundle
 * (dist/worker.js, so the esbuild redirects, lazy app-graph evaluation, and
 * the node:* shims are all exercised) inside Node, against a fake Durable
 * Object whose SqlStorage is backed by an in-memory better-sqlite3.
 *
 *   npm run test:worker      (builds dist/ first)
 *
 * What this does and does not prove: everything above the runtime — routing,
 * auth, rendering, the DO SQLite adapter path, the admin import — runs the
 * exact code that will run on celld. The V8-isolate specifics of celld itself
 * (module loading, its SQLite authorizer) can only be proven on the real node;
 * see worker/MIGRATION.md.
 */
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";

const root = path.resolve(import.meta.dirname, "..");
const bundlePath = pathToFileURL(path.join(root, "dist", "worker.js")).href;

// ---------------------------------------------------------------------------
// Fake Workers environment
// ---------------------------------------------------------------------------

/** SqlStorage lookalike over better-sqlite3 (the DO-side of the shim's contract). */
function fakeSqlStorage(db: InstanceType<typeof BetterSqlite3>) {
  return {
    exec(query: string, ...bindings: unknown[]) {
      let rows: unknown[] = [];
      try {
        const stmt = db.prepare(query);
        if (stmt.reader) rows = stmt.all(...(bindings as []));
        else stmt.run(...(bindings as []));
      } catch (e) {
        // Multi-statement scripts (the DDL) can't be prepared; exec them whole.
        if (bindings.length === 0 && /more than one statement/i.test(String(e))) db.exec(query);
        else throw e;
      }
      return rows as Iterable<Record<string, unknown>>;
    },
  };
}

const AUTH_TOKEN = "smoke-auth-token";
const API_KEY = "smoke-api-key";
const ADMIN_TOKEN = "smoke-admin-token";
const CSS_TEXT = "/* smoke stylesheet */ body{color:red}";

const sqlite = new BetterSqlite3(":memory:");
const env: Record<string, unknown> = {
  AUTH_TOKEN,
  API_KEY,
  ADMIN_TOKEN,
  ASSETS: {
    fetch: async (input: Request | string) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/static/app.css")) return new Response(CSS_TEXT, { headers: { "Content-Type": "text/css" } });
      return new Response("not found", { status: 404 });
    },
  },
};

const mod = await import(bundlePath);
const doInstance = new mod.TrackerDO({ storage: { sql: fakeSqlStorage(sqlite) } }, env);
env.TRACKER = {
  idFromName: (name: string) => name,
  get: () => ({ fetch: (r: Request) => doInstance.fetch(r) }),
};

const BASE = "https://tv.example.test";
const worker = mod.default as { fetch(r: Request, e: unknown): Promise<Response> };
const request = (p: string, init?: RequestInit) => worker.fetch(new Request(BASE + p, init), env);

let passed = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (!cond) throw new Error(`FAIL ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`);
  passed++;
  console.log("ok  ", label);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

// Health reaches through the DO (this is the fleet's health-check route).
{
  const res = await request("/health");
  ok("GET /health is 200 via the DO", res.status === 200 && (await res.text()) === "OK");
}

// Schema materialized in DO SQLite by the app's frozen DDL.
{
  const tables = sqlite
    .prepare("select name from sqlite_master where type='table' order by name")
    .all()
    .map((r) => (r as { name: string }).name);
  for (const t of ["shows", "seasons", "episodes", "watch_history"]) {
    ok(`DDL created table ${t}`, tables.includes(t));
  }
}

// Unauthed / renders the public landing page (200, no library data).
{
  const res = await request("/");
  const html = await res.text();
  ok("GET / unauthed is 200 HTML", res.status === 200 && html.includes("<!DOCTYPE html>"));
  ok("CSS cache-buster uses the real stylesheet hash", html.includes(`?v=${cssVersion()}`));
}

function cssVersion(): string {
  return createHash("sha256").update(CSS_TEXT).digest("hex").slice(0, 12);
}

// Admin import: auth required, wrong token rejected, dump accepted.
{
  const dump = JSON.parse(
    (await import("node:child_process")).execFileSync(
      "npx",
      ["tsx", path.join(root, "scripts", "dump-tracker-db.ts"), path.join(root, "tracker.db")],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  );
  const post = (body: string, token: string | null, qs = "") =>
    request("/admin/import" + qs, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });

  ok("import without token is 401", (await post("{}", null)).status === 401);
  ok("import with wrong token is 401", (await post("{}", "nope")).status === 401);
  ok("import with bad format is 400", (await post('{"format":"x"}', ADMIN_TOKEN)).status === 400);

  const res = await post(JSON.stringify(dump), ADMIN_TOKEN);
  const body = (await res.json()) as { ok: boolean; imported: Record<string, number> };
  ok("import of the committed tracker.db succeeds", res.status === 200 && body.ok, body);
  ok("imported show count matches the dump", body.imported.shows === dump.shows.length, body.imported);
  ok("re-import without ?mode=replace is 409", (await post(JSON.stringify(dump), ADMIN_TOKEN)).status === 409);
  const replay = await post(JSON.stringify(dump), ADMIN_TOKEN, "?mode=replace");
  ok("re-import with ?mode=replace succeeds", replay.status === 200);
}

// Machine API: key required, then real data from the imported DB.
{
  ok("GET /api/upcoming without key is 401", (await request("/api/upcoming")).status === 401);
  const res = await request("/api/upcoming?days=3650", { headers: { Authorization: `Bearer ${API_KEY}` } });
  const body = (await res.json()) as { episodes: unknown[] };
  ok("GET /api/upcoming with key is 200 JSON", res.status === 200 && Array.isArray(body.episodes));
}

// Magic-link auth: bad token 403; good token interstitial; POST sets cookie via
// a hand-built 303 (celld-safe — no Response.redirect anywhere in the app).
let cookie = "";
{
  ok("GET /auth/<wrong> is 403", (await request("/auth/wrong")).status === 403);
  const page = await request(`/auth/${AUTH_TOKEN}`);
  ok("GET /auth/<token> is 200", page.status === 200);

  const res = await request(`/auth/${AUTH_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE },
    body: "remember=1",
  });
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  ok("POST /auth/<token> is 303 to /", res.status === 303 && res.headers.get("Location") === "/");
  ok("auth sets a 90-day tv_auth cookie", /^tv_auth=[0-9a-f]/.test(setCookie) && setCookie.includes("Max-Age=7776000"));
  cookie = setCookie.split(";")[0];
}

// Authed pages render from the imported data.
{
  const res = await request("/", { headers: { Cookie: cookie } });
  const html = await res.text();
  ok("GET / authed is the dashboard", res.status === 200 && html.includes("/api/refresh-all"));
  const shows = await request("/shows", { headers: { Cookie: cookie } });
  ok("GET /shows authed is 200", shows.status === 200);
  const firstShow = sqlite.prepare("select id from shows order by id limit 1").get() as { id: number };
  const detail = await request(`/show/${firstShow.id}`, { headers: { Cookie: cookie } });
  ok("GET /show/:id authed is 200", detail.status === 200);
  ok("GET /show/999999 is 404", (await request("/show/999999", { headers: { Cookie: cookie } })).status === 404);
}

// Watch toggle (JSON branch) persists through the DO SQLite adapter,
// including the transaction block in markEpisodeWatched.
{
  const target = sqlite
    .prepare(
      `select sh.id as show_id, se.season_number, e.episode_number, e.id as episode_id
       from episodes e join seasons se on e.season_id = se.id join shows sh on se.show_id = sh.id
       where e.watched = 0 limit 1`
    )
    .get() as { show_id: number; season_number: number; episode_number: number; episode_id: number };
  const res = await request("/api/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
    body: JSON.stringify({
      show_id: target.show_id,
      season: target.season_number,
      episode: target.episode_number,
      watched: true,
    }),
  });
  ok("POST /api/watch (JSON) acks", res.status === 200);
  const row = sqlite.prepare("select watched from episodes where id = ?").get(target.episode_id) as {
    watched: number;
  };
  ok("watch toggle persisted in DO SQLite", row.watched === 1);
  const hist = sqlite
    .prepare("select count(*) as n from watch_history where episode_id = ? and action = 'watched'")
    .get(target.episode_id) as { n: number };
  ok("watch history row written (transaction path)", hist.n >= 1);

  // CSRF: same POST without an Origin/Referer must be forbidden.
  const forged = await request("/api/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: "{}",
  });
  ok("POST /api/watch without Origin is 403", forged.status === 403);
}

// Cookie-authed mutation without cookie is rejected.
{
  const res = await request("/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE },
    body: "show_id=1&status=completed",
  });
  ok("POST /api/status without cookie is 401", res.status === 401);
}

// URL shape is explicit: trailing-slash variants 404 (same as the Bun router).
{
  ok("GET /shows/ is 404 (no auto-trailing-slash)", (await request("/shows/", { headers: { Cookie: cookie } })).status === 404);
}

console.log(`\nsmoke: all ${passed} checks passed`);
