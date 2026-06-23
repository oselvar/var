import { globSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { executePlan, loadBddConfig, parse, plan } from '@oselvar/bdd'
import { buildRegistry, contextFactory } from '@oselvar/bdd-runtime'

export type RunOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
  readonly globs?: ReadonlyArray<string> | undefined
}

export type RunResult = { readonly exitCode: number }

export async function runRun(opts: RunOptions): Promise<RunResult> {
  const cfg = await loadBddConfig(opts.cwd)
  const stepFiles = findFiles(opts.cwd, cfg.steps)
  const bddPatterns = opts.globs && opts.globs.length > 0 ? opts.globs : cfg.bdds
  const bddFiles = findFiles(opts.cwd, bddPatterns)

  // Importing each stepfile runs its `step()` / `defineContext()` /
  // `defineParameterType()` calls, populating the @oselvar/bdd-runtime
  // module-scope registry. Order does not matter.
  for (const path of stepFiles) {
    await import(pathToFileURL(path).href)
  }

  const registry = buildRegistry()
  const createContext = contextFactory()

  let passed = 0
  let failed = 0
  let errorDiagnostics = 0

  for (const path of bddFiles) {
    const source = readFileSync(path, 'utf8')
    const bdd = parse(path, source, cfg.scannerPlugins)
    const execution = plan(bdd, registry)

    const queue: { name: string; run: () => void | Promise<void> }[] = []
    executePlan(execution, {
      sink: { example: (name, run) => queue.push({ name, run }) },
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
    opts.writeStdout(
      `, ${errorDiagnostics} diagnostic${errorDiagnostics === 1 ? '' : 's'}`,
    )
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

// node:fs/promises.glob (async) crashes on symlinked entries during
// recursion in Node 22.x. The synchronous globSync handles symlinks
// correctly and the up-front file lists are small enough that the
// blocking call is a non-issue.
function findFiles(cwd: string, patterns: ReadonlyArray<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const pattern of patterns) {
    for (const entry of globSync(pattern, { cwd })) {
      const abs = resolve(cwd, entry)
      if (!seen.has(abs)) {
        seen.add(abs)
        out.push(abs)
      }
    }
  }
  return out
}
