/**
 * End-to-end browser test (Playwright + system Chrome).
 *
 * Self-contained: boots its own server on a throwaway copy of the committed
 * tracker.db seed, drives the real UI in Chrome, then tears everything down.
 *
 *   npm run test:e2e
 *
 * Covers: precompiled CSS is actually applied (regression guard — a stale
 * Tailwind @source once shipped an empty stylesheet to prod), magic-link auth,
 * the client relative-date script, the watch-toggle fetch interaction (DOM
 * mutation + DB persistence across reload), season "mark all", the no-framework
 * auto-submit selects, nav, and the API-key surface.
 */

import { spawn } from "node:child_process";
import { copyFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = Number(process.env.E2E_PORT ?? 8231);
const BASE = `http://localhost:${PORT}`;
const AUTH_TOKEN = "tk";
const API_KEY = "ak";

const results: string[] = [];
const pass = (l: string) => results.push("ok   " + l);
const fail = (l: string) => results.push("FAIL " + l);

// --- Boot a dedicated server against a throwaway copy of the committed seed ---
const tmp = mkdtempSync(join(tmpdir(), "tv-e2e-"));
const dbPath = join(tmp, "tracker.db");
copyFileSync("tracker.db", dbPath);

const server = spawn("npm", ["run", "serve"], {
  env: { ...process.env, AUTH_TOKEN, API_KEY, DB_PATH: dbPath, PORT: String(PORT), NODE_ENV: "production" },
  stdio: "ignore",
});

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not become healthy in time");
}

function cleanup() {
  try { server.kill("SIGTERM"); } catch {}
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}

const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

