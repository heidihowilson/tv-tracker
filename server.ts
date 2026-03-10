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

// API key for cron endpoints
const API_KEY = Deno.env.get("API_KEY") ?? crypto.randomUUID();
console.log(`API Key for cron endpoints: ${API_KEY}`);

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
app.get("/login", (c) => {
  // If already logged in, redirect to dashboard
  const token = getCookie(c, "session");
  if (token && validSessions.has(token)) {
    return c.redirect("/");
  }
  return c.html(loginPage());
});

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
    // Use location.replace to avoid login page in browser history
    return c.html(`<!DOCTYPE html>
<html>
<head><title>Redirecting...</title></head>
<body>
<script>window.location.replace('/');</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body>
</html>`);
  }

  return c.html(loginPage("Invalid username or password"), 401);
});

app.get("/logout", (c) => {
  const token = getCookie(c, "session");
  if (token) validSessions.delete(token);
  deleteCookie(c, "session", { path: "/" });
  return c.redirect("/login");
});

// ============ PRIVATE API ROUTES (API key auth, before cookie middleware) ============

// Validate API key
function validateApiKey(c: { req: { query: (key: string) => string | undefined } }): boolean {
  const key = c.req.query("key");
  return key === API_KEY;
}

// GET /api/today - episodes airing today for tracked shows
app.get("/api/today", (c) => {
  if (!validateApiKey(c)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }
  
  const today = new Date().toISOString().split("T")[0];
  const episodes = db.getUpcomingEpisodes(0).filter(ep => ep.air_date === today);
  
  return c.json({
    date: today,
    episodes: episodes.map(ep => ({
      show: ep.show_title,
      season: ep.season_number,
      episode: ep.episode_number,
      title: ep.episode_title,
      service: ep.service,
      air_date: ep.air_date,
    })),
  });
});

