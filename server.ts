/**
 * TV Tracker Web UI
 * Simple Hono server for managing shows
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { html, raw } from "https://deno.land/x/hono@v4.3.11/helper/html/index.ts";
import { serveStatic } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { getCookie, setCookie, deleteCookie } from "https://deno.land/x/hono@v4.3.11/helper/cookie/index.ts";
import * as db from "./db.ts";
import * as tvmaze from "./tvmaze.ts";
import * as tracker from "./tracker.ts";

const app = new Hono();

// Auth config
const authUser = Deno.env.get("AUTH_USER");
const authPass = Deno.env.get("AUTH_PASS");
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ?? crypto.randomUUID();

// Simple session token generator
function makeSessionToken(user: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(user + SESSION_SECRET);
  let hash = 0;
  for (const b of data) {
    hash = ((hash << 5) - hash + b) | 0;
  }
  return Math.abs(hash).toString(36) + "-" + Date.now().toString(36);
}

// Valid session tokens (in-memory, survives for container lifetime)
const validSessions = new Set<string>();

// Health check endpoint (no auth)
app.get("/health", (c) => c.text("OK"));

// Login page
const loginPage = (error?: string) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sign In - TV Tracker</title>
      <style>
        :root {
          --bg: #0f0f0f;
          --card: #1a1a1a;
          --border: #333;
          --text: #e0e0e0;
          --muted: #888;
          --accent: #6366f1;
          --danger: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 2rem;
          width: 100%;
          max-width: 360px;
        }
        .login-card h1 {
          font-size: 1.5rem;
          margin-bottom: 0.25rem;
        }
        .login-card p {
          color: var(--muted);
          font-size: 0.85rem;
          margin-bottom: 1.5rem;
        }
        label {
          display: block;
          font-size: 0.85rem;
          color: var(--muted);
          margin-bottom: 0.25rem;
        }
        input[type="text"],
        input[type="password"] {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 0.65rem 0.75rem;
          border-radius: 6px;
          font-size: 0.95rem;
          margin-bottom: 1rem;
        }
        input:focus {
          outline: none;
          border-color: var(--accent);
        }
        button {
          width: 100%;
          background: var(--accent);
          color: white;
          border: none;
          padding: 0.7rem;
          border-radius: 6px;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
        }
        button:hover { opacity: 0.9; }
        .error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--danger);
          color: var(--danger);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="login-card">
        <h1>📺 TV Tracker</h1>
        <p>Sign in to continue</p>
        ${error ? raw(`<div class="error">${error}</div>`) : ""}
        <form method="POST" action="/login">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" autocomplete="username" required autofocus />
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required />
          <button type="submit">Sign In</button>
        </form>
      </div>
    </body>
  </html>
`;

// Login routes
app.get("/login", (c) => c.html(loginPage()));

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  const password = body.password as string;

  if (authUser && authPass && username === authUser && password === authPass) {
    const token = makeSessionToken(username);
    validSessions.add(token);
    setCookie(c, "session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return c.redirect("/");
  }

  return c.html(loginPage("Invalid username or password"), 401);
});

app.get("/logout", (c) => {
  const token = getCookie(c, "session");
  if (token) validSessions.delete(token);
  deleteCookie(c, "session", { path: "/" });
  return c.redirect("/login");
});

// Auth middleware (cookie-based)
if (authUser && authPass) {
  console.log("Cookie auth enabled");
  app.use("*", async (c, next) => {
    const token = getCookie(c, "session");
    if (token && validSessions.has(token)) {
      return next();
    }
    return c.redirect("/login");
  });
}

// ============ HTML TEMPLATES ============

const layout = (title: string, content: string) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title} - TV Tracker</title>
      <style>
        :root {
          --bg: #0f0f0f;
          --card: #1a1a1a;
          --border: #333;
          --text: #e0e0e0;
          --muted: #888;
          --accent: #6366f1;
          --success: #22c55e;
          --warning: #f59e0b;
          --danger: #ef4444;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg);
          color: var(--text);
          line-height: 1.5;
          min-height: 100vh;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
        }
        header {
          border-bottom: 1px solid var(--border);
          padding: 1rem 0;
          margin-bottom: 1.5rem;
        }
        header h1 {
          font-size: 1.5rem;
          font-weight: 600;
        }
        nav {
          display: flex;
          gap: 1.5rem;
          margin-top: 0.75rem;
        }
        nav a {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.9rem;
        }
        nav a:hover,
        nav a.active {
          color: var(--accent);
        }
        h2 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .card h3 {
          font-size: 1rem;
          margin-bottom: 0.5rem;
        }
        .badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .badge-watching {
          background: var(--accent);
        }
        .badge-completed {
          background: var(--success);
        }
        .badge-queued {
          background: var(--warning);
          color: #000;
        }
        .badge-dropped {
          background: var(--danger);
        }
        .meta {
          color: var(--muted);
          font-size: 0.85rem;
        }
        .progress-bar {
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 0.5rem;
        }
        .progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.3s;
        }
        button,
        .btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          text-decoration: none;
          display: inline-block;
        }
        button:hover,
        .btn:hover {
          opacity: 0.9;
        }
        button.small,
        .btn.small {
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
        }
        button.secondary {
          background: var(--border);
        }
        input,
        select {
          background: var(--bg);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.9rem;
        }
        input:focus,
        select:focus {
          outline: none;
          border-color: var(--accent);
        }
        .search-form {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .search-form input {
          flex: 1;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        th {
          color: var(--muted);
          font-weight: 500;
          font-size: 0.85rem;
        }
        tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .episode-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .episode-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.5rem;
          background: var(--bg);
          border-radius: 4px;
        }
        .episode-item.watched {
          opacity: 0.5;
        }
        .episode-item .ep-num {
          font-weight: 600;
          min-width: 60px;
        }
        .episode-item .ep-title {
          flex: 1;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }
        .flex {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .flex-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .mb-1 {
          margin-bottom: 1rem;
        }
        .text-muted {
          color: var(--muted);
        }
        .air-date {
          color: var(--warning);
          font-size: 0.85rem;
        }
        .search-results {
          margin-top: 1rem;
        }
        .search-result {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: var(--bg);
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>📺 TV Tracker</h1>
          <nav>
            <a href="/">Dashboard</a>
            <a href="/upcoming">Upcoming</a>
            <a href="/shows">All Shows</a>
            <a href="/search">Add Show</a>
            <a href="/logout" style="margin-left:auto; color:var(--danger)">Sign Out</a>
          </nav>
        </header>
        ${raw(content)}
      </div>
    </body>
  </html>
`;

// ============ ROUTES ============

// Dashboard - show progress and unwatched
app.get("/", (c) => {
  const progress = db.getAllProgress();
  const unwatched = db.getRecentlyAired(14);

  const progressHtml = progress
    .map((p) => {
      const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
      const next = p.next_episode
        ? `Next: S${p.next_episode.season}E${p.next_episode.episode}${
            p.next_episode.air_date ? ` (${p.next_episode.air_date})` : ""
          }`
        : "Up to date";
      return `
        <div class="card">
          <div class="flex-between mb-1">
            <h3><a href="/show/${p.show_id}">${p.title}</a></h3>
            <span class="badge badge-${p.status}">${p.status}</span>
          </div>
          <div class="meta">${p.service ?? "Unknown"} · ${p.watched_episodes}/${p.total_episodes} episodes · ${next}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const unwatchedHtml = unwatched
    .map(
      (ep) => `
      <div class="episode-item">
        <span class="air-date">${ep.air_date}</span>
        <span class="ep-num">S${ep.season_number}E${ep.episode_number}</span>
        <span class="ep-title"><a href="/show/${ep.show_id}">${ep.show_title}</a>${
          ep.episode_title ? ` - ${ep.episode_title}` : ""
        }</span>
        <form method="POST" action="/api/watch" style="display:inline">
          <input type="hidden" name="show_id" value="${ep.show_id}" />
          <input type="hidden" name="season" value="${ep.season_number}" />
          <input type="hidden" name="episode" value="${ep.episode_number}" />
          <button class="small">✓ Watch</button>
        </form>
      </div>
    `
    )
    .join("");

  const content = `
    <h2>Currently Watching</h2>
    ${progress.length === 0 ? '<p class="text-muted">No shows being watched</p>' : `<div class="grid">${progressHtml}</div>`}
    
    <h2 style="margin-top: 2rem">Ready to Watch</h2>
    ${
      unwatched.length === 0
        ? '<p class="text-muted">All caught up!</p>'
        : `<div class="episode-list">${unwatchedHtml}</div>`
    }
  `;

  return c.html(layout("Dashboard", content));
});

// Upcoming episodes
app.get("/upcoming", (c) => {
  const days = parseInt(c.req.query("days") ?? "14");
  const upcoming = db.getUpcomingEpisodes(days);

  const upcomingHtml = upcoming
    .map(
      (ep) => `
      <tr>
        <td class="air-date">${ep.air_date}</td>
        <td><a href="/show/${ep.show_id}">${ep.show_title}</a></td>
        <td>S${ep.season_number}E${ep.episode_number}</td>
        <td>${ep.episode_title ?? ""}</td>
        <td>${ep.service ?? ""}</td>
      </tr>
    `
    )
    .join("");

  const content = `
    <div class="flex-between mb-1">
      <h2>Upcoming Episodes</h2>
      <form method="GET">
        <select name="days" onchange="this.form.submit()">
          <option value="7" ${days === 7 ? "selected" : ""}>7 days</option>
          <option value="14" ${days === 14 ? "selected" : ""}>14 days</option>
          <option value="30" ${days === 30 ? "selected" : ""}>30 days</option>
        </select>
      </form>
    </div>
    ${
      upcoming.length === 0
        ? '<p class="text-muted">No upcoming episodes</p>'
        : `
      <table>
        <thead>
          <tr>
            <th>Air Date</th>
            <th>Show</th>
            <th>Episode</th>
            <th>Title</th>
            <th>Service</th>
          </tr>
        </thead>
        <tbody>${upcomingHtml}</tbody>
      </table>
    `
    }
  `;

  return c.html(layout("Upcoming", content));
});

// All shows
app.get("/shows", (c) => {
  const status = (c.req.query("status") as db.Show["status"]) ?? undefined;
  const shows = status ? db.getShowsByStatus(status) : db.getAllShows();

  const showsHtml = shows
    .map(
      (s) => `
      <tr>
        <td><a href="/show/${s.id}">${s.title}</a></td>
        <td><span class="badge badge-${s.status}">${s.status}</span></td>
        <td>${s.service ?? ""}</td>
        <td class="text-muted">${s.notes ?? ""}</td>
      </tr>
    `
    )
    .join("");

  const content = `
    <div class="flex-between mb-1">
      <h2>All Shows (${shows.length})</h2>
      <form method="GET">
        <select name="status" onchange="this.form.submit()">
          <option value="">All</option>
          <option value="watching" ${status === "watching" ? "selected" : ""}>Watching</option>
          <option value="completed" ${status === "completed" ? "selected" : ""}>Completed</option>
          <option value="queued" ${status === "queued" ? "selected" : ""}>Queued</option>
          <option value="dropped" ${status === "dropped" ? "selected" : ""}>Dropped</option>
        </select>
      </form>
    </div>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Service</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${showsHtml}</tbody>
    </table>
  `;

  return c.html(layout("All Shows", content));
});

// Show detail
app.get("/show/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  const show = db.getShow(id);

  if (!show) {
    return c.html(layout("Not Found", '<p class="text-muted">Show not found</p>'));
  }

  const seasons = db.getSeasons(id);
  const progress = db.getShowProgress(id);

  const seasonsHtml = seasons
    .map((s) => {
      const episodes = db.getEpisodes(s.id);
      const watchedCount = episodes.filter((e) => e.watched).length;
      const episodesHtml = episodes
        .map(
          (e) => `
          <div class="episode-item ${e.watched ? "watched" : ""}">
            <span class="ep-num">E${e.episode_number}</span>
            <span class="ep-title">${e.title ?? ""}</span>
            ${e.air_date ? `<span class="air-date">${e.air_date}</span>` : ""}
            <form method="POST" action="/api/watch" style="display:inline">
              <input type="hidden" name="show_id" value="${id}" />
              <input type="hidden" name="season" value="${s.season_number}" />
              <input type="hidden" name="episode" value="${e.episode_number}" />
              <input type="hidden" name="watched" value="${e.watched ? "0" : "1"}" />
              <button class="small ${e.watched ? "secondary" : ""}">${e.watched ? "✕" : "✓"}</button>
            </form>
          </div>
        `
        )
        .join("");

      return `
        <div class="card">
          <div class="flex-between mb-1">
            <h3>Season ${s.season_number}</h3>
            <span class="text-muted">${watchedCount}/${episodes.length} watched</span>
          </div>
          <div class="episode-list">${episodesHtml}</div>
        </div>
      `;
    })
    .join("");

  const content = `
    <div class="flex-between mb-1">
      <div>
        <h2>${show.title}</h2>
        <p class="meta">${show.service ?? "Unknown service"} · Added ${show.added_at?.split("T")[0]}</p>
      </div>
      <div class="flex">
        <span class="badge badge-${show.status}">${show.status}</span>
        <form method="POST" action="/api/status" style="display:inline">
          <input type="hidden" name="show_id" value="${id}" />
          <select name="status" onchange="this.form.submit()">
            <option value="watching" ${show.status === "watching" ? "selected" : ""}>Watching</option>
            <option value="completed" ${show.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="queued" ${show.status === "queued" ? "selected" : ""}>Queued</option>
            <option value="dropped" ${show.status === "dropped" ? "selected" : ""}>Dropped</option>
          </select>
        </form>
        <form method="POST" action="/api/refresh" style="display:inline">
          <input type="hidden" name="show_id" value="${id}" />
          <button class="small secondary">↻ Refresh</button>
        </form>
      </div>
    </div>
    ${show.notes ? `<p class="text-muted mb-1">${show.notes}</p>` : ""}
    ${
      progress
        ? `
      <div class="card">
        <p>Progress: ${progress.watched_episodes}/${progress.total_episodes} episodes (${Math.round((progress.watched_episodes / progress.total_episodes) * 100)}%)</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(progress.watched_episodes / progress.total_episodes) * 100}%"></div>
        </div>
      </div>
    `
        : ""
    }
    ${seasonsHtml}
  `;

  return c.html(layout(show.title, content));
});

// Search / Add show
app.get("/search", async (c) => {
  const query = c.req.query("q");
  let resultsHtml = "";

  if (query) {
    try {
      const results = await tvmaze.searchShows(query);
      resultsHtml = results
        .slice(0, 15)
        .map((r) => {
          const service = tvmaze.getService(r.show) ?? "Unknown";
          const existing = db.getShowByTvmazeId(r.show.id);
          return `
            <div class="search-result">
              <div>
                <strong>${r.show.name}</strong>
                <span class="text-muted"> · ${service} · ${r.show.status}</span>
              </div>
              ${
                existing
                  ? `<a href="/show/${existing.id}" class="btn small secondary">View</a>`
                  : `
                  <form method="POST" action="/api/add">
                    <input type="hidden" name="tvmaze_id" value="${r.show.id}" />
                    <button class="small">+ Add</button>
                  </form>
                `
              }
            </div>
          `;
        })
        .join("");
    } catch (e) {
      resultsHtml = `<p class="text-muted">Search failed: ${e}</p>`;
    }
  }

  const content = `
    <h2>Search TVMaze</h2>
    <form method="GET" class="search-form">
      <input type="text" name="q" placeholder="Search for a show..." value="${query ?? ""}" autofocus />
      <button>Search</button>
    </form>
    <div class="search-results">${resultsHtml}</div>
  `;

  return c.html(layout("Add Show", content));
});

// ============ API ROUTES ============

// Mark episode watched
app.post("/api/watch", async (c) => {
  const body = await c.req.parseBody();
  const showId = parseInt(body.show_id as string);
  const season = parseInt(body.season as string);
  const episode = parseInt(body.episode as string);
  const watched = body.watched !== "0";

  db.markEpisodeWatchedByNumber(showId, season, episode, watched);

  const referer = c.req.header("Referer") ?? "/";
  return c.redirect(referer);
});

// Change status
app.post("/api/status", async (c) => {
  const body = await c.req.parseBody();
  const showId = parseInt(body.show_id as string);
  const status = body.status as db.Show["status"];

  db.updateShowStatus(showId, status);

  return c.redirect(`/show/${showId}`);
});

// Refresh show data
app.post("/api/refresh", async (c) => {
  const body = await c.req.parseBody();
  const showId = parseInt(body.show_id as string);

  await tracker.refreshShowData(showId);

  return c.redirect(`/show/${showId}`);
});

// Add new show
app.post("/api/add", async (c) => {
  const body = await c.req.parseBody();
  const tvmazeId = parseInt(body.tvmaze_id as string);

  const show = await tracker.addShowById(tvmazeId);

  if (show) {
    return c.redirect(`/show/${show.id}`);
  }
  return c.redirect("/search");
});

// ============ START SERVER ============

const port = parseInt(Deno.env.get("PORT") ?? "8000");

console.log(`TV Tracker running at http://localhost:${port}`);
Deno.serve({ port }, app.fetch);
