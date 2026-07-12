//! Rust sibling of `boom.steps.ts` (bundle `09-expected-message-mismatch`).

use var::{Handler, HandlerError, Registry, StepKind, Value, add_step};

pub const FILE: &str = "boom.steps.rs";

pub fn register(r: Registry) -> Registry {
    // Throws a message that does NOT contain the expected substring "expected
    // message", so the expected-failure is NOT satisfied → the example fails.
    add_step(
        &r,
        "I always boom",
        FILE,
        1,
        Handler::sync0(|_state| Err(HandlerError::new("actual different error"))),
        Some(StepKind::Stimulus),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
