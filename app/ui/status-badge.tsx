/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Shared status badge. Stateless: the handle exists only to satisfy the
 * component contract; we read props and ignore the rest.
 */
import type { Handle } from "remix/ui";

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "watching":
      return "badge-primary";
    case "completed":
      return "badge-success";
    case "queued":
      return "badge-warning";
    case "dropped":
      return "badge-error";
    default:
      return "badge-ghost";
  }
}

export function StatusBadge(handle: Handle<{ status: string; size?: string }>) {
  return () => (
    <span class={`badge ${statusBadgeClass(handle.props.status)} ${handle.props.size ?? "badge-sm"}`}>
      {handle.props.status}
    </span>
  );
}
