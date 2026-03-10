/**
 * Migration Script
 * Import existing shows.json and history.json into SQLite
 */

import * as db from "./db.ts";
import * as tvmaze from "./tvmaze.ts";

interface OldShow {
  title: string;
  season?: number;
  episode?: number;
  episodes?: number;
  service: string;
  added?: string;
  completedAt?: string;
  premieres?: string;
  notes?: string | null;
}

interface OldHistory {
  title: string;
  season: number;
  episode?: number;
  episodes?: number;
  watchedAt?: string;
  completedAt?: string;
  action: string;
}

interface OldData {
  watching: OldShow[];
  completed: OldShow[];
  dropped: OldShow[];
  queued: OldShow[];
}

async function migrate() {
  const showsPath = new URL("./shows.json", import.meta.url).pathname;
  const historyPath = new URL("./history.json", import.meta.url).pathname;

  console.log("Loading existing data...\n");

  let showsData: OldData;
  let historyData: OldHistory[];

  try {
    showsData = JSON.parse(await Deno.readTextFile(showsPath));
    historyData = JSON.parse(await Deno.readTextFile(historyPath));
  } catch (e) {
    console.log("Could not read existing files:", e);
    return;
  }

  const showMap = new Map<string, number>(); // title -> db id

  // Process shows by status
  for (const status of ["watching", "completed", "dropped", "queued"] as const) {
    const shows = showsData[status] || [];
    console.log(`Processing ${status}: ${shows.length} shows`);

    for (const show of shows) {
      console.log(`  - ${show.title}`);

      // Check if already exists
      const existing = db.getShowByTitle(show.title);
      if (existing) {
        showMap.set(show.title.toLowerCase(), existing.id);
        console.log(`    (already exists)`);
        continue;
      }

      // Try to find on TVMaze
      let tvmazeId: number | undefined;
      let tvmazeShow: tvmaze.TvMazeShow | undefined;

      try {
        const result = await tvmaze.findShow(show.title);
        if (result && result.show.name.toLowerCase() === show.title.toLowerCase()) {
          tvmazeId = result.show.id;
          tvmazeShow = result.show;
          console.log(`    Found TVMaze ID: ${tvmazeId}`);
        } else if (result) {
          // Close match?
          console.log(`    TVMaze match: "${result.show.name}" (score: ${result.score.toFixed(2)})`);
          if (result.score > 5) {
            tvmazeId = result.show.id;
            tvmazeShow = result.show;
          }
        }
      } catch (e) {
        console.log(`    TVMaze lookup failed: ${e}`);
      }

      // Add to database
      const addedAt = show.added || show.completedAt || new Date().toISOString();
      const id = db.addShow(show.title, {
        tvmaze_id: tvmazeId,
        service: show.service,
        status,
        notes: show.notes ?? undefined,
        added_at: addedAt,
      });

      showMap.set(show.title.toLowerCase(), id);

      // If we got TVMaze data, populate episodes
      if (tvmazeId) {
        try {
          const seasons = await tvmaze.getSeasons(tvmazeId);
          const episodes = await tvmaze.getEpisodes(tvmazeId);

          for (const season of seasons) {
            db.addSeason(id, season.number, {
              episode_count: season.episodeOrder ?? undefined,
              premiered: season.premiereDate ?? undefined,
              ended: season.endDate ?? undefined,
            });
          }

          for (const ep of episodes) {
            const season = db.getSeason(id, ep.season);
            if (season) {
              db.addEpisode(season.id, ep.number, {
                title: ep.name,
                air_date: ep.airdate ?? undefined,
                runtime: ep.runtime ?? undefined,
              });
            }
          }

          console.log(`    Imported ${seasons.length} seasons, ${episodes.length} episodes`);
        } catch (e) {
          console.log(`    Failed to fetch episodes: ${e}`);
        }
      } else {
        // No TVMaze data - create placeholder season/episodes based on existing progress
        if (show.season) {
          const seasonId = db.addSeason(id, show.season, {});
          if (show.episode) {
            // Create placeholder episodes up to current
            for (let i = 1; i <= show.episode; i++) {
              db.addEpisode(seasonId, i, {});
            }
          } else if (show.episodes) {
            // Completed season
            for (let i = 1; i <= show.episodes; i++) {
              db.addEpisode(seasonId, i, {});
            }
          }
          console.log(`    Created placeholder season ${show.season}`);
        }
      }

      // Small delay to respect rate limits
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Process watch history
  console.log(`\nProcessing watch history: ${historyData.length} entries`);

  for (const entry of historyData) {
    const showId = showMap.get(entry.title.toLowerCase());
    if (!showId) {
      console.log(`  Skipping history for unknown show: ${entry.title}`);
      continue;
    }

    const watchedAt = entry.watchedAt || entry.completedAt || new Date().toISOString();

    if (entry.action === "watched" && entry.episode) {
      // Mark specific episode as watched
      const season = db.getSeason(showId, entry.season);
      if (season) {
        const episode = db.getEpisode(season.id, entry.episode);
        if (episode) {
          // Update episode directly without creating duplicate history
          const dbInst = db.getDb();
          dbInst.prepare("UPDATE episodes SET watched = 1, watched_at = ? WHERE id = ?").run(watchedAt, episode.id);
        }
      }
    } else if (entry.action === "completed") {
      // Mark all episodes in season as watched
      const season = db.getSeason(showId, entry.season);
      if (season && entry.episodes) {
        const dbInst = db.getDb();
        const stmt = dbInst.prepare("UPDATE episodes SET watched = 1, watched_at = ? WHERE season_id = ?");
        stmt.run(watchedAt, season.id);
      }
    }

    // Add to history
    db.addWatchHistory({
      show_id: showId,
      action: entry.action === "completed" ? "completed" : "watched",
      watched_at: watchedAt,
    });
  }

  console.log("\nMigration complete!");

  // Print summary
  const allShows = db.getAllShows();
  console.log(`\nSummary:`);
  console.log(`  Watching: ${allShows.filter((s) => s.status === "watching").length}`);
  console.log(`  Completed: ${allShows.filter((s) => s.status === "completed").length}`);
  console.log(`  Dropped: ${allShows.filter((s) => s.status === "dropped").length}`);
  console.log(`  Queued: ${allShows.filter((s) => s.status === "queued").length}`);

  db.closeDb();
}

if (import.meta.main) {
  await migrate();
}
