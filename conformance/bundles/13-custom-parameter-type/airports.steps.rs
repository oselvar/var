//! Rust sibling of `airports.steps.ts` (bundle `13-custom-parameter-type`).

use std::collections::BTreeMap;
use std::rc::Rc;
use varar::{HandlerError, ParseFn, Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Custom {airport} parameter type: IATA code, lowercased by parse. The
    // sensor asserts the lowercasing, so an identity parse would fail.
    let parse: ParseFn = Rc::new(|g: &[&str]| Value::from(g[0].to_lowercase()));
    s.param("airport", "[A-Z]{3}", parse);

    s.stimulus("I fly to {airport}", |_state, dest| {
        Ok(Some(Value::Map(BTreeMap::from([(
            "dest".to_string(),
            dest,
        )]))))
    });
    s.sensor("The destination code is {word}", |state, expected| {
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
    });
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
