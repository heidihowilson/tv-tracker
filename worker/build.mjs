/**
 * Bundles the Worker with esbuild. Invoked by build-worker.sh (which owns
 * assembling dist/assets and copying wrangler.jsonc).
 *
 * The redirect plugin is what makes the runtime port work without forking the
 * app: the same app/ modules the Bun server runs are bundled, with the four
 * runtime-specific seams swapped for Worker implementations:
 *
 *   better-sqlite3   -> worker/shims/better-sqlite3.ts  (DO SQLite client)
 *   app/config.ts    -> worker/config.ts                (env-injected secrets)
 *   node:crypto      -> worker/shims/node-crypto.ts     (sync sha256 + XOR fold)
 *   node:fs          -> worker/shims/node-fs.ts         (CSS text via assets)
 *   node:url         -> worker/shims/node-url.ts        (fileURLToPath no-op)
 *
 * The output is a single ESM file with NO top-level await: the app graph is
 * only reached through TrackerDO's dynamic import, which esbuild compiles to
 * lazy module initializers — so evaluation happens after the DO has env in
 * hand, and celld's module loader sees a plain synchronous top level. Both
 * properties are asserted below after the build.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist", "worker.js");

const redirects = new Map([
  [path.join(root, "app", "config.ts"), path.join(root, "worker", "config.ts")],
]);

const bareRedirects = new Map([
  ["better-sqlite3", path.join(root, "worker", "shims", "better-sqlite3.ts")],
  ["node:crypto", path.join(root, "worker", "shims", "node-crypto.ts")],
  ["node:fs", path.join(root, "worker", "shims", "node-fs.ts")],
  ["node:url", path.join(root, "worker", "shims", "node-url.ts")],
]);

const redirectPlugin = {
  name: "celld-runtime-redirects",
  setup(build) {
    build.onResolve({ filter: /^(better-sqlite3|node:(crypto|fs|url))$/ }, (args) => ({
      path: bareRedirects.get(args.path),
    }));
    // app/config.ts is imported via relative specifiers; match on the resolved path.
    build.onResolve({ filter: /config(\.ts)?$/ }, (args) => {
      if (args.kind === "entry-point" || !args.path.startsWith(".")) return null;
      const resolved = path.resolve(args.resolveDir, args.path);
      const target = redirects.get(resolved) ?? redirects.get(`${resolved}.ts`);
      return target ? { path: target } : null;
    });
  },
};

await build({
  entryPoints: [path.join(root, "worker", "index.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  jsxImportSource: "remix/ui",
  plugins: [redirectPlugin],
  // tracker.ts's CLI-entry guard and app/middleware/auth.ts's env warning read
  // `process` at module-eval time; give them an inert stub (TrackerDO fills
  // process.env.AUTH_TOKEN in before the app graph evaluates).
  banner: { js: 'globalThis.process ||= { argv: [], env: {} };' },
  minify: false,
  sourcemap: false,
  logLevel: "info",
});

// --- Post-build assertions -------------------------------------------------

const bundled = readFileSync(outfile, "utf8");

// 1. No runtime imports survived bundling (celld can't resolve node:* or npm packages).
const externalImport = /(^|\n)\s*import[^\n]*from\s*["'](?!\.)[^"']+["']/.exec(bundled);
if (externalImport) {
  throw new Error(`dist/worker.js still imports an external module: ${externalImport[0].trim()}`);
}

// 2. No top-level await (the app graph's TLA must have been compiled into the
//    lazy initializers behind TrackerDO's dynamic import).
if (/^await\s/m.test(bundled)) {
  throw new Error("dist/worker.js contains top-level await; celld's loader may reject it");
}

console.log("worker bundle OK:", outfile);
