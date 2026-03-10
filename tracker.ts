/**
 * TV Tracker - Main CLI and Library
 * Track shows, mark episodes watched, manage your watchlist
 */

import * as db from "./db.ts";
import * as tvmaze from "./tvmaze.ts";

// ============ HIGH-LEVEL OPERATIONS ============

/**
 * Add a new show from TVMaze search
 */
export async function addShowFromSearch(
  query: string,
  options: {
    status?: db.Show["status"];
    service?: string;
    notes?: string;
    populateEpisodes?: boolean;
  } = {}
): Promise<db.Show | null> {
  const result = await tvmaze.findShow(query);
  if (!result) {
    console.log(`No show found for: ${query}`);
    return null;
  }

  const show = result.show;
  const existing = db.getShowByTvmazeId(show.id);
  if (existing) {
    console.log(`Show already exists: ${existing.title}`);
    return existing;
  }

  const service = options.service ?? tvmaze.getService(show) ?? undefined;
  const imageUrl = show.image?.medium ?? undefined;
  const id = db.addShow(show.name, {
    tvmaze_id: show.id,
    service,
    status: options.status ?? "watching",
    notes: options.notes,
    image_url: imageUrl,
  });

  if (options.populateEpisodes !== false) {
    await populateShowData(id);
  }

  return db.getShow(id)!;
}

/**
 * Add show by TVMaze ID directly
 */
export async function addShowById(
  tvmazeId: number,
  options: {
    status?: db.Show["status"];
    service?: string;
    notes?: string;
    populateEpisodes?: boolean;
  } = {}
): Promise<db.Show | null> {
  const existing = db.getShowByTvmazeId(tvmazeId);
  if (existing) {
    console.log(`Show already exists: ${existing.title}`);
    return existing;
  }

  const show = await tvmaze.getShow(tvmazeId);
  const service = options.service ?? tvmaze.getService(show) ?? undefined;
  const imageUrl = show.image?.medium ?? undefined;

  const id = db.addShow(show.name, {
    tvmaze_id: show.id,
    service,
    status: options.status ?? "watching",
    notes: options.notes,
    image_url: imageUrl,
  });

  if (options.populateEpisodes !== false) {
    await populateShowData(id);
  }

  return db.getShow(id)!;
}

/**
 * Fetch and populate seasons/episodes from TVMaze
 */
export async function populateShowData(showId: number): Promise<void> {
  const show = db.getShow(showId);
  if (!show?.tvmaze_id) {
    console.log("Show not found or no TVMaze ID");
    return;
  }

  console.log(`Fetching data for: ${show.title}`);

  // Fetch show details to update image
  const tvmazeShow = await tvmaze.getShow(show.tvmaze_id);
  if (tvmazeShow.image?.medium && !show.image_url) {
    db.updateShowImage(showId, tvmazeShow.image.medium);
  }

  const seasons = await tvmaze.getSeasons(show.tvmaze_id);
  const episodes = await tvmaze.getEpisodes(show.tvmaze_id);

  // Add seasons
  for (const season of seasons) {
    db.addSeason(showId, season.number, {
      episode_count: season.episodeOrder ?? undefined,
      premiered: season.premiereDate ?? undefined,
      ended: season.endDate ?? undefined,
    });
  }

  // Add episodes
  for (const ep of episodes) {
    const season = db.getSeason(showId, ep.season);
    if (season) {
      db.addEpisode(season.id, ep.number, {
        title: ep.name,
        air_date: ep.airdate ?? undefined,
        runtime: ep.runtime ?? undefined,
      });
    }
  }

  console.log(`Added ${seasons.length} seasons, ${episodes.length} episodes`);
}

/**
 * Refresh show data from TVMaze (update episodes, check for new ones)
 */
export async function refreshShowData(showId: number): Promise<void> {
  await populateShowData(showId);
}

/**
 * Refresh all shows that have TVMaze IDs
 */
export async function refreshAllShows(): Promise<void> {
  const shows = db.getAllShows().filter((s) => s.tvmaze_id);
  for (const show of shows) {
    await refreshShowData(show.id);
  }
}

/**
 * Mark episode watched by show title and episode numbers
 */
export function markWatched(
  showTitle: string,
  season: number,
  episode: number | number[],
  watched: boolean = true
): boolean {
  const show = db.getShowByTitle(showTitle);
  if (!show) {
    console.log(`Show not found: ${showTitle}`);
    return false;
  }

  const episodes = Array.isArray(episode) ? episode : [episode];
  let success = true;

  for (const ep of episodes) {
    if (!db.markEpisodeWatchedByNumber(show.id, season, ep, watched)) {
      console.log(`Episode not found: S${season}E${ep}`);
      success = false;
    }
  }

  return success;
}

