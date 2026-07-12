//! Rust sibling of `division.steps.ts` (bundle `03-expected-failure`).

use var::{Handler, HandlerError, Registry, StepKind, Value, add_step};

pub const FILE: &str = "division.steps.rs";

pub fn register(r: Registry) -> Registry {
    add_step(
        &r,
        "I divide {int} by {int}",
        FILE,
        1,
        Handler::sync2(|state, _a, b| {
            let b = if let Value::Int(i) = b { i } else { 0 };
            if b == 0 {
                return Err(HandlerError::new("division by zero"));
            }
            Ok(Some(state))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
