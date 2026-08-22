/**
 * Bundle-time stand-in for `node:fs`.
 *
 * The only call site in the Worker graph is app/actions/render.tsx, which
 * computes CSS_VERSION by hashing public/static/app.css. There is no
 * filesystem in the celld runtime, but TrackerDO fetches the compiled CSS
 * through the assets binding before the app graph is imported and stashes the
 * text on `globalThis.__TV_CSS_TEXT__` — so the same hash-the-stylesheet code
 * path still yields a real content hash for cache busting.
 *
 * If the stash is missing (assets fetch failed), this throws and render.tsx's
 * existing try/catch falls back to CSS_VERSION = "0", exactly like the Bun
 * path does when the file is absent.
 */
export function readFileSync(path: string | URL): string {
  const css = (globalThis as { __TV_CSS_TEXT__?: string }).__TV_CSS_TEXT__;
  if (typeof css === "string" && String(path).endsWith("app.css")) return css;
  throw new Error(`node-fs shim: no file available for ${String(path)}`);
}

export default { readFileSync };
