import { appendFileSync, existsSync } from 'node:fs'
import { createRegistry, generateSnippet } from '@oselvar/var-core'
import { loadVarConfig } from '@oselvar/var-core/node'

export type StepdefOptions = {
  readonly text: string
  readonly file: string | undefined
  readonly print: boolean
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type StepdefResult = { readonly exitCode: number }

export async function runStepdef(opts: StepdefOptions): Promise<StepdefResult> {
  const cfg = await loadVarConfig(opts.cwd)
  const snippet = generateSnippet(opts.text, createRegistry(), {
    template: cfg.snippet.template,
  })
  if (opts.print || !opts.file) {
    opts.writeStdout(snippet.fullCode)
    return { exitCode: 0 }
  }
  if (!existsSync(opts.file)) {
    appendFileSync(opts.file, '')
  }
  appendFileSync(opts.file, snippet.fullCode)
  return { exitCode: 0 }
}
