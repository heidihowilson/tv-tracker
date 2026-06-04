/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Shared status badge — the app-level mapper from watch status to an
 * mk-badge variant (the design system never knows what "watching" means).
 * Dot variant: a leading currentColor status dot reads better than text alone.
 * Stateless: the handle exists only to satisfy the component contract.
 */
import type { Handle } from "remix/ui";

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "watching":
      return "mk-badge--accent";
    case "completed":
      return "mk-badge--success";
    case "queued":
      return "mk-badge--warning";
    case "dropped":
      return "mk-badge--danger";
    default:
      return "";
  }
}

export function StatusBadge(handle: Handle<{ status: string }>) {
  return () => (
    <span class={`mk-badge mk-badge--dot ${statusBadgeClass(handle.props.status)}`}>{handle.props.status}</span>
  );
}
