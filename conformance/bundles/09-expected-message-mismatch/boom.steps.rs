//! Rust sibling of `boom.steps.ts` (bundle `09-expected-message-mismatch`).

use var::{HandlerError, Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Throws a message that does NOT contain the expected substring "expected
    // message", so the expected-failure is NOT satisfied → the example fails.
    s.stimulus("I always boom", |_state| {
        Err(HandlerError::new("actual different error"))
    });
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
