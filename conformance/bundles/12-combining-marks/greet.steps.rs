//! Rust sibling of `greet.steps.ts` (bundle `12-combining-marks`).

use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.sensor("I greet {string}", |_state, _name| Ok(None));
}

pub fn state() -> Value {
    Value::Null
}
