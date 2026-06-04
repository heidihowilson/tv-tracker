/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * A date that static/app.js rewrites to a relative label ("Today", "2d ago",
 * "Mar 8") and color-codes. The contract app.js expects: class `ep-date` plus a
 * strict YYYY-MM-DD `data-date` (it appends "T00:00:00" and string-compares to a
 * YYYY-MM-DD "today"). Accepts a full ISO timestamp too — normalized here, at the
 * shared boundary, so no caller can break the contract. The day is the no-JS
 * fallback text.
 */
import type { Handle } from "remix/ui";

export function RelativeDate(handle: Handle<{ date: string; class?: string }>) {
  return () => {
    const day = handle.props.date.split("T")[0];
    return (
      <span class={`ep-date ${handle.props.class ?? ""}`} data-date={day}>
        {day}
      </span>
    );
  };
}
