/** Pure text helper — capitalize the first letter. */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
