//! Rust sibling of `cukes.steps.ts` (bundle `05-ambiguous-match`).

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "cukes.steps.rs";

pub fn register(r: Registry) -> Registry {
    // Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
    let r = add_step(
        &r,
        "I have {int} cukes",
        FILE,
        1,
        Handler::sync1(|_state, _n| Ok(None)),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    add_step(
        &r,
        "I have 5 cukes",
        FILE,
        2,
        Handler::sync0(|_state| Ok(None)),
        Some(StepKind::Stimulus),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
