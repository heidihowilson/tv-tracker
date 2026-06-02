/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Show-detail page (route-local) + NotFound page.
 *
 * Header: poster, title, service/added meta, status badge, inline status <select>
 * (POST /api/status, onChangeSubmit) and a ↻ Refresh button (POST /api/refresh).
 * Then a progress card, then one card per season. Episode rows and the per-season
 * "Mark all" control carry data-* attributes wired to static/app.js for no-reload
 * watch toggling. The ShowDetailData contract is consumed by the root controller.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { StatusBadge } from "../../ui/status-badge.tsx";
import { onChangeSubmit } from "../../ui/on-change-submit.ts";
import { cap } from "../../utils/text.ts";
import { safeUrl } from "../../utils/url.ts";
import type { Show, Season, Episode, ShowProgress, ShowStatus } from "../../data/schema.ts";

export interface ShowDetailData {
  show: Show;
  progress: ShowProgress | null;
  seasons: { season: Season; episodes: Episode[] }[];
}

const STATUSES: ShowStatus[] = ["watching", "completed", "queued", "dropped"];

export function NotFoundPage(_handle: Handle<{}>) {
  return () => (
    <Layout title="Not Found">
      <p class="text-base-content/60">Show not found</p>
    </Layout>
  );
}

/** One episode row with the no-reload watch toggle. */
function EpisodeRow(handle: Handle<{ showId: number; seasonNumber: number; ep: Episode }>) {
  return () => {
    const { showId, seasonNumber, ep: e } = handle.props;
    return (
      <div
        class={`episode-item flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 p-3 bg-base-300 rounded-lg ${e.watched ? "watched" : ""}`}
        id={`ep-${seasonNumber}-${e.episode_number}`}
      >
        <span class="font-semibold text-sm min-w-[50px] md:min-w-[60px]">E{e.episode_number}</span>
        <span class="flex-1 min-w-[150px] text-sm">{e.title}</span>
        {e.air_date ? (
          <span class="ep-date text-sm whitespace-nowrap" data-date={e.air_date}>
            {e.air_date}
          </span>
        ) : (
          ""
        )}
        <button
          class={`btn btn-sm watch-btn ${e.watched ? "btn-ghost" : "btn-primary"}`}
          data-show={String(showId)}
          data-season={String(seasonNumber)}
          data-episode={String(e.episode_number)}
          data-watched={e.watched ? "1" : "0"}
        >
          {e.watched ? "✕" : "✓"}
        </button>
      </div>
    );
  };
}

/** One season card: watched-count, "Mark all"/"Unmark all" control, episode list. */
function SeasonCard(handle: Handle<{ showId: number; season: Season; episodes: Episode[] }>) {
  return () => {
    const { showId, season, episodes } = handle.props;
    const watchedCount = episodes.filter((e) => e.watched).length;
    const allWatched = watchedCount === episodes.length && episodes.length > 0;
    return (
      <div class="card bg-base-200 shadow-sm mb-4">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 class="card-title text-base">Season {season.season_number}</h3>
            <div class="flex items-center gap-2">
              <span class="text-base-content/60 text-sm watched-count">
                {watchedCount}/{episodes.length} watched
              </span>
              {episodes.length > 0 ? (
                <button
                  class={`btn btn-xs season-watch-all-btn ${allWatched ? "btn-ghost" : "btn-outline btn-primary"}`}
                  data-show={String(showId)}
                  data-season={String(season.season_number)}
                  data-watched={allWatched ? "1" : "0"}
                >
                  {allWatched ? "Unmark all" : "Mark all"}
                </button>
              ) : (
                ""
              )}
            </div>
          </div>
          <div class="flex flex-col gap-2">
            {episodes.map((e) => (
              <EpisodeRow showId={showId} seasonNumber={season.season_number} ep={e} />
            ))}
          </div>
        </div>
      </div>
    );
  };
}

export function ShowDetailPage(handle: Handle<{ data: ShowDetailData }>) {
  return () => {
    const { show, progress, seasons } = handle.props.data;
    const imgSrc = safeUrl(show.image_url);
    const pct =
      progress && progress.total_episodes > 0
        ? Math.round((progress.watched_episodes / progress.total_episodes) * 100)
        : 0;
    return (
      <Layout title={show.title}>
        <div class="flex gap-4 mb-6">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              class="w-20 h-30 sm:w-24 sm:h-36 object-cover rounded-lg shrink-0 bg-base-300"
              loading="lazy"
            />
          ) : (
            ""
          )}
          <div class="flex-1">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <h2 class="text-xl font-bold">{show.title}</h2>
                <p class="text-sm text-base-content/60">
                  {show.service ?? "Unknown service"} · Added {show.added_at?.split("T")[0]}
                </p>
              </div>
              <StatusBadge status={show.status} size="" />
            </div>
            {show.notes ? <p class="text-base-content/60 text-sm mb-2">{show.notes}</p> : ""}
            <div class="flex flex-wrap gap-2">
              <form method="POST" action={routes.api.status.href()} class="inline">
                <input type="hidden" name="show_id" value={String(show.id)} />
                <select name="status" {...onChangeSubmit} class="select select-bordered select-sm">
                  {STATUSES.map((st) => (
                    <option value={st} selected={show.status === st}>
                      {cap(st)}
                    </option>
                  ))}
                </select>
              </form>
              <form method="POST" action={routes.api.refresh.href()} class="inline">
                <input type="hidden" name="show_id" value={String(show.id)} />
                <button class="btn btn-ghost btn-sm">↻ Refresh</button>
              </form>
              <form method="POST" action={routes.api.delete.href()} class="inline delete-form">
                <input type="hidden" name="show_id" value={String(show.id)} />
                <button class="btn btn-ghost btn-sm text-error">🗑 Delete</button>
              </form>
            </div>

            <details class="mt-3">
              <summary class="text-sm text-base-content/60 cursor-pointer select-none">Edit notes &amp; service</summary>
              <form method="POST" action={routes.api.update.href()} class="mt-2 flex flex-col gap-2 max-w-md">
                <input type="hidden" name="show_id" value={String(show.id)} />
                <input
                  name="service"
                  value={show.service ?? ""}
                  placeholder="Service (e.g. Netflix)"
                  class="input input-bordered input-sm"
                  autocomplete="off"
                />
                <textarea
                  name="notes"
                  placeholder="Notes"
                  rows={3}
                  class="textarea textarea-bordered textarea-sm"
                  value={show.notes ?? ""}
                ></textarea>
                <button class="btn btn-primary btn-sm self-start">Save</button>
              </form>
            </details>
          </div>
        </div>
        {progress && progress.total_episodes > 0 ? (
          <div class="card bg-base-200 shadow-sm mb-4">
            <div class="card-body p-4">
              <p class="text-sm">{`Progress: ${progress.watched_episodes}/${progress.total_episodes} episodes (${pct}%)`}</p>
              <progress
                class="progress progress-primary w-full mt-2"
                value={String(progress.watched_episodes)}
                max={String(progress.total_episodes)}
              ></progress>
            </div>
          </div>
        ) : (
          <div class="card bg-base-200 shadow-sm mb-4">
            <div class="card-body p-4">
              <p class="text-base-content/60">No episode data yet — hit ↻ Refresh to pull from TVMaze</p>
            </div>
          </div>
        )}
        {seasons.map((s) => (
          <SeasonCard showId={show.id} season={s.season} episodes={s.episodes} />
        ))}
      </Layout>
    );
  };
}
