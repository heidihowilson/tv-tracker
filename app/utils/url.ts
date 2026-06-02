/**
 * Pure URL helper — allowlist http(s) URLs for use in href/src attributes.
 * (Scheme check, not escaping; the ui renderer handles escaping.)
 */
export function safeUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}
