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
import { PosterThumb } from "../../ui/poster-thumb.tsx";
import { CardRow } from "../../ui/card-row.tsx";
import { TitleBadgeRow } from "../../ui/title-badge-row.tsx";
import { RelativeDate } from "../../ui/relative-date.tsx";
import { WatchProgress } from "../../ui/watch-progress.tsx";
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
        class="episode-item mk-card p-3 flex items-center gap-3"
        id={`dash-ep-${ep.show_id}-${ep.season_number}-${ep.episode_number}`}
      >
        <PosterThumb src={safeUrl(ep.image_url)} title={ep.show_title} class="w-11 h-16" />
        <div class="flex-1 min-w-0">
          <a href={routes.showDetail.href({ id: String(ep.show_id) })} class="font-semibold text-sm">
            {ep.show_title}
          </a>
          <div class="text-xs text-muted truncate">
            S{ep.season_number}E{ep.episode_number}
            {ep.episode_title ? ` · ${ep.episode_title}` : ""}
          </div>
          <RelativeDate date={ep.air_date} class="text-xs text-faint" />
        </div>
        <button
          class="mk-btn mk-btn--primary watch-btn shrink-0"
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
    const meta =
      (p.service ?? "Unknown") + (p.total_episodes > 0 ? ` · ${p.watched_episodes}/${p.total_episodes}` : "");
    return (
      <CardRow href={routes.showDetail.href({ id: String(p.show_id) })}>
        <PosterThumb src={safeUrl(show?.image_url)} title={p.title} class="w-12 h-18" />
        <div class="flex-1 min-w-0">
          <TitleBadgeRow title={p.title} status={p.status} />
          <div class="text-xs text-muted truncate mt-0.5">
            {meta}
            {p.next_episode ? (
              <>
                {" · Next "}
                S{p.next_episode.season}E{p.next_episode.episode}
                {p.next_episode.air_date ? (
                  <>
                    {" ("}
                    <RelativeDate date={p.next_episode.air_date} />
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
          <WatchProgress watched={p.watched_episodes} total={p.total_episodes} class="mt-2" />
        </div>
      </CardRow>
    );
  };
}

/** One compact "coming soon" row. */
function ComingSoonRow(handle: Handle<{ ep: UpcomingEpisode }>) {
  return () => {
    const ep = handle.props.ep;
    return (
      <CardRow href={routes.showDetail.href({ id: String(ep.show_id) })}>
        <PosterThumb src={safeUrl(ep.image_url)} title={ep.show_title} class="w-9 h-13" />
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">{ep.show_title}</div>
          <div class="text-xs text-muted truncate">
            S{ep.season_number}E{ep.episode_number}
            {ep.episode_title ? ` · ${ep.episode_title}` : ""}
          </div>
        </div>
        <RelativeDate date={ep.air_date} class="text-xs text-faint shrink-0" />
      </CardRow>
    );
  };
}

export function DashboardPage(handle: Handle<{ data: DashboardData }>) {
  return () => {
    const d = handle.props.data;
    return (
      <Layout title="Home" active="home">
        <div
          id="refresh-banner"
          class={`mk-alert mk-alert--info flex-row items-center gap-2 mb-4 ${d.refreshing.running ? "" : "hidden"}`}
          role="status"
        >
          <span class="mk-spinner mk-spinner--sm"></span>
          <span id="refresh-banner-text">
            {d.refreshing.running ? `Refreshing ${d.refreshing.refreshed}/${d.refreshing.total || "…"}` : "Refreshing…"}
          </span>
        </div>

        <h2 class="text-lg font-bold mb-3">Up Next</h2>
        {d.unwatched.length === 0 ? (
          <p class="text-muted mb-8">All caught up! 🎉</p>
        ) : (
          <div class="flex flex-col gap-2 mb-8">
            {d.unwatched.map((ep) => (
              <UnwatchedRow ep={ep} />
            ))}
          </div>
        )}

        <h2 class="text-lg font-bold mb-3">Currently Watching</h2>
        {d.watching.length === 0 ? (
          <div class="mk-empty">
            <div class="mk-empty__title">No shows yet</div>
            <p class="mk-empty__message">Track a show and it will land here.</p>
            <a href={routes.search.href()} class="mk-empty__action mk-btn mk-btn--primary no-underline">
              + Add Show
            </a>
          </div>
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
              <a href={routes.upcoming.href()} class="text-sm">
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
        <div class="mt-10">
          <hr class="mk-divider" />
          <form method="POST" action={routes.api.refreshAllPost.href()}>
            <button id="refresh-all-btn" class="mk-btn mk-btn--ghost mk-btn--sm text-faint">
              ↻ Refresh all show data
            </button>
          </form>
        </div>
      </Layout>
    );
  };
}
