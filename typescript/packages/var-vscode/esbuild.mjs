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
await build({
  ...shared,
  entryPoints: ['../var-lsp/src/bin.ts'],
  outfile: 'dist/server.cjs',
})

// The server's grammar loader falls back to reading these wasm files from
// disk (VAR_GRAMMAR_DIR) because the cjs bundle above has no
// `import.meta.resolve`. Resolve them via var-lsp's dependency on
// tree-sitter-typescript — not var-vscode's own node_modules, since it has
// no direct dependency on the package — and copy them next to the bundle.
const requireFromLsp = createRequire(resolve('../var-lsp/package.json'))
for (const wasm of ['tree-sitter-typescript.wasm', 'tree-sitter-tsx.wasm']) {
  const src = requireFromLsp.resolve(`tree-sitter-typescript/${wasm}`)
  await copyFile(src, `dist/${wasm}`)
}
