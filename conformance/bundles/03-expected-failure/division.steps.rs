//! Rust sibling of `division.steps.ts` (bundle `03-expected-failure`).

use varar::{HandlerError, Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    s.stimulus("I divide {int} by {int}", |state, _a, b| {
        let b = if let Value::Int(i) = b { i } else { 0 };
        if b == 0 {
            return Err(HandlerError::new("division by zero"));
        }
        Ok(Some(state))
    });
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
