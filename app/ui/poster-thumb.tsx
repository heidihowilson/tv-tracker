/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Poster thumbnail with a graceful fallback, on the design system's mk-thumb.
 *
 * When a show has no image_url (common until a TVMaze refresh fills it in),
 * mk-thumb__fallback centers the title's initial on a tonal surface —
 * identifiable and not a void. Pass the already safeUrl()-checked src; sizing
 * comes from the `class` prop so call sites stay in control (and Tailwind sees
 * the literal size classes there). The fallback glyph is sized down from the
 * library's 3xl default — these thumbs run 36–96px wide.
 */
import type { Handle } from "remix/ui";

export function PosterThumb(handle: Handle<{ src: string | null; title: string; class?: string }>) {
  return () => {
    const { src, title } = handle.props;
    const cls = handle.props.class ?? "w-12 h-18";
    if (src) {
      return (
        <div class={`mk-thumb shrink-0 ${cls}`}>
          <img src={src} alt="" loading="lazy" />
        </div>
      );
    }
    const initial = title.trim().charAt(0).toUpperCase() || "?";
    return (
      <div class={`mk-thumb shrink-0 ${cls}`}>
        <span class="mk-thumb__fallback text-xl select-none">{initial}</span>
      </div>
    );
  };
}
