// Shared by every dialect with a C-style backslash escape syntax
// (TypeScript, Python): a lookup-table escape (e.g. `\n`, `\'`) or a
// `\xNN` hex-byte escape decode identically regardless of language. Each
// dialect's SIMPLE_ESCAPES table differs (which letters are recognized, what
// they map to), and its own decode function handles the remaining
// language-specific forms (`\u{...}`, `\uNNNN`/`\UNNNNNNNN`, octal, the
// unknown-escape fallback) after this returns `undefined`.
export function decodeSimpleOrHexEscape(
  body: string,
  simpleEscapes: Readonly<Record<string, string>>,
): string | undefined {
  const simple = simpleEscapes[body]
  if (simple !== undefined) return simple
  if (body.startsWith('x') && body.length === 3) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 16))
  }
  return undefined
}
