//! Rust sibling of `report.steps.ts` (bundle `07-row-check-mismatch`).

use std::collections::BTreeMap;
use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "report.steps.rs";

pub fn register(r: Registry) -> Registry {
    // Header-bound row step: returns its computed columns; the core diffs them
    // against the row cells (rowChecks). score 99 ≠ 10 → CellMismatchError.
    add_step(
        &r,
        "I report the score and grade",
        FILE,
        1,
        Handler::sync1(|_state, _row| {
            Ok(Some(Value::Map(BTreeMap::from([
                ("score".to_string(), Value::from("99")),
                ("grade".to_string(), Value::from("A")),
            ]))))
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
