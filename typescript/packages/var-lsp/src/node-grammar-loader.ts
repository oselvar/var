import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '@oselvar/var-language'

export function createNodeGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const filename =
        languageId === 'typescript-tsx' ? 'tree-sitter-tsx.wasm' : 'tree-sitter-typescript.wasm'
      // The packaged VS Code extension bundles this server to cjs, where
      // `import.meta.resolve` doesn't exist (esbuild rewrites `import.meta`
      // to `{}`). The extension's esbuild step copies the grammar wasm files
      // next to the bundle and sets VAR_GRAMMAR_DIR when forking the server,
      // so check that override first.
      const grammarDir = process.env.VAR_GRAMMAR_DIR
      if (grammarDir) {
        return readFile(join(grammarDir, filename))
      }
      // Resolved dynamically at runtime, so knip can't trace this import —
      // hence the `ignoreDependencies: ["tree-sitter-typescript"]` entry for
      // this package in knip.json.
      const url = import.meta.resolve(`tree-sitter-typescript/${filename}`)
      return readFile(fileURLToPath(url))
    },
  }
}
