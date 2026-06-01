/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
/**
 * TV Tracker views — @remix-run/ui (Remix 3) JSX, server-rendered to HTML strings.
 *
 * NOTE: the JSX-source pragma on the first line is load-bearing — it tells esbuild/tsx to
 * compile JSX to the Remix runtime even if tsconfig.json isn't present (e.g. a misconfigured
 * container). Without it JSX falls back to React.createElement and every view throws
 * "React is not defined". (Do not repeat the literal pragma token in prose — esbuild scans all
 * comments for it and would use the following word as the import source.)
 *
 * Notes on @remix-run/ui 0.2.0:
 *  - Plain `(props) => <jsx>` functions can't be used as JSX *tags* (the runtime expects a
 *    two-stage component that returns a render function). For static SSR we instead CALL the
 *    helpers directly — `{Card({ ... })}` — so they return intrinsic RemixElements. Proven to
 *    render correctly; also keeps TypeScript happy.
 *  - Text children and attribute values are auto-escaped, so no manual esc() is needed.
 *  - <script> text content is also escaped (would break inline JS), so the client script lives
 *    in /static/app.js, referenced via <script src>.
 *  - safeUrl() still allowlists http(s) URLs for href/src (scheme check, not escaping).
 */

import { renderToString } from "@remix-run/ui/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type * as db from "./db.ts";

/**
 * Cache-busting version for the precompiled stylesheet. Hash of static/app.css,
 * computed once at startup, so the `?v=` query changes whenever the CSS does
 * (the static handler serves it with `immutable` caching). Falls back to a
 * constant if the file isn't present (shouldn't happen — built in the image).
 */
const CSS_VERSION = (() => {
  try {
    const p = fileURLToPath(new URL("./static/app.css", import.meta.url));
    return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
  } catch {
    return "0";
  }
})();

/** @remix-run/ui's renderToString takes no doctype option, so we prepend it. */
async function render(node: unknown): Promise<string> {
  return "<!DOCTYPE html>\n" + (await renderToString(node as never));
}

/** onchange isn't in the ui JSX prop types; spread it via this cast helper. */
const onChangeSubmit = { onchange: "this.form.submit()" } as Record<string, string>;

/** Validate URL is safe for use in href/src attributes (scheme allowlist). */
export function safeUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "watching": return "badge-primary";
    case "completed": return "badge-success";
    case "queued": return "badge-warning";
    case "dropped": return "badge-error";
    default: return "badge-ghost";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ============ SHARED HEAD / LAYOUT ============

const NAV_STYLE = `
        .episode-item.watched { opacity: 0.5; }
        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          display: flex;
          padding-bottom: env(safe-area-inset-bottom, 0);
        }
        .mobile-nav a {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 8px 0;
          text-decoration: none;
          font-size: 11px;
          transition: color 0.15s;
        }
      `;

