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

/** Map an action to an mk-badge variant (plain tonal = the quiet "unwatched"). */
function actionBadge(action: WatchHistoryEntry["action"]): string {
  switch (action) {
    case "watched":
      return "mk-badge--success";
    case "completed":
      return "mk-badge--accent";
    case "dropped":
      return "mk-badge--warning";
    default:
      return "";
  }
}

function HistoryRow(handle: Handle<{ entry: WatchHistoryEntry }>) {
  return () => {
    const e = handle.props.entry;
    const epLabel =
      e.season_number != null && e.episode_number != null ? `S${e.season_number}E${e.episode_number}` : null;
    return (
      <div class="mk-card p-3 flex flex-wrap items-center gap-2 md:gap-3">
        <span class={`mk-badge ${actionBadge(e.action)}`}>{cap(e.action)}</span>
        <span class="flex-1 min-w-[150px] text-sm">
          {e.show_id != null && e.show_title ? (
            <a href={routes.showDetail.href({ id: String(e.show_id) })} class="font-medium">
              {e.show_title}
            </a>
          ) : (
            <span class="text-muted">(deleted show)</span>
          )}
          {epLabel ? <span class="text-muted">{` · ${epLabel}`}</span> : ""}
          {e.episode_title ? <span class="text-muted">{` · ${e.episode_title}`}</span> : ""}
        </span>
        {/* RelativeDate normalizes the full timestamp to YYYY-MM-DD itself. */}
        <RelativeDate date={e.watched_at} class="text-sm whitespace-nowrap text-faint" />
      </div>
    );
  };
}

export function HistoryPage(handle: Handle<{ entries: WatchHistoryEntry[] }>) {
  return () => {
    const { entries } = handle.props;
    return (
      <Layout title="History" active="shows">
        <DesktopTitle class="mb-4">Recently Watched</DesktopTitle>
        {entries.length === 0 ? (
          <div class="mk-empty">
            <div class="mk-empty__title">No watch history yet</div>
            <p class="mk-empty__message">Mark an episode watched and it will show up here.</p>
          </div>
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
