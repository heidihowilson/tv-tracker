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

// Auth config — device token auth
// AUTH_TOKEN: secret token for the auth link (e.g. tv.sethgholson.com/auth/TOKEN)
// API_KEY: separate key for cron/API endpoints
const AUTH_TOKEN = Deno.env.get("AUTH_TOKEN") ?? crypto.randomUUID();
const API_KEY = Deno.env.get("API_KEY") ?? crypto.randomUUID();
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

console.log(`API Key for cron endpoints: ${API_KEY}`);
console.log(`Auth link: /auth/${AUTH_TOKEN}`);

// Static files (icons, etc.)
app.use("/static/*", serveStatic({ root: "./" }));

// Health check endpoint (no auth)
app.get("/health", (c) => c.text("OK"));

// Device token auth — interstitial then cookie
app.get("/auth/:token", (c) => {
  const token = c.req.param("token");
  if (token !== AUTH_TOKEN) {
    return c.text("Invalid link", 403);
  }

  // Already authed? Go straight to dashboard
  const existing = getCookie(c, "tv_auth");
  if (existing === AUTH_TOKEN) {
    return c.redirect("/");
  }

  // Show interstitial
  return c.html(`<!DOCTYPE html>
<html lang="en" data-theme="abyss">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome — TV Tracker</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet" type="text/css" />
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="min-h-screen flex items-center justify-center bg-base-100 p-4">
  <div class="card bg-base-200 shadow-xl w-full max-w-sm">
    <div class="card-body">
      <h1 class="card-title text-2xl">📺 TV Tracker</h1>
      <p class="text-base-content/60 text-sm mt-2">
        This link gives you access to the family TV tracker. Once authorized, you can browse shows, mark episodes as watched, and see what's coming up.
      </p>
      <div class="divider my-2"></div>
      <form method="POST" action="/auth/${token}">
        <label class="flex items-center gap-3 cursor-pointer mb-4">
          <input type="checkbox" name="remember" value="1" checked class="checkbox checkbox-primary checkbox-sm" />
          <span class="text-sm">Remember this device for 90 days</span>
        </label>
        <button type="submit" class="btn btn-primary w-full">Continue</button>
      </form>
    </div>
  </div>
</body>
</html>`);
});

// POST handler — actually set the cookie
app.post("/auth/:token", async (c) => {
  const token = c.req.param("token");
  if (token !== AUTH_TOKEN) {
    return c.text("Invalid link", 403);
  }

  const body = await c.req.parseBody();
  const remember = body.remember === "1";

  setCookie(c, "tv_auth", AUTH_TOKEN, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: remember ? COOKIE_MAX_AGE : undefined, // session cookie if unchecked
  });

  return c.html(`<!DOCTYPE html><html><head><title>Welcome</title></head><body>
<script>window.location.replace('/');</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body></html>`);
});

// ============ PRIVATE API ROUTES (API key auth, before cookie middleware) ============

function validateApiKey(c: { req: { query: (key: string) => string | undefined } }): boolean {
  const key = c.req.query("key");
  return key === API_KEY;
}

