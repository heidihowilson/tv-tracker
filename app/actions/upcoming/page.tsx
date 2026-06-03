/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Upcoming page (route-local) — episodes airing within the selected window,
 * bucketed into relative-week groups by the root controller. A days <select>
 * (onChangeSubmit) re-filters via GET. Each card shows a thumbnail, the
 * episode label/title, the air date, and the service.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { onChangeSubmit } from "../../ui/on-change-submit.ts";
import { PosterThumb } from "../../ui/poster-thumb.tsx";
import { safeUrl } from "../../utils/url.ts";
import type { UpcomingEpisode } from "../../data/schema.ts";

export interface UpcomingData {
  days: number;
  groups: { week: number; label: string; eps: UpcomingEpisode[] }[];
  empty: boolean;
}

function UpcomingCard(handle: Handle<{ ep: UpcomingEpisode }>) {
  return () => {
    const ep = handle.props.ep;
    const imgSrc = safeUrl(ep.image_url);
    return (
      <a
        href={routes.showDetail.href({ id: String(ep.show_id) })}
        class="card bg-base-200 shadow-sm hover:bg-base-300 transition-colors no-underline"
      >
        <div class="card-body p-3 flex-row gap-3 items-center">
          <PosterThumb src={imgSrc} title={ep.show_title} class="w-14 h-20 sm:w-16 sm:h-24" />
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-sm truncate">{ep.show_title}</h3>
            <p class="text-xs text-base-content/60 truncate">
              S{ep.season_number}E{ep.episode_number}
              {ep.episode_title ? ` · ${ep.episode_title}` : ""}
            </p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="ep-date text-xs" data-date={ep.air_date}>
                {ep.air_date}
              </span>
              {ep.service ? <span class="text-xs text-base-content/40">· {ep.service}</span> : ""}
            </div>
          </div>
        </div>
      </a>
    );
  };
}

export function UpcomingPage(handle: Handle<{ data: UpcomingData }>) {
  return () => {
    const d = handle.props.data;
    return (
      <Layout title="Upcoming">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 class="text-lg font-bold hidden lg:block">Upcoming Episodes</h2>
          <form method="GET">
            <select name="days" {...onChangeSubmit} class="select select-bordered">
              {[7, 14, 30, 60].map((v) => (
                <option value={String(v)} selected={d.days === v}>{`${v} days`}</option>
              ))}
            </select>
          </form>
        </div>
        {d.empty ? (
          <p class="text-base-content/60">No upcoming episodes</p>
        ) : (
          d.groups.map((g) => (
            <section class="mb-6">
              <h3 class="text-base font-bold text-base-content/70 mb-3">
                {g.label} <span class="text-base-content/40 font-normal">({g.eps.length})</span>
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                {g.eps.map((ep) => (
                  <UpcomingCard ep={ep} />
                ))}
              </div>
            </section>
          ))
        )}
      </Layout>
    );
  };
}
