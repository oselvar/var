//! Steps for `hello-var.md`.

use super::{as_int, as_str, smap};
use var_core::handler::Handler;
use var_core::registry::{Registry, add_step};
use var_core::step_kind::StepKind;
use var_core::value::Value;

pub const FILE: &str = "hello_var.steps";

pub fn register(r: Registry) -> Registry {
    // stimulus: greet a name, storing the greeting.
    let r = add_step(
        &r,
        "I greet {string}",
        FILE,
        1,
        Handler::sync1(|state, name| {
            let mut m = smap(&state);
            m.insert(
                "greeting".to_string(),
                Value::from(format!("Hello, {}!", as_str(&name))),
            );
            Ok(Some(Value::Map(m)))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();

    // sensor: the stored greeting.
    let r = add_step(
        &r,
        "the greeting should be {string}",
        FILE,
        5,
        Handler::sync1(|state, _expected| Ok(smap(&state).get("greeting").cloned())),
        Some(StepKind::Sensor),
    )
    .unwrap();

    // stimulus: evaluate an integer addition, storing the result.
    let r = add_step(
        &r,
        "expression `{int}+{int}`",
        FILE,
        10,
        Handler::sync2(|state, a, b| {
            let mut m = smap(&state);
            m.insert("result".to_string(), Value::Int(as_int(&a) + as_int(&b)));
            Ok(Some(Value::Map(m)))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();

    // sensor: the stored result.
    add_step(
        &r,
        "evaluate to `{int}`",
        FILE,
        15,
        Handler::sync1(|state, _expected| Ok(smap(&state).get("result").cloned())),
        Some(StepKind::Sensor),
    )
    .unwrap()
}
