import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '@varar/language'

// The vitest adapter only ever scans `.steps.ts` / `.steps.tsx` files, so it
// needs just the TypeScript grammars — not the full per-language set the LSP
// carries.
const GRAMMAR_FILES: Readonly<Record<string, string>> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  'typescript-tsx': 'tree-sitter-typescript/tree-sitter-tsx.wasm',
}

export function createNodeGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const specifier = GRAMMAR_FILES[languageId]
      if (!specifier) throw new Error(`No grammar wasm known for language "${languageId}"`)
      // Resolved dynamically at runtime, so knip can't trace this import —
      // hence the `ignoreDependencies: [...]` entry for this package in
      // knip.json.
      const url = import.meta.resolve(specifier)
      return readFile(fileURLToPath(url))
    },
  }
}
