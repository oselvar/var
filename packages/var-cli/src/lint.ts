import { readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRegistry, parse, partitionGlobs, plan } from '@oselvar/var-core'
import { loadVarConfig } from '@oselvar/var-core/node'

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

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export async function runLint(opts: LintOptions): Promise<LintResult> {
  const cfg = await loadVarConfig(opts.cwd)
  const patterns = opts.globs && opts.globs.length > 0 ? opts.globs : cfg.vars
  const files = await findFiles(opts.cwd, patterns)
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

async function globAbs(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const out: string[] = []
  for (const pattern of patterns) {
    for await (const entry of glob(pattern, { cwd })) {
      out.push(resolve(cwd, entry))
    }
  }
  return out
}

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const { includes, excludes } = partitionGlobs(patterns)
  const excluded = new Set(await globAbs(cwd, excludes))
  const out: string[] = []
  const seen = new Set<string>()
  for (const abs of await globAbs(cwd, includes)) {
    if (excluded.has(abs) || seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
  }
  return out
}
