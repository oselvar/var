// The role a step definition plays, mirroring concepts/sensors-and-actuators.md:
//   context — the quiescent state the software rests in
//   action  — the actuator: the single stimulus
//   sensor  — the read-only assertion (the only role that returns for comparison)
export type StepKind = 'context' | 'action' | 'sensor'
