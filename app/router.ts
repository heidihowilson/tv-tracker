/**
 * Router assembly — the global middleware stack and every controller mapping.
 *
 * Ordering (fast-exits first, body-parsers before consumers, context-loaders
 * last): logger (dev only), compression, staticFiles, formData, methodOverride,
 * asyncContext, loadDatabase, loadAuth.
 */
import { createRouter } from "remix/router";
import { logger } from "remix/middleware/logger";
import { compression } from "remix/middleware/compression";
import { staticFiles } from "remix/middleware/static";
import { formData } from "remix/middleware/form-data";
import { methodOverride } from "remix/middleware/method-override";
import { asyncContext } from "remix/middleware/async-context";

import "./context.ts"; // registers the RouterTypes.context augmentation
import type { AppContext } from "./context.ts";
import { STATIC_ROOT } from "./config.ts";
import { loadDatabase } from "./middleware/database.ts";
import { loadAuth } from "./middleware/auth.ts";
import { routes } from "./routes.ts";

import rootController from "./actions/controller.tsx";
import authController from "./actions/auth/controller.tsx";
import apiController from "./actions/api/controller.tsx";

const middleware = [];
if (process.env.NODE_ENV === "development") middleware.push(logger());
middleware.push(compression());
middleware.push(staticFiles(STATIC_ROOT, { cacheControl: "public, max-age=86400, immutable" }));
middleware.push(formData());
middleware.push(methodOverride());
middleware.push(asyncContext());
middleware.push(loadDatabase());
middleware.push(loadAuth());

// The runtime array is loosely typed (the dev-only logger makes it non-tuple),
// so we pin the router's context to AppContext explicitly. MiddlewareContext over
// a non-tuple array resolves to this context unchanged, and it matches the context
// the controllers were built against via RouterTypes.
export const router = createRouter<AppContext>({ middleware });

router.map(routes, rootController); // home / upcoming / shows / showDetail / search / health
router.map(routes.auth.token, authController); // form() index + action
router.map(routes.api, apiController); // the api leaves
