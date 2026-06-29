// `vars`/`steps` globs may include gitignore-style negations: a pattern
// starting with `!` excludes paths that would otherwise be discovered. This
// splits a pattern list into positive (include) and negative (exclude, with
// the leading `!` stripped) globs. Discovery globs the includes, then removes
// anything matching the excludes. Pure — no filesystem access.
export type PartitionedGlobs = {
  readonly includes: ReadonlyArray<string>
  readonly excludes: ReadonlyArray<string>
}

export function partitionGlobs(patterns: ReadonlyArray<string>): PartitionedGlobs {
  const includes: string[] = []
  const excludes: string[] = []
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) excludes.push(pattern.slice(1))
    else includes.push(pattern)
  }
  return { includes, excludes }
}
