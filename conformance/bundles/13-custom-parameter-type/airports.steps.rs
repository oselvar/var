//! Rust sibling of `airports.steps.ts` (bundle `13-custom-parameter-type`).

use std::collections::BTreeMap;
use std::rc::Rc;
use var::{
    Handler, HandlerError, ParseFn, Registry, StepKind, Value, add_step, define_parameter_type,
};

pub const FILE: &str = "airports.steps.rs";

pub fn register(r: Registry) -> Registry {
    // Custom {airport} parameter type: IATA code, lowercased by parse. The
    // sensor asserts the lowercasing, so an identity parse would fail.
    let parse: ParseFn = Rc::new(|g: &[&str]| Value::from(g[0].to_lowercase()));
    let r = define_parameter_type(&r, "airport", "[A-Z]{3}", parse);

    let r = add_step(
        &r,
        "I fly to {airport}",
        FILE,
        1,
        Handler::sync1(|_state, dest| {
            Ok(Some(Value::Map(BTreeMap::from([(
                "dest".to_string(),
                dest,
            )]))))
        }),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    add_step(
        &r,
        "The destination code is {word}",
        FILE,
        2,
        Handler::sync1(|state, expected| {
            let expected = if let Value::String(s) = expected {
                s
            } else {
                String::new()
            };
            let cleaned = expected.trim_end_matches(['.', '!', '?']);
            let dest = match &state {
                Value::Map(m) => match m.get("dest") {
                    Some(Value::String(s)) => s.clone(),
                    _ => String::new(),
                },
                _ => String::new(),
            };
            if cleaned != dest {
                return Err(HandlerError::new(format!(
                    "expected {cleaned} but got {dest}"
                )));
            }
            Ok(None)
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
