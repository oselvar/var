//! Rust sibling of `echo.steps.ts` (bundle `06-doc-string-mismatch`).

use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    // Returns the WRONG string (bare — the doc string is the only slot); the
    // core compares it to the doc string and throws DocStringMismatchError.
    s.sensor("I echo the following:", |_state, _doc| Ok(Some(Value::from("goodbye"))));
}

pub fn state() -> Value {
    Value::Null
}
