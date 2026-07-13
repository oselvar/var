//! Rust sibling of `boom.steps.ts` (bundle `09-expected-message-mismatch`).

use var::{Handler, HandlerError, Registry, Steps, Value};

pub const FILE: &str = "boom.steps.rs";

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Throws a message that does NOT contain the expected substring "expected
    // message", so the expected-failure is NOT satisfied → the example fails.
    s.stimulus(
        "I always boom",
        FILE,
        1,
        Handler::sync0(|_state| Err(HandlerError::new("actual different error"))),
    );
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
