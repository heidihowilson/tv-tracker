/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * The stable title + status row: title truncates, badge never wraps below it
 * (the phase-2 card-hierarchy fix, locked in as a component so it can't drift).
 */
import type { Handle } from "remix/ui";
import { StatusBadge } from "./status-badge.tsx";
import type { ShowStatus } from "../data/schema.ts";

export function TitleBadgeRow(handle: Handle<{ title: string; status: ShowStatus }>) {
  return () => (
    <div class="flex items-center gap-2">
      <span class="font-semibold text-sm truncate flex-1 min-w-0">{handle.props.title}</span>
      <StatusBadge status={handle.props.status} />
    </div>
  );
}
