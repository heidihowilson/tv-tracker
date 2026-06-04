/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Magic-link interstitial (route-local). Owns its own minimal <html> document
 * (CSS link only, no nav, no app.js). Follows the OS light/dark preference.
 */
import type { Handle } from "remix/ui";
import { CSS_VERSION } from "../render.tsx";
import { routes, staticUrl } from "../../routes.ts";

export function AuthInterstitialPage(handle: Handle<{ token: string }>) {
  return () => (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome — TV Tracker</title>
        <link href={`${staticUrl("app.css")}?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
      </head>
      <body class="min-h-screen flex items-center justify-center p-4">
        <div class="mk-card w-full max-w-sm">
          <h1 class="text-2xl font-bold">📺 TV Tracker</h1>
          <p class="text-muted text-sm mt-2">
            This link gives you access to the family TV tracker. Once authorized, you can browse shows, mark episodes as
            watched, and see what's coming up.
          </p>
          <hr class="mk-divider my-4" />
          <form method="POST" action={routes.auth.token.action.href({ token: handle.props.token })}>
            <label class="mk-choice mb-4">
              <input type="checkbox" name="remember" value="1" checked class="mk-checkbox" />
              <span class="text-sm">Remember this device for 90 days</span>
            </label>
            <button type="submit" class="mk-btn mk-btn--primary mk-btn--block">
              Continue
            </button>
          </form>
        </div>
      </body>
    </html>
  );
}
