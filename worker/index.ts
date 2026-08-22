/**
 * Worker entry for the celld runtime.
 *
 * Split of responsibilities:
 *   - /static/* and /favicon.ico → the assets binding (dist/assets, assembled
 *     by build-worker.sh from an explicit allowlist of public/).
 *   - everything else            → the single TrackerDO instance, which runs
 *     the same remix router + controllers as the Bun server against its own
 *     DO SQLite.
 *
 * URL shape is decided explicitly (celld's nested-directory-index serving and
 * auto-trailing-slash are both unreliable, so we rely on neither):
 *   - wrangler.jsonc sets assets html_handling: "none" — the assets binding
 *     never serves or redirects HTML, and there is no HTML in dist/assets
 *     anyway. Every page, including root "/", is rendered by the DO.
 *   - Paths are exact, matching the Bun server's contract: "/", "/shows",
 *     "/show/:id", ... A trailing-slash variant ("/shows/") 404s here exactly
 *     as it does on the Bun server — no added redirect, no drift between
 *     runtimes.
 *
 * This module (and worker/tracker-do.ts) must not statically import the app
 * graph — see the initialization-order note in worker/tracker-do.ts.
 */
import { TrackerDO } from "./tracker-do.ts";

export { TrackerDO };

/** Longest-prefix allowlist for the assets binding; everything else is app. */
function isAssetPath(pathname: string): boolean {
  return pathname === "/favicon.ico" || pathname.startsWith("/static/");
}

export default {
  async fetch(request: Request, env: TrackerEnv): Promise<Response> {
    const url = new URL(request.url);

    if ((request.method === "GET" || request.method === "HEAD") && isAssetPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const stub = env.TRACKER.get(env.TRACKER.idFromName("tracker"));
    return stub.fetch(request);
  },
};
