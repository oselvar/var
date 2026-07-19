//! Rust sibling of `report.steps.ts` (bundle `07-row-check-mismatch`).

use std::collections::BTreeMap;
use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    // Header-bound row step: returns its computed columns; the core diffs them
    // against the row cells (rowChecks). score 99 ≠ 10 → CellMismatchError.
    s.sensor("I report the score and grade", |_state, _row| {
        Ok(Some(Value::Map(BTreeMap::from([
            ("score".to_string(), Value::from("99")),
            ("grade".to_string(), Value::from("A")),
        ]))))
    });
}

pub fn state() -> Value {
    Value::Null
}
