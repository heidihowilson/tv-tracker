/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * The watched/total progress bar. Renders nothing when there are no episodes
 * (every call site guarded for that individually before extraction).
 */
import type { Handle } from "remix/ui";

export function WatchProgress(handle: Handle<{ watched: number; total: number; class?: string }>) {
  return () => {
    const { watched, total } = handle.props;
    if (total <= 0) return "";
    const pct = Math.round((watched / total) * 100);
    return (
      <progress
        class={`progress progress-primary w-full ${handle.props.class ?? ""}`}
        value={String(pct)}
        max="100"
      ></progress>
    );
  };
}
