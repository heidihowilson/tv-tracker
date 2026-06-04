/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * The app's standard tappable list item: a full-card link with a horizontal
 * body (poster + content laid out by the caller). Hover/active feedback baked in
 * so tap states stay consistent everywhere.
 *
 * Deliberately NOT `card-side`: that DaisyUI modifier breaks min-w-0 truncation
 * and let long titles push status badges off-screen (found in phase 2).
 */
import type { Handle, RemixNode } from "remix/ui";

export function CardRow(handle: Handle<{ href: string; class?: string; children?: RemixNode }>) {
  return () => (
    <a
      href={handle.props.href}
      class={`card bg-base-200 hover:bg-base-300 active:bg-base-300 transition-colors no-underline ${handle.props.class ?? ""}`}
    >
      <div class="card-body flex-row items-center gap-3 p-3">{handle.props.children}</div>
    </a>
  );
}
