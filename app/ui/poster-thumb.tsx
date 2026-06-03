/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Poster thumbnail with a graceful fallback.
 *
 * When a show has no image_url (common until a TVMaze refresh fills it in), the
 * old UI rendered a big empty dark box. This shows the title's initial on a
 * subtle gradient instead — identifiable and not a void. Pass the already
 * safeUrl()-checked src; sizing comes from the `class` prop so call sites stay in
 * control (and Tailwind sees the literal size classes there).
 */
import type { Handle } from "remix/ui";

export function PosterThumb(handle: Handle<{ src: string | null; title: string; class?: string }>) {
  return () => {
    const { src, title } = handle.props;
    const cls = handle.props.class ?? "w-12 h-18";
    if (src) {
      return <img src={src} alt="" class={`${cls} object-cover rounded-md shrink-0 bg-base-300`} loading="lazy" />;
    }
    const initial = title.trim().charAt(0).toUpperCase() || "?";
    return (
      <div
        class={`${cls} rounded-md shrink-0 bg-gradient-to-br from-base-300 to-base-200 flex items-center justify-center`}
      >
        <span class="text-base-content/30 font-bold text-xl select-none">{initial}</span>
      </div>
    );
  };
}