/**
 * Mark all episodes up to a certain point as watched
 */
export function markWatchedThrough(showTitle: string, season: number, episode: number): boolean {
  const show = db.getShowByTitle(showTitle);
  if (!show) {
    console.log(`Show not found: ${showTitle}`);
    return false;
  }

  const seasons = db.getSeasons(show.id);
  const episodeIds: number[] = [];

  for (const s of seasons) {
    if (s.season_number > season) break;

    const eps = db.getEpisodes(s.id);
    for (const ep of eps) {
      if (s.season_number === season && ep.episode_number > episode) break;
      if (!ep.watched) {
        episodeIds.push(ep.id);
      }
    }
  }

  if (episodeIds.length > 0) {
    db.batchMarkWatched(episodeIds, true);
    console.log(`Marked ${episodeIds.length} episodes as watched`);
  }

  return true;
}

/**
 * Change show status
 */
export function setStatus(showTitle: string, status: db.Show["status"]): boolean {
  const show = db.getShowByTitle(showTitle);
  if (!show) {
    console.log(`Show not found: ${showTitle}`);
    return false;
  }

  db.updateShowStatus(show.id, status);
  db.addWatchHistory({ show_id: show.id, action: status === "completed" ? "completed" : "dropped" });
  return true;
}

/**
 * Get shows currently being watched with progress
 */
export function getWatchingProgress(): db.ShowProgress[] {
  return db.getAllProgress();
}

/**
 * Get upcoming episodes for tracked shows
 */
export function getUpcoming(days: number = 14): db.UpcomingEpisode[] {
  return db.getUpcomingEpisodes(days);
}

/**
 * Get recently aired unwatched episodes
 */
export function getUnwatched(days: number = 7): db.UpcomingEpisode[] {
  return db.getRecentlyAired(days);
}

/**
 * Search TVMaze for shows (doesn't add, just returns results)
 */
export async function search(query: string): Promise<tvmaze.SearchResult[]> {
  return tvmaze.searchShows(query);
}

// ============ CLI ============

