/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * All-shows page (route-local) — a status-filterable table of every tracked show.
 * The status <select> (onChangeSubmit) re-filters via GET; the root controller
 * narrows the query to a single status (or all). Each title links to the detail
 * page.
 */
import type { Handle } from "remix/ui";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { StatusBadge } from "../../ui/status-badge.tsx";
import { onChangeSubmit } from "../../ui/on-change-submit.ts";
import { cap } from "../../utils/text.ts";
import type { Show, ShowStatus } from "../../data/schema.ts";

const STATUSES: ShowStatus[] = ["watching", "completed", "queued", "dropped"];

function ShowRow(handle: Handle<{ show: Show }>) {
  return () => {
    const s = handle.props.show;
    return (
      <tr>
        <td>
          <a href={routes.showDetail.href({ id: String(s.id) })} class="link link-hover">
            {s.title}
          </a>
        </td>
        <td>
          <StatusBadge status={s.status} />
        </td>
        <td>{s.service}</td>
        <td class="text-base-content/60">{s.notes}</td>
      </tr>
    );
  };
}

export function ShowsPage(handle: Handle<{ shows: Show[]; status?: ShowStatus }>) {
  return () => {
    const { shows, status } = handle.props;
    return (
      <Layout title="All Shows">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 class="text-lg font-bold">{`All Shows (${shows.length})`}</h2>
          <form method="GET">
            <select name="status" {...onChangeSubmit} class="select select-bordered select-sm">
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
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Service</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {shows.map((s) => (
                <ShowRow show={s} />
              ))}
            </tbody>
          </table>
        </div>
      </Layout>
    );
  };
}
