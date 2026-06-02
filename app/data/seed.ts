/**
 * Runtime data initialization.
 *
 * On startup, if the database is empty, import the legacy shows.json / history.json
 * seed files (skipped entirely when the DB already has shows). Lives in app/data
 * per the skill's "runtime data initialization" ownership rule.
 */
import { readFile } from "node:fs/promises";

import * as db from "./db.ts";
import * as tvmaze from "../../tvmaze.ts";
import * as tracker from "../../tracker.ts";

export async function seedIfEmpty(): Promise<void> {
  const count = await db.getShowCount();
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
        const existing = await db.getShowByTitle(show.title);
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
        const id = await db.addShow(show.title, {
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
        const season = await db.getSeason(showId, entry.season);
        if (season) {
          const episode = await db.getEpisode(season.id, entry.episode);
          if (episode) {
            await db.markEpisodeWatched(episode.id, true);
          }
        }
      } else if (entry.action === "completed" && entry.season) {
        const season = await db.getSeason(showId, entry.season);
        if (season) {
          const episodes = await db.getEpisodes(season.id);
          for (const ep of episodes) {
            await db.markEpisodeWatched(ep.id, true);
          }
        }
      }
    }

    console.log("Migration complete!");
  } catch (e) {
    console.error("Migration failed:", e);
  }
}
