/**
 * Constant-time secret comparison.
 *
 * Plain `===` on secrets leaks both length and an early-mismatch timing signal.
 * Node's `timingSafeEqual` is constant-time but requires equal-length buffers (it
 * throws otherwise), so we compare fixed-length SHA-256 digests of the inputs:
 * always 32 bytes, constant-time, and the pre-hash means the raw input length is
 * never leaked either. (Runtime is Node — `node:crypto` is available; the old
 * Deno build would have reached for `crypto.subtle`.)
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}
