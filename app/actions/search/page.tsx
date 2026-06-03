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
      <div class="flex gap-3 items-center p-3 bg-base-200 rounded-lg mb-2">
        {r.imageUrl ? (
          <img src={r.imageUrl} alt="" class="w-12 h-18 object-cover rounded shrink-0 bg-base-300" loading="lazy" />
        ) : (
          <div class="w-12 h-18 rounded bg-base-300 shrink-0"></div>
        )}
        <div class="flex-1 min-w-0">
          <strong class="text-sm">{r.name}</strong>
          <div class="text-xs text-base-content/60">
            {r.service} · {r.status}
          </div>
        </div>
        <div class="shrink-0">
          {r.existingId ? (
            <a href={routes.showDetail.href({ id: String(r.existingId) })} class="btn btn-ghost btn-sm">
              View
            </a>
          ) : (
            <form method="POST" action={routes.api.add.href()}>
              <input type="hidden" name="tvmaze_id" value={String(r.tvmazeId)} />
              <button class="btn btn-primary btn-sm">+ Add</button>
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
      <Layout title="Add Show">
        <h2 class="text-lg font-bold mb-4">Search TVMaze</h2>
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
            class="input input-bordered flex-1"
          />
          <button class="btn btn-primary">Search</button>
        </form>
        <div>
          {error ? <p class="text-base-content/60">{`Search failed: ${error}`}</p> : ""}
          {results ? results.map((r) => <SearchResult result={r} />) : ""}
        </div>
      </Layout>
    );
  };
}
