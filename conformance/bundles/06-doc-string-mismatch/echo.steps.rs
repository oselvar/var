//! Rust sibling of `echo.steps.ts` (bundle `06-doc-string-mismatch`).

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "echo.steps.rs";

pub fn register(r: Registry) -> Registry {
    // Returns the WRONG string (bare — the doc string is the only slot); the
    // core compares it to the doc string and throws DocStringMismatchError.
    add_step(
        &r,
        "I echo the following:",
        FILE,
        1,
        Handler::sync1(|_state, _doc| Ok(Some(Value::from("goodbye")))),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
