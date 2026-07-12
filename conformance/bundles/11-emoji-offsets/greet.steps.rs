//! Rust sibling of `greet.steps.ts` (bundle `11-emoji-offsets`).

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "greet.steps.rs";

pub fn register(r: Registry) -> Registry {
    // The list item is followed by a table, appended as a trailing arg, so this
    // sensor's slots are {string} + the table (returns nothing → passes).
    add_step(
        &r,
        "I greet {string}",
        FILE,
        1,
        Handler::sync2(|_state, _name, _table| Ok(None)),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
