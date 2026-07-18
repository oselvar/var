//! Rust sibling of `greet.steps.ts` (bundle `08-string-capture`).

use var::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    s.stimulus("I greet {string}", |_state, _name| Ok(None));
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
