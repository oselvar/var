//! Rust sibling of `cukes.steps.ts` (bundle `10-error-fence-without-step`).

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "cukes.steps.rs";

pub fn register(r: Registry) -> Registry {
    // The prose matches no step, so the `error` fence has nothing to run →
    // error-fence-without-step diagnostic, and the example is dropped. This
    // step exists only so the registry matches the other ports'.
    add_step(
        &r,
        "I have {int} cukes",
        FILE,
        1,
        Handler::sync1(|_state, _n| Ok(None)),
        Some(StepKind::Stimulus),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
