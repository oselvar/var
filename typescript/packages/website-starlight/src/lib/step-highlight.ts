// Astro escapes a fixed set of characters when it renders a text expression
// into a slot. Reverse the set Astro emits plus `&apos;` defensively (Astro
// does not emit `&apos;` but some tooling does). `&amp;` must be decoded last
// so we never double-decode.
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
