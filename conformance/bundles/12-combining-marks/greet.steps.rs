//! Rust sibling of `greet.steps.ts` (bundle `12-combining-marks`).

use var::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    s.sensor("I greet {string}", |_state, _name| Ok(None));
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