function appLayout(title: string, children: unknown) {
  return (
    <html lang="en" data-theme="abyss">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`${title} - TV Tracker`}</title>
        <link rel="icon" type="image/x-icon" href="/static/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TV Tracker" />
        <link href={`/static/app.css?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
        <style>{NAV_STYLE}</style>
      </head>
      <body class="min-h-screen bg-base-100 pb-20 lg:pb-0">
        <div class="hidden lg:block sticky top-0 z-40 bg-base-200/95 backdrop-blur border-b border-base-300">
          <div class="container mx-auto max-w-6xl px-4 flex items-center h-14">
            <a href="/" class="font-bold text-lg mr-8">📺 TV Tracker</a>
            <nav class="flex gap-1">
              <a href="/" class="btn btn-ghost btn-sm">Home</a>
              <a href="/upcoming" class="btn btn-ghost btn-sm">Upcoming</a>
              <a href="/shows" class="btn btn-ghost btn-sm">All Shows</a>
            </nav>
            <div class="ml-auto">
              <a href="/search" class="btn btn-primary btn-sm">+ Add Show</a>
            </div>
          </div>
        </div>

        <div class="lg:hidden sticky top-0 z-40 bg-base-200/95 backdrop-blur border-b border-base-300">
          <div class="flex items-center justify-center h-12 px-4">
            <a href="/" class="font-bold text-lg">📺 TV Tracker</a>
          </div>
        </div>

        <div class="container mx-auto px-3 py-4 max-w-6xl">{children as never}</div>

        <nav class="mobile-nav lg:hidden bg-base-200 border-t border-base-300">
          <a href="/" class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span>Home</span>
          </a>
          <a href="/upcoming" class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span>Upcoming</span>
          </a>
          <a href="/search" class="text-primary font-semibold">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
            <span>Add</span>
          </a>
          <a href="/shows" class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            <span>Shows</span>
          </a>
        </nav>
        <script src="/static/app.js"></script>
      </body>
    </html>
  );
}

// ============ DASHBOARD ============

export interface DashboardData {
  progress: db.ShowProgress[];
  unwatched: db.UpcomingEpisode[];
  showsById: Map<number, db.Show>;
}

function progressCard(p: db.ShowProgress, show: db.Show | undefined) {
  const imgSrc = safeUrl(show?.image_url);
  const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
  const meta =
    (p.service ?? "Unknown") +
    (p.total_episodes > 0 ? ` · ${p.watched_episodes}/${p.total_episodes} episodes` : "") +
    " · ";
  return (
    <a href={`/show/${p.show_id}`} class="card bg-base-200 shadow-sm hover:bg-base-300 transition-colors cursor-pointer no-underline">
      <div class="card-body p-4 flex-row gap-3">
        {imgSrc
          ? <img src={imgSrc} alt="" class="w-16 h-24 object-cover rounded-md shrink-0 bg-base-300" loading="lazy" />
          : <div class="w-16 h-24 rounded-md bg-base-300 shrink-0"></div>}
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-start justify-between gap-2 mb-1">
            <h3 class="font-semibold text-sm">{p.title}</h3>
            <span class={`badge ${statusBadgeClass(p.status)} badge-sm`}>{p.status}</span>
          </div>
          <div class="text-xs text-base-content/60">
            {meta}
            {p.next_episode
              ? <>Next: S{p.next_episode.season}E{p.next_episode.episode}{p.next_episode.air_date
                  ? <> (<span class="ep-date" data-date={p.next_episode.air_date}>{p.next_episode.air_date}</span>)</>
                  : ""}</>
              : "Up to date"}
          </div>
          {p.total_episodes > 0 ? <progress class="progress progress-primary w-full mt-2" value={String(pct)} max="100"></progress> : ""}
        </div>
      </div>
    </a>
  );
}

function unwatchedRow(ep: db.UpcomingEpisode) {
  return (
    <div class="episode-item flex flex-wrap items-center gap-2 md:gap-4 p-3 bg-base-200 rounded-lg" id={`dash-ep-${ep.show_id}-${ep.season_number}-${ep.episode_number}`}>
      <span class="ep-date text-sm whitespace-nowrap" data-date={ep.air_date}>{ep.air_date}</span>
      <span class="font-semibold text-sm min-w-[50px]">S{ep.season_number}E{ep.episode_number}</span>
      <span class="flex-1 min-w-[150px] text-sm">
        <a href={`/show/${ep.show_id}`} class="link link-hover">{ep.show_title}</a>
        {ep.episode_title ? ` - ${ep.episode_title}` : ""}
      </span>
      <button class="btn btn-primary btn-sm watch-btn" data-show={String(ep.show_id)} data-season={String(ep.season_number)} data-episode={String(ep.episode_number)} data-watched="0">✓ Watch</button>
    </div>
  );
}

export function renderDashboard(d: DashboardData): Promise<string> {
  return render(
    appLayout("Dashboard", (
      <>
        <h2 class="text-lg font-bold mb-4">What to Watch Next</h2>
        {d.unwatched.length === 0
          ? <p class="text-base-content/60">All caught up! 🎉</p>
          : <div class="flex flex-col gap-2">{d.unwatched.map((ep) => unwatchedRow(ep))}</div>}

        <h2 class="text-lg font-bold mb-4 mt-8">Currently Watching</h2>
        {d.progress.length === 0
          ? <p class="text-base-content/60">No shows being tracked</p>
          : <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{d.progress.map((p) => progressCard(p, d.showsById.get(p.show_id)))}</div>}
      </>
    ))
  );
}

// ============ UPCOMING ============

export interface UpcomingData {
  days: number;
  groups: { week: number; label: string; eps: db.UpcomingEpisode[] }[];
  empty: boolean;
}

function upcomingCard(ep: db.UpcomingEpisode) {
  const imgSrc = safeUrl(ep.image_url);
  return (
    <a href={`/show/${ep.show_id}`} class="card bg-base-200 shadow-sm hover:bg-base-300 transition-colors no-underline">
      <div class="card-body p-3 flex-row gap-3 items-center">
        {imgSrc
          ? <img src={imgSrc} alt="" class="w-14 h-20 sm:w-16 sm:h-24 object-cover rounded-md shrink-0 bg-base-300" loading="lazy" />
          : <div class="w-14 h-20 sm:w-16 sm:h-24 rounded-md bg-base-300 shrink-0 flex items-center justify-center text-2xl">📺</div>}
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-sm truncate">{ep.show_title}</h3>
          <p class="text-xs text-base-content/60 truncate">S{ep.season_number}E{ep.episode_number}{ep.episode_title ? ` · ${ep.episode_title}` : ""}</p>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <span class="ep-date text-xs" data-date={ep.air_date}>{ep.air_date}</span>
            {ep.service ? <span class="text-xs text-base-content/40">· {ep.service}</span> : ""}
          </div>
        </div>
      </div>
    </a>
  );
}

export function renderUpcoming(d: UpcomingData): Promise<string> {
  return render(
    appLayout("Upcoming", (
      <>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 class="text-lg font-bold">Upcoming Episodes</h2>
          <form method="GET">
            <select name="days" {...onChangeSubmit} class="select select-bordered select-sm">
              {[7, 14, 30, 60].map((v) => <option value={String(v)} selected={d.days === v}>{`${v} days`}</option>)}
            </select>
          </form>
        </div>
        {d.empty
          ? <p class="text-base-content/60">No upcoming episodes</p>
          : <>{d.groups.map((g) => (
              <section class="mb-6">
                <h3 class="text-base font-bold text-base-content/70 mb-3">{g.label} <span class="text-base-content/40 font-normal">({g.eps.length})</span></h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">{g.eps.map((ep) => upcomingCard(ep))}</div>
              </section>
            ))}</>}
      </>
    ))
  );
}

// ============ ALL SHOWS ============

export function renderShows(shows: db.Show[], status: string | undefined): Promise<string> {
  const statuses: db.Show["status"][] = ["watching", "completed", "queued", "dropped"];
  return render(
    appLayout("All Shows", (
      <>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 class="text-lg font-bold">{`All Shows (${shows.length})`}</h2>
          <form method="GET">
            <select name="status" {...onChangeSubmit} class="select select-bordered select-sm">
              <option value="" selected={!status}>All</option>
              {statuses.map((s) => <option value={s} selected={status === s}>{cap(s)}</option>)}
            </select>
          </form>
        </div>
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr><th>Title</th><th>Status</th><th>Service</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {shows.map((s) => (
                <tr>
                  <td><a href={`/show/${s.id}`} class="link link-hover">{s.title}</a></td>
                  <td><span class={`badge ${statusBadgeClass(s.status)} badge-sm`}>{s.status}</span></td>
                  <td>{s.service}</td>
                  <td class="text-base-content/60">{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ))
  );
}

// ============ SHOW DETAIL ============

export interface ShowDetailData {
  show: db.Show;
  progress: db.ShowProgress | null;
  seasons: { season: db.Season; episodes: db.Episode[] }[];
}

function episodeRow(showId: number, seasonNumber: number, e: db.Episode) {
  return (
    <div class={`episode-item flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 p-3 bg-base-300 rounded-lg ${e.watched ? "watched" : ""}`} id={`ep-${seasonNumber}-${e.episode_number}`}>
      <span class="font-semibold text-sm min-w-[50px] md:min-w-[60px]">E{e.episode_number}</span>
      <span class="flex-1 min-w-[150px] text-sm">{e.title}</span>
      {e.air_date ? <span class="ep-date text-sm whitespace-nowrap" data-date={e.air_date}>{e.air_date}</span> : ""}
      <button class={`btn btn-sm watch-btn ${e.watched ? "btn-ghost" : "btn-primary"}`} data-show={String(showId)} data-season={String(seasonNumber)} data-episode={String(e.episode_number)} data-watched={e.watched ? "1" : "0"}>{e.watched ? "✕" : "✓"}</button>
    </div>
  );
}

function seasonCard(showId: number, season: db.Season, episodes: db.Episode[]) {
  const watchedCount = episodes.filter((e) => e.watched).length;
  const allWatched = watchedCount === episodes.length && episodes.length > 0;
  return (
    <div class="card bg-base-200 shadow-sm mb-4">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 class="card-title text-base">Season {season.season_number}</h3>
          <div class="flex items-center gap-2">
            <span class="text-base-content/60 text-sm watched-count">{watchedCount}/{episodes.length} watched</span>
            {episodes.length > 0
              ? <button class={`btn btn-xs season-watch-all-btn ${allWatched ? "btn-ghost" : "btn-outline btn-primary"}`} data-show={String(showId)} data-season={String(season.season_number)} data-watched={allWatched ? "1" : "0"}>{allWatched ? "Unmark all" : "Mark all"}</button>
              : ""}
          </div>
        </div>
        <div class="flex flex-col gap-2">{episodes.map((e) => episodeRow(showId, season.season_number, e))}</div>
      </div>
    </div>
  );
}

export function renderShowDetail(d: ShowDetailData): Promise<string> {
  const { show, progress } = d;
  const imgSrc = safeUrl(show.image_url);
  const pct = progress && progress.total_episodes > 0 ? Math.round((progress.watched_episodes / progress.total_episodes) * 100) : 0;
  const statuses: db.Show["status"][] = ["watching", "completed", "queued", "dropped"];
  return render(
    appLayout(show.title, (
      <>
        <div class="flex gap-4 mb-6">
          {imgSrc ? <img src={imgSrc} alt="" class="w-20 h-30 sm:w-24 sm:h-36 object-cover rounded-lg shrink-0 bg-base-300" loading="lazy" /> : ""}
          <div class="flex-1">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <h2 class="text-xl font-bold">{show.title}</h2>
                <p class="text-sm text-base-content/60">{show.service ?? "Unknown service"} · Added {show.added_at?.split("T")[0]}</p>
              </div>
              <span class={`badge ${statusBadgeClass(show.status)}`}>{show.status}</span>
            </div>
            {show.notes ? <p class="text-base-content/60 text-sm mb-2">{show.notes}</p> : ""}
            <div class="flex flex-wrap gap-2">
              <form method="POST" action="/api/status" class="inline">
                <input type="hidden" name="show_id" value={String(show.id)} />
                <select name="status" {...onChangeSubmit} class="select select-bordered select-sm">
                  {statuses.map((s) => <option value={s} selected={show.status === s}>{cap(s)}</option>)}
                </select>
              </form>
              <form method="POST" action="/api/refresh" class="inline">
                <input type="hidden" name="show_id" value={String(show.id)} />
                <button class="btn btn-ghost btn-sm">↻ Refresh</button>
              </form>
            </div>
          </div>
        </div>
        {progress && progress.total_episodes > 0
          ? <div class="card bg-base-200 shadow-sm mb-4">
              <div class="card-body p-4">
                <p class="text-sm">{`Progress: ${progress.watched_episodes}/${progress.total_episodes} episodes (${pct}%)`}</p>
                <progress class="progress progress-primary w-full mt-2" value={String(progress.watched_episodes)} max={String(progress.total_episodes)}></progress>
              </div>
            </div>
          : <div class="card bg-base-200 shadow-sm mb-4"><div class="card-body p-4"><p class="text-base-content/60">No episode data yet — hit ↻ Refresh to pull from TVMaze</p></div></div>}
        {d.seasons.map((s) => seasonCard(show.id, s.season, s.episodes))}
      </>
    ))
  );
}

export function renderNotFound(): Promise<string> {
  return render(appLayout("Not Found", <p class="text-base-content/60">Show not found</p>));
}

// ============ SEARCH ============

export interface SearchResultItem {
  tvmazeId: number;
  name: string;
  service: string;
  status: string;
  imageUrl: string;
  existingId: number | null;
}

function searchResult(r: SearchResultItem) {
  return (
    <div class="flex gap-3 items-center p-3 bg-base-200 rounded-lg mb-2">
      {r.imageUrl ? <img src={r.imageUrl} alt="" class="w-12 h-18 object-cover rounded shrink-0 bg-base-300" loading="lazy" /> : <div class="w-12 h-18 rounded bg-base-300 shrink-0"></div>}
      <div class="flex-1 min-w-0">
        <strong class="text-sm">{r.name}</strong>
        <div class="text-xs text-base-content/60">{r.service} · {r.status}</div>
      </div>
      <div class="shrink-0">
        {r.existingId
          ? <a href={`/show/${r.existingId}`} class="btn btn-ghost btn-sm">View</a>
          : <form method="POST" action="/api/add"><input type="hidden" name="tvmaze_id" value={String(r.tvmazeId)} /><button class="btn btn-primary btn-sm">+ Add</button></form>}
      </div>
    </div>
  );
}

export function renderSearch(query: string | null, results: SearchResultItem[] | null, error: string | null): Promise<string> {
  return render(
    appLayout("Add Show", (
      <>
        <h2 class="text-lg font-bold mb-4">Search TVMaze</h2>
        <form method="GET" class="flex flex-col sm:flex-row gap-2 mb-6">
          <input type="text" name="q" placeholder="Search for a show..." value={query ?? ""} autofocus inputmode="search" autocomplete="off" autocapitalize="words" class="input flex-1" style="height:3.5rem;font-size:1.125rem;padding:0 1.25rem;" />
          <button class="btn btn-primary" style="height:3.5rem;font-size:1.125rem;padding:0 1.5rem;">Search</button>
        </form>
        <div>
          {error ? <p class="text-base-content/60">{`Search failed: ${error}`}</p> : ""}
          {results ? <>{results.map((r) => searchResult(r))}</> : ""}
        </div>
      </>
    ))
  );
}

// ============ AUTH INTERSTITIAL ============

export function renderAuthInterstitial(token: string): Promise<string> {
  return render(
    <html lang="en" data-theme="abyss">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome — TV Tracker</title>
        <link href={`/static/app.css?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
      </head>
      <body class="min-h-screen flex items-center justify-center bg-base-100 p-4">
        <div class="card bg-base-200 shadow-xl w-full max-w-sm">
          <div class="card-body">
            <h1 class="card-title text-2xl">📺 TV Tracker</h1>
            <p class="text-base-content/60 text-sm mt-2">
              This link gives you access to the family TV tracker. Once authorized, you can browse shows, mark episodes as watched, and see what's coming up.
            </p>
            <div class="divider my-2"></div>
            <form method="POST" action={`/auth/${token}`}>
              <label class="flex items-center gap-3 cursor-pointer mb-4">
                <input type="checkbox" name="remember" value="1" checked class="checkbox checkbox-primary checkbox-sm" />
                <span class="text-sm">Remember this device for 90 days</span>
              </label>
              <button type="submit" class="btn btn-primary w-full">Continue</button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
}

// ============ PUBLIC LANDING ============

export interface LandingShow {
  show: db.Show;
  watched: number;
  total: number;
}

function landingCard(item: LandingShow) {
  const { show, watched, total } = item;
  const tvmazeUrl = show.tvmaze_id ? `https://www.tvmaze.com/shows/${show.tvmaze_id}` : "#";
  const progress = total > 0 ? `${watched}/${total} episodes` : "";
  const isDone = show.status === "completed";
  const imgSrc = safeUrl(show.image_url);
  return (
    <a href={tvmazeUrl} target="_blank" rel="noopener" class="group">
      <div class="relative overflow-hidden rounded-xl bg-base-200 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.03]">
        {imgSrc
          ? <img src={imgSrc} alt={show.title} class="w-full aspect-[2/3] object-cover" loading="lazy" />
          : <div class="w-full aspect-[2/3] bg-base-300 flex items-center justify-center text-4xl">📺</div>}
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        <div class="absolute bottom-0 left-0 right-0 p-3">
          <h3 class="font-bold text-white text-sm leading-tight">{show.title}</h3>
          <div class="flex items-center gap-2 mt-1">
            {isDone ? <span class="badge badge-success badge-xs">Finished</span> : <span class="badge badge-primary badge-xs">Watching</span>}
            {progress ? <span class="text-xs text-white/60">{progress}</span> : ""}
          </div>
          {show.service ? <span class="text-xs text-white/40">{show.service}</span> : ""}
        </div>
      </div>
    </a>
  );
}

export function renderLanding(watching: LandingShow[], completed: LandingShow[]): Promise<string> {
  return render(
    <html lang="en" data-theme="abyss">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>What We're Watching — TV Tracker</title>
        <link rel="icon" type="image/x-icon" href="/static/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png" />
        <link href={`/static/app.css?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
      </head>
      <body class="min-h-screen bg-base-100">
        <div class="max-w-5xl mx-auto px-4 py-12">
          <div class="text-center mb-10">
            <h1 class="text-3xl font-bold mb-2">📺 What We're Watching</h1>
            <p class="text-base-content/50 text-sm">A peek at our current TV rotation</p>
          </div>
          {watching.length > 0
            ? <section class="mb-12">
                <h2 class="text-lg font-semibold text-base-content/70 mb-4">Currently Watching</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{watching.map((item) => landingCard(item))}</div>
              </section>
            : ""}
          {completed.length > 0
            ? <section class="mb-12">
                <h2 class="text-lg font-semibold text-base-content/70 mb-4">Recently Finished</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{completed.map((item) => landingCard(item))}</div>
              </section>
            : ""}
          <footer class="text-center text-base-content/30 text-xs mt-16">Tracked with too much enthusiasm</footer>
        </div>
      </body>
    </html>
  );
}
