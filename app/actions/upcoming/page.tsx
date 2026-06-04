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
import { CardRow } from "../../ui/card-row.tsx";
import { RelativeDate } from "../../ui/relative-date.tsx";
import { DesktopTitle } from "../../ui/desktop-title.tsx";
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
      <CardRow href={routes.showDetail.href({ id: String(ep.show_id) })}>
        <PosterThumb src={imgSrc} title={ep.show_title} class="w-14 h-20 sm:w-16 sm:h-24" />
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-sm truncate">{ep.show_title}</h3>
          <p class="text-xs text-base-content/60 truncate">
            S{ep.season_number}E{ep.episode_number}
            {ep.episode_title ? ` · ${ep.episode_title}` : ""}
          </p>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <RelativeDate date={ep.air_date} class="text-xs" />
            {ep.service ? <span class="text-xs text-base-content/40">· {ep.service}</span> : ""}
          </div>
        </div>
      </CardRow>
    );
  };
}

export function UpcomingPage(handle: Handle<{ data: UpcomingData }>) {
  return () => {
    const d = handle.props.data;
    return (
      <Layout title="Upcoming" active="home">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <DesktopTitle>Upcoming Episodes</DesktopTitle>
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
