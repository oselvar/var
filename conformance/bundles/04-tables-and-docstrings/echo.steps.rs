//! Rust sibling of `echo.steps.ts` (bundle `04-tables-and-docstrings`).

use var::{Handler, Registry, Steps, Value};

pub const FILE: &str = "echo.steps.rs";

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // The doc string is this sensor's only slot, so it is returned bare; the
    // core compares it against the input (compareDocString); equal passes.
    s.sensor(
        "I echo the following:",
        FILE,
        1,
        Handler::sync1(|_state, doc| Ok(Some(doc))),
    );
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
