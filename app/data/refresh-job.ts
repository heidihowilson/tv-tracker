/**
 * Background "refresh all shows" job — a process-wide singleton.
 *
 * The loop walks every show, backfilling its TVMaze id/image when missing and
 * re-pulling episode data, with a 500ms courtesy gap between shows to respect
 * TVMaze's rate limit. That takes minutes, so we run it detached and expose live
 * progress: the web POST fires it and returns immediately (the dashboard shows a
 * banner that polls /api/refresh-status), while the machine GET awaits the run for
 * its final JSON.
 *
 * A single in-flight run is enforced (#6): a double-click or a second caller does
 * not spawn a parallel loop that would race `updateShow*` writes and burn the
 * TVMaze quota twice — it joins the run already in progress instead.
 */
import * as db from "./db.ts";
import * as tvmaze from "../../tvmaze.ts";
import * as tracker from "../../tracker.ts";

export interface RefreshProgress {
  running: boolean;
  total: number;
  refreshed: number;
  errors: number;
  startedAt: number | null;
  finishedAt: number | null;
}

let state: RefreshProgress = {
  running: false,
  total: 0,
  refreshed: 0,
  errors: 0,
  startedAt: null,
  finishedAt: null,
};
let inFlight: Promise<RefreshProgress> | null = null;

/** A snapshot of the current/last run's progress (safe to serialize). */
export function refreshProgress(): RefreshProgress {
  return { ...state };
}

export function isRefreshing(): boolean {
  return state.running;
}

/** The actual work — mutates `state` as it goes so pollers see live counts. */
async function run(): Promise<void> {
  const shows = await db.getAllShows();
  state.total = shows.length;

  for (const show of shows) {
    try {
      if (!show.tvmaze_id) {
        const result = await tvmaze.findShow(show.title);
        if (result && result.score > 0.5) {
          await db.updateShowTvmazeId(show.id, result.show.id);
          if (result.show.image?.medium) {
            await db.updateShowImage(show.id, result.show.image.medium);
          }
          show.tvmaze_id = result.show.id;
        }
      }
      if (show.tvmaze_id) {
        await tracker.populateShowData(show.id);
        state.refreshed++;
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`Error refreshing ${show.title}:`, e);
      state.errors++;
    }
  }
}

/**
 * Start a refresh unless one is already running.
 *
 * Returns whether THIS call started the run, plus a promise that resolves when
 * the (new or already in-flight) run finishes. Callers that want fire-and-forget
 * (the web POST) ignore `done`; callers that want the final result (the machine
 * GET) await it.
 */
export function startRefreshAll(): { started: boolean; done: Promise<RefreshProgress> } {
  if (state.running && inFlight) return { started: false, done: inFlight };

  state = { running: true, total: 0, refreshed: 0, errors: 0, startedAt: Date.now(), finishedAt: null };
  inFlight = (async () => {
    try {
      await run();
    } finally {
      state.running = false;
      state.finishedAt = Date.now();
    }
    return refreshProgress();
  })();

  return { started: true, done: inFlight };
}
