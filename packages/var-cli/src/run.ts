import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildRegistry, contextFactory } from '@oselvar/var/registry'
import { collectExamples, parse, plan } from '@oselvar/var-core'
import { findFiles, loadVarConfig } from '@oselvar/var-core/node'

export type RunOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
  readonly globs?: ReadonlyArray<string> | undefined
}

export type RunResult = { readonly exitCode: number }

export async function runRun(opts: RunOptions): Promise<RunResult> {
  const cfg = await loadVarConfig(opts.cwd)
  const stepFiles = findFiles(opts.cwd, cfg.steps)
  // A CLI `--globs` override is include-only; excludes live in var.config.ts.
  const varGlobs =
    opts.globs && opts.globs.length > 0 ? { include: opts.globs, exclude: [] } : cfg.vars
  const varFiles = findFiles(opts.cwd, varGlobs.include, varGlobs.exclude)

  // Importing each stepfile runs its `defineState(...)` calls, populating the
  // @oselvar/var module-scope registry. Order does not matter.
  for (const path of stepFiles) {
    await import(pathToFileURL(path).href)
  }

  const registry = buildRegistry()
  const createContext = contextFactory()

  let passed = 0
  let failed = 0
  let errorDiagnostics = 0

  for (const path of varFiles) {
    const source = readFileSync(path, 'utf8')
    const varDoc = parse(path, source, cfg.scannerPlugins)
    const execution = plan(varDoc, registry)

    const queue = collectExamples(execution, {
      reporter: {
        diagnostic: (d) => {
          if (d.severity === 'error') errorDiagnostics++
          const where = `${path}:${d.span.startLine}:${d.span.startCol}`
          opts.writeStderr(`${d.severity}: ${d.code} at ${where}\n${indent(d.message, '  ')}\n`)
        },
      },
      createContext,
    })

    const rel = relative(opts.cwd, path) || path
    opts.writeStdout(`${rel}\n`)
    for (const { name, run } of queue) {
      const start = Date.now()
      try {
        await run()
        opts.writeStdout(`  ✓ ${name} (${Date.now() - start}ms)\n`)
        passed++
      } catch (err) {
        opts.writeStdout(`  ✗ ${name} (${Date.now() - start}ms)\n`)
        opts.writeStdout(`${indent(formatError(err), '      ')}\n`)
        failed++
      }
    }
  }

  const total = passed + failed
  opts.writeStdout(
    `\n${total} example${total === 1 ? '' : 's'}, ${passed} passed, ${failed} failed`,
  )
  if (errorDiagnostics > 0) {
    opts.writeStdout(`, ${errorDiagnostics} diagnostic${errorDiagnostics === 1 ? '' : 's'}`)
  }
  opts.writeStdout('\n')

  return { exitCode: failed > 0 || errorDiagnostics > 0 ? 1 : 0 }
}

function indent(s: string, pad: string): string {
  return s
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n')
}

function formatError(err: unknown): string {
  if (err instanceof Error && typeof err.stack === 'string') return err.stack
  if (err instanceof Error) return err.message
  return String(err)
}
