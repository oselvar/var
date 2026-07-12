//! Rust sibling of `greet.steps.ts` (bundle `08-string-capture`).

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "greet.steps.rs";

pub fn register(r: Registry) -> Registry {
    add_step(
        &r,
        "I greet {string}",
        FILE,
        1,
        Handler::sync1(|_state, _name| Ok(None)),
        Some(StepKind::Stimulus),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
