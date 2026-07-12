//! The role a step definition plays — port of `step-role.ts`'s `StepKind` /
//! `StepKind.java`.

/// A step's role: a stimulus drives the software (arranges + acts); a sensor is
/// the read-only assertion (the only role that returns for comparison).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepKind {
    Stimulus,
    Sensor,
}
