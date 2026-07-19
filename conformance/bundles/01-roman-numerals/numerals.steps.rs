//! Rust sibling of `numerals.steps.ts` (bundle `01-roman-numerals`).
//!
//! Full-replacement state (ADR 0006): the `{result}` map is the whole state.

use std::collections::BTreeMap;
use varar::{HandlerError, Steps, Value};

fn roman(n: i64) -> Option<&'static str> {
    match n {
        1 => Some("I"),
        4 => Some("IV"),
        9 => Some("IX"),
        40 => Some("XL"),
        _ => None,
    }
}

pub fn register(s: &mut Steps) {
    s.stimulus("I convert {int} to roman numerals", |_state, n| {
        let n = if let Value::Int(i) = n { i } else { 0 };
        let mut m = BTreeMap::new();
        if let Some(s) = roman(n) {
            m.insert("result".to_string(), Value::from(s));
        }
        Ok(Some(Value::Map(m)))
    });
    s.sensor("The result is {word}", |state, expected| {
        // {word} greedily captures trailing punctuation ("I." not "I"); strip
        // it, then throw on mismatch rather than returning (which would make
        // the core compare the RAW captured "I." and wrongly fail). Returning
        // None opts out, matching the .ts/.java sensors.
        let expected = if let Value::String(s) = expected {
            s
        } else {
            String::new()
        };
        let cleaned = expected.trim_end_matches(['.', '!', '?']);
        let result = match &state {
            Value::Map(m) => match m.get("result") {
                Some(Value::String(s)) => s.clone(),
                _ => String::new(),
            },
            _ => String::new(),
        };
        if cleaned != result {
            return Err(HandlerError::new(format!("expected {cleaned} but got {result}")));
        }
        Ok(None)
    });
}

pub fn state() -> Value {
    Value::Map(BTreeMap::new())
}
