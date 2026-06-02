/** @jsxRuntime automatic */
/** @jsxImportSource remix/ui */
/**
 * Auth controller — the form() pair at /auth/:token.
 *   index  (GET)  → validate token, show interstitial (or redirect if already authed)
 *   action (POST) → set the tv_auth cookie (90-day remember or session-only)
 */
import { createController } from "remix/router";
import { redirect } from "remix/response/redirect";
import * as s from "remix/data-schema";

import { routes } from "../../routes.ts";
import { AUTH_TOKEN } from "../../config.ts";
import { COOKIE_VALUE, readAuthCookie, rememberCookie, sessionCookie } from "../../middleware/auth.ts";
import { safeEqual } from "../../utils/crypto.ts";
import { authForm } from "../../data/validators.ts";
import { render } from "../render.tsx";
import { AuthInterstitialPage } from "./page.tsx";

export default createController(routes.auth.token, {
  actions: {
    async index({ params, request }) {
      if (!safeEqual(params.token, AUTH_TOKEN)) return new Response("Invalid link", { status: 403 });
      // Already authed? Straight to dashboard.
      if (safeEqual(readAuthCookie(request) ?? "", COOKIE_VALUE)) return redirect(routes.home.href());
      return render(<AuthInterstitialPage token={params.token} />);
    },

    async action({ params, get }) {
      if (!safeEqual(params.token, AUTH_TOKEN)) return new Response("Invalid link", { status: 403 });
      const parsed = s.parseSafe(authForm, get(FormData));
      const remember = parsed.success ? parsed.value.remember : false;
      const setCookie = remember ? rememberCookie() : sessionCookie();

      // Redirect-after-POST: set the tv_auth cookie, then 303 to the dashboard.
      // Works without JS and removes the inline-<script> escaping concern.
      return new Response(null, {
        status: 303,
        headers: { Location: routes.home.href(), "Set-Cookie": setCookie },
      });
    },
  },
});
