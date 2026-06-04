/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Search page (route-local) — TVMaze search by ?q. Each result links to the
 * existing show (if already tracked) or offers a + Add form (POST /api/add).
 * The SearchResultItem contract is consumed by the root controller.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { PosterThumb } from "../../ui/poster-thumb.tsx";
import { DesktopTitle } from "../../ui/desktop-title.tsx";

export interface SearchResultItem {
  tvmazeId: number;
  name: string;
  service: string;
  status: string;
  imageUrl: string;
  existingId: number | null;
}

function SearchResult(handle: Handle<{ result: SearchResultItem }>) {
  return () => {
    const r = handle.props.result;
    return (
      <div class="mk-card p-3 flex gap-3 items-center mb-2">
        <PosterThumb src={r.imageUrl || null} title={r.name} class="w-12 h-18" />
        <div class="flex-1 min-w-0">
          <strong class="text-sm">{r.name}</strong>
          <div class="text-xs text-muted">
            {r.service} · {r.status}
          </div>
        </div>
        <div class="shrink-0">
          {r.existingId ? (
            <a
              href={routes.showDetail.href({ id: String(r.existingId) })}
              class="mk-btn mk-btn--ghost mk-btn--sm no-underline"
            >
              View
            </a>
          ) : (
            <form method="POST" action={routes.api.add.href()}>
              <input type="hidden" name="tvmaze_id" value={String(r.tvmazeId)} />
              <button class="mk-btn mk-btn--primary mk-btn--sm">+ Add</button>
            </form>
          )}
        </div>
      </div>
    );
  };
}

export function SearchPage(
  handle: Handle<{ query: string | null; results: SearchResultItem[] | null; error: string | null }>
) {
  return () => {
    const { query, results, error } = handle.props;
    return (
      <Layout title="Add Show" active="add">
        <DesktopTitle class="mb-4">Add Show</DesktopTitle>
        <form method="GET" class="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            type="text"
            name="q"
            placeholder="Search for a show..."
            value={query ?? ""}
            autofocus
            inputmode="search"
            autocomplete="off"
            autocapitalize="words"
            class="mk-input flex-1 w-full"
          />
          <button class="mk-btn mk-btn--primary">Search</button>
        </form>
        <div>
          {error ? (
            <div class="mk-alert mk-alert--danger mb-4" role="alert">
              <div class="mk-alert__title">Search failed</div>
              {error}
            </div>
          ) : (
            ""
          )}
          {results ? results.map((r) => <SearchResult result={r} />) : ""}
        </div>
      </Layout>
    );
  };
}
