import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '../src/grammar-loader.js'

export function createTestGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const filename =
        languageId === 'typescript-tsx' ? 'tree-sitter-tsx.wasm' : 'tree-sitter-typescript.wasm'
      const url = import.meta.resolve(`tree-sitter-typescript/${filename}`)
      return readFile(fileURLToPath(url))
    },
  }
}
