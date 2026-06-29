import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CONFIG = `export default {
  vars: ['var-examples/**/*.var.md'],
  steps: ['var-examples/**/*.steps.ts'],
}
`

const EXAMPLE_MD = `# Hello, BDD

Given I greet "world"
Then the greeting is "Hello, world!"
`

const EXAMPLE_STEPS = `import { defineState } from '@oselvar/var-vitest'

const { action, sensor } = defineState(() => ({ greeting: '' }))

action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = \`Hello, \${name}!\`
})

sensor('the greeting is {string}', (ctx, _expected: string) => [ctx.greeting] as [string])
`

export type InitOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type InitResult = { readonly exitCode: number }

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const files: Array<{ readonly relPath: string; readonly content: string }> = [
    { relPath: 'var.config.ts', content: CONFIG },
    { relPath: 'var-examples/01-hello.var.md', content: EXAMPLE_MD },
    { relPath: 'var-examples/steps/01-hello.steps.ts', content: EXAMPLE_STEPS },
  ]
  for (const f of files) {
    const target = join(opts.cwd, f.relPath)
    if (existsSync(target)) {
      opts.writeStdout(`skipped ${f.relPath} (already exists)\n`)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, f.content)
    opts.writeStdout(`created ${f.relPath}\n`)
  }
  return { exitCode: 0 }
}
