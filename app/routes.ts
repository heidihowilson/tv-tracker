/**
 * Route contract — the single source of truth for every URL in the app.
 *
 * `href()` generation, controller wiring, and tests all derive from this map.
 * Every URL here is preserved exactly from the original Hono/Remix port so the
 * deployed client and existing bookmarks keep working.
 */
import { get, post, route, form } from "remix/routes";

export const routes = route({
  // Top-level page leaves + health. These are the root controller's actions.
  home: get("/"), // GET /
  upcoming: get("/upcoming"), // GET /upcoming
  shows: get("/shows"), // GET /shows
  showDetail: get("/show/:id"), // GET /show/:id
  search: get("/search"), // GET /search
  history: get("/history"), // GET /history
  health: get("/health"), // GET /health

  // Magic-link auth: form() expands to index (GET /auth/:token) + action (POST /auth/:token).
  auth: route("auth", {
    token: form(":token"),
  }),

  // Machine + UI API surface. Each leaf is its own key.
  // GET and POST /api/refresh-all share a URL but differ in auth, so they are
  // two separate leaf routes (refreshAllGet uses an API key, refreshAllPost the cookie).
  api: route("api", {
    today: get("today"), // GET  /api/today        (API key)
    upcoming: get("upcoming"), // GET  /api/upcoming     (API key)
    watch: post("watch"), // POST /api/watch        (JSON or form)
    status: post("status"), // POST /api/status       (form)
    refresh: post("refresh"), // POST /api/refresh      (form)
    add: post("add"), // POST /api/add          (form)
    update: post("update"), // POST /api/update       (form) — edit notes/service
    delete: post("delete"), // POST /api/delete       (form) — remove a show
    refreshAllGet: get("refresh-all"), // GET  /api/refresh-all  (API key)
    refreshAllPost: post("refresh-all"), // POST /api/refresh-all  (cookie)
    refreshStatus: get("refresh-status"), // GET  /api/refresh-status (cookie) — poll progress
  }),
});

/**
 * Static asset namespace (GET /static/*path).
 *
 * Served entirely by the staticFiles() middleware — it never reaches a
 * controller action, so it lives outside the root `routes` map (which would
 * otherwise demand a matching `static` action). It is still part of the URL
 * contract: asset hrefs derive from it via `staticUrl(...)` below so the
 * CSS/JS/favicon links are not hardcoded strings.
 */
export const staticRoute = route({ static: get("/static/*path") }).static;

/** Typed href for a static asset, e.g. staticUrl("app.css") === "/static/app.css". */
export const staticUrl = (path: string): string => staticRoute.href({ path });
