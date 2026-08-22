/**
 * Router assembly for the celld/Workers runtime.
 *
 * Mirrors app/router.ts but with the middleware stack a Worker needs:
 *
 *  - no logger()        — dev-only on the Bun path too
 *  - no compression()   — the Cloudflare edge negotiates content-encoding
 *  - no staticFiles()   — /static/* and /favicon.ico are answered by the
 *                         assets binding in worker/index.ts before a request
 *                         ever reaches the Durable Object
 *  - no asyncContext()  — built on node:async_hooks AsyncLocalStorage, which
 *                         the celld runtime does not provide; nothing in the
 *                         controllers reads it
 *
 * Everything that carries app behavior — formData, methodOverride,
 * loadDatabase, loadAuth, the route map, and all three controllers — is the
 * exact same code the Bun server runs (loadDatabase pulls in app/data/db.ts,
 * whose better-sqlite3 import the build rewrites to the DO SQLite shim).
 *
 * IMPORTANT: this module must only ever be imported dynamically from
 * TrackerDO, after it has stashed ctx.storage.sql and the secrets on
 * globalThis — app/middleware/auth.ts derives COOKIE_VALUE from AUTH_TOKEN at
 * module scope, and app/data/db.ts opens its database at module scope.
 */
import { createRouter } from "remix/router";
import { formData } from "remix/middleware/form-data";
import { methodOverride } from "remix/middleware/method-override";

import "../app/context.ts"; // registers the RouterTypes.context augmentation
import type { AppContext } from "../app/context.ts";
import { loadDatabase } from "../app/middleware/database.ts";
import { loadAuth } from "../app/middleware/auth.ts";
import { routes } from "../app/routes.ts";

import rootController from "../app/actions/controller.tsx";
import authController from "../app/actions/auth/controller.tsx";
import apiController from "../app/actions/api/controller.tsx";

export const router = createRouter<AppContext>({
  middleware: [formData(), methodOverride(), loadDatabase(), loadAuth()],
});

router.map(routes, rootController); // home / upcoming / shows / showDetail / search / history / health
router.map(routes.auth.token, authController); // form() index + action
router.map(routes.api, apiController); // the api leaves
