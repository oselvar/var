//! Rust sibling of `squares.steps.ts` (bundle `14-stateless-steps`).
//!
//! Pure steps — nothing to arrange or evolve — so `state()` is the bare
//! [`Value::Null`] every handler ignores.

use var::{Handler, Registry, StepKind, Value, add_step};

pub const FILE: &str = "squares.steps.rs";

pub fn register(r: Registry) -> Registry {
    let r = add_step(
        &r,
        "I warm up my mental math",
        FILE,
        1,
        Handler::sync0(|_state| Ok(None)),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    // Two slots ({int}, {int}); the handler uses only the first and returns
    // both computed columns [n, n*n] for positional comparison.
    add_step(
        &r,
        "The square of {int} is {int}.",
        FILE,
        2,
        Handler::sync2(|_state, n, _square| {
            let n = if let Value::Int(i) = n { i } else { 0 };
            Ok(Some(Value::List(vec![Value::Int(n), Value::Int(n * n)])))
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
