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
