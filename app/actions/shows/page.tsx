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
import { StatusBadge } from "../../ui/status-badge.tsx";
import { onChangeSubmit } from "../../ui/on-change-submit.ts";
import { cap } from "../../utils/text.ts";
import { safeUrl } from "../../utils/url.ts";
import type { ShowListItem, ShowStatus } from "../../data/schema.ts";

const STATUSES: ShowStatus[] = ["watching", "completed", "queued", "dropped"];

/** One show row: poster, title/status/service, watched/total progress bar. */
function ShowRow(handle: Handle<{ item: ShowListItem }>) {
  return () => {
    const { show: s, watched, total } = handle.props.item;
    const imgSrc = safeUrl(s.image_url);
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
    return (
      <a
        href={routes.showDetail.href({ id: String(s.id) })}
        class="show-row card card-side bg-base-200 hover:bg-base-300 transition-colors no-underline"
        data-title={s.title.toLowerCase()}
      >
        <div class="card-body flex-row items-center gap-3 p-3">
          {imgSrc ? (
            <img src={imgSrc} alt="" class="poster w-12 h-18 object-cover rounded shrink-0 bg-base-300" loading="lazy" />
          ) : (
            <div class="poster w-12 h-18 rounded bg-base-300 shrink-0"></div>
          )}
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-semibold text-sm truncate">{s.title}</span>
              <StatusBadge status={s.status} />
            </div>
            <div class="text-xs text-base-content/60 mt-0.5">
              {s.service ?? "Unknown"}
              {total > 0 ? ` · ${watched}/${total} watched` : ""}
            </div>
            {total > 0 ? (
              <progress class="progress progress-primary w-full mt-1.5" value={String(pct)} max="100"></progress>
            ) : (
              ""
            )}
          </div>
        </div>
      </a>
    );
  };
}

export function ShowsPage(handle: Handle<{ items: ShowListItem[]; status?: ShowStatus }>) {
  return () => {
    const { items, status } = handle.props;
    return (
      <Layout title="All Shows">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 class="text-lg font-bold">{`All Shows (${items.length})`}</h2>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id="shows-filter"
              type="text"
              placeholder="Filter by title…"
              class="input input-bordered"
              autocomplete="off"
            />
            <form method="GET">
              <select name="status" {...onChangeSubmit} class="select select-bordered">
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
          <p class="text-base-content/60">{status ? `No ${status} shows.` : "No shows tracked yet."}</p>
        ) : (
          <div class="flex flex-col gap-2">
            {items.map((item) => (
              <ShowRow item={item} />
            ))}
          </div>
        )}
        {/* Shown by static/app.js when the client-side title filter matches nothing. */}
        <p id="shows-empty" class="hidden text-base-content/60 mt-4">
          No shows match your filter.
        </p>
      </Layout>
    );
  };
}
