import type { GrammarLoader } from '@oselvar/var-language'
import tsxGrammarUrl from 'tree-sitter-typescript/tree-sitter-tsx.wasm?url'
import tsGrammarUrl from 'tree-sitter-typescript/tree-sitter-typescript.wasm?url'
// Vite rewrites each `?url` import to the hashed asset URL it emits for the
// bundled `.wasm`, so the browser worker loads real files instead of reaching
// for node_modules. web-tree-sitter's own runtime wasm is located via
// `initOptions.locateFile`; the grammar wasm is fetched as bytes.
import runtimeWasmUrl from 'web-tree-sitter/web-tree-sitter.wasm?url'

// The playground only authors `.steps.ts`, so only the TypeScript grammars are
// bundled — matching the worker's `steps: ['**/*.steps.ts']` config.
const GRAMMAR_URLS: Readonly<Record<string, string>> = {
  typescript: tsGrammarUrl,
  'typescript-tsx': tsxGrammarUrl,
}

export function createBrowserGrammarLoader(): GrammarLoader {
  return {
    initOptions: { locateFile: () => runtimeWasmUrl },
    async load(languageId) {
      const url = GRAMMAR_URLS[languageId]
      if (!url) throw new Error(`No grammar wasm known for language "${languageId}"`)
      const res = await fetch(url)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}
