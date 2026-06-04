/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * A date that static/app.js rewrites to a relative label ("Today", "2d ago",
 * "Mar 8") and color-codes. The contract app.js expects: class `ep-date` plus a
 * YYYY-MM-DD `data-date`. The raw date is the no-JS fallback text.
 */
import type { Handle } from "remix/ui";

export function RelativeDate(handle: Handle<{ date: string; class?: string }>) {
  return () => (
    <span class={`ep-date ${handle.props.class ?? ""}`} data-date={handle.props.date}>
      {handle.props.date}
    </span>
  );
}
