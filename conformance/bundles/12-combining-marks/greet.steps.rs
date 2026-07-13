//! Rust sibling of `greet.steps.ts` (bundle `12-combining-marks`).

use var::{Handler, Registry, Steps, Value};

pub const FILE: &str = "greet.steps.rs";

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    s.sensor(
        "I greet {string}",
        FILE,
        1,
        Handler::sync1(|_state, _name| Ok(None)),
    );
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
