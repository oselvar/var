import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { findFiles, loadVarConfig } from '@varar/config'
import { type Diagnostic, driftDiagnostics, reconcileDrift } from '@varar/core'
import { createFileBaselineStore, examplesWithRuns, loadSteps, planSpec } from '@varar/runner'

export type RunOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
  readonly globs?: ReadonlyArray<string> | undefined
  // Accept all current drift and re-record the baseline (snapshot-update
  // semantics). Also enabled by the VARAR_UPDATE environment variable.
  readonly update?: boolean
}

export type RunResult = { readonly exitCode: number }

export async function runRun(opts: RunOptions): Promise<RunResult> {
  const cfg = await loadVarConfig(opts.cwd)
  // A CLI `--globs` override is include-only; excludes live in varar.config.json.
  const varGlobs =
    opts.globs && opts.globs.length > 0 ? { include: opts.globs, exclude: [] } : cfg.docs
  const varFiles = findFiles(opts.cwd, varGlobs.include, varGlobs.exclude)

  const { registry, createContext } = await loadSteps(cfg.steps, opts.cwd)
  const baselineStore = createFileBaselineStore(opts.cwd)
  const update =
    opts.update === true || process.env.VARAR_UPDATE === '1' || process.env.VARAR_UPDATE === 'true'

  let passed = 0
  let failed = 0
  let errorDiagnostics = 0

  for (const path of varFiles) {
    const source = readFileSync(path, 'utf8')
    const execution = planSpec(path, source, registry)

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

    // Reconcile drift against the committed baseline. On a clean run this
    // records/updates varar.lock.json; an unacknowledged drift is reported as an
    // error diagnostic (non-zero exit) and leaves the baseline untouched.
    const specPath = rel.split(sep).join('/')
    const drifts = await reconcileDrift({
      store: baselineStore,
      specPath,
      source,
      varDoc: execution.varDoc,
      plan: execution,
      update,
    })
    for (const d of driftDiagnostics(drifts)) reporter.diagnostic(d)
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
