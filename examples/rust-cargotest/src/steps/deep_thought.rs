//! Steps for `deep-thought.md`.

use var::{Handler, Registry, Steps, Value};

pub const FILE: &str = "deep_thought.steps";

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // A one-slot sensor: the return IS the answer, compared against the {int}.
    s.sensor(
        "life, the universe and everything is {int}",
        FILE,
        1,
        Handler::sync1(|_state, _answer| Ok(Some(Value::Int(42)))),
    );
    s.into_registry()
}
