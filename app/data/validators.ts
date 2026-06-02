/**
 * Boundary validation schemas.
 *
 * Every controller parses params, query strings, and bodies through these with
 * `s.parseSafe(...)` so validation failure is a return value (a Response), not a
 * thrown exception. Form bodies use `f.object`/`f.field`; JSON and query/param
 * objects use `s.object`. `coerce.number()` + `s.defaulted(...)` replace
 * the old parseInt-with-default idiom.
 */
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import * as coerce from "remix/data-schema/coerce";

export const statusSchema = s.enum_(["watching", "completed", "dropped", "queued"]);

/** /show/:id */
export const showIdParam = s.object({
  id: coerce.number().refine(Number.isInteger, "Expected an integer id"),
});

/** /search ?q (optional, trimmed) */
export const searchQuery = s.object({
  q: s.defaulted(s.string(), "").transform((v) => v.trim()),
});

/**
 * ?days with a caller-supplied default (e.g. /upcoming=30, /api/upcoming=7).
 *
 * Clamped to a sane 0..3650 (10-year) window: out-of-range or negative input
 * fails validation and falls back to the default, so it never reaches the
 * `new Date(Date.now() + days*86400000)` math where a huge value would overflow
 * the Date range and throw RangeError on toISOString().
 */
export const daysQuery = (def: number) =>
  s.object({
    days: s.defaulted(
      coerce
        .number()
        .refine(Number.isInteger, "Expected an integer")
        .refine((n) => n >= 0 && n <= 3650, "days out of range"),
      def
    ),
  });

/** /shows ?status (optional) */
export const statusQuery = s.object({
  status: s.optional(statusSchema),
});

/** POST /api/watch — JSON body. */
export const watchJson = s.object({
  show_id: s.number(),
  season: s.number(),
  episode: s.number(),
  watched: s.optional(s.boolean()),
});

/** POST /api/watch — form body. `watched` defaults to "1"; anything but "0" is true. */
export const watchForm = f.object({
  show_id: f.field(coerce.number()),
  season: f.field(coerce.number()),
  episode: f.field(coerce.number()),
  watched: f.field(s.defaulted(s.string(), "1").transform((v) => v !== "0")),
});

/** POST /api/status — form body. */
export const statusForm = f.object({
  show_id: f.field(coerce.number()),
  status: f.field(statusSchema),
});

/** POST /api/add — form body. */
export const addForm = f.object({
  tvmaze_id: f.field(coerce.number()),
});

/** POST /api/refresh — form body. */
export const refreshForm = f.object({
  show_id: f.field(coerce.number()),
});

/** POST /auth/:token — form body. */
export const authForm = f.object({
  remember: f.field(s.defaulted(s.string(), "").transform((v) => v === "1")),
});
