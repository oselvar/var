// Pure, browser-safe URI<->path conversion (no node:url).
export function uriToPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri
  return decodeURIComponent(uri.slice('file://'.length))
}
