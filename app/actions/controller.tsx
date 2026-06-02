/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Root controller — owns the top-level page leaves plus /health.
 *
 * Every direct leaf key in the root route map must have a matching action here
 * (home, upcoming, shows, showDetail, search, health) or createController throws.
 * The auth and api nested route maps have their own controllers and are NOT keys
 * here.
 */
import { createController } from "remix/router";
import { Authed } from "../middleware/auth.ts";
import * as s from "remix/data-schema";

import { routes } from "../routes.ts";
import * as db from "../data/db.ts";
import * as tvmaze from "../../tvmaze.ts";
import { safeUrl } from "../utils/url.ts";
import { showIdParam, searchQuery, daysQuery, statusQuery } from "../data/validators.ts";
import { render } from "./render.tsx";
import { DashboardPage } from "./home/page.tsx";
import { LandingPage, type LandingShow } from "./landing/page.tsx";
import { UpcomingPage } from "./upcoming/page.tsx";
import { ShowsPage } from "./shows/page.tsx";
import { ShowDetailPage, NotFoundPage } from "./show/page.tsx";
import { SearchPage, type SearchResultItem } from "./search/page.tsx";
import type { Show } from "../data/schema.ts";

async function renderLanding(): Promise<Response> {
  const toLanding = async (sh: Show): Promise<LandingShow> => {
    const p = await db.getShowProgress(sh.id);
    return { show: sh, watched: p?.watched_episodes ?? 0, total: p?.total_episodes ?? 0 };
  };
  const watching = await Promise.all((await db.getShowsByStatus("watching")).map(toLanding));
  const completed = await Promise.all((await db.getShowsByStatus("completed")).map(toLanding));
  return render(<LandingPage watching={watching} completed={completed} />);
}

export default createController(routes, {
  actions: {
    async home({ get }) {
      // Unauthenticated visitors get the public landing gallery at "/".
      if (!get(Authed)) return renderLanding();

      const watching = await db.getDashboard();
      const unwatched = await db.getRecentlyAired(14);
      return render(<DashboardPage data={{ watching, unwatched }} />);
    },

    async upcoming({ url, get }) {
      // Same contract as home: unauthed visitors get the public landing (200),
      // never the private library.
      if (!get(Authed)) return renderLanding();

      const parsed = s.parseSafe(daysQuery(30), Object.fromEntries(url.searchParams));
      const days = parsed.success ? parsed.value.days : 30;
      const upcoming = await db.getUpcomingEpisodes(days);

      const today = new Date();
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const weekLabel = (w: number): string => {
        if (w === 0) return "This week";
        if (w === 1) return "Next week";
        return `In ${w} weeks`;
      };

      const groupMap = new Map<number, (typeof upcoming)[number][]>();
      for (const ep of upcoming) {
        const ad = new Date(ep.air_date + "T00:00:00");
        const adMid = new Date(ad.getFullYear(), ad.getMonth(), ad.getDate()).getTime();
        const diffDays = Math.round((adMid - todayMid) / 86400000);
        const week = Math.max(0, Math.floor(diffDays / 7));
        if (!groupMap.has(week)) groupMap.set(week, []);
        groupMap.get(week)!.push(ep);
      }
      const groups = [...groupMap.keys()]
        .sort((a, b) => a - b)
        .map((week) => ({ week, label: weekLabel(week), eps: groupMap.get(week)! }));

      return render(<UpcomingPage data={{ days, groups, empty: upcoming.length === 0 }} />);
    },

    async shows({ url, get }) {
      if (!get(Authed)) return renderLanding();

      const parsed = s.parseSafe(statusQuery, Object.fromEntries(url.searchParams));
      const status = parsed.success ? parsed.value.status : undefined;
      const shows = status ? await db.getShowsByStatus(status) : await db.getAllShows();
      return render(<ShowsPage shows={shows} status={status} />);
    },

    async showDetail({ params, get }) {
      if (!get(Authed)) return renderLanding();

      const parsed = s.parseSafe(showIdParam, params);
      if (!parsed.success) return render(<NotFoundPage />, { status: 404 });
      const show = await db.getShow(parsed.value.id);
      if (!show) return render(<NotFoundPage />, { status: 404 });

      const seasonRows = await db.getSeasons(show.id);
      const seasons = await Promise.all(
        seasonRows.map(async (season) => ({ season, episodes: await db.getEpisodes(season.id) }))
      );
      const progress = await db.getShowProgress(show.id);
      return render(<ShowDetailPage data={{ show, progress, seasons }} />);
    },

    async search({ url, get }) {
      if (!get(Authed)) return renderLanding();

      const parsed = s.parseSafe(searchQuery, Object.fromEntries(url.searchParams));
      const query = parsed.success && parsed.value.q ? parsed.value.q : null;
      let results: SearchResultItem[] | null = null;
      let error: string | null = null;

      if (query) {
        try {
          const found = await tvmaze.searchShows(query);
          results = await Promise.all(
            found.slice(0, 15).map(async (r) => ({
              tvmazeId: r.show.id,
              name: r.show.name,
              service: tvmaze.getService(r.show) ?? "Unknown",
              status: r.show.status,
              imageUrl: safeUrl(r.show.image?.medium),
              existingId: (await db.getShowByTvmazeId(r.show.id))?.id ?? null,
            }))
          );
        } catch (e) {
          error = String(e);
        }
      }

      return render(<SearchPage query={query} results={results} error={error} />);
    },

    health() {
      return new Response("OK");
    },
  },
});
