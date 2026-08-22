/**
 * Constant-time string comparison for the celld runtime.
 *
 * celld (measured on the real node, v0.2.1) does NOT implement
 * `crypto.subtle.timingSafeEqual` — it is a workerd-only extension, and on
 * celld it throws at call time. Node's `crypto.timingSafeEqual` obviously does
 * not exist either. So this is a hand-rolled XOR fold: XOR every byte pair
 * into an accumulator, fold the length difference in too, and only inspect the
 * accumulator at the end. No early exit, no data-dependent branches.
 *
 * The loop runs over max(aLen, bLen) so the comparison time depends only on
 * the longer input's length, never on where the first mismatch is.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** XOR fold over two byte arrays of equal length (used by the node:crypto shim). */
export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
