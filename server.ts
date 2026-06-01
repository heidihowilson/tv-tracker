/**
 * TV Tracker Web UI
 * Remix 3 (fetch-router) server. Views rendered via @remix-run/ui (see views.tsx).
 */

import * as http from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRouter } from "@remix-run/fetch-router";
import type { Middleware } from "@remix-run/fetch-router";
import { createRequestListener } from "@remix-run/node-fetch-server";
import { parseFormData } from "@remix-run/form-data-parser";
import * as db from "./db.ts";
import * as tvmaze from "./tvmaze.ts";
import * as tracker from "./tracker.ts";
import * as views from "./views.tsx";

// ============ RESPONSE HELPERS ============

/** Build an HTML response with the right content type */
function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

/** Build a 302 redirect response */
function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

// ============ COOKIE HELPERS ============

interface CookieOpts {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
  maxAge?: number;
}

/** Read a single cookie value from a request's Cookie header */
function getCookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/** Serialize a Set-Cookie header value */
function serializeCookie(name: string, value: string, opts: CookieOpts = {}): string {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) str += `; Max-Age=${opts.maxAge}`;
  str += `; Path=${opts.path ?? "/"}`;
  if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
  if (opts.secure) str += `; Secure`;
  if (opts.httpOnly) str += `; HttpOnly`;
  return str;
}

// ============ HMAC ============

/** HMAC-SHA256 sign a value (for cookie derivation) */
async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============ AUTH CONFIG ============

const AUTH_TOKEN = process.env.AUTH_TOKEN ?? crypto.randomUUID();
const API_KEY = process.env.API_KEY ?? crypto.randomUUID();
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

// Derive cookie value from token via HMAC (raw token never stored in cookie)
const COOKIE_VALUE = await hmacSign("tv-tracker-auth", AUTH_TOKEN);

if (!process.env.AUTH_TOKEN) {
  console.log(`[WARN] No AUTH_TOKEN env var set — generated ephemeral token.`);
  console.log(`Auth link: /auth/${AUTH_TOKEN}`);
}

function validateApiKey(req: Request): boolean {
  // Prefer Authorization header, fall back to query param for backward compat
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    return bearer === API_KEY;
  }
  // Legacy: query param (deprecated)
  const key = new URL(req.url).searchParams.get("key");
  return key === API_KEY;
}

// ============ STATIC FILES ============

const STATIC_DIR = fileURLToPath(new URL("./static", import.meta.url));

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

// ============ PUBLIC LANDING PAGE ============

async function renderLandingPage(): Promise<Response> {
  const toLanding = (s: db.Show): views.LandingShow => {
    const p = db.getShowProgress(s.id);
    return { show: s, watched: p?.watched_episodes ?? 0, total: p?.total_episodes ?? 0 };
  };
  const watching = db.getShowsByStatus("watching").map(toLanding);
  const completed = db.getShowsByStatus("completed").map(toLanding);
  return html(await views.renderLanding(watching, completed));
}

// ============ AUTH MIDDLEWARE ============

const authMiddleware: Middleware = async (ctx, next) => {
  const path = ctx.url.pathname;

  // Always-public paths
  if (path === "/health" || path.startsWith("/static/") || path.startsWith("/auth/")) {
    return next();
  }

  // API-key GET endpoints validate their own key in the handler
  if (ctx.method === "GET" && (path === "/api/today" || path === "/api/upcoming" || path === "/api/refresh-all")) {
    return next();
  }

  // Everything else requires the auth cookie
  const cookie = getCookieValue(ctx.request, "tv_auth");
  if (cookie === COOKIE_VALUE) {
    const res = await next();
    // Rolling expiry — refresh on every authed visit
    res.headers.append(
      "Set-Cookie",
      serializeCookie("tv_auth", COOKIE_VALUE, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      })
    );
    return res;
  }

  // Not authed → public landing page (gallery of currently watching)
  return renderLandingPage();
};

