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
 *
 * `compact` (default ON) swaps mk-thumb's fixed 8px-per-side frame for a
 * proportional one. The library frame is sized for display art and eats a
 * third of a 44px list thumb; every call site here except the show-detail hero
 * is a list thumb, so compact is the default and the hero opts out explicitly.
 * See .mk-thumb--compact in styles/app.css for the measurements.
 */
import type { Handle } from "remix/ui";

export function PosterThumb(
  handle: Handle<{ src: string | null; title: string; class?: string; compact?: boolean }>
) {
  return () => {
    const { src, title } = handle.props;
    const cls = handle.props.class ?? "w-12 h-18";
    const frame = handle.props.compact === false ? "" : " mk-thumb--compact";
    if (src) {
      return (
        <div class={`mk-thumb shrink-0${frame} ${cls}`}>
          <img src={src} alt="" loading="lazy" />
        </div>
      );
    }
    const initial = title.trim().charAt(0).toUpperCase() || "?";
    return (
      <div class={`mk-thumb shrink-0${frame} ${cls}`}>
        <span class="mk-thumb__fallback text-xl select-none">{initial}</span>
      </div>
    );
  };
}
