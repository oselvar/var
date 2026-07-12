//! Rust sibling of `counter.steps.ts` (bundle `02-context-isolation`).

use std::collections::BTreeMap;
use var::{Handler, HandlerError, Registry, StepKind, Value, add_step};

pub const FILE: &str = "counter.steps.rs";

fn count_of(state: &Value) -> i64 {
    match state {
        Value::Map(m) => match m.get("count") {
            Some(Value::Int(i)) => *i,
            _ => 0,
        },
        _ => 0,
    }
}

pub fn register(r: Registry) -> Registry {
    let r = add_step(
        &r,
        "I increment",
        FILE,
        1,
        Handler::sync0(|state| {
            let next = count_of(&state) + 1;
            Ok(Some(Value::Map(BTreeMap::from([(
                "count".to_string(),
                Value::Int(next),
            )]))))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    add_step(
        &r,
        "The count is {int}",
        FILE,
        2,
        Handler::sync1(|state, n| {
            let count = count_of(&state);
            let expected = if let Value::Int(i) = n { i } else { 0 };
            if count != expected {
                return Err(HandlerError::new(format!(
                    "expected {expected} but got {count}"
                )));
            }
            Ok(None)
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Map(BTreeMap::from([("count".to_string(), Value::Int(0))]))
}
