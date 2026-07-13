import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '@oselvar/var-language'

const GRAMMAR_FILES: Readonly<Record<string, string>> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  'typescript-tsx': 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
  java: 'tree-sitter-java/tree-sitter-java.wasm',
  kotlin: '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
  ruby: 'tree-sitter-ruby/tree-sitter-ruby.wasm',
  rust: 'tree-sitter-rust/tree-sitter-rust.wasm',
}

export function createNodeGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const specifier = GRAMMAR_FILES[languageId]
      if (!specifier) throw new Error(`No grammar wasm known for language "${languageId}"`)
      // The packaged VS Code extension bundles this server without its
      // node_modules, so `import.meta.resolve` can't reach the grammar
      // packages there. The extension's esbuild step copies the grammar wasm
      // files next to the bundle and sets VAR_GRAMMAR_DIR when forking the
      // server, so check that override first. Wasm basenames are unique
      // across the grammar packages, so a flat directory is enough.
      const grammarDir = process.env.VAR_GRAMMAR_DIR
      if (grammarDir) {
        return readFile(join(grammarDir, basename(specifier)))
      }
      // Resolved dynamically at runtime, so knip can't trace this import —
      // hence the `ignoreDependencies: [...]` entry for this package in
      // knip.json.
      const url = import.meta.resolve(specifier)
      return readFile(fileURLToPath(url))
    },
  }
}
