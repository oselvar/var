import { readFileSync } from 'node:fs'
import { createRegistry, parse, plan } from '@oselvar/var-core'
import { findSpecs, readVarConfig } from '@oselvar/var-runner'

export type LintOptions = {
  readonly cwd: string
  readonly json: boolean
  readonly globs: ReadonlyArray<string> | undefined
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
}

export type LintResult = { readonly exitCode: number }

type Item = {
  readonly path: string
  readonly code: string
  readonly line: number
  readonly col: number
  readonly message: string
}

export async function runLint(opts: LintOptions): Promise<LintResult> {
  const cfg = await readVarConfig(opts.cwd)
  // A CLI `--globs` override is include-only; excludes live in var.config.ts.
  const varGlobs =
    opts.globs && opts.globs.length > 0 ? { include: opts.globs, exclude: [] } : cfg.vars
  const files = findSpecs(opts.cwd, varGlobs.include, varGlobs.exclude)
  const registry = createRegistry()
  const items: Item[] = []
  for (const path of files) {
    const source = readFileSync(path, 'utf8')
    const result = plan(parse(path, source), registry)
    for (const d of result.diagnostics) {
      items.push({
        path,
        code: d.code,
        line: d.span.startLine,
        col: d.span.startCol,
        message: d.message,
      })
    }
  }
  if (opts.json) {
    opts.writeStdout(JSON.stringify({ diagnostics: items }, null, 2))
  } else {
    for (const it of items) {
      opts.writeStdout(`${it.path}:${it.line}:${it.col}  ${it.code}  ${firstLine(it.message)}\n`)
    }
  }
  return { exitCode: items.some((i) => isError(i.code)) ? 1 : 0 }
}

function firstLine(s: string): string {
  const i = s.indexOf('\n')
  return i === -1 ? s : s.slice(0, i)
}

function isError(code: string): boolean {
  return code === 'ambiguous-match'
}
