//! Rust sibling of `greet.steps.ts` (bundle `11-emoji-offsets`).

use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    // The list item is followed by a table, appended as a trailing arg, so this
    // sensor's slots are {string} + the table (returns nothing → passes).
    s.sensor("I greet {string}", |_state, _name, _table| Ok(None));
}

pub fn state() -> Value {
    Value::Null
}
