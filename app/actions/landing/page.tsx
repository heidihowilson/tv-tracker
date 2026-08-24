/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Public landing gallery shown to unauthenticated visitors at "/". Owns its own
 * minimal <html> document (CSS link only, no nav, no app.js). Single-mode
 * Vaudeville sheet, same as the rest of the app.
 */
import type { Handle } from "remix/ui";
import { CSS_VERSION } from "../render.tsx";
import { staticUrl } from "../../routes.ts";
import { safeUrl } from "../../utils/url.ts";
import type { Show } from "../../data/schema.ts";

export interface LandingShow {
  show: Show;
  watched: number;
  total: number;
}

function LandingCard(handle: Handle<{ item: LandingShow }>) {
  return () => {
    const { show, watched, total } = handle.props.item;
    const tvmazeUrl = show.tvmaze_id ? `https://www.tvmaze.com/shows/${show.tvmaze_id}` : "#";
    const progress = total > 0 ? `${watched}/${total} episodes` : "";
    const isDone = show.status === "completed";
    const imgSrc = safeUrl(show.image_url);
    return (
      <a href={tvmazeUrl} target="_blank" rel="noopener" class="no-underline hover:no-underline">
        <div class="mk-thumb transition-transform duration-300 hover:scale-[1.03]">
          {imgSrc ? (
            <img src={imgSrc} alt={show.title} loading="lazy" />
          ) : (
            <span class="mk-thumb__fallback">{show.title.trim().charAt(0).toUpperCase() || "?"}</span>
          )}
          {/* Scrim and caption inset to the art, not the frame: mk-thumb's 6px
              mat is part of the printed frame and must not be tinted. The ramp
              is heavier than a decorative gradient because poster art is
              frequently bright exactly where the caption sits. */}
          <div
            class="absolute inset-[var(--mk-frame-pad)] bg-gradient-to-t from-black/90 via-black/55 to-transparent"
            aria-hidden="true"
          ></div>
          <div class="absolute bottom-0 left-0 right-0 p-3 pb-2">
            <h3 class="mk-on-art-text font-bold text-white text-sm leading-tight">{show.title}</h3>
            <div class="flex items-center gap-2 mt-1">
              {isDone ? (
                <span class="mk-badge mk-badge--on-art">Finished</span>
              ) : (
                <span class="mk-badge mk-badge--on-art mk-badge--accent">Watching</span>
              )}
              {progress ? <span class="mk-on-art-text text-xs text-white/85">{progress}</span> : ""}
            </div>
            {show.service ? (
              <span class="mk-on-art-text text-xs text-white/75">{show.service}</span>
            ) : (
              ""
            )}
          </div>
        </div>
      </a>
    );
  };
}

export function LandingPage(handle: Handle<{ watching: LandingShow[]; completed: LandingShow[] }>) {
  return () => {
    const { watching, completed } = handle.props;
    return (
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>What We're Watching — TV Tracker</title>
          <link rel="icon" type="image/x-icon" href={staticUrl("favicon.ico")} />
          <link rel="apple-touch-icon" sizes="180x180" href={staticUrl("apple-touch-icon.png")} />
          <link href={`${staticUrl("app.css")}?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
        </head>
        <body class="min-h-screen">
          <div class="max-w-5xl mx-auto px-4 py-12">
            <div class="text-center mb-10">
              <h1 class="text-3xl font-bold mb-2">📺 What We're Watching</h1>
              <p class="text-muted text-sm">A peek at our current TV rotation</p>
            </div>
            {watching.length > 0 ? (
              <section class="mb-12">
                <h2 class="text-lg font-semibold text-muted mb-4">Currently Watching</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {watching.map((item) => (
                    <LandingCard item={item} />
                  ))}
                </div>
              </section>
            ) : (
              ""
            )}
            {completed.length > 0 ? (
              <section class="mb-12">
                <h2 class="text-lg font-semibold text-muted mb-4">Recently Finished</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {completed.map((item) => (
                    <LandingCard item={item} />
                  ))}
                </div>
              </section>
            ) : (
              ""
            )}
            <footer class="text-center text-muted text-xs mt-16">Tracked with too much enthusiasm</footer>
          </div>
        </body>
      </html>
    );
  };
}
