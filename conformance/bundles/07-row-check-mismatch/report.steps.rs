//! Rust sibling of `report.steps.ts` (bundle `07-row-check-mismatch`).

use std::collections::BTreeMap;
use var::{Handler, Registry, Steps, Value};

pub const FILE: &str = "report.steps.rs";

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Header-bound row step: returns its computed columns; the core diffs them
    // against the row cells (rowChecks). score 99 ≠ 10 → CellMismatchError.
    s.sensor(
        "I report the score and grade",
        FILE,
        1,
        Handler::sync1(|_state, _row| {
            Ok(Some(Value::Map(BTreeMap::from([
                ("score".to_string(), Value::from("99")),
                ("grade".to_string(), Value::from("A")),
            ]))))
        }),
    );
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
