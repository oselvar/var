export type ParsedArgv = {
  readonly command: string
  readonly positionals: ReadonlyArray<string>
  readonly flags: Readonly<Record<string, string | true>>
}

export function parseArgv(argv: ReadonlyArray<string>): ParsedArgv {
  if (argv.length === 0) return { command: '', positionals: [], flags: {} }
  const command = argv[0] ?? ''
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i] ?? ''
    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq !== -1) {
        const key = token.slice(2, eq)
        flags[key] = token.slice(eq + 1)
      } else {
        const key = token.slice(2)
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      }
    } else {
      positionals.push(token)
    }
  }
  return { command, positionals, flags }
}
