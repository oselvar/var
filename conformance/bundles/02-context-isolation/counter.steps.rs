//! Rust sibling of `counter.steps.ts` (bundle `02-context-isolation`).

use std::collections::BTreeMap;
use varar::{HandlerError, Steps, Value};

fn count_of(state: &Value) -> i64 {
    match state {
        Value::Map(m) => match m.get("count") {
            Some(Value::Int(i)) => *i,
            _ => 0,
        },
        _ => 0,
    }
}

pub fn register(s: &mut Steps) {
    s.stimulus("I increment", |state| {
        let next = count_of(&state) + 1;
        Ok(Some(Value::Map(BTreeMap::from([("count".to_string(), Value::Int(next))]))))
    });
    s.sensor("The count is {int}", |state, n| {
        let count = count_of(&state);
        let expected = if let Value::Int(i) = n { i } else { 0 };
        if count != expected {
            return Err(HandlerError::new(format!("expected {expected} but got {count}")));
        }
        Ok(None)
    });
}

pub fn state() -> Value {
    Value::Map(BTreeMap::from([("count".to_string(), Value::Int(0))]))
}
