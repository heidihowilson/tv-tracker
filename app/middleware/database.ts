/**
 * Database middleware — injects the shared data-table `Database` instance into
 * request context under the canonical `Database` key, so controllers read it with
 * `get(Database)`. The query helpers in app/data/db.ts use the same instance.
 */
import type { Middleware } from "remix/router";
import { Database } from "remix/data-table";

import { db } from "../data/db.ts";

export function loadDatabase(): Middleware<{ key: typeof Database; value: typeof db }> {
  return (context, next) => {
    context.set(Database, db);
    return next();
  };
}