const router = createRouter({ middleware: [authMiddleware] });

// ============ HEALTH ============

router.get("/health", () => new Response("OK"));

// ============ STATIC ============

router.get("/static/*path", async (ctx) => {
  const rel = (ctx.params as Record<string, string>).path ?? "";
  const filePath = join(STATIC_DIR, normalize("/" + rel));
  if (!filePath.startsWith(STATIC_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "Content-Type": mimeFor(filePath),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});

// ============ AUTH ROUTES ============

// Device token auth — interstitial then cookie
router.get("/auth/:token", async (ctx) => {
  const token = ctx.params.token;
  if (token !== AUTH_TOKEN) {
    return new Response("Invalid link", { status: 403 });
  }

  // Already authed? Go straight to dashboard
  const existing = getCookieValue(ctx.request, "tv_auth");
  if (existing === COOKIE_VALUE) {
    return redirect("/");
  }

  return html(await views.renderAuthInterstitial(token));
});

// POST handler — actually set the cookie
router.post("/auth/:token", async (ctx) => {
  const token = ctx.params.token;
  if (token !== AUTH_TOKEN) {
    return new Response("Invalid link", { status: 403 });
  }

  const body = await parseFormData(ctx.request);
  const remember = body.get("remember") === "1";

  const setCookie = serializeCookie("tv_auth", COOKIE_VALUE, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: remember ? COOKIE_MAX_AGE : undefined, // session cookie if unchecked
  });

  return html(
    `<!DOCTYPE html><html><head><title>Welcome</title></head><body>
<script>window.location.replace('/');</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body></html>`,
    200,
    { "Set-Cookie": setCookie }
  );
});

// ============ PRIVATE API ROUTES (API key auth) ============

router.get("/api/today", (ctx) => {
  if (!validateApiKey(ctx.request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const today = new Date().toISOString().split("T")[0];
  const episodes = db.getUpcomingEpisodes(0).filter((ep) => ep.air_date === today);
  return Response.json({
    date: today,
    episodes: episodes.map((ep) => ({
      show: ep.show_title, season: ep.season_number, episode: ep.episode_number,
      title: ep.episode_title, service: ep.service, air_date: ep.air_date,
    })),
  });
});

router.get("/api/upcoming", (ctx) => {
  if (!validateApiKey(ctx.request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const days = parseInt(ctx.url.searchParams.get("days") ?? "7");
  const today = new Date().toISOString().split("T")[0];
  const episodes = db.getUpcomingEpisodes(days);
  return Response.json({
    date: today, days_ahead: days,
    episodes: episodes.map((ep) => ({
      show: ep.show_title, season: ep.season_number, episode: ep.episode_number,
      title: ep.episode_title, service: ep.service, air_date: ep.air_date,
    })),
  });
});

router.get("/api/refresh-all", async (ctx) => {
  if (!validateApiKey(ctx.request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await refreshAllShows();
  return Response.json(result);
});

// ============ PAGE ROUTES ============

// Dashboard - show progress and unwatched
router.get("/", async () => {
  const progress = db.getAllProgress();
  const unwatched = db.getRecentlyAired(14);
  const showsById = new Map<number, db.Show>();
  for (const p of progress) {
    const show = db.getShow(p.show_id);
    if (show) showsById.set(p.show_id, show);
  }
  return html(await views.renderDashboard({ progress, unwatched, showsById }));
});

// Upcoming episodes — grouped into relative-week buckets with thumbnails
router.get("/upcoming", async (ctx) => {
  const days = parseInt(ctx.url.searchParams.get("days") ?? "30");
  const upcoming = db.getUpcomingEpisodes(days);

  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const weekLabel = (w: number): string => {
    if (w === 0) return "This week";
    if (w === 1) return "Next week";
    return `In ${w} weeks`;
  };

  const groupMap = new Map<number, db.UpcomingEpisode[]>();
  for (const ep of upcoming) {
    const ad = new Date(ep.air_date + "T00:00:00");
    const adMid = new Date(ad.getFullYear(), ad.getMonth(), ad.getDate()).getTime();
    const diffDays = Math.round((adMid - todayMid) / 86400000);
    const week = Math.max(0, Math.floor(diffDays / 7));
    if (!groupMap.has(week)) groupMap.set(week, []);
    groupMap.get(week)!.push(ep);
  }
  const groups = [...groupMap.keys()].sort((a, b) => a - b).map((week) => ({
    week, label: weekLabel(week), eps: groupMap.get(week)!,
  }));

  return html(await views.renderUpcoming({ days, groups, empty: upcoming.length === 0 }));
});

// All shows
router.get("/shows", async (ctx) => {
  const status = (ctx.url.searchParams.get("status") as db.Show["status"]) || undefined;
  const shows = status ? db.getShowsByStatus(status) : db.getAllShows();
  return html(await views.renderShows(shows, status));
});

// Show detail
router.get("/show/:id", async (ctx) => {
  const id = parseInt(ctx.params.id);
  const show = db.getShow(id);
  if (!show) {
    return html(await views.renderNotFound());
  }
  const seasons = db.getSeasons(id).map((season) => ({ season, episodes: db.getEpisodes(season.id) }));
  const progress = db.getShowProgress(id);
  return html(await views.renderShowDetail({ show, progress, seasons }));
});

// Search / Add show
router.get("/search", async (ctx) => {
  const query = ctx.url.searchParams.get("q");
  let results: views.SearchResultItem[] | null = null;
  let error: string | null = null;

  if (query) {
    try {
      const found = await tvmaze.searchShows(query);
      results = found.slice(0, 15).map((r) => ({
        tvmazeId: r.show.id,
        name: r.show.name,
        service: tvmaze.getService(r.show) ?? "Unknown",
        status: r.show.status,
        imageUrl: views.safeUrl(r.show.image?.medium),
        existingId: db.getShowByTvmazeId(r.show.id)?.id ?? null,
      }));
    } catch (e) {
      error = String(e);
    }
  }

  return html(await views.renderSearch(query, results, error));
});

// ============ MUTATION API ROUTES ============

// Mark episode watched
router.post("/api/watch", async (ctx) => {
  const contentType = ctx.request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await ctx.request.json();
    db.markEpisodeWatchedByNumber(body.show_id, body.season, body.episode, body.watched);
    return Response.json({ ok: true, watched: body.watched });
  }

  const body = await parseFormData(ctx.request);
  const showId = parseInt(body.get("show_id") as string);
  const season = parseInt(body.get("season") as string);
  const episode = parseInt(body.get("episode") as string);
  const watched = body.get("watched") !== "0";

  db.markEpisodeWatchedByNumber(showId, season, episode, watched);

  const referer = ctx.request.headers.get("Referer") ?? "/";
  return redirect(referer);
});

// Change status
router.post("/api/status", async (ctx) => {
  const body = await parseFormData(ctx.request);
  const showId = parseInt(body.get("show_id") as string);
  const status = body.get("status") as db.Show["status"];
  db.updateShowStatus(showId, status);
  return redirect(`/show/${showId}`);
});

// Refresh show data
router.post("/api/refresh", async (ctx) => {
  const body = await parseFormData(ctx.request);
  const showId = parseInt(body.get("show_id") as string);
  await tracker.refreshShowData(showId);
  return redirect(`/show/${showId}`);
});

// Add new show
router.post("/api/add", async (ctx) => {
  const body = await parseFormData(ctx.request);
  const tvmazeId = parseInt(body.get("tvmaze_id") as string);
  const show = await tracker.addShowById(tvmazeId);
  if (show) {
    return redirect(`/show/${show.id}`);
  }
  return redirect("/search");
});

// Shared refresh-all logic
async function refreshAllShows(): Promise<{ refreshed: number; errors: number; total: number }> {
  const shows = db.getAllShows();
  let refreshed = 0;
  let errors = 0;

  for (const show of shows) {
    try {
      if (!show.tvmaze_id) {
        const result = await tvmaze.findShow(show.title);
        if (result && result.score > 0.5) {
          db.updateShowTvmazeId(show.id, result.show.id);
          if (result.show.image?.medium) {
            db.updateShowImage(show.id, result.show.image.medium);
          }
          show.tvmaze_id = result.show.id;
        }
      }

      if (show.tvmaze_id) {
        await tracker.populateShowData(show.id);
        refreshed++;
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`Error refreshing ${show.title}:`, e);
      errors++;
    }
  }

  return { refreshed, errors, total: shows.length };
}

// Refresh all (authenticated UI)
router.post("/api/refresh-all", async (ctx) => {
  await refreshAllShows();
  const referer = ctx.request.headers.get("Referer") ?? "/";
  return redirect(referer);
});

// ============ STARTUP ============

async function seedIfEmpty(): Promise<void> {
  const count = db.getShowCount();
  if (count > 0) {
    console.log(`Database has ${count} shows, skipping seed.`);
    return;
  }

  console.log("Database is empty, checking for seed files...");

  const showsPath = "./shows.json";
  const historyPath = "./history.json";

  let showsRaw: string;
  let historyRaw: string;
  try {
    showsRaw = await readFile(showsPath, "utf8");
    historyRaw = await readFile(historyPath, "utf8");
  } catch {
    console.log("No seed files found (shows.json, history.json), starting fresh.");
    return;
  }

  console.log("Found seed files, running migration...");

  try {
    const showsData = JSON.parse(showsRaw);
    const historyData = JSON.parse(historyRaw);
    const showMap = new Map<string, number>();

    for (const status of ["watching", "completed", "dropped", "queued"] as const) {
      const shows = showsData[status] || [];
      console.log(`  Processing ${status}: ${shows.length} shows`);

      for (const show of shows) {
        const existing = db.getShowByTitle(show.title);
        if (existing) {
          showMap.set(show.title.toLowerCase(), existing.id);
          continue;
        }

        let tvmazeId: number | undefined;
        let imageUrl: string | undefined;
        try {
          const result = await tvmaze.findShow(show.title);
          if (result && result.score > 0.5) {
            tvmazeId = result.show.id;
            imageUrl = result.show.image?.medium ?? undefined;
          }
        } catch {
          // Ignore TVMaze errors during seed
        }

        const addedAt = show.added || show.completedAt || new Date().toISOString();
        const id = db.addShow(show.title, {
          tvmaze_id: tvmazeId,
          service: show.service,
          status,
          notes: show.notes ?? undefined,
          added_at: addedAt,
          image_url: imageUrl,
        });

        showMap.set(show.title.toLowerCase(), id);

        if (tvmazeId) {
          try {
            await tracker.populateShowData(id);
          } catch {
            // Ignore errors
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    }

    for (const entry of historyData) {
      const showId = showMap.get(entry.title.toLowerCase());
      if (!showId) continue;

      if (entry.action === "watched" && entry.episode) {
        const season = db.getSeason(showId, entry.season);
        if (season) {
          const episode = db.getEpisode(season.id, entry.episode);
          if (episode) {
            db.markEpisodeWatched(episode.id, true);
          }
        }
      } else if (entry.action === "completed" && entry.season) {
        const season = db.getSeason(showId, entry.season);
        if (season) {
          const episodes = db.getEpisodes(season.id);
          for (const ep of episodes) {
            db.markEpisodeWatched(ep.id, true);
          }
        }
      }
    }

    console.log("Migration complete!");
  } catch (e) {
    console.error("Migration failed:", e);
  }
}

// ============ START SERVER ============

const port = parseInt(process.env.PORT ?? "8000");

await seedIfEmpty();

const server = http.createServer(createRequestListener((request) => router.fetch(request)));
server.listen(port, () => {
  console.log(`TV Tracker running at http://localhost:${port}`);
});
