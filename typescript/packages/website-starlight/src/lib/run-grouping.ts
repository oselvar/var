export type StepFile = { readonly path: string; readonly source: string }

export type EditorDescriptor = {
  readonly uri: string
  readonly group: string
  readonly source: string
}

export type RunInput = {
  readonly group: string
  readonly varPath: string
  readonly varSource: string
  readonly stepFiles: ReadonlyArray<StepFile>
}

// Strips the scheme from a standard file:/// URI to recover the bare path.
const stripFileScheme = (uri: string): string => uri.replace(/^file:\/\/\//, '')

// Group editor descriptors and pair each group's spec (.md) with the step
// files in that same group — visible .steps.ts editors first, then any hidden
// carried steps. Pure: no DOM, no editor instances. Order follows first
// appearance of each group.
export function groupRunInputs(
  editors: ReadonlyArray<EditorDescriptor>,
  hiddenStepsByGroup: ReadonlyMap<string, ReadonlyArray<StepFile>>,
): ReadonlyArray<RunInput> {
  const order: string[] = []
  const byGroup = new Map<string, EditorDescriptor[]>()
  for (const ed of editors) {
    let bucket = byGroup.get(ed.group)
    if (!bucket) {
      bucket = []
      byGroup.set(ed.group, bucket)
      order.push(ed.group)
    }
    bucket.push(ed)
  }

  const inputs: RunInput[] = []
  for (const group of order) {
    const bucket = byGroup.get(group) ?? []
    // The spec is the markdown view; the others in the group are `.steps.ts`.
    const spec = bucket.find((e) => e.uri.endsWith('.md'))
    if (!spec) continue
    const visibleSteps: StepFile[] = bucket
      .filter((e) => e.uri.endsWith('.steps.ts'))
      .map((e) => ({ path: stripFileScheme(e.uri), source: e.source }))
    const hidden = hiddenStepsByGroup.get(group) ?? []
    inputs.push({
      group,
      varPath: stripFileScheme(spec.uri),
      varSource: spec.source,
      stepFiles: [...visibleSteps, ...hidden],
    })
  }
  return inputs
}
