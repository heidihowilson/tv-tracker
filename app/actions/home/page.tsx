/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Dashboard page (route-local) — the authed view of "/".
 *
 * Two sections: "What to Watch Next" (recently-aired-but-unwatched rows, each
 * with a no-reload ✓ Watch button wired to static/app.js via data-* attrs) and
 * "Currently Watching" (per-show progress cards with thumbnail, meta, next
 * episode, and a progress bar). The data contract (DashboardData) is consumed by
 * the root controller.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { StatusBadge } from "../../ui/status-badge.tsx";
import { safeUrl } from "../../utils/url.ts";
import type { Show, ShowProgress, UpcomingEpisode } from "../../data/schema.ts";
import type { RefreshProgress } from "../../data/refresh-job.ts";

export interface DashboardData {
  /** Currently-watching shows, each progress row paired with its full show row. */
  watching: Array<{ progress: ShowProgress; show: Show }>;
  unwatched: UpcomingEpisode[];
  /** Live "refresh all" progress; the banner shows when `running` and JS polls. */
  refreshing: RefreshProgress;
}

/** One "what to watch next" row with the no-reload watch button. */
function UnwatchedRow(handle: Handle<{ ep: UpcomingEpisode }>) {
  return () => {
    const ep = handle.props.ep;
    return (
      <div
        class="episode-item flex flex-wrap items-center gap-2 md:gap-4 p-3 bg-base-200 rounded-lg"
        id={`dash-ep-${ep.show_id}-${ep.season_number}-${ep.episode_number}`}
      >
        <span class="ep-date text-sm whitespace-nowrap" data-date={ep.air_date}>
          {ep.air_date}
        </span>
        <span class="font-semibold text-sm min-w-[50px]">
          S{ep.season_number}E{ep.episode_number}
        </span>
        <span class="flex-1 min-w-[150px] text-sm">
          <a href={routes.showDetail.href({ id: String(ep.show_id) })} class="link link-hover">
            {ep.show_title}
          </a>
          {ep.episode_title ? ` - ${ep.episode_title}` : ""}
        </span>
        <button
          class="btn btn-primary btn-sm watch-btn"
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

/** One "currently watching" card: thumbnail, meta, next-episode line, progress. */
function ProgressCard(handle: Handle<{ progress: ShowProgress; show?: Show }>) {
  return () => {
    const { progress: p, show } = handle.props;
    const imgSrc = safeUrl(show?.image_url);
    const pct = p.total_episodes > 0 ? Math.round((p.watched_episodes / p.total_episodes) * 100) : 0;
    const meta =
      (p.service ?? "Unknown") +
      (p.total_episodes > 0 ? ` · ${p.watched_episodes}/${p.total_episodes} episodes` : "") +
      " · ";
    return (
      <a
        href={routes.showDetail.href({ id: String(p.show_id) })}
        class="card bg-base-200 shadow-sm hover:bg-base-300 transition-colors cursor-pointer no-underline"
      >
        <div class="card-body p-4 flex-row gap-3">
          {imgSrc ? (
            <img src={imgSrc} alt="" class="w-16 h-24 object-cover rounded-md shrink-0 bg-base-300" loading="lazy" />
          ) : (
            <div class="w-16 h-24 rounded-md bg-base-300 shrink-0"></div>
          )}
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-1">
              <h3 class="font-semibold text-sm">{p.title}</h3>
              <StatusBadge status={p.status} />
            </div>
            <div class="text-xs text-base-content/60">
              {meta}
              {p.next_episode ? (
                <>
                  Next: S{p.next_episode.season}E{p.next_episode.episode}
                  {p.next_episode.air_date ? (
                    <>
                      {" "}
                      (
                      <span class="ep-date" data-date={p.next_episode.air_date}>
                        {p.next_episode.air_date}
                      </span>
                      )
                    </>
                  ) : (
                    ""
                  )}
                </>
              ) : (
                "Up to date"
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

export function DashboardPage(handle: Handle<{ data: DashboardData }>) {
  return () => {
    const d = handle.props.data;
    return (
      <Layout title="Dashboard">
        <div class="flex items-center justify-between mb-4 gap-2">
          <h2 class="text-lg font-bold">What to Watch Next</h2>
          <form method="POST" action={routes.api.refreshAllPost.href()}>
            <button type="submit" id="refresh-all-btn" class="btn btn-ghost btn-sm whitespace-nowrap">
              ↻ Refresh All
            </button>
          </form>
        </div>

        <div id="refresh-banner" class={`alert alert-info mb-4 ${d.refreshing.running ? "" : "hidden"}`} role="status">
          <span class="loading loading-spinner loading-sm"></span>
          <span id="refresh-banner-text">
            {d.refreshing.running ? `Refreshing ${d.refreshing.refreshed}/${d.refreshing.total || "…"}` : "Refreshing…"}
          </span>
        </div>

        {d.unwatched.length === 0 ? (
          <p class="text-base-content/60">All caught up! 🎉</p>
        ) : (
          <div class="flex flex-col gap-2">
            {d.unwatched.map((ep) => (
              <UnwatchedRow ep={ep} />
            ))}
          </div>
        )}

        <h2 class="text-lg font-bold mb-4 mt-8">Currently Watching</h2>
        {d.watching.length === 0 ? (
          <p class="text-base-content/60">No shows being tracked</p>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {d.watching.map((item) => (
              <ProgressCard progress={item.progress} show={item.show} />
            ))}
          </div>
        )}
      </Layout>
    );
  };
}
