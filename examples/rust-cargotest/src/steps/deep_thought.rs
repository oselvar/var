//! Steps for `deep-thought.md`.

use var_core::handler::Handler;
use var_core::registry::{Registry, add_step};
use var_core::step_kind::StepKind;
use var_core::value::Value;

pub const FILE: &str = "deep_thought.steps";

pub fn register(r: Registry) -> Registry {
    // A one-slot sensor: the return IS the answer, compared against the {int}.
    add_step(
        &r,
        "life, the universe and everything is {int}",
        FILE,
        1,
        Handler::sync1(|_state, _answer| Ok(Some(Value::Int(42)))),
        Some(StepKind::Sensor),
    )
    .unwrap()
}
