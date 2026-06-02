/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Magic-link interstitial (route-local). Owns its own minimal <html> document
 * (abyss theme + CSS link, no nav, no app.js).
 */
import type { Handle } from "remix/ui";
import { CSS_VERSION } from "../render.tsx";
import { routes, staticUrl } from "../../routes.ts";

export function AuthInterstitialPage(handle: Handle<{ token: string }>) {
  return () => (
    <html lang="en" data-theme="abyss">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome — TV Tracker</title>
        <link href={`${staticUrl("app.css")}?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
      </head>
      <body class="min-h-screen flex items-center justify-center bg-base-100 p-4">
        <div class="card bg-base-200 shadow-xl w-full max-w-sm">
          <div class="card-body">
            <h1 class="card-title text-2xl">📺 TV Tracker</h1>
            <p class="text-base-content/60 text-sm mt-2">
              This link gives you access to the family TV tracker. Once authorized, you can browse shows, mark episodes as
              watched, and see what's coming up.
            </p>
            <div class="divider my-2"></div>
            <form method="POST" action={routes.auth.token.action.href({ token: handle.props.token })}>
              <label class="flex items-center gap-3 cursor-pointer mb-4">
                <input type="checkbox" name="remember" value="1" checked class="checkbox checkbox-primary checkbox-sm" />
                <span class="text-sm">Remember this device for 90 days</span>
              </label>
              <button type="submit" class="btn btn-primary w-full">
                Continue
              </button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
}
