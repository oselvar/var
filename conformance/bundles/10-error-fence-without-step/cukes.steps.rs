//! Rust sibling of `cukes.steps.ts` (bundle `10-error-fence-without-step`).

use var::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // The prose matches no step, so the `error` fence has nothing to run →
    // error-fence-without-step diagnostic, and the example is dropped. This
    // step exists only so the registry matches the other ports'.
    s.stimulus("I have {int} cukes", |_state, _n| Ok(None));
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
