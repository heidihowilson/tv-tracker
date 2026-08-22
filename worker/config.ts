/**
 * Bundle-time stand-in for app/config.ts on the celld/Workers runtime.
 *
 * The Bun/Node config module reads process.env and resolves filesystem paths
 * at import time. On Workers, secrets only exist on the per-request `env`
 * binding object, so TrackerDO copies them to `globalThis.__TV_ENV__` and only
 * THEN dynamically imports the app graph — this module's top-level reads
 * therefore observe the real values (same capture-at-import semantics as the
 * Bun path, same ephemeral-random fallback in an unconfigured dev fleet).
 *
 * On celld the secrets arrive as CELLD_VAR_AUTH_TOKEN / CELLD_VAR_API_KEY /
 * CELLD_VAR_ADMIN_TOKEN in /etc/celld/<fleet>.env — never as a `vars` block in
 * wrangler.jsonc (manifest vars are plaintext in the bucket).
 */
interface InjectedEnv {
  AUTH_TOKEN?: string;
  API_KEY?: string;
}

const injected: InjectedEnv = (globalThis as { __TV_ENV__?: InjectedEnv }).__TV_ENV__ ?? {};

export const AUTH_TOKEN = injected.AUTH_TOKEN ?? crypto.randomUUID();
export const API_KEY = injected.API_KEY ?? crypto.randomUUID();

/** 90 days — rolling cookie expiry, identical to the Bun path. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

/** Unused on Workers (no listener, no filesystem); kept so the module surface matches. */
export const PORT = 0;
export const STATIC_ROOT = "/";
export const DB_PATH = ":durable-object:";
