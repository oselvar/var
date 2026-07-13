import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '../src/grammar-loader.ts'

const GRAMMAR_FILES: Readonly<Record<string, string>> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  'typescript-tsx': 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
  java: 'tree-sitter-java/tree-sitter-java.wasm',
  kotlin: '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
  ruby: 'tree-sitter-ruby/tree-sitter-ruby.wasm',
  rust: 'tree-sitter-rust/tree-sitter-rust.wasm',
}

export function createTestGrammarLoader(): GrammarLoader {
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
