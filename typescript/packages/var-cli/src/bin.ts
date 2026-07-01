#!/usr/bin/env node
import { parseArgv } from './argv.js'
import { runInit } from './init.js'
import { runLint } from './lint.js'
import { runRun } from './run.js'

const parsed = parseArgv(process.argv.slice(2))

async function main(): Promise<void> {
  const io = {
    cwd: process.cwd(),
    writeStdout: (s: string) => process.stdout.write(s),
    writeStderr: (s: string) => process.stderr.write(s),
  }
  const globs = parsed.positionals.length > 0 ? parsed.positionals : undefined
  switch (parsed.command) {
    case '':
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(
        [
          'var — markdown-native BDD',
          '',
          'Usage:',
          '  var run [globs]        run markdown spec examples (no test runner)',
          '  var lint [globs]       check for missing/ambiguous/orphan steps',
          '  var init               scaffold a new project',
          '',
        ].join('\n'),
      )
      break
    case 'lint': {
      const result = await runLint({ ...io, json: parsed.flags.json === true, globs })
      process.exitCode = result.exitCode
      break
    }
    case 'init': {
      const result = await runInit({ cwd: io.cwd, writeStdout: io.writeStdout })
      process.exitCode = result.exitCode
      break
    }
    case 'run': {
      const result = await runRun({ ...io, globs })
      process.exitCode = result.exitCode
      break
    }
    default:
      process.stderr.write(`var: unknown command "${parsed.command}". Try \`var help\`.\n`)
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`var: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