async function cli() {
  const args = Deno.args;
  const command = args[0];

  switch (command) {
    case "add": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.log("Usage: tracker add <show name>");
        break;
      }
      const show = await addShowFromSearch(query);
      if (show) {
        console.log(`Added: ${show.title} (${show.service ?? "unknown service"})`);
      }
      break;
    }

    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.log("Usage: tracker search <query>");
        break;
      }
      const results = await search(query);
      for (const r of results.slice(0, 10)) {
        const service = tvmaze.getService(r.show) ?? "N/A";
        console.log(`[${r.show.id}] ${r.show.name} (${service}) - ${r.show.status}`);
      }
      break;
    }

    case "watch": {
      // tracker watch "Show Name" S01E05
      // tracker watch "Show Name" 1 5
      const showTitle = args[1];
      let season: number, episode: number;

      if (args[2]?.match(/^S?\d+E\d+$/i)) {
        const match = args[2].match(/S?(\d+)E(\d+)/i)!;
        season = parseInt(match[1]);
        episode = parseInt(match[2]);
      } else {
        season = parseInt(args[2]);
        episode = parseInt(args[3]);
      }

      if (!showTitle || isNaN(season) || isNaN(episode)) {
        console.log('Usage: tracker watch "Show Name" S01E05');
        break;
      }

      if (markWatched(showTitle, season, episode)) {
        console.log(`Marked ${showTitle} S${season}E${episode} as watched`);
      }
      break;
    }

    case "watched-through": {
      const showTitle = args[1];
      const season = parseInt(args[2]);
      const episode = parseInt(args[3]);

      if (!showTitle || isNaN(season) || isNaN(episode)) {
        console.log('Usage: tracker watched-through "Show Name" <season> <episode>');
        break;
      }

      markWatchedThrough(showTitle, season, episode);
      break;
    }

    case "status": {
      const showTitle = args[1];
      const status = args[2] as db.Show["status"];

      if (!showTitle || !["watching", "completed", "dropped", "queued"].includes(status)) {
        console.log('Usage: tracker status "Show Name" <watching|completed|dropped|queued>');
        break;
      }

      if (setStatus(showTitle, status)) {
        console.log(`Set ${showTitle} to ${status}`);
      }
      break;
    }

    case "upcoming": {
      const days = parseInt(args[1]) || 14;
      const upcoming = getUpcoming(days);
      if (upcoming.length === 0) {
        console.log("No upcoming episodes");
      } else {
        console.log(`\nUpcoming episodes (next ${days} days):\n`);
        for (const ep of upcoming) {
          console.log(
            `${ep.air_date} | ${ep.show_title} S${ep.season_number}E${ep.episode_number}` +
              (ep.episode_title ? ` - ${ep.episode_title}` : "") +
              ` [${ep.service ?? "?"}]`
          );
        }
      }
      break;
    }

    case "unwatched": {
      const days = parseInt(args[1]) || 7;
      const unwatched = getUnwatched(days);
      if (unwatched.length === 0) {
        console.log("No unwatched episodes");
      } else {
        console.log(`\nUnwatched episodes (last ${days} days):\n`);
        for (const ep of unwatched) {
          console.log(
            `${ep.air_date} | ${ep.show_title} S${ep.season_number}E${ep.episode_number}` +
              (ep.episode_title ? ` - ${ep.episode_title}` : "") +
              ` [${ep.service ?? "?"}]`
          );
        }
      }
      break;
    }

    case "progress": {
      const progress = getWatchingProgress();
      if (progress.length === 0) {
        console.log("No shows being watched");
      } else {
        console.log("\nWatching Progress:\n");
        for (const p of progress) {
          const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
          const next = p.next_episode
            ? ` → Next: S${p.next_episode.season}E${p.next_episode.episode}` +
              (p.next_episode.air_date ? ` (${p.next_episode.air_date})` : "")
            : "";
          console.log(`${p.title}: ${p.watched_episodes}/${p.total_episodes} (${pct}%)${next} [${p.service ?? "?"}]`);
        }
      }
      break;
    }

    case "list": {
      const status = (args[1] as db.Show["status"]) || "watching";
      const shows = db.getShowsByStatus(status);
      console.log(`\n${status.toUpperCase()} (${shows.length}):\n`);
      for (const show of shows) {
        console.log(`  ${show.title} [${show.service ?? "?"}]${show.notes ? ` - ${show.notes}` : ""}`);
      }
      break;
    }

    case "refresh": {
      const showTitle = args[1];
      if (showTitle) {
        const show = db.getShowByTitle(showTitle);
        if (show) {
          await refreshShowData(show.id);
        } else {
          console.log(`Show not found: ${showTitle}`);
        }
      } else {
        console.log("Refreshing all shows...");
        await refreshAllShows();
        console.log("Done");
      }
      break;
    }

    case "info": {
      const showTitle = args[1];
      if (!showTitle) {
        console.log('Usage: tracker info "Show Name"');
        break;
      }
      const show = db.getShowByTitle(showTitle);
      if (!show) {
        console.log(`Show not found: ${showTitle}`);
        break;
      }
      const progress = db.getShowProgress(show.id);
      const seasons = db.getSeasons(show.id);

      console.log(`\n${show.title}`);
      console.log(`  Status: ${show.status}`);
      console.log(`  Service: ${show.service ?? "Unknown"}`);
      console.log(`  TVMaze ID: ${show.tvmaze_id ?? "None"}`);
      console.log(`  Added: ${show.added_at}`);
      if (show.notes) console.log(`  Notes: ${show.notes}`);
      if (progress) {
        console.log(`  Progress: ${progress.watched_episodes}/${progress.total_episodes} episodes`);
      }
      console.log(`\nSeasons: ${seasons.length}`);
      for (const s of seasons) {
        const eps = db.getEpisodes(s.id);
        const watched = eps.filter((e) => e.watched).length;
        console.log(`  S${s.season_number}: ${watched}/${eps.length} watched`);
      }
      break;
    }

    default:
      console.log(`
TV Tracker CLI

Commands:
  add <show name>              Add a new show from TVMaze search
  search <query>               Search TVMaze without adding
  watch "Show" S01E05          Mark episode as watched
  watched-through "Show" 1 5   Mark all episodes through S1E5 as watched
  status "Show" <status>       Set show status (watching/completed/dropped/queued)
  upcoming [days]              Show upcoming episodes (default: 14 days)
  unwatched [days]             Show recently aired unwatched episodes
  progress                     Show watching progress for all active shows
  list [status]                List shows by status (default: watching)
  refresh [show]               Refresh episode data from TVMaze
  info "Show"                  Show detailed info about a show
      `);
  }

  db.closeDb();
}

// Run CLI if executed directly
if (import.meta.main) {
  await cli();
}
