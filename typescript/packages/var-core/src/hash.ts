// FNV-1a (32-bit) change-detector over UTF-16 code units. Not a security hash:
// tiny, dependency-free (no node:crypto), and trivially re-implementable in
// another language. The `fnv1a:` prefix namespaces the algorithm so a future
// format version can swap it unambiguously. `Math.imul` does the 32-bit FNV
// prime multiply with wraparound.
export function hashSource(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0')
  return `fnv1a:${hex}`
}
