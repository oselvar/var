import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { Diagnostic } from '@oselvar/var-core'
import {
  examplesWithRuns,
  findSpecs,
  loadSteps,
  planSpec,
  readVarConfig,
} from '@oselvar/var-runner'

export type RunOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
  readonly globs?: ReadonlyArray<string> | undefined
}

export type RunResult = { readonly exitCode: number }

export async function runRun(opts: RunOptions): Promise<RunResult> {
  const cfg = await readVarConfig(opts.cwd)
  // A CLI `--globs` override is include-only; excludes live in var.config.ts.
  const varGlobs =
    opts.globs && opts.globs.length > 0 ? { include: opts.globs, exclude: [] } : cfg.vars
  const varFiles = findSpecs(opts.cwd, varGlobs.include, varGlobs.exclude)

  const { registry, createContext } = await loadSteps(cfg.steps, opts.cwd)

  let passed = 0
  let failed = 0
  let errorDiagnostics = 0

  for (const path of varFiles) {
    const source = readFileSync(path, 'utf8')
    const execution = planSpec(path, source, registry, cfg.scannerPlugins)

    const reporter = {
      diagnostic: (d: Diagnostic) => {
        if (d.severity === 'error') errorDiagnostics++
        const where = `${path}:${d.span.startLine}:${d.span.startCol}`
        opts.writeStderr(`${d.severity}: ${d.code} at ${where}\n${indent(d.message, '  ')}\n`)
      },
    }

    const items = examplesWithRuns(execution, createContext, reporter)

    const rel = relative(opts.cwd, path) || path
    opts.writeStdout(`${rel}\n`)
    for (const { example, run } of items) {
      const start = Date.now()
      try {
        await run()
        opts.writeStdout(`  ✓ ${example.name} (${Date.now() - start}ms)\n`)
        passed++
      } catch (err) {
        opts.writeStdout(`  ✗ ${example.name} (${Date.now() - start}ms)\n`)
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
