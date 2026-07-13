//! Steps for `hello-var.md`.

use super::{as_int, as_str, smap};
use var::{Handler, Registry, Steps, Value};

pub const FILE: &str = "hello_var.steps";

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);

    // stimulus: greet a name, storing the greeting.
    s.stimulus(
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
    );

    // sensor: the stored greeting.
    s.sensor(
        "the greeting should be {string}",
        FILE,
        5,
        Handler::sync1(|state, _expected| Ok(smap(&state).get("greeting").cloned())),
    );

    // stimulus: evaluate an integer addition, storing the result.
    s.stimulus(
        "expression `{int}+{int}`",
        FILE,
        10,
        Handler::sync2(|state, a, b| {
            let mut m = smap(&state);
            m.insert("result".to_string(), Value::Int(as_int(&a) + as_int(&b)));
            Ok(Some(Value::Map(m)))
        }),
    );

    // sensor: the stored result.
    s.sensor(
        "evaluate to `{int}`",
        FILE,
        15,
        Handler::sync1(|state, _expected| Ok(smap(&state).get("result").cloned())),
    );
    s.into_registry()
}
