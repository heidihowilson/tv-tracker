/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Shared app chrome: the full document with favicons, the precompiled CSS link
 * (cache-busted via CSS_VERSION), nav, and the external client script. Client
 * JS stays external because the ui renderer escapes inline <script> text.
 *
 * Theme: the sethmakes system is dual light/dark via color-scheme +
 * light-dark(); data-theme="dark" pins the app dark regardless of OS
 * preference (drop the attribute to follow the OS instead). Chrome surfaces
 * are tonal (surface-1 over the page bg) with zero borders, per the design
 * language.
 *
 * Mobile-first chrome (Phase 1): a contextual top bar (page title + optional
 * action) replaces the wasted centered-logo strip, and a 3-item bottom nav —
 * Home, Add (center/primary), All Shows. Desktop keeps a top bar with the same
 * simplified nav. Upcoming/History remain as routes but are off the primary nav.
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
          padding: 10px 0;
          min-height: 56px;
          text-decoration: none;
          font-size: 11px;
          transition: color 0.15s, background-color 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .mobile-nav a:active { background-color: var(--mk-color-surface-3); }
        /* Authoritative: keep the bottom bar off desktop. A bare lg:hidden utility
           loses to the .mobile-nav rule above on source order, so hide it here. */
        @media (min-width: 1024px) { .mobile-nav { display: none; } }
      `;

/** Inline TV mark — an SVG so it never renders as a tofu box like the emoji did. */
function Logo(handle: Handle<{ class?: string }>) {
  return () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      class={handle.props.class ?? "h-6 w-6"}
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M8 3l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** Which primary-nav tab the current page belongs to (highlights it in both navs). */
export type NavTab = "home" | "add" | "shows";

export function Layout(handle: Handle<{ title: string; active?: NavTab; action?: RemixNode; children?: RemixNode }>) {
  return () => {
    const active = handle.props.active;
    /** Bottom-nav link classes: the current tab is tinted, the rest muted. */
    const tab = (key: NavTab) => (active === key ? "text-accent font-semibold" : "text-muted hover:text-accent");
    const current = (key: NavTab) => (active === key ? "page" : undefined);
    /** Desktop-nav button: the current tab gets the tonal fill, the rest are ghosts. */
    const navBtn = (key: NavTab) =>
      `mk-btn mk-btn--sm no-underline ${active === key ? "" : "mk-btn--ghost text-muted"}`;

    return (
    <html lang="en" data-theme="dark">
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
      <body class="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Desktop top bar: logo + simplified nav + primary Add action. */}
        <div class="hidden lg:block sticky top-0 z-40 bg-surface-1/95 backdrop-blur">
          <div class="container mx-auto max-w-6xl px-4 flex items-center h-14">
            <a
              href={routes.home.href()}
              class="font-bold text-lg mr-8 flex items-center gap-2 text-accent no-underline hover:no-underline"
            >
              <Logo class="h-6 w-6" />
              <span class="text-body">TV Tracker</span>
            </a>
            <nav aria-label="Primary" class="flex gap-1">
              <a href={routes.home.href()} class={navBtn("home")} aria-current={current("home")}>
                Home
              </a>
              <a href={routes.shows.href()} class={navBtn("shows")} aria-current={current("shows")}>
                All Shows
              </a>
            </nav>
            <div class="ml-auto">
              <a href={routes.search.href()} class="mk-btn mk-btn--primary mk-btn--sm no-underline">
                + Add Show
              </a>
            </div>
          </div>
        </div>

        {/* Mobile top bar: contextual (page title + optional action), not a logo strip. */}
        <header class="lg:hidden sticky top-0 z-40 bg-surface-1/95 backdrop-blur">
          <div class="flex items-center gap-2 h-14 px-4">
            <h1 class="font-bold text-lg truncate flex-1">{handle.props.title}</h1>
            {handle.props.action ? <div class="shrink-0">{handle.props.action}</div> : ""}
          </div>
        </header>

        <div class="container mx-auto px-3 py-4 max-w-6xl">{handle.props.children}</div>

        {/* Mobile bottom nav: Home / Add (primary) / All Shows. */}
        <nav aria-label="Primary" class="mobile-nav lg:hidden bg-surface-1">
          <a href={routes.home.href()} class={tab("home")} aria-current={current("home")}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span>Home</span>
          </a>
          <a href={routes.search.href()} class={tab("add")} aria-current={current("add")}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add</span>
          </a>
          <a href={routes.shows.href()} class={tab("shows")} aria-current={current("shows")}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>All Shows</span>
          </a>
        </nav>
        <script src={staticUrl("app.js")}></script>
      </body>
    </html>
    );
  };
}
