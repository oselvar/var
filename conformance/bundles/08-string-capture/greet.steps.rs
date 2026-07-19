//! Rust sibling of `greet.steps.ts` (bundle `08-string-capture`).

use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.stimulus("I greet {string}", |_state, _name| Ok(None));
}

pub fn state() -> Value {
    Value::Null
}
