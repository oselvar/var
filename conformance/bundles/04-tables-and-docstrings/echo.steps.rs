//! Rust sibling of `echo.steps.ts` (bundle `04-tables-and-docstrings`).

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "echo.steps.rs";

pub fn register(r: Registry) -> Registry {
    // The doc string is this sensor's only slot, so it is returned bare; the
    // core compares it against the input (compareDocString); equal passes.
    add_step(
        &r,
        "I echo the following:",
        FILE,
        1,
        Handler::sync1(|_state, doc| Ok(Some(doc))),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
