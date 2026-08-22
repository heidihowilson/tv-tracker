#!/usr/bin/env bash
# Assembles dist/ for the celld runtime: bundled worker + manifest + assets.
#
#   dist/
#     worker.js       esbuild bundle of worker/index.ts (see worker/build.mjs)
#     wrangler.jsonc  copied from worker/wrangler.jsonc (paths are dist-relative)
#     assets/         explicit-allowlist copy of public/ — NEVER the repo root,
#                     so .git/node_modules/tracker.db can't leak into the bucket
#
# Deploy the result with:  CELLD_FLEET=<fleet> celld-release deploy dist
set -euo pipefail
cd "$(dirname "$0")"

# 1. Compile the stylesheet + copy the token fonts (same step the Bun path runs).
npm run build:css

# 2. Assemble the asset allowlist.
rm -rf dist
mkdir -p dist/assets/static
cp public/favicon.ico dist/assets/favicon.ico
for f in \
  app.css \
  app.js \
  favicon.ico \
  favicon-16.png \
  favicon-32.png \
  apple-touch-icon.png \
  icon-192.png \
  icon-512.png \
  icon-1024.png
do
  cp "public/static/$f" "dist/assets/static/$f"
done
cp -r public/static/fonts dist/assets/static/fonts

# 3. Bundle the worker (fails the build on stray external imports / top-level await).
node worker/build.mjs

# 4. Manifest.
cp worker/wrangler.jsonc dist/wrangler.jsonc

echo "dist/ assembled:"
find dist -type f | sort
