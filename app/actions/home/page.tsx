/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Dashboard page (route-local) — the authed view of "/", the hub for the primary
 * job: "what should I watch next?".
 *
 * Sections: "Up Next" (recently-aired unwatched, each with a prominent one-tap ✓
 * Watch wired to static/app.js), "Currently Watching" (per-show progress cards),
 * and a "Coming Soon" peek (folds the Upcoming page in; links out to the full
 * list). "Refresh all" is demoted to a quiet maintenance action at the bottom.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { StatusBadge } from "../../ui/status-badge.tsx";
import { PosterThumb } from "../../ui/poster-thumb.tsx";
import { safeUrl } from "../../utils/url.ts";
import type { Show, ShowProgress, UpcomingEpisode } from "../../data/schema.ts";
import type { RefreshProgress } from "../../data/refresh-job.ts";

export interface DashboardData {
  /** Currently-watching shows, each progress row paired with its full show row. */
  watching: Array<{ progress: ShowProgress; show: Show }>;
  unwatched: UpcomingEpisode[];
  /** A peek at what's airing soon (folded-in Upcoming); full list at /upcoming. */
  comingSoon: UpcomingEpisode[];
  /** Live "refresh all" progress; the banner shows when `running` and JS polls. */
  refreshing: RefreshProgress;
}

/** One "up next" row: poster, show + episode, relative date, prominent ✓ Watch. */
function UnwatchedRow(handle: Handle<{ ep: UpcomingEpisode }>) {
  return () => {
    const ep = handle.props.ep;
    return (
      <div
        class="episode-item flex items-center gap-3 p-3 bg-base-200 rounded-xl"
        id={`dash-ep-${ep.show_id}-${ep.season_number}-${ep.episode_number}`}
      >
        <PosterThumb src={safeUrl(ep.image_url)} title={ep.show_title} class="w-11 h-16" />
        <div class="flex-1 min-w-0">
          <a href={routes.showDetail.href({ id: String(ep.show_id) })} class="link link-hover font-semibold text-sm">
            {ep.show_title}
          </a>
          <div class="text-xs text-base-content/60 truncate">
            S{ep.season_number}E{ep.episode_number}
            {ep.episode_title ? ` · ${ep.episode_title}` : ""}
          </div>
          <span class="ep-date text-xs text-base-content/50" data-date={ep.air_date}>
            {ep.air_date}
          </span>
        </div>
        <button
          class="btn btn-primary watch-btn shrink-0"
          data-show={String(ep.show_id)}
          data-season={String(ep.season_number)}
          data-episode={String(ep.episode_number)}
          data-watched="0"
        >
          ✓ Watch
        </button>
      </div>
    );
  };
}

/** One "currently watching" card: poster, stable title+badge row, next, progress. */
function ProgressCard(handle: Handle<{ progress: ShowProgress; show?: Show }>) {
  return () => {
    const { progress: p, show } = handle.props;
    const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
    const meta =
      (p.service ?? "Unknown") + (p.total_episodes > 0 ? ` · ${p.watched_episodes}/${p.total_episodes}` : "");
    return (
      <a
        href={routes.showDetail.href({ id: String(p.show_id) })}
        class="card bg-base-200 hover:bg-base-300 active:bg-base-300 transition-colors no-underline"
      >
        <div class="card-body p-3 flex-row gap-3 items-center">
          <PosterThumb src={safeUrl(show?.image_url)} title={p.title} class="w-12 h-18" />
          <div class="flex-1 min-w-0">
            {/* Stable single row: title truncates, badge never wraps below it. */}
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-sm truncate flex-1 min-w-0">{p.title}</h3>
              <StatusBadge status={p.status} />
            </div>
            <div class="text-xs text-base-content/60 truncate mt-0.5">
              {meta}
              {p.next_episode ? (
                <>
                  {" · Next "}
                  S{p.next_episode.season}E{p.next_episode.episode}
                  {p.next_episode.air_date ? (
                    <>
                      {" ("}
                      <span class="ep-date" data-date={p.next_episode.air_date}>
                        {p.next_episode.air_date}
                      </span>
                      {")"}
                    </>
                  ) : (
                    ""
                  )}
                </>
              ) : (
                " · Up to date"
              )}
            </div>
            {p.total_episodes > 0 ? (
              <progress class="progress progress-primary w-full mt-2" value={String(pct)} max="100"></progress>
            ) : (
              ""
            )}
          </div>
        </div>
      </a>
    );
  };
}

/** One compact "coming soon" row. */
function ComingSoonRow(handle: Handle<{ ep: UpcomingEpisode }>) {
  return () => {
    const ep = handle.props.ep;
    return (
      <a
        href={routes.showDetail.href({ id: String(ep.show_id) })}
        class="flex items-center gap-3 p-2.5 bg-base-200 rounded-lg no-underline hover:bg-base-300 active:bg-base-300 transition-colors"
      >
        <PosterThumb src={safeUrl(ep.image_url)} title={ep.show_title} class="w-9 h-13" />
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">{ep.show_title}</div>
          <div class="text-xs text-base-content/60 truncate">
            S{ep.season_number}E{ep.episode_number}
            {ep.episode_title ? ` · ${ep.episode_title}` : ""}
          </div>
        </div>
        <span class="ep-date text-xs text-base-content/50 shrink-0" data-date={ep.air_date}>
          {ep.air_date}
        </span>
      </a>
    );
  };
}

export function DashboardPage(handle: Handle<{ data: DashboardData }>) {
  return () => {
    const d = handle.props.data;
    return (
      <Layout title="Home">
        <div id="refresh-banner" class={`alert alert-info mb-4 ${d.refreshing.running ? "" : "hidden"}`} role="status">
          <span class="loading loading-spinner loading-sm"></span>
          <span id="refresh-banner-text">
            {d.refreshing.running ? `Refreshing ${d.refreshing.refreshed}/${d.refreshing.total || "…"}` : "Refreshing…"}
          </span>
        </div>

        <h2 class="text-lg font-bold mb-3">Up Next</h2>
        {d.unwatched.length === 0 ? (
          <p class="text-base-content/60 mb-8">All caught up! 🎉</p>
        ) : (
          <div class="flex flex-col gap-2 mb-8">
            {d.unwatched.map((ep) => (
              <UnwatchedRow ep={ep} />
            ))}
          </div>
        )}

        <h2 class="text-lg font-bold mb-3">Currently Watching</h2>
        {d.watching.length === 0 ? (
          <p class="text-base-content/60">No shows being tracked</p>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {d.watching.map((item) => (
              <ProgressCard progress={item.progress} show={item.show} />
            ))}
          </div>
        )}

        {d.comingSoon.length > 0 ? (
          <section class="mt-8">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-bold">Coming Soon</h2>
              <a href={routes.upcoming.href()} class="text-sm link link-hover text-primary">
                See all →
              </a>
            </div>
            <div class="flex flex-col gap-2">
              {d.comingSoon.map((ep) => (
                <ComingSoonRow ep={ep} />
              ))}
            </div>
          </section>
        ) : (
          ""
        )}

        {/* Demoted maintenance action — quiet, at the bottom. */}
        <div class="mt-10 pt-4 border-t border-base-300">
          <form method="POST" action={routes.api.refreshAllPost.href()}>
            <button id="refresh-all-btn" class="btn btn-ghost btn-sm text-base-content/50">
              ↻ Refresh all show data
            </button>
          </form>
        </div>
      </Layout>
    );
  };
}