// GET /api/upcoming - upcoming episodes for tracked shows
app.get("/api/upcoming", (c) => {
  if (!validateApiKey(c)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }
  
  const days = parseInt(c.req.query("days") ?? "7");
  const today = new Date().toISOString().split("T")[0];
  const episodes = db.getUpcomingEpisodes(days);
  
  return c.json({
    date: today,
    days_ahead: days,
    episodes: episodes.map(ep => ({
      show: ep.show_title,
      season: ep.season_number,
      episode: ep.episode_number,
      title: ep.episode_title,
      service: ep.service,
      air_date: ep.air_date,
    })),
  });
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
        a {
          color: var(--accent);
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0.75rem;
        }
        header {
          border-bottom: 1px solid var(--border);
          padding: 0.75rem 0;
          margin-bottom: 1rem;
        }
        header h1 {
          font-size: 1.25rem;
          font-weight: 600;
        }
        /* Mobile-first nav */
        nav {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 1rem;
          margin-top: 0.75rem;
        }
        nav a {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.9rem;
          padding: 0.5rem 0;
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        nav a:hover,
        nav a.active {
          color: var(--accent);
        }
        nav .signout {
          margin-left: auto;
          color: var(--danger);
        }
        h2 {
          font-size: 1.125rem;
          margin-bottom: 0.75rem;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .card h3 {
          font-size: 0.95rem;
          margin-bottom: 0.5rem;
        }
        .card-with-thumb {
          display: flex;
          gap: 0.75rem;
        }
        .card-thumb {
          width: 60px;
          height: 90px;
          object-fit: cover;
          border-radius: 4px;
          flex-shrink: 0;
          background: var(--border);
        }
        .card-content {
          flex: 1;
          min-width: 0;
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
          font-size: 0.8rem;
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
          padding: 0.625rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          text-decoration: none;
          display: inline-block;
          min-height: 44px;
          min-width: 44px;
        }
        button:hover,
        .btn:hover {
          opacity: 0.9;
        }
        button.small,
        .btn.small {
          padding: 0.375rem 0.625rem;
          font-size: 0.8rem;
          min-height: 36px;
          min-width: 36px;
        }
        button.secondary {
          background: var(--border);
        }
        input,
        select {
          background: var(--bg);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 0.625rem;
          border-radius: 4px;
          font-size: 1rem;
          min-height: 44px;
        }
        input:focus,
        select:focus {
          outline: none;
          border-color: var(--accent);
        }
        .search-form {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .search-form input {
          width: 100%;
        }
        /* Mobile-first: single column grid */
        .grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }
        /* Table wrapper for horizontal scroll on mobile */
        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          margin: 0 -0.75rem;
          padding: 0 0.75rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 500px;
        }
        th,
        td {
          padding: 0.75rem 0.5rem;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        th {
          color: var(--muted);
          font-weight: 500;
          font-size: 0.8rem;
          white-space: nowrap;
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
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem;
          background: var(--bg);
          border-radius: 4px;
          min-height: 44px;
        }
        .episode-item.watched {
          opacity: 0.5;
        }
        .episode-item .ep-num {
          font-weight: 600;
          min-width: 50px;
          font-size: 0.85rem;
        }
        .episode-item .ep-title {
          flex: 1;
          min-width: 150px;
          font-size: 0.9rem;
        }
        .flex {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .flex-between {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }
        .mb-1 {
          margin-bottom: 0.75rem;
        }
        .text-muted {
          color: var(--muted);
        }
        .ep-date {
          font-size: 0.8rem;
          white-space: nowrap;
          color: var(--muted);
        }
        .ep-date.date-today {
          color: var(--accent);
          font-weight: 600;
        }
        .ep-date.date-future {
          color: var(--warning);
        }
        .ep-date.date-past {
          color: var(--muted);
        }
        .air-date {
          font-size: 0.8rem;
          white-space: nowrap;
          color: var(--muted);
        }
        .search-results {
          margin-top: 0.75rem;
        }
        .search-result {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          padding: 0.75rem;
          background: var(--bg);
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }
        .search-result-thumb {
          width: 45px;
          height: 67px;
          object-fit: cover;
          border-radius: 4px;
          flex-shrink: 0;
          background: var(--border);
        }
        .search-result-info {
          flex: 1;
          min-width: 0;
        }
        .search-result-actions {
          flex-shrink: 0;
        }
        .show-header {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .show-header-thumb {
          width: 80px;
          height: 120px;
          object-fit: cover;
          border-radius: 6px;
          flex-shrink: 0;
          background: var(--border);
        }
        .show-header-info {
          flex: 1;
        }
        
        /* Tablet and up */
        @media (min-width: 640px) {
          .container {
            padding: 1rem;
          }
          header {
            padding: 1rem 0;
            margin-bottom: 1.5rem;
          }
          header h1 {
            font-size: 1.5rem;
          }
          nav {
            flex-wrap: nowrap;
            gap: 1.5rem;
          }
          h2 {
            font-size: 1.25rem;
            margin-bottom: 1rem;
          }
          .card {
            padding: 1rem;
            margin-bottom: 1rem;
          }
          .search-form {
            flex-direction: row;
            margin-bottom: 1.5rem;
          }
          .search-form input {
            flex: 1;
            width: auto;
          }
          .grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1rem;
          }
          .table-wrapper {
            margin: 0;
            padding: 0;
          }
          .episode-item {
            flex-wrap: nowrap;
            gap: 1rem;
          }
          .episode-item .ep-num {
            min-width: 60px;
          }
          .show-header-thumb {
            width: 100px;
            height: 150px;
          }
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
            <a href="/logout" class="signout">Sign Out</a>
          </nav>
        </header>
        ${raw(content)}
      </div>
      <script>
        // Color-code dates
        function colorDates() {
          const today = new Date().toISOString().split('T')[0];
          document.querySelectorAll('.ep-date[data-date]').forEach(el => {
            const d = el.dataset.date;
            if (d === today) el.classList.add('date-today');
            else if (d > today) el.classList.add('date-future');
            else el.classList.add('date-past');
          });
        }
        colorDates();

        // Watch/unwatch via fetch (no page reload, no history entry)
        document.addEventListener('click', async (e) => {
          const btn = e.target.closest('.watch-btn');
          if (!btn) return;
          e.preventDefault();

          const showId = parseInt(btn.dataset.show);
          const season = parseInt(btn.dataset.season);
          const episode = parseInt(btn.dataset.episode);
          const currentlyWatched = btn.dataset.watched === '1';
          const newWatched = !currentlyWatched;

          btn.disabled = true;
          btn.textContent = '…';

          try {
            const res = await fetch('/api/watch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ show_id: showId, season, episode, watched: newWatched }),
            });

            if (res.ok) {
              const item = btn.closest('.episode-item');
              if (newWatched) {
                item.classList.add('watched');
                btn.classList.add('secondary');
                btn.textContent = '✕';
                btn.dataset.watched = '1';
              } else {
                item.classList.remove('watched');
                btn.classList.remove('secondary');
                btn.textContent = '✓';
                btn.dataset.watched = '0';
              }

              // Update season watched count if on show page
              const card = item.closest('.card');
              if (card) {
                const countEl = card.querySelector('.text-muted');
                if (countEl) {
                  const watched = card.querySelectorAll('.episode-item.watched').length;
                  const total = card.querySelectorAll('.episode-item').length;
                  countEl.textContent = watched + '/' + total + ' watched';
                }
              }
            } else {
              btn.textContent = '!';
            }
          } catch {
            btn.textContent = '!';
          }
          btn.disabled = false;
        });
      </script>
    </body>
  </html>
`;

// ============ ROUTES ============

// Dashboard - show progress and unwatched
app.get("/", (c) => {
  const progress = db.getAllProgress();
  const unwatched = db.getRecentlyAired(14);

  // Get shows with images for progress cards
  const showsMap = new Map<number, db.Show>();
  for (const p of progress) {
    const show = db.getShow(p.show_id);
    if (show) showsMap.set(p.show_id, show);
  }

  const progressHtml = progress
    .map((p) => {
      const show = showsMap.get(p.show_id);
      const imageUrl = show?.image_url;
      const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
      const next = p.next_episode
        ? `Next: S${p.next_episode.season}E${p.next_episode.episode}${
            p.next_episode.air_date ? ` (${p.next_episode.air_date})` : ""
          }`
        : "Up to date";
      return `
        <div class="card card-with-thumb">
          ${imageUrl ? `<img src="${imageUrl}" alt="" class="card-thumb" loading="lazy">` : '<div class="card-thumb"></div>'}
          <div class="card-content">
            <div class="flex-between mb-1">
              <h3><a href="/show/${p.show_id}">${p.title}</a></h3>
              <span class="badge badge-${p.status}">${p.status}</span>
            </div>
            <div class="meta">${p.service ?? "Unknown"}${p.total_episodes > 0 ? ` · ${p.watched_episodes}/${p.total_episodes} episodes` : ""} · ${next}</div>
            ${p.total_episodes > 0 ? `<div class="progress-bar">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  const unwatchedHtml = unwatched
    .map(
      (ep) => `
      <div class="episode-item" id="dash-ep-${ep.show_id}-${ep.season_number}-${ep.episode_number}">
        <span class="ep-date" data-date="${ep.air_date}">${ep.air_date}</span>
        <span class="ep-num">S${ep.season_number}E${ep.episode_number}</span>
        <span class="ep-title"><a href="/show/${ep.show_id}">${ep.show_title}</a>${
          ep.episode_title ? ` - ${ep.episode_title}` : ""
        }</span>
        <button class="small watch-btn"
          data-show="${ep.show_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}"
          data-watched="0">✓ Watch</button>
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
        <td><span class="ep-date" data-date="${ep.air_date}">${ep.air_date}</span></td>
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
      <div class="table-wrapper">
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
      </div>
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
    <div class="table-wrapper">
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
    </div>
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
          <div class="episode-item ${e.watched ? "watched" : ""}" id="ep-${s.season_number}-${e.episode_number}">
            <span class="ep-num">E${e.episode_number}</span>
            <span class="ep-title">${e.title ?? ""}</span>
            ${e.air_date ? `<span class="ep-date" data-date="${e.air_date}">${e.air_date}</span>` : ""}
            <button class="small watch-btn ${e.watched ? "secondary" : ""}"
              data-show="${id}" data-season="${s.season_number}" data-episode="${e.episode_number}"
              data-watched="${e.watched ? "1" : "0"}">${e.watched ? "✕" : "✓"}</button>
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
    <div class="show-header">
      ${show.image_url ? `<img src="${show.image_url}" alt="" class="show-header-thumb" loading="lazy">` : ''}
      <div class="show-header-info">
        <div class="flex-between mb-1">
          <div>
            <h2>${show.title}</h2>
            <p class="meta">${show.service ?? "Unknown service"} · Added ${show.added_at?.split("T")[0]}</p>
          </div>
          <span class="badge badge-${show.status}">${show.status}</span>
        </div>
        ${show.notes ? `<p class="text-muted mb-1">${show.notes}</p>` : ""}
        <div class="flex">
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
    </div>
    ${
      progress && progress.total_episodes > 0
        ? `
      <div class="card">
        <p>Progress: ${progress.watched_episodes}/${progress.total_episodes} episodes (${Math.round((progress.watched_episodes / progress.total_episodes) * 100)}%)</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(progress.watched_episodes / progress.total_episodes) * 100}%"></div>
        </div>
      </div>
    `
        : '<div class="card"><p class="text-muted">No episode data yet — hit ↻ Refresh to pull from TVMaze</p></div>'
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
          const imageUrl = r.show.image?.medium;
          const existing = db.getShowByTvmazeId(r.show.id);
          return `
            <div class="search-result">
              ${imageUrl ? `<img src="${imageUrl}" alt="" class="search-result-thumb" loading="lazy">` : '<div class="search-result-thumb"></div>'}
              <div class="search-result-info">
                <strong>${r.show.name}</strong>
                <div class="text-muted">${service} · ${r.show.status}</div>
              </div>
              <div class="search-result-actions">
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
  const contentType = c.req.header("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await c.req.json();
    db.markEpisodeWatchedByNumber(body.show_id, body.season, body.episode, body.watched);
    return c.json({ ok: true, watched: body.watched });
  }

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

// Refresh all shows from TVMaze
app.post("/api/refresh-all", async (c) => {
  const shows = db.getAllShows();
  let refreshed = 0;
  let errors = 0;

  for (const show of shows) {
    try {
      // If no TVMaze ID, try to find one
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
      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`Error refreshing ${show.title}:`, e);
      errors++;
    }
  }

  const referer = c.req.header("Referer") ?? "/";
  return c.redirect(referer);
});

// API-key version of refresh-all (for cron/automation)
app.get("/api/refresh-all", async (c) => {
  const key = c.req.query("key");
  const expectedKey = Deno.env.get("API_KEY");

  if (!expectedKey || key !== expectedKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

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

  return c.json({ refreshed, errors, total: shows.length });
});

// ============ STARTUP ============

async function seedIfEmpty(): Promise<void> {
  const count = db.getShowCount();
  if (count > 0) {
    console.log(`Database has ${count} shows, skipping seed.`);
    return;
  }

  console.log("Database is empty, checking for seed files...");

  // Check for shows.json and history.json
  const showsPath = "./shows.json";
  const historyPath = "./history.json";

  try {
    await Deno.stat(showsPath);
    await Deno.stat(historyPath);
  } catch {
    console.log("No seed files found (shows.json, history.json), starting fresh.");
    return;
  }

  console.log("Found seed files, running migration...");

  // Import and run migrate
  try {
    const showsData = JSON.parse(await Deno.readTextFile(showsPath));
    const historyData = JSON.parse(await Deno.readTextFile(historyPath));

    const showMap = new Map<string, number>();

    // Process shows by status
    for (const status of ["watching", "completed", "dropped", "queued"] as const) {
      const shows = showsData[status] || [];
      console.log(`  Processing ${status}: ${shows.length} shows`);

      for (const show of shows) {
        const existing = db.getShowByTitle(show.title);
        if (existing) {
          showMap.set(show.title.toLowerCase(), existing.id);
          continue;
        }

        // Try to find on TVMaze
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

        // Fetch episodes if we have TVMaze data
        if (tvmazeId) {
          try {
            await tracker.populateShowData(id);
          } catch {
            // Ignore errors
          }
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Process watch history
    for (const entry of historyData) {
      const showId = showMap.get(entry.title.toLowerCase());
      if (!showId) continue;

      const watchedAt = entry.watchedAt || entry.completedAt || new Date().toISOString();

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

const port = parseInt(Deno.env.get("PORT") ?? "8000");

// Seed database if empty
await seedIfEmpty();

console.log(`TV Tracker running at http://localhost:${port}`);
Deno.serve({ port }, app.fetch);
