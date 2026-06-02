/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * API controller — the /api leaves.
 *
 * GET endpoints (today, upcoming, refreshAllGet) are machine-facing and guarded
 * by requireApiKey() at action level. Mutation POSTs (watch, status, refresh,
 * add, refreshAllPost) are web/cookie-facing and guarded by requireAuthed().
 * Action-level middleware keeps the dual-auth split that the original inline
 * checks expressed.
 *
 * /api/watch accepts BOTH JSON and form bodies; it branches on Content-Type. The
 * formData() middleware only parses form/multipart bodies, so the JSON branch
 * reads request.json() directly.
 */
import { createController } from "remix/router";
import { redirect } from "remix/response/redirect";
import { SuperHeaders } from "remix/headers";
import * as s from "remix/data-schema";

import { routes } from "../../routes.ts";
import * as db from "../../data/db.ts";
import * as tvmaze from "../../../tvmaze.ts";
import * as tracker from "../../../tracker.ts";
import { requireApiKey, requireAuthed } from "../../middleware/auth.ts";
import { daysQuery, watchJson, watchForm, statusForm, addForm, refreshForm } from "../../data/validators.ts";

/**
 * JSON for the machine-facing GET endpoints (today, upcoming, refresh-all).
 * These are meant to be polled, so they declare `Cache-Control: no-store` via
 * typed SuperHeaders — an honest contract that keeps polling clients from
 * caching a stale snapshot.
 */
function jsonNoStore(body: unknown): Response {
  const headers = new SuperHeaders();
  headers.cacheControl = { noStore: true };
  return Response.json(body, { headers });
}

async function refreshAllShows(): Promise<{ refreshed: number; errors: number; total: number }> {
  const shows = await db.getAllShows();
  let refreshed = 0;
  let errors = 0;

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

export default createController(routes.api, {
  actions: {
    today: {
      middleware: [requireApiKey()],
      async handler() {
        const today = new Date().toISOString().split("T")[0];
        const episodes = (await db.getUpcomingEpisodes(0)).filter((ep) => ep.air_date === today);
        return jsonNoStore({
          date: today,
          episodes: episodes.map((ep) => ({
            show: ep.show_title,
            season: ep.season_number,
            episode: ep.episode_number,
            title: ep.episode_title,
            service: ep.service,
            air_date: ep.air_date,
          })),
        });
      },
    },

    upcoming: {
      middleware: [requireApiKey()],
      async handler({ url }) {
        const parsed = s.parseSafe(daysQuery(7), Object.fromEntries(url.searchParams));
        const days = parsed.success ? parsed.value.days : 7;
        const today = new Date().toISOString().split("T")[0];
        const episodes = await db.getUpcomingEpisodes(days);
        return jsonNoStore({
          date: today,
          days_ahead: days,
          episodes: episodes.map((ep) => ({
            show: ep.show_title,
            season: ep.season_number,
            episode: ep.episode_number,
            title: ep.episode_title,
            service: ep.service,
            air_date: ep.air_date,
          })),
        });
      },
    },

    refreshAllGet: {
      middleware: [requireApiKey()],
      async handler() {
        const result = await refreshAllShows();
        return jsonNoStore(result);
      },
    },

    watch: {
      middleware: [requireAuthed()],
      async handler({ request, get }) {
        const contentType = request.headers.get("Content-Type") ?? "";

        // JSON branch (the no-reload client in app.js): echo `watched` back
        // verbatim and answer with a JSON ack — no redirect.
        if (contentType.includes("application/json")) {
          const parsed = s.parseSafe(watchJson, await request.json());
          if (!parsed.success) return Response.json({ error: parsed.issues }, { status: 400 });
          const { show_id, season, episode, watched } = parsed.value;
          // markEpisodeWatchedByNumber returns false when the season/episode does
          // not exist — surface that as a 404 instead of a false success ack.
          const ok = await db.markEpisodeWatchedByNumber(show_id, season, episode, watched ?? true);
          return Response.json({ ok, watched }, { status: ok ? 200 : 404 });
        }

        // Form branch (progressive-enhancement fallback): redirect back to the
        // page that posted the toggle. This is a browser form post, so on bad
        // input we redirect back (303 POST-redirect-GET) rather than emit JSON.
        const referer = request.headers.get("Referer");
        const parsed = s.parseSafe(watchForm, get(FormData));
        if (!parsed.success) return redirect(referer ?? routes.home.href(), 303);
        const { show_id, season, episode, watched } = parsed.value;
        await db.markEpisodeWatchedByNumber(show_id, season, episode, watched);
        return redirect(referer ?? routes.home.href(), 303);
      },
    },

    status: {
      middleware: [requireAuthed()],
      async handler({ get, request }) {
        // Browser <select> form post: bad input redirects back (POST-redirect-GET,
        // 303) instead of returning a JSON blob the browser cannot use.
        const parsed = s.parseSafe(statusForm, get(FormData));
        if (!parsed.success) return redirect(request.headers.get("Referer") ?? routes.shows.href(), 303);
        const { show_id, status } = parsed.value;
        await db.updateShowStatus(show_id, status);
        return redirect(routes.showDetail.href({ id: String(show_id) }), 303);
      },
    },

    refresh: {
      middleware: [requireAuthed()],
      async handler({ get, request }) {
        const parsed = s.parseSafe(refreshForm, get(FormData));
        if (!parsed.success) return redirect(request.headers.get("Referer") ?? routes.shows.href(), 303);
        await tracker.refreshShowData(parsed.value.show_id);
        return redirect(routes.showDetail.href({ id: String(parsed.value.show_id) }), 303);
      },
    },

    add: {
      middleware: [requireAuthed()],
      async handler({ get }) {
        const parsed = s.parseSafe(addForm, get(FormData));
        if (!parsed.success) return redirect(routes.search.href(), 303);
        const show = await tracker.addShowById(parsed.value.tvmaze_id);
        if (show) return redirect(routes.showDetail.href({ id: String(show.id) }), 303);
        return redirect(routes.search.href(), 303);
      },
    },

    refreshAllPost: {
      middleware: [requireAuthed()],
      async handler({ request }) {
        await refreshAllShows();
        return redirect(request.headers.get("Referer") ?? routes.home.href(), 303);
      },
    },
  },
});
