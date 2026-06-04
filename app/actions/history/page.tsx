/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Watch-history page (route-local) — the last N watch actions (#4).
 *
 * watch_history is written on every mark/unmark but had no UI. Each entry shows
 * the action, the show (linked) and S/E when known, and when it happened. The
 * `.ep-date` span is reused so static/app.js renders the date relatively.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { RelativeDate } from "../../ui/relative-date.tsx";
import { DesktopTitle } from "../../ui/desktop-title.tsx";
import { cap } from "../../utils/text.ts";
import type { WatchHistoryEntry } from "../../data/schema.ts";

/** Map an action to a DaisyUI badge color. */
function actionBadge(action: WatchHistoryEntry["action"]): string {
  switch (action) {
    case "watched":
      return "badge-success";
    case "unwatched":
      return "badge-ghost";
    case "completed":
      return "badge-primary";
    case "dropped":
      return "badge-warning";
    default:
      return "badge-ghost";
  }
}

function HistoryRow(handle: Handle<{ entry: WatchHistoryEntry }>) {
  return () => {
    const e = handle.props.entry;
    const day = e.watched_at.split("T")[0];
    const epLabel =
      e.season_number != null && e.episode_number != null ? `S${e.season_number}E${e.episode_number}` : null;
    return (
      <div class="flex flex-wrap items-center gap-2 md:gap-3 p-3 bg-base-200 rounded-lg">
        <span class={`badge ${actionBadge(e.action)} badge-sm`}>{cap(e.action)}</span>
        <span class="flex-1 min-w-[150px] text-sm">
          {e.show_id != null && e.show_title ? (
            <a href={routes.showDetail.href({ id: String(e.show_id) })} class="link link-hover font-medium">
              {e.show_title}
            </a>
          ) : (
            <span class="text-base-content/60">(deleted show)</span>
          )}
          {epLabel ? <span class="text-base-content/60">{` · ${epLabel}`}</span> : ""}
          {e.episode_title ? <span class="text-base-content/60">{` · ${e.episode_title}`}</span> : ""}
        </span>
        <RelativeDate date={day} class="text-sm whitespace-nowrap text-base-content/50" />
      </div>
    );
  };
}

export function HistoryPage(handle: Handle<{ entries: WatchHistoryEntry[] }>) {
  return () => {
    const { entries } = handle.props;
    return (
      <Layout title="History">
        <DesktopTitle class="mb-4">Recently Watched</DesktopTitle>
        {entries.length === 0 ? (
          <p class="text-base-content/60">No watch history yet.</p>
        ) : (
          <div class="flex flex-col gap-2">
            {entries.map((entry) => (
              <HistoryRow entry={entry} />
            ))}
          </div>
        )}
      </Layout>
    );
  };
}
