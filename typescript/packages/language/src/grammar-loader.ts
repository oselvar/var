import type { Parser } from 'web-tree-sitter'

// web-tree-sitter's one-time runtime init options (`Parser.init`). The only
// field that matters per-environment is `locateFile`, which a bundled browser
// build needs to point at the emitted `web-tree-sitter.wasm` URL; Node resolves
// it relative to the package and needs none.
export type ParserInitOptions = Parameters<typeof Parser.init>[0]

export interface GrammarLoader {
  load(languageId: string): Promise<Uint8Array>
  // Optional per-environment options forwarded to the one-time `Parser.init()`.
  // Node loaders omit it (the default resolution works); the browser loader
  // supplies `locateFile` so the emscripten runtime finds its `.wasm`.
  readonly initOptions?: ParserInitOptions
}
