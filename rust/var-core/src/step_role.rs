//! Guess a step's role from its neighbours in document order — port of
//! `step-role.ts` / `StepRole.java`. Purely structural (no keyword heuristics).

use crate::step_kind::StepKind;

/// The kinds of the steps immediately before and after the step being inferred.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Neighbours {
    pub before: Vec<StepKind>,
    pub after: Vec<StepKind>,
}

impl Neighbours {
    pub fn new(before: Vec<StepKind>, after: Vec<StepKind>) -> Neighbours {
        Neighbours { before, after }
    }
}

/// Guesses a step's role: nothing after it → most likely the observation
/// (sensor); anything followed by other steps → most likely driving (stimulus).
pub fn infer_step_role(neighbours: &Neighbours) -> StepKind {
    if neighbours.after.is_empty() {
        StepKind::Sensor
    } else {
        StepKind::Stimulus
    }
}
