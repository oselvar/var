//! Port of `StepRoleTest.java` / `step-role.test.ts`.

use varar_core::step_kind::StepKind;
use varar_core::step_role::{Neighbours, infer_step_role};

#[test]
fn no_step_after_the_selection_means_sensor_expectation_last() {
    let neighbours = Neighbours::new(vec![StepKind::Stimulus], vec![]);
    assert_eq!(StepKind::Sensor, infer_step_role(&neighbours));
}

#[test]
fn a_sensor_follows_and_no_action_sits_between_means_action() {
    let neighbours = Neighbours::new(vec![StepKind::Stimulus], vec![StepKind::Sensor]);
    assert_eq!(StepKind::Stimulus, infer_step_role(&neighbours));
}

#[test]
fn nothing_before_and_a_step_after_means_context() {
    let neighbours = Neighbours::new(vec![], vec![StepKind::Stimulus]);
    assert_eq!(StepKind::Stimulus, infer_step_role(&neighbours));
}

#[test]
fn otherwise_means_action() {
    let neighbours = Neighbours::new(vec![StepKind::Stimulus], vec![StepKind::Stimulus]);
    assert_eq!(StepKind::Stimulus, infer_step_role(&neighbours));
}
