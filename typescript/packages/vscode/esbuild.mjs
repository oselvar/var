import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
}

// The extension itself. `vscode` is provided by the extension host, which
// still loads extension entry points as CommonJS only (microsoft/vscode#130367)
// — this is the one artifact that must stay cjs.
await build({
  ...shared,
  format: 'cjs',
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
})

// The LSP server, self-contained so the packaged .vsix needs no node_modules.
// It runs as a forked child process, so the extension host's cjs restriction
// doesn't apply: bundle it as esm, where `import.meta.url` is real (web-tree-
// sitter's emscripten glue calls `createRequire(import.meta.url)` and
// `new URL("web-tree-sitter.wasm", import.meta.url)` at load time). Bundled
// cjs dependencies still reach for the cjs globals at runtime — `require(...)`
// for node builtins, and `__filename`/`__dirname` (typescript.js) — which esm
// doesn't have; the banner recreates them from `import.meta.url`.
await build({
  ...shared,
  format: 'esm',
  entryPoints: ['../lsp/src/bin.ts'],
  outfile: 'dist/server.mjs',
  banner: {
    js: [
      'import { createRequire as __cjsCreateRequire } from "node:module";',
      'import { fileURLToPath as __cjsFileURLToPath } from "node:url";',
      'import { dirname as __cjsDirname } from "node:path";',
      'const require = __cjsCreateRequire(import.meta.url);',
      'const __filename = __cjsFileURLToPath(import.meta.url);',
      'const __dirname = __cjsDirname(__filename);',
    ].join(' '),
  },
})

// The server's grammar loader falls back to reading these wasm files from
// disk (VAR_GRAMMAR_DIR) because the cjs bundle above has no
// `import.meta.resolve`. Resolve them via var-lsp's dependencies on the
// grammar packages — not var-vscode's own node_modules, since it has no
// direct dependency on them — and copy them flat next to the bundle
// (basenames are unique across the grammar packages; this mirrors
// node-grammar-loader.ts's GRAMMAR_FILES map, one entry per language).
const requireFromLsp = createRequire(resolve('../lsp/package.json'))
for (const specifier of [
  'tree-sitter-typescript/tree-sitter-typescript.wasm',
  'tree-sitter-typescript/tree-sitter-tsx.wasm',
  'tree-sitter-python/tree-sitter-python.wasm',
  'tree-sitter-java/tree-sitter-java.wasm',
  '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
  'tree-sitter-ruby/tree-sitter-ruby.wasm',
  'tree-sitter-rust/tree-sitter-rust.wasm',
  'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm',
]) {
  const src = requireFromLsp.resolve(specifier)
  await copyFile(src, `dist/${specifier.split('/').pop()}`)
}

// web-tree-sitter's own core runtime wasm (distinct from the two grammar
// wasms above). Its glue resolves this via `import.meta.url` (shimmed
// above), which points at dist/server.mjs, so the file must sit next to it.
// var-vscode has no direct dependency on web-tree-sitter — resolve it via
// var-language's, which does.
const requireFromLanguage = createRequire(resolve('../language/package.json'))
await copyFile(
  requireFromLanguage.resolve('web-tree-sitter/web-tree-sitter.wasm'),
  'dist/web-tree-sitter.wasm',
)
