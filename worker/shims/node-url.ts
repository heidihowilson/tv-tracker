/**
 * Bundle-time stand-in for `node:url`.
 *
 * Call sites in the Worker graph: app/actions/render.tsx (builds a path for
 * the node:fs shim above — the value only needs to end in "app.css") and
 * tracker.ts (a `process.argv[1] === fileURLToPath(import.meta.url)` CLI-entry
 * guard that is always false in the Worker, where process.argv is empty).
 * Returning the URL string verbatim satisfies both.
 */
export function fileURLToPath(url: string | URL): string {
  return String(url);
}

export default { fileURLToPath };
