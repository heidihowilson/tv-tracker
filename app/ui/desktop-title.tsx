/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * A page title shown on desktop only — mobile gets the title from the layout's
 * contextual header bar, so rendering it in content too would double it (the
 * phase-3 dedupe, as a component so the convention is self-documenting).
 */
import type { Handle, RemixNode } from "remix/ui";

export function DesktopTitle(handle: Handle<{ class?: string; children?: RemixNode }>) {
  return () => (
    <h2 class={`text-lg font-bold hidden lg:block ${handle.props.class ?? ""}`}>{handle.props.children}</h2>
  );
}
