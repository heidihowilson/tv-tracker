/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * All-shows page (route-local) — every tracked show as a poster row with a
 * watched/total progress bar (#3). A server-side status <select> (onChangeSubmit,
 * GET) narrows by status; a client-side text box (#shows-filter, wired in
 * static/app.js) filters the rendered rows by title without a reload. Each row
 * links to the detail page.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { PosterThumb } from "../../ui/poster-thumb.tsx";
import { TitleBadgeRow } from "../../ui/title-badge-row.tsx";
import { WatchProgress } from "../../ui/watch-progress.tsx";
import { DesktopTitle } from "../../ui/desktop-title.tsx";
import { onChangeSubmit } from "../../ui/on-change-submit.ts";
import { cap } from "../../utils/text.ts";
import { safeUrl } from "../../utils/url.ts";
import type { ShowListItem, ShowStatus } from "../../data/schema.ts";

const STATUSES: ShowStatus[] = ["watching", "completed", "queued", "dropped"];

/** One show row: poster, title/status/service, watched/total progress bar. */
function ShowRow(handle: Handle<{ item: ShowListItem }>) {
  return () => {
    const { show: s, watched, total } = handle.props.item;
    return (
      <a
        href={routes.showDetail.href({ id: String(s.id) })}
        class="show-row mk-card p-3 flex items-center gap-3 text-inherit hover:text-inherit no-underline hover:no-underline hover:bg-surface-2 active:bg-surface-2 transition-colors"
        data-title={s.title.toLowerCase()}
      >
        <PosterThumb src={safeUrl(s.image_url)} title={s.title} class="poster w-12 h-18" />
        <div class="flex-1 min-w-0">
          <TitleBadgeRow title={s.title} status={s.status} />
          <div class="text-xs text-muted mt-0.5 truncate">
            {s.service ?? "Unknown"}
            {total > 0 ? ` · ${watched}/${total} watched` : ""}
          </div>
          <WatchProgress watched={watched} total={total} class="mt-1.5" />
        </div>
      </a>
    );
  };
}

export function ShowsPage(handle: Handle<{ items: ShowListItem[]; status?: ShowStatus }>) {
  return () => {
    const { items, status } = handle.props;
    return (
      <Layout title={`All Shows (${items.length})`} active="shows">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div class="flex items-baseline gap-3">
            <DesktopTitle>{`All Shows (${items.length})`}</DesktopTitle>
            <a href={routes.history.href()} class="text-sm">
              History →
            </a>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id="shows-filter"
              type="text"
              placeholder="Filter by title…"
              class="mk-input flex-1 sm:flex-none sm:w-56"
              autocomplete="off"
            />
            <form method="GET">
              <select name="status" {...onChangeSubmit} class="mk-select">
                <option value="" selected={!status}>
                  All
                </option>
                {STATUSES.map((st) => (
                  <option value={st} selected={status === st}>
                    {cap(st)}
                  </option>
                ))}
              </select>
            </form>
          </div>
        </div>

        {items.length === 0 ? (
          <div class="mk-empty">
            <div class="mk-empty__title">{status ? `No ${status} shows` : "No shows tracked yet"}</div>
            <p class="mk-empty__message">
              {status ? "Try a different status filter." : "Search for a show to start tracking it."}
            </p>
            {status ? "" : (
              <a href={routes.search.href()} class="mk-empty__action mk-btn mk-btn--primary no-underline">
                + Add Show
              </a>
            )}
          </div>
        ) : (
          <div class="flex flex-col gap-2">
            {items.map((item) => (
              <ShowRow item={item} />
            ))}
          </div>
        )}
        {/* Shown by static/app.js when the client-side title filter matches nothing. */}
        <p id="shows-empty" class="hidden text-muted mt-4">
          No shows match your filter.
        </p>
      </Layout>
    );
  };
}
