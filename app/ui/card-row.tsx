/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * The app's standard tappable list item: a full-card link with a horizontal
 * body (poster + content laid out by the caller). Hover/active feedback baked in
 * so tap states stay consistent everywhere.
 *
 * An mk-card with the padding tightened to list density (p-3 over the card's
 * default space-5). text-inherit/no-underline (incl. hover) neutralize the
 * design system's base link styling — the card is the link, its content keeps
 * body colors.
 */
import type { Handle, RemixNode } from "remix/ui";

export function CardRow(handle: Handle<{ href: string; class?: string; children?: RemixNode }>) {
  return () => (
    <a
      href={handle.props.href}
      class={`mk-card p-3 flex items-center gap-3 text-inherit hover:text-inherit no-underline hover:no-underline hover:bg-surface-2 active:bg-surface-2 transition-colors ${handle.props.class ?? ""}`}
    >
      {handle.props.children}
    </a>
  );
}
