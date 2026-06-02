/**
 * Runtime configuration derived from the environment.
 *
 * Kept in one module so middleware, the server bootstrap, and the data layer
 * all read the same values. Secrets fall back to an ephemeral random value in
 * dev so the app still boots, but a warning is logged (see middleware/auth.ts).
 */
import { fileURLToPath } from "node:url";

export const AUTH_TOKEN = process.env.AUTH_TOKEN ?? crypto.randomUUID();
export const API_KEY = process.env.API_KEY ?? crypto.randomUUID();

/** 90 days — rolling cookie expiry, preserved exactly from the original. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export const PORT = parseInt(process.env.PORT ?? "8000");

/**
 * Directory `staticFiles()` serves from. It maps request pathname
 * `/static/app.css` to `<STATIC_ROOT>/static/app.css`, so the assets live under
 * `public/static/*` and existing `/static/...` URLs keep resolving unchanged.
 */
export const STATIC_ROOT = fileURLToPath(new URL("../public", import.meta.url));

/** Path to the SQLite database file (env-authoritative; defaults to repo root). */
export const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL("../tracker.db", import.meta.url));
