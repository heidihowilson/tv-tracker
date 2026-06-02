/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Shared app chrome: the full abyss-themed document with favicons, the
 * precompiled CSS link (cache-busted via CSS_VERSION), desktop + mobile nav, and
 * the external client script. Client JS stays external because the ui renderer
 * escapes inline <script> text.
 *
 * Stateless component: read props from the handle, return a render function.
 */
import type { Handle, RemixNode } from "remix/ui";
import { CSS_VERSION } from "../actions/render.tsx";
import { routes, staticUrl } from "../routes.ts";

const NAV_STYLE = `
        .episode-item.watched { opacity: 0.5; }
        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          display: flex;
          padding-bottom: env(safe-area-inset-bottom, 0);
        }
        .mobile-nav a {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 8px 0;
          text-decoration: none;
          font-size: 11px;
          transition: color 0.15s;
        }
      `;

export function Layout(handle: Handle<{ title: string; children?: RemixNode }>) {
  return () => (
    <html lang="en" data-theme="abyss">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`${handle.props.title} - TV Tracker`}</title>
        <link rel="icon" type="image/x-icon" href={staticUrl("favicon.ico")} />
        <link rel="icon" type="image/png" sizes="32x32" href={staticUrl("favicon-32.png")} />
        <link rel="icon" type="image/png" sizes="16x16" href={staticUrl("favicon-16.png")} />
        <link rel="apple-touch-icon" sizes="180x180" href={staticUrl("apple-touch-icon.png")} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TV Tracker" />
        <link href={`${staticUrl("app.css")}?v=${CSS_VERSION}`} rel="stylesheet" type="text/css" />
        <style>{NAV_STYLE}</style>
      </head>
      <body class="min-h-screen bg-base-100 pb-20 lg:pb-0">
        <div class="hidden lg:block sticky top-0 z-40 bg-base-200/95 backdrop-blur border-b border-base-300">
          <div class="container mx-auto max-w-6xl px-4 flex items-center h-14">
            <a href={routes.home.href()} class="font-bold text-lg mr-8">
              📺 TV Tracker
            </a>
            <nav class="flex gap-1">
              <a href={routes.home.href()} class="btn btn-ghost btn-sm">
                Home
              </a>
              <a href={routes.upcoming.href()} class="btn btn-ghost btn-sm">
                Upcoming
              </a>
              <a href={routes.shows.href()} class="btn btn-ghost btn-sm">
                All Shows
              </a>
              <a href={routes.history.href()} class="btn btn-ghost btn-sm">
                History
              </a>
            </nav>
            <div class="ml-auto">
              <a href={routes.search.href()} class="btn btn-primary btn-sm">
                + Add Show
              </a>
            </div>
          </div>
        </div>

        <div class="lg:hidden sticky top-0 z-40 bg-base-200/95 backdrop-blur border-b border-base-300">
          <div class="flex items-center justify-center h-12 px-4">
            <a href={routes.home.href()} class="font-bold text-lg">
              📺 TV Tracker
            </a>
          </div>
        </div>

        <div class="container mx-auto px-3 py-4 max-w-6xl">{handle.props.children}</div>

        <nav class="mobile-nav lg:hidden bg-base-200 border-t border-base-300">
          <a href={routes.home.href()} class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span>Home</span>
          </a>
          <a href={routes.upcoming.href()} class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Upcoming</span>
          </a>
          <a href={routes.search.href()} class="text-primary font-semibold">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add</span>
          </a>
          <a href={routes.shows.href()} class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Shows</span>
          </a>
          <a href={routes.history.href()} class="text-base-content/70 hover:text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>History</span>
          </a>
        </nav>
        <script src={staticUrl("app.js")}></script>
      </body>
    </html>
  );
}
