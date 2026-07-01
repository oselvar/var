import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '../src/grammar-loader.js'

export function createTestGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const filename =
        languageId === 'typescript-tsx' ? 'tree-sitter-tsx.wasm' : 'tree-sitter-typescript.wasm'
      // Resolved dynamically at runtime, so knip can't trace this import —
      // hence the `ignoreDependencies: ["tree-sitter-typescript"]` entry for
      // this package in knip.json.
      const url = import.meta.resolve(`tree-sitter-typescript/${filename}`)
      return readFile(fileURLToPath(url))
    },
  }
}
