//! Rust sibling of `cukes.steps.ts` (bundle `05-ambiguous-match`).

use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    // Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
    s.stimulus("I have {int} cukes", |_state, _n| Ok(None));
    s.stimulus("I have 5 cukes", |_state| Ok(None));
}

pub fn state() -> Value {
    Value::Null
}
