#!/usr/bin/env node
import { parseArgv } from './argv.js'
import { runInit } from './init.js'
import { runLint } from './lint.js'
import { runRun } from './run.js'
import { runStepdef } from './stepdef.js'

const parsed = parseArgv(process.argv.slice(2))

async function main(): Promise<void> {
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
          '  var stepdef "<text>"   generate a step definition',
          '  var lint [globs]       check for missing/ambiguous/orphan steps',
          '  var init               scaffold a new project',
          '',
        ].join('\n'),
      )
      break
    case 'stepdef': {
      const text = parsed.positionals[0]
      if (!text) {
        process.stderr.write('var stepdef: missing text argument\n')
        process.exitCode = 1
        break
      }
      const file = typeof parsed.flags.file === 'string' ? parsed.flags.file : undefined
      const print = parsed.flags.print === true
      const result = await runStepdef({
        text,
        file,
        print,
        cwd: process.cwd(),
        writeStdout: (s) => process.stdout.write(s),
      })
      process.exitCode = result.exitCode
      break
    }
    case 'lint': {
      const result = await runLint({
        cwd: process.cwd(),
        json: parsed.flags.json === true,
        globs: parsed.positionals.length > 0 ? parsed.positionals : undefined,
        writeStdout: (s) => process.stdout.write(s),
        writeStderr: (s) => process.stderr.write(s),
      })
      process.exitCode = result.exitCode
      break
    }
    case 'init': {
      const result = await runInit({
        cwd: process.cwd(),
        writeStdout: (s) => process.stdout.write(s),
      })
      process.exitCode = result.exitCode
      break
    }
    case 'run': {
      const result = await runRun({
        cwd: process.cwd(),
        globs: parsed.positionals.length > 0 ? parsed.positionals : undefined,
        writeStdout: (s) => process.stdout.write(s),
        writeStderr: (s) => process.stderr.write(s),
      })
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
