//! Rust sibling of `echo.steps.ts` (bundle `04-tables-and-docstrings`).

use var::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // The doc string is this sensor's only slot, so it is returned bare; the
    // core compares it against the input (compareDocString); equal passes.
    s.sensor("I echo the following:", |_state, doc| Ok(Some(doc)));
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
