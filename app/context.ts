/**
 * Typed app context.
 *
 * Derives `AppContext` from the context-providing middleware so every controller
 * and action gets typed `get(Database)`, `get(Authed)`, and `get(FormData)`
 * without repeating a type clause. Importing this module registers the
 * `RouterTypes.context` augmentation.
 */
import type { AnyParams, ContextWithParams, MiddlewareContext } from "remix/router";
import type { formData } from "remix/middleware/form-data";

import type { loadDatabase } from "./middleware/database.ts";
import type { loadAuth } from "./middleware/auth.ts";

/**
 * The middleware that contribute typed context keys, listed in stack order.
 *
 * Only context-SETTING middleware appear here — they are what `MiddlewareContext`
 * reads to build the `get(...)` key union. The other runtime-stack entries
 * (logger, compression, staticFiles, methodOverride, asyncContext) wrap the
 * request but set no context key, so they contribute nothing to this type and
 * are intentionally omitted. Order here mirrors the runtime stack in router.ts.
 */
type RootMiddleware = [ReturnType<typeof formData>, ReturnType<typeof loadDatabase>, ReturnType<typeof loadAuth>];

export type AppContext<params extends AnyParams = {}> = ContextWithParams<MiddlewareContext<RootMiddleware>, params>;

declare module "remix/router" {
  interface RouterTypes {
    context: AppContext;
  }
}
