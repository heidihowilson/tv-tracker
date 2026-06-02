/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Public landing gallery shown to unauthenticated visitors at "/". Owns its own
 * minimal <html> document (abyss theme + CSS link, no nav, no app.js).
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
      <a href={tvmazeUrl} target="_blank" rel="noopener" class="group">
        <div class="relative overflow-hidden rounded-xl bg-base-200 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.03]">
          {imgSrc ? (
            <img src={imgSrc} alt={show.title} class="w-full aspect-[2/3] object-cover" loading="lazy" />
          ) : (
            <div class="w-full aspect-[2/3] bg-base-300 flex items-center justify-center text-4xl">📺</div>
          )}
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-3">
            <h3 class="font-bold text-white text-sm leading-tight">{show.title}</h3>
            <div class="flex items-center gap-2 mt-1">
              {isDone ? (
                <span class="badge badge-success badge-xs">Finished</span>
              ) : (
                <span class="badge badge-primary badge-xs">Watching</span>
              )}
              {progress ? <span class="text-xs text-white/60">{progress}</span> : ""}
            </div>
            {show.service ? <span class="text-xs text-white/40">{show.service}</span> : ""}
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
      <html lang="en" data-theme="abyss">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>What We're Watching — TV Tracker</title>
          <link rel="icon" type="image/x-icon" href={staticUrl("favicon.ico")} />
          <link rel="apple-touch-icon" sizes="180x180" href={staticUrl("apple-touch-icon.png")} />
          <link href={`${staticUrl("app.css")}?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
        </head>
        <body class="min-h-screen bg-base-100">
          <div class="max-w-5xl mx-auto px-4 py-12">
            <div class="text-center mb-10">
              <h1 class="text-3xl font-bold mb-2">📺 What We're Watching</h1>
              <p class="text-base-content/50 text-sm">A peek at our current TV rotation</p>
            </div>
            {watching.length > 0 ? (
              <section class="mb-12">
                <h2 class="text-lg font-semibold text-base-content/70 mb-4">Currently Watching</h2>
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
                <h2 class="text-lg font-semibold text-base-content/70 mb-4">Recently Finished</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {completed.map((item) => (
                    <LandingCard item={item} />
                  ))}
                </div>
              </section>
            ) : (
              ""
            )}
            <footer class="text-center text-base-content/30 text-xs mt-16">Tracked with too much enthusiasm</footer>
          </div>
        </body>
      </html>
    );
  };
}