try {
  await waitForServer();
  pass("server booted and /health is OK");

  // --- CSS regression guard: the stylesheet must actually be applied ---
  // A stale Tailwind @source once emitted a ~7KB empty reset, leaving the site
  // unstyled while still returning HTTP 200. Assert real computed styles, not status.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // abyss theme is a dark non-transparent color; unstyled would be rgba(0,0,0,0).
  bodyBg !== "rgba(0, 0, 0, 0)" && bodyBg !== "transparent"
    ? pass(`CSS applied: body background = ${bodyBg}`)
    : fail(`CSS NOT applied (body background = ${bodyBg}) — likely empty stylesheet`);
  const cssText = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="stylesheet"]') as HTMLLinkElement | null;
    if (!link) return "";
    return await (await fetch(link.href)).text();
  });
  cssText.length > 30000 && cssText.includes(".btn-primary")
    ? pass(`stylesheet is full (${cssText.length} bytes, has DaisyUI classes)`)
    : fail(`stylesheet looks empty/partial (${cssText.length} bytes)`);

  // --- Magic-link auth flow ---
  await page.goto(`${BASE}/auth/${AUTH_TOKEN}`, { waitUntil: "networkidle" });
  const continueBtn = page.getByRole("button", { name: "Continue" });
  (await continueBtn.isVisible()) ? pass("auth interstitial shows Continue") : fail("no Continue button");
  await continueBtn.click();
  await page.waitForURL(`${BASE}/`, { timeout: 5000 });
  pass("clicking Continue navigates to dashboard");

  await page.waitForLoadState("networkidle");
  (await page.getByText("Currently Watching").first().isVisible())
    ? pass("dashboard shows 'Currently Watching'") : fail("dashboard missing section");

  // --- Refresh-all wiring: button present + status endpoint shape (no real run) ---
  (await page.locator("#refresh-all-btn").count()) > 0
    ? pass("dashboard has Refresh All button")
    : fail("no Refresh All button");
  const rstatus = await page.evaluate(async () => {
    const r = await fetch("/api/refresh-status", { headers: { Accept: "application/json" } });
    return { status: r.status, body: await r.json() };
  });
  rstatus.status === 200 && typeof rstatus.body.running === "boolean" && typeof rstatus.body.total === "number"
    ? pass(`/api/refresh-status OK (running=${rstatus.body.running})`)
    : fail(`/api/refresh-status bad: ${JSON.stringify(rstatus)}`);

  // --- Client relative-date script transformed the ISO dates ---
  const epDate = page.locator(".ep-date[data-date]").first();
  if (await epDate.count() > 0) {
    const raw = await epDate.getAttribute("data-date");
    const shown = (await epDate.textContent())?.trim();
    (shown && shown !== raw) ? pass(`relativeDate JS ran (${raw} → "${shown}")`) : fail(`ep-date not transformed ("${shown}")`);
  } else { results.push("--   no .ep-date to check"); }

  // --- /shows poster rows + progress + client-side filter (#3) ---
  await page.goto(`${BASE}/shows`, { waitUntil: "networkidle" });
  const rowCount = await page.locator(".show-row").count();
  rowCount >= 1 ? pass(`/shows has ${rowCount} poster rows`) : fail("/shows list empty");
  // Every row renders a poster slot (an <img> when the show has image_url, else a
  // placeholder). The committed seed has no images, so assert the slot, not <img>.
  (await page.locator(".show-row .poster").count()) === rowCount
    ? pass(`/shows rows have poster slots (${rowCount})`)
    : fail("/shows rows missing poster slots");
  (await page.locator(".show-row progress").count()) > 0
    ? pass("/shows rows have progress bars")
    : fail("/shows rows missing progress bars");
  // Client-side title filter: typing a real title prefix narrows the list.
  const firstTitle = (await page.locator(".show-row").first().getAttribute("data-title")) ?? "";
  await page.fill("#shows-filter", firstTitle.slice(0, 4));
  await page.waitForTimeout(200);
  const visibleAfter = await page.locator(".show-row:not(.hidden)").count();
  visibleAfter >= 1 && visibleAfter <= rowCount
    ? pass(`client filter narrowed ${rowCount} -> ${visibleAfter} rows`)
    : fail(`client filter wrong: ${visibleAfter}/${rowCount}`);
  await page.fill("#shows-filter", "");
  const firstShowHref = await page.locator(".show-row").first().getAttribute("href");
  if (!firstShowHref) throw new Error("no show link found on /shows");

  // --- Show detail with episodes ---
  let detailUrl = `${BASE}${firstShowHref}`;
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  let epCount = await page.locator(".episode-item").count();
  // first show may have no episodes; walk a few until we find one that does
  if (epCount === 0) {
    const hrefs = await page.locator('a[href^="/show/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    for (const h of [...new Set(hrefs)].slice(0, 8)) {
      await page.goto(`${BASE}${h}`, { waitUntil: "networkidle" });
      epCount = await page.locator(".episode-item").count();
      if (epCount > 0) { detailUrl = `${BASE}${h}`; break; }
    }
  }
  epCount > 0 ? pass(`show detail rendered ${epCount} episode rows`) : fail("no show with episodes found");

  // --- Watch-toggle: DOM mutation + persistence across reload ---
  if (epCount > 0) {
    const firstBtn = page.locator(".watch-btn").first();
    const before = await firstBtn.getAttribute("data-watched");
    await firstBtn.click();
    await page.waitForFunction(
      (prev) => document.querySelector(".watch-btn")?.getAttribute("data-watched") !== prev,
      before, { timeout: 5000 }
    );
    const after = await firstBtn.getAttribute("data-watched");
    after !== before ? pass(`watch toggle mutated DOM (${before}→${after})`) : fail("toggle did not change");
    const hasClass = await page.locator(".episode-item").first().evaluate((el) => el.classList.contains("watched"));
    (after === "1" ? hasClass : !hasClass) ? pass("episode .watched class synced") : fail("watched class out of sync");
    await page.reload({ waitUntil: "networkidle" });
    (await page.locator(".watch-btn").first().getAttribute("data-watched")) === after
      ? pass(`toggle persisted across reload (=${after})`) : fail("did not persist");
    await page.locator(".watch-btn").first().click(); // revert
    await page.waitForTimeout(500);

    // Season "mark all"
    await page.goto(detailUrl, { waitUntil: "networkidle" });
    const markAll = page.locator(".season-watch-all-btn").first();
    if (await markAll.count() > 0) {
      const l0 = (await markAll.textContent())?.trim();
      await markAll.click();
      await page.waitForTimeout(1200);
      const l1 = (await markAll.textContent())?.trim();
      l1 !== l0 ? pass(`season mark-all toggled ("${l0}"→"${l1}")`) : fail("mark-all label unchanged");
      await markAll.click(); await page.waitForTimeout(1200); // revert
    } else { results.push("--   no season-watch-all-btn on this show"); }
  }

  // --- Edit notes/service (#2): fill the form, save, confirm it persisted ---
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  const noteVal = `e2e note ${Date.now()}`;
  if ((await page.locator('form[action="/api/update"] textarea[name="notes"]').count()) > 0) {
    await page.locator("details summary").first().click().catch(() => {});
    await page.fill('form[action="/api/update"] textarea[name="notes"]', noteVal);
    await page.click('form[action="/api/update"] button[type="submit"], form[action="/api/update"] button');
    await page.waitForLoadState("networkidle");
    (await page.getByText(noteVal).first().isVisible())
      ? pass("edited notes persisted and render")
      : fail("edited notes did not persist");
  } else {
    fail("no edit-notes form on show detail");
  }

  // --- Delete button present (#1) ---
  (await page.locator('form[action="/api/delete"] button').count()) > 0
    ? pass("show detail has Delete button")
    : fail("no Delete button on show detail");

  // --- Watch-history page (#4) ---
  await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
  (await page.getByText("Recently Watched").first().isVisible())
    ? pass("/history page renders")
    : fail("/history page missing heading");
  const histRows = await page.locator(".badge").count();
  histRows >= 1 ? pass(`/history shows ${histRows} entries`) : results.push("--   /history empty (no watch history in seed)");

  // --- No-framework auto-submit select ---
  await page.goto(`${BASE}/upcoming`, { waitUntil: "networkidle" });
  const sel = page.locator('select[name="days"]');
  if (await sel.count() > 0) {
    await sel.selectOption("7");
    await page.waitForURL(/days=7/, { timeout: 5000 });
    pass("upcoming days select auto-submits");
  } else { fail("no days select"); }

  // --- Nav ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "All Shows" }).first().click();
  await page.waitForURL(`${BASE}/shows`, { timeout: 5000 });
  pass("nav to All Shows works");

  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  (await page.locator('input[name="q"]').isVisible()) ? pass("search input visible") : fail("no search input");

  // --- API-key surface (the machine-facing routes) ---
  const noKey = await fetch(`${BASE}/api/today`);
  noKey.status === 401 ? pass("/api/today without key -> 401") : fail(`/api/today no-key -> ${noKey.status}`);
  const withKey = await fetch(`${BASE}/api/today`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  withKey.status === 200 ? pass("/api/today with Bearer -> 200") : fail(`/api/today bearer -> ${withKey.status}`);

  // --- CSRF same-origin guard: a cross-origin POST to a cookie route is rejected ---
  // requireSameOrigin runs before requireAuthed, so a forged Origin is a 403
  // regardless of cookie. The browser-driven watch toggle above proves the
  // same-origin (positive) path still works.
  const forged = await fetch(`${BASE}/api/status`, {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
    body: "show_id=1&status=watching",
  });
  forged.status === 403 ? pass("cross-origin POST rejected (403)") : fail(`cross-origin POST -> ${forged.status}`);

  consoleErrors.length === 0 ? pass("no browser console/page errors") : fail(`console errors: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
} catch (e) {
  fail("EXCEPTION: " + (e as Error).message);
} finally {
  await browser.close();
  cleanup();
}

const passed = results.filter((r) => r.startsWith("ok")).length;
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(results.join("\n"));
console.log(`\nPASS ${passed} / FAIL ${failed}`);
process.exit(failed === 0 ? 0 : 1);
