/**
 * Auth — two preserved mechanisms.
 *
 *  1. Magic-link / web UI: a single shared HMAC-derived value carried in the
 *     `tv_auth` cookie. The value IS the proof (stateless, no server store). The
 *     `loadAuth()` middleware parses it into a typed `Authed` context flag and
 *     re-applies a rolling 90-day Set-Cookie on every authed response. It never
 *     blocks — the public landing-page fallback for unauthed users is handled in
 *     the home controller so the URL contract is unchanged.
 *
 *  2. API key: `requireApiKey()` is controller-level middleware for the machine
 *     `/api` GET endpoints (Bearer header or ?key=).
 *
 * SPEC DEVIATION (intentional): the spec skeleton used `remix/cookie` for the
 * tv_auth cookie. Verified against remix@3.0.0-beta.3, `createCookie` base64-
 * encodes the value, so `parse()` of an already-deployed raw-hex cookie returns
 * null and serialize() changes the wire format. That violates the hard constraint
 * that deployed cookies keep validating. So we keep hand-rolled parse/serialize
 * that preserve the exact raw-hex value and attribute string from the original.
 */
import { createContextKey, type Middleware } from "remix/router";
import { SuperHeaders } from "remix/headers";

import { AUTH_TOKEN, API_KEY, COOKIE_MAX_AGE } from "../config.ts";
import { safeEqual } from "../utils/crypto.ts";

// ============ HMAC ============

/** HMAC-SHA256 sign a value (cookie derivation). Copied verbatim from the original. */
async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Derived cookie value (raw token is never stored). Top-level await (ESM/tsx ok). */
export const COOKIE_VALUE = await hmacSign("tv-tracker-auth", AUTH_TOKEN);

if (!process.env.AUTH_TOKEN) {
  console.log(`[WARN] No AUTH_TOKEN env var set — generated ephemeral token.`);
  console.log(`Auth link: /auth/${AUTH_TOKEN}`);
}

// ============ COOKIE WIRE FORMAT (preserved exactly) ============

export const AUTH_COOKIE_NAME = "tv_auth";

interface CookieOpts {
  maxAge?: number;
}

/** Serialize the tv_auth Set-Cookie value with the exact attributes used in prod. */
export function serializeAuthCookie(value: string, opts: CookieOpts = {}): string {
  let str = `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) str += `; Max-Age=${opts.maxAge}`;
  str += `; Path=/`;
  str += `; SameSite=Lax`;
  str += `; Secure`;
  str += `; HttpOnly`;
  return str;
}

/** Read the tv_auth value from a Cookie header. */
export function readAuthCookie(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === AUTH_COOKIE_NAME) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/** Set-Cookie for the "remember 90 days" case. */
export function rememberCookie(): string {
  return serializeAuthCookie(COOKIE_VALUE, { maxAge: COOKIE_MAX_AGE });
}

/** Set-Cookie for the "remember unchecked" case (session cookie, no Max-Age). */
export function sessionCookie(): string {
  return serializeAuthCookie(COOKIE_VALUE);
}

// ============ CONTEXT ============

export const Authed = createContextKey<boolean>();

// ============ GLOBAL MIDDLEWARE ============

/**
 * Parses tv_auth, sets `Authed`, and re-applies the rolling 90-day cookie on
 * authed responses. Never blocks — guarding is per-page (home renders the public
 * landing gallery when not authed).
 */
export function loadAuth(): Middleware<{ key: typeof Authed; value: boolean }> {
  return async (context, next) => {
    const ok = safeEqual(readAuthCookie(context.request) ?? "", COOKIE_VALUE);
    context.set(Authed, ok);
    const res = await next();
    if (ok) {
      res.headers.append("Set-Cookie", rememberCookie());
    }
    return res;
  };
}

// ============ CONTROLLER MIDDLEWARE ============

/** Machine API guard (Bearer header or ?key=). Replaces inline validateApiKey(). */
export function requireApiKey(): Middleware {
  return (context, next) => {
    const authHeader = context.request.headers.get("Authorization");
    const bearer = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : null;
    const key = bearer ?? context.url.searchParams.get("key");
    if (key === null || !safeEqual(key, API_KEY)) {
      const headers = new SuperHeaders();
      headers.cacheControl = { noStore: true };
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    return next();
  };
}

/**
 * Cookie guard for web mutation endpoints. The original auth middleware blocked
 * every non-public request without a valid tv_auth cookie; the cookie-backed POST
 * /api/* routes rely on that. loadAuth() (global) only sets the flag and never
 * blocks, so this action-level guard reads `Authed` and rejects when not set.
 */
export function requireAuthed(): Middleware {
  return (context, next) => {
    if (!context.get(Authed)) return new Response("Unauthorized", { status: 401 });
    return next();
  };
}

/**
 * CSRF defense for the cookie-authed mutation POSTs (watch/status/refresh/add/
 * refresh-all). We verify the request originates from our own origin rather than
 * using a synchronizer token: the app has no server-side session store to bind a
 * per-request token to, and the only shared secret would have to be rendered into
 * pages — including the *public* landing page — which would leak it to an attacker.
 *
 * Origin-checking is stateless and needs no template/JS plumbing. Browsers always
 * send `Origin` on POST (fetch and form alike); we fall back to `Referer` for the
 * rare client that omits it, and reject a state-changing request that carries
 * neither. Paired with the tv_auth cookie's `SameSite=Lax` (which already withholds
 * the cookie on cross-site POSTs), a forged cross-site request fails both checks.
 *
 * We compare `host` (hostname:port), NOT the full `origin` (which includes scheme),
 * on purpose: TLS terminates at the Coolify/Traefik proxy, so the Node server sees
 * a plain http connection and `context.url.origin` is `http://tv.sethgholson.com`
 * while the browser sends `Origin: https://tv.sethgholson.com`. Comparing scheme
 * would false-reject every legitimate POST in production. Host+port still blocks
 * the real CSRF vectors (cross-site and cross-port); a same-host scheme downgrade
 * isn't a CSRF threat for an https-only, proxy-fronted app.
 */
export function requireSameOrigin(): Middleware {
  return (context, next) => {
    const forbid = () => new Response("Forbidden", { status: 403 });
    const source = context.request.headers.get("Origin") ?? context.request.headers.get("Referer");
    if (!source) return forbid();
    let sourceHost: string;
    try {
      sourceHost = new URL(source).host;
    } catch {
      return forbid();
    }
    if (sourceHost !== context.url.host) return forbid();
    return next();
  };
}
