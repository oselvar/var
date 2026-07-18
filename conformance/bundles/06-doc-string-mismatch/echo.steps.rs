//! Rust sibling of `echo.steps.ts` (bundle `06-doc-string-mismatch`).

use var::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Returns the WRONG string (bare — the doc string is the only slot); the
    // core compares it to the doc string and throws DocStringMismatchError.
    s.sensor("I echo the following:", |_state, _doc| {
        Ok(Some(Value::from("goodbye")))
    });
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
