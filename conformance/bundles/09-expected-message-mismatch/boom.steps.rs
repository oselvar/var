//! Rust sibling of `boom.steps.ts` (bundle `09-expected-message-mismatch`).

use varar::{HandlerError, Steps, Value};

pub fn register(s: &mut Steps) {
    // Throws a message that does NOT contain the expected substring "expected
    // message", so the expected-failure is NOT satisfied → the example fails.
    s.stimulus("I always boom", |_state| Err(HandlerError::new("actual different error")));
}

pub fn state() -> Value {
    Value::Null
}
