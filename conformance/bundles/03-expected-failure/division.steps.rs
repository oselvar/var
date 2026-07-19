//! Rust sibling of `division.steps.ts` (bundle `03-expected-failure`).

use varar::{HandlerError, Steps, Value};

pub fn register(s: &mut Steps) {
    s.stimulus("I divide {int} by {int}", |state, _a, b| {
        let b = if let Value::Int(i) = b { i } else { 0 };
        if b == 0 {
            return Err(HandlerError::new("division by zero"));
        }
        Ok(Some(state))
    });
}

pub fn state() -> Value {
    Value::Null
}
