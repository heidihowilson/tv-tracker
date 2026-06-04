/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * The watched/total progress bar. Renders nothing when there are no episodes
 * (every call site guarded for that individually before extraction).
 * Always determinate — an mk-progress with no value would animate as
 * indeterminate, so the value is required here.
 */
import type { Handle } from "remix/ui";

export function WatchProgress(handle: Handle<{ watched: number; total: number; class?: string }>) {
  return () => {
    const { watched, total } = handle.props;
    if (total <= 0) return "";
    // Clamp so drifting upstream counts can never render an out-of-range value.
    const pct = Math.max(0, Math.min(100, Math.round((watched / total) * 100)));
    return <progress class={`mk-progress ${handle.props.class ?? ""}`} value={String(pct)} max="100"></progress>;
  };
}
