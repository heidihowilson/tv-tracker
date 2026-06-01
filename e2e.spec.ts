/**
 * End-to-end browser test (Playwright + system Chrome).
 *
 * Run:
 *   AUTH_TOKEN=tk API_KEY=ak DB_PATH=/tmp/tv_e2e.db PORT=8203 npm run serve   # in one shell
 *   npm run test:e2e                                                          # in another
 *
 * Or just `npm run test:e2e` after copying tracker.db to a throwaway DB_PATH and
 * starting the server on PORT 8203 with AUTH_TOKEN=tk.
 *
 * Drives the real UI: magic-link auth, dashboard render, the client-side relative-date
 * script, the watch-toggle fetch interaction (DOM mutation + DB persistence across reload),
 * season "mark all", the no-framework auto-submit selects, and nav.
 */

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:8203";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "tk";

const results: string[] = [];
const pass = (l: string) => results.push("ok   " + l);
const fail = (l: string) => results.push("FAIL " + l);
const consoleErrors: string[] = [];

const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

try {
  // Magic-link auth flow
  await page.goto(`${BASE}/auth/${AUTH_TOKEN}`, { waitUntil: "networkidle" });
  const continueBtn = page.getByRole("button", { name: "Continue" });
  (await continueBtn.isVisible()) ? pass("auth interstitial shows Continue") : fail("no Continue button");
  await continueBtn.click();
  await page.waitForURL(`${BASE}/`, { timeout: 5000 });
  pass("clicking Continue navigates to dashboard");

  await page.waitForLoadState("networkidle");
  (await page.getByText("Currently Watching").first().isVisible())
    ? pass("dashboard shows 'Currently Watching'") : fail("dashboard missing section");

  // Client relative-date script transformed the ISO dates
  const epDate = page.locator(".ep-date[data-date]").first();
  if (await epDate.count() > 0) {
    const raw = await epDate.getAttribute("data-date");
    const shown = (await epDate.textContent())?.trim();
    (shown && shown !== raw) ? pass(`relativeDate JS ran (${raw} → "${shown}")`) : fail(`ep-date not transformed ("${shown}")`);
  } else { results.push("--   no .ep-date to check"); }

  // Show detail with episodes
  await page.goto(`${BASE}/show/2`, { waitUntil: "networkidle" });
  (await page.title()).includes("The Pitt") ? pass("show/2 title is The Pitt") : fail("wrong show title");
  const epCount = await page.locator(".episode-item").count();
  epCount >= 15 ? pass(`show/2 rendered ${epCount} episode rows`) : fail(`only ${epCount} rows`);

  // Watch-toggle: DOM mutation + persistence across reload
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
  await page.goto(`${BASE}/show/2`, { waitUntil: "networkidle" });
  const markAll = page.locator(".season-watch-all-btn").first();
  if (await markAll.count() > 0) {
    const l0 = (await markAll.textContent())?.trim();
    await markAll.click();
    await page.waitForTimeout(1200);
    const l1 = (await markAll.textContent())?.trim();
    l1 !== l0 ? pass(`season mark-all toggled ("${l0}"→"${l1}")`) : fail("mark-all label unchanged");
    await markAll.click(); await page.waitForTimeout(1200); // revert
  } else { fail("no season-watch-all-btn"); }

  // No-framework auto-submit select
  await page.goto(`${BASE}/upcoming`, { waitUntil: "networkidle" });
  const sel = page.locator('select[name="days"]');
  if (await sel.count() > 0) {
    await sel.selectOption("7");
    await page.waitForURL(/days=7/, { timeout: 5000 });
    pass("upcoming days select auto-submits");
  } else { fail("no days select"); }

  // Nav
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "All Shows" }).first().click();
  await page.waitForURL(`${BASE}/shows`, { timeout: 5000 });
  const rows = await page.locator("table tbody tr").count();
  rows === 7 ? pass(`/shows table has ${rows} rows`) : fail(`expected 7 rows, got ${rows}`);

  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  (await page.locator('input[name="q"]').isVisible()) ? pass("search input visible") : fail("no search input");

  consoleErrors.length === 0 ? pass("no browser console/page errors") : fail(`console errors: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
} catch (e) {
  fail("EXCEPTION: " + (e as Error).message);
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.startsWith("ok")).length;
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(results.join("\n"));
console.log(`\nPASS ${passed} / FAIL ${failed}`);
process.exit(failed === 0 ? 0 : 1);