app.get("/api/today", (c) => {
  if (!validateApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
  const today = new Date().toISOString().split("T")[0];
  const episodes = db.getUpcomingEpisodes(0).filter(ep => ep.air_date === today);
  return c.json({
    date: today,
    episodes: episodes.map(ep => ({
      show: ep.show_title, season: ep.season_number, episode: ep.episode_number,
      title: ep.episode_title, service: ep.service, air_date: ep.air_date,
    })),
  });
});

app.get("/api/upcoming", (c) => {
  if (!validateApiKey(c)) return c.json({ error: "Unauthorized" }, 401);
  const days = parseInt(c.req.query("days") ?? "7");
  const today = new Date().toISOString().split("T")[0];
  const episodes = db.getUpcomingEpisodes(days);
  return c.json({
    date: today, days_ahead: days,
    episodes: episodes.map(ep => ({
      show: ep.show_title, season: ep.season_number, episode: ep.episode_number,
      title: ep.episode_title, service: ep.service, air_date: ep.air_date,
    })),
  });
});

// Auth middleware — check cookie, refresh rolling expiry
console.log("Device token auth enabled");
app.use("*", async (c, next) => {
  const cookie = getCookie(c, "tv_auth");
  if (cookie === AUTH_TOKEN) {
    // Rolling expiry — refresh on every visit
    setCookie(c, "tv_auth", AUTH_TOKEN, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return next();
  }
  return c.text("Access denied. Use your auth link to sign in.", 403);
});

// ============ HTML TEMPLATES ============

const layout = (title: string, content: string) => html`
  <!DOCTYPE html>
  <html lang="en" data-theme="abyss">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title} - TV Tracker</title>
      <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
      <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
      <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <meta name="apple-mobile-web-app-title" content="TV Tracker">
      <link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
      <link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet" type="text/css" />
      <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      <style>
        .episode-item.watched { opacity: 0.5; }
      </style>
    </head>
    <body class="min-h-screen bg-base-100">
      <div class="container mx-auto px-3 py-3 max-w-6xl">
        <!-- Navbar -->
        <div class="navbar bg-base-200 rounded-box mb-6">
          <div class="navbar-start">
            <div class="dropdown">
              <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16" />
                </svg>
              </div>
              <ul tabindex="0" class="menu menu-sm dropdown-content bg-base-200 rounded-box z-10 mt-3 w-52 p-2 shadow">
                <li><a href="/">Dashboard</a></li>
                <li><a href="/upcoming">Upcoming</a></li>
                <li><a href="/shows">All Shows</a></li>
                <li><a href="/search">Add Show</a></li>
              </ul>
            </div>
            <a href="/" class="btn btn-ghost text-xl">📺 TV Tracker</a>
          </div>
          <div class="navbar-center hidden lg:flex">
            <ul class="menu menu-horizontal px-1">
              <li><a href="/">Dashboard</a></li>
              <li><a href="/upcoming">Upcoming</a></li>
              <li><a href="/shows">All Shows</a></li>
              <li><a href="/search">Add Show</a></li>
            </ul>
          </div>
          <div class="navbar-end">
          </div>
        </div>
        ${raw(content)}
      </div>
      <script>
        // Relative date formatting
        function relativeDate(dateStr) {
          const d = new Date(dateStr + 'T00:00:00');
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const diffMs = target - today;
          const diffDays = Math.round(diffMs / 86400000);

          if (diffDays === 0) return 'Today';
          if (diffDays === 1) return 'Tomorrow';
          if (diffDays === -1) return 'Yesterday';
          if (diffDays > 1 && diffDays <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
          if (diffDays < 0 && diffDays >= -6) return Math.abs(diffDays) + 'd ago';
          if (diffDays < -6 && diffDays >= -30) return Math.abs(Math.round(diffDays / 7)) + 'w ago';
          if (diffDays > 6 && diffDays <= 30) return 'In ' + Math.round(diffDays / 7) + 'w';
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        // Color-code and format dates
        function formatDates() {
          const today = new Date().toISOString().split('T')[0];
          document.querySelectorAll('.ep-date[data-date]').forEach(el => {
            const d = el.dataset.date;
            el.textContent = relativeDate(d);
            el.title = d; // tooltip shows actual date
            el.classList.remove('text-base-content/50', 'text-primary', 'font-semibold', 'text-warning');
            if (d === today) {
              el.classList.add('text-primary', 'font-semibold');
            } else if (d > today) {
              el.classList.add('text-warning');
            } else {
              el.classList.add('text-base-content/50');
            }
          });
        }
        formatDates();

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
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-ghost');
                btn.textContent = '✕';
                btn.dataset.watched = '1';
              } else {
                item.classList.remove('watched');
                btn.classList.remove('btn-ghost');
                btn.classList.add('btn-primary');
                btn.textContent = '✓';
                btn.dataset.watched = '0';
              }

              // Update season watched count if on show page
              const card = item.closest('.card');
              if (card) {
                const countEl = card.querySelector('.watched-count');
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

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "watching": return "badge-primary";
      case "completed": return "badge-success";
      case "queued": return "badge-warning";
      case "dropped": return "badge-error";
      default: return "badge-ghost";
    }
  };

  const progressHtml = progress
    .map((p) => {
      const show = showsMap.get(p.show_id);
      const imageUrl = show?.image_url;
      const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
      const next = p.next_episode
        ? `Next: S${p.next_episode.season}E${p.next_episode.episode}${
            p.next_episode.air_date ? ` (<span class="ep-date" data-date="${p.next_episode.air_date}">${p.next_episode.air_date}</span>)` : ""
          }`
        : "Up to date";
      return `
        <a href="/show/${p.show_id}" class="card bg-base-200 shadow-sm hover:bg-base-300 transition-colors cursor-pointer no-underline">
          <div class="card-body p-4 flex-row gap-3">
            ${imageUrl ? `<img src="${imageUrl}" alt="" class="w-16 h-24 object-cover rounded-md shrink-0 bg-base-300" loading="lazy">` : '<div class="w-16 h-24 rounded-md bg-base-300 shrink-0"></div>'}
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-start justify-between gap-2 mb-1">
                <h3 class="font-semibold text-sm">${p.title}</h3>
                <span class="badge ${statusBadgeClass(p.status)} badge-sm">${p.status}</span>
              </div>
              <div class="text-xs text-base-content/60">${p.service ?? "Unknown"}${p.total_episodes > 0 ? ` · ${p.watched_episodes}/${p.total_episodes} episodes` : ""} · ${next}</div>
              ${p.total_episodes > 0 ? `<progress class="progress progress-primary w-full mt-2" value="${pct}" max="100"></progress>` : ""}
            </div>
          </div>
        </a>
      `;
    })
    .join("");

  const unwatchedHtml = unwatched
    .map(
      (ep) => `
      <div class="episode-item flex flex-wrap items-center gap-2 md:gap-4 p-3 bg-base-200 rounded-lg" id="dash-ep-${ep.show_id}-${ep.season_number}-${ep.episode_number}">
        <span class="ep-date text-sm whitespace-nowrap" data-date="${ep.air_date}">${ep.air_date}</span>
        <span class="font-semibold text-sm min-w-[50px]">S${ep.season_number}E${ep.episode_number}</span>
        <span class="flex-1 min-w-[150px] text-sm"><a href="/show/${ep.show_id}" class="link link-hover">${ep.show_title}</a>${
          ep.episode_title ? ` - ${ep.episode_title}` : ""
        }</span>
        <button class="btn btn-primary btn-sm watch-btn"
          data-show="${ep.show_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}"
          data-watched="0">✓ Watch</button>
      </div>
    `
    )
    .join("");

  const content = `
    <h2 class="text-lg font-bold mb-4">Currently Watching</h2>
    ${progress.length === 0 ? '<p class="text-base-content/60">No shows being watched</p>' : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${progressHtml}</div>`}
    
    <h2 class="text-lg font-bold mb-4 mt-8">Ready to Watch</h2>
    ${
      unwatched.length === 0
        ? '<p class="text-base-content/60">All caught up!</p>'
        : `<div class="flex flex-col gap-2">${unwatchedHtml}</div>`
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
        <td><span class="ep-date text-sm" data-date="${ep.air_date}">${ep.air_date}</span></td>
        <td><a href="/show/${ep.show_id}" class="link link-hover">${ep.show_title}</a></td>
        <td>S${ep.season_number}E${ep.episode_number}</td>
        <td>${ep.episode_title ?? ""}</td>
        <td>${ep.service ?? ""}</td>
      </tr>
    `
    )
    .join("");

  const content = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 class="text-lg font-bold">Upcoming Episodes</h2>
      <form method="GET">
        <select name="days" onchange="this.form.submit()" class="select select-bordered select-sm">
          <option value="7" ${days === 7 ? "selected" : ""}>7 days</option>
          <option value="14" ${days === 14 ? "selected" : ""}>14 days</option>
          <option value="30" ${days === 30 ? "selected" : ""}>30 days</option>
        </select>
      </form>
    </div>
    ${
      upcoming.length === 0
        ? '<p class="text-base-content/60">No upcoming episodes</p>'
        : `
      <div class="overflow-x-auto">
        <table class="table table-zebra">
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

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "watching": return "badge-primary";
      case "completed": return "badge-success";
      case "queued": return "badge-warning";
      case "dropped": return "badge-error";
      default: return "badge-ghost";
    }
  };

  const showsHtml = shows
    .map(
      (s) => `
      <tr>
        <td><a href="/show/${s.id}" class="link link-hover">${s.title}</a></td>
        <td><span class="badge ${statusBadgeClass(s.status)} badge-sm">${s.status}</span></td>
        <td>${s.service ?? ""}</td>
        <td class="text-base-content/60">${s.notes ?? ""}</td>
      </tr>
    `
    )
    .join("");

  const content = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 class="text-lg font-bold">All Shows (${shows.length})</h2>
      <form method="GET">
        <select name="status" onchange="this.form.submit()" class="select select-bordered select-sm">
          <option value="">All</option>
          <option value="watching" ${status === "watching" ? "selected" : ""}>Watching</option>
          <option value="completed" ${status === "completed" ? "selected" : ""}>Completed</option>
          <option value="queued" ${status === "queued" ? "selected" : ""}>Queued</option>
          <option value="dropped" ${status === "dropped" ? "selected" : ""}>Dropped</option>
        </select>
      </form>
    </div>
    <div class="overflow-x-auto">
      <table class="table table-zebra">
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
    return c.html(layout("Not Found", '<p class="text-base-content/60">Show not found</p>'));
  }

  const seasons = db.getSeasons(id);
  const progress = db.getShowProgress(id);

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "watching": return "badge-primary";
      case "completed": return "badge-success";
      case "queued": return "badge-warning";
      case "dropped": return "badge-error";
      default: return "badge-ghost";
    }
  };

  const seasonsHtml = seasons
    .map((s) => {
      const episodes = db.getEpisodes(s.id);
      const watchedCount = episodes.filter((e) => e.watched).length;
      const episodesHtml = episodes
        .map(
          (e) => `
          <div class="episode-item flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 p-3 bg-base-300 rounded-lg ${e.watched ? "watched" : ""}" id="ep-${s.season_number}-${e.episode_number}">
            <span class="font-semibold text-sm min-w-[50px] md:min-w-[60px]">E${e.episode_number}</span>
            <span class="flex-1 min-w-[150px] text-sm">${e.title ?? ""}</span>
            ${e.air_date ? `<span class="ep-date text-sm whitespace-nowrap" data-date="${e.air_date}">${e.air_date}</span>` : ""}
            <button class="btn btn-sm watch-btn ${e.watched ? "btn-ghost" : "btn-primary"}"
              data-show="${id}" data-season="${s.season_number}" data-episode="${e.episode_number}"
              data-watched="${e.watched ? "1" : "0"}">${e.watched ? "✕" : "✓"}</button>
          </div>
        `
        )
        .join("");

      return `
        <div class="card bg-base-200 shadow-sm mb-4">
          <div class="card-body p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 class="card-title text-base">Season ${s.season_number}</h3>
              <span class="text-base-content/60 text-sm watched-count">${watchedCount}/${episodes.length} watched</span>
            </div>
            <div class="flex flex-col gap-2">${episodesHtml}</div>
          </div>
        </div>
      `;
    })
    .join("");

  const content = `
    <div class="flex gap-4 mb-6">
      ${show.image_url ? `<img src="${show.image_url}" alt="" class="w-20 h-30 sm:w-24 sm:h-36 object-cover rounded-lg shrink-0 bg-base-300" loading="lazy">` : ''}
      <div class="flex-1">
        <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div>
            <h2 class="text-xl font-bold">${show.title}</h2>
            <p class="text-sm text-base-content/60">${show.service ?? "Unknown service"} · Added ${show.added_at?.split("T")[0]}</p>
          </div>
          <span class="badge ${statusBadgeClass(show.status)}">${show.status}</span>
        </div>
        ${show.notes ? `<p class="text-base-content/60 text-sm mb-2">${show.notes}</p>` : ""}
        <div class="flex flex-wrap gap-2">
          <form method="POST" action="/api/status" class="inline">
            <input type="hidden" name="show_id" value="${id}" />
            <select name="status" onchange="this.form.submit()" class="select select-bordered select-sm">
              <option value="watching" ${show.status === "watching" ? "selected" : ""}>Watching</option>
              <option value="completed" ${show.status === "completed" ? "selected" : ""}>Completed</option>
              <option value="queued" ${show.status === "queued" ? "selected" : ""}>Queued</option>
              <option value="dropped" ${show.status === "dropped" ? "selected" : ""}>Dropped</option>
            </select>
          </form>
          <form method="POST" action="/api/refresh" class="inline">
            <input type="hidden" name="show_id" value="${id}" />
            <button class="btn btn-ghost btn-sm">↻ Refresh</button>
          </form>
        </div>
      </div>
    </div>
    ${
      progress && progress.total_episodes > 0
        ? `
      <div class="card bg-base-200 shadow-sm mb-4">
        <div class="card-body p-4">
          <p class="text-sm">Progress: ${progress.watched_episodes}/${progress.total_episodes} episodes (${Math.round((progress.watched_episodes / progress.total_episodes) * 100)}%)</p>
          <progress class="progress progress-primary w-full mt-2" value="${progress.watched_episodes}" max="${progress.total_episodes}"></progress>
        </div>
      </div>
    `
        : '<div class="card bg-base-200 shadow-sm mb-4"><div class="card-body p-4"><p class="text-base-content/60">No episode data yet — hit ↻ Refresh to pull from TVMaze</p></div></div>'
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
            <div class="flex gap-3 items-center p-3 bg-base-200 rounded-lg mb-2">
              ${imageUrl ? `<img src="${imageUrl}" alt="" class="w-12 h-18 object-cover rounded shrink-0 bg-base-300" loading="lazy">` : '<div class="w-12 h-18 rounded bg-base-300 shrink-0"></div>'}
              <div class="flex-1 min-w-0">
                <strong class="text-sm">${r.show.name}</strong>
                <div class="text-xs text-base-content/60">${service} · ${r.show.status}</div>
              </div>
              <div class="shrink-0">
                ${
                  existing
                    ? `<a href="/show/${existing.id}" class="btn btn-ghost btn-sm">View</a>`
                    : `
                    <form method="POST" action="/api/add">
                      <input type="hidden" name="tvmaze_id" value="${r.show.id}" />
                      <button class="btn btn-primary btn-sm">+ Add</button>
                    </form>
                  `
                }
              </div>
            </div>
          `;
        })
        .join("");
    } catch (e) {
      resultsHtml = `<p class="text-base-content/60">Search failed: ${e}</p>`;
    }
  }

  const content = `
    <h2 class="text-lg font-bold mb-4">Search TVMaze</h2>
    <form method="GET" class="flex flex-col sm:flex-row gap-2 mb-6">
      <input type="text" name="q" placeholder="Search for a show..." value="${query ?? ""}" autofocus class="input input-bordered flex-1" />
      <button class="btn btn-primary">Search</button>
    </form>
    <div>${resultsHtml}</div>
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
