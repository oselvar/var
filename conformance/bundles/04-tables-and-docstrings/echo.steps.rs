//! Rust sibling of `echo.steps.ts` (bundle `04-tables-and-docstrings`).

use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    // The doc string is this sensor's only slot, so it is returned bare; the
    // core compares it against the input (compareDocString); equal passes.
    s.sensor("I echo the following:", |_state, doc| Ok(Some(doc)));
}

pub fn state() -> Value {
    Value::Null
}
