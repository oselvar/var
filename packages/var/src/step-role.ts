// The role a step definition plays, mirroring concepts/sensors-and-actuators.md:
//   context — the quiescent state the software rests in
//   action  — the actuator: the single stimulus
//   sensor  — the read-only assertion (the only role that returns for comparison)
export type StepKind = 'context' | 'action' | 'sensor'

// Guess a step's role from its neighbours, using the canonical document order
// context → action → sensor. Purely structural — never inspects sentence words
// (no Given/When/Then heuristics). The generated snippet always offers the other
// roles as commented alternatives, so a wrong guess is cheap to correct.
export function inferStepRole(neighbours: {
  readonly before: ReadonlyArray<StepKind>
  readonly after: ReadonlyArray<StepKind>
}): StepKind {
  const { before, after } = neighbours
  if (after.length === 0) return 'sensor'
  if (after.includes('sensor') && !before.includes('action') && !after.includes('action')) {
    return 'action'
  }
  if (before.length === 0) return 'context'
  return 'action'
}
