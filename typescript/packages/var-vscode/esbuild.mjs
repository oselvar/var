import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
}

// The extension itself. `vscode` is provided by the extension host.
await build({
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
})

// The LSP server, self-contained so the packaged .vsix needs no node_modules.
// esbuild rewrites `import.meta` to `{}` in cjs output, but web-tree-sitter's
// emscripten glue calls `createRequire(import.meta.url)` and
// `new URL("web-tree-sitter.wasm", import.meta.url)` at load time — both
// throw on `{}.url`. Shim `import.meta.url` back to a real file URL so the
// glue resolves paths relative to the bundle, same as an unbundled module.
await build({
  ...shared,
  entryPoints: ['../var-lsp/src/bin.ts'],
  outfile: 'dist/server.cjs',
  banner: { js: 'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': '__importMetaUrl' },
})

// The server's grammar loader falls back to reading these wasm files from
// disk (VAR_GRAMMAR_DIR) because the cjs bundle above has no
// `import.meta.resolve`. Resolve them via var-lsp's dependencies on the
// grammar packages — not var-vscode's own node_modules, since it has no
// direct dependency on them — and copy them flat next to the bundle
// (basenames are unique across the grammar packages; this mirrors
// node-grammar-loader.ts's GRAMMAR_FILES map, one entry per language).
const requireFromLsp = createRequire(resolve('../var-lsp/package.json'))
for (const specifier of [
  'tree-sitter-typescript/tree-sitter-typescript.wasm',
  'tree-sitter-typescript/tree-sitter-tsx.wasm',
  'tree-sitter-python/tree-sitter-python.wasm',
  'tree-sitter-java/tree-sitter-java.wasm',
  '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
]) {
  const src = requireFromLsp.resolve(specifier)
  await copyFile(src, `dist/${specifier.split('/').pop()}`)
}

// web-tree-sitter's own core runtime wasm (distinct from the two grammar
// wasms above). Its glue resolves this via `import.meta.url` (shimmed
// above), which points at dist/server.cjs, so the file must sit next to it.
// var-vscode has no direct dependency on web-tree-sitter — resolve it via
// var-language's, which does.
const requireFromLanguage = createRequire(resolve('../var-language/package.json'))
await copyFile(
  requireFromLanguage.resolve('web-tree-sitter/web-tree-sitter.wasm'),
  'dist/web-tree-sitter.wasm',
)
