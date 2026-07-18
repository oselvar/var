//! Rust sibling of `money.steps.ts` (bundle `15-custom-parameter-format`).
//!
//! Money is encoded as a bare [`Value::Float`] (pounds); `format` renders it
//! back in document notation, so the pinned mismatch reads `£2.60` / `£2.55`.

use std::rc::Rc;
use var::{FormatFn, ParseFn, Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    let parse: ParseFn = Rc::new(|g: &[&str]| {
        let raw = g[0];
        let value = raw
            .strip_prefix('£')
            .unwrap_or(raw)
            .parse::<f64>()
            .unwrap_or(0.0);
        Value::Float(value)
    });
    let format: FormatFn = Rc::new(|v: &Value| match v {
        Value::Float(x) => Some(format!("£{x:.2}")),
        _ => None,
    });
    s.param_with_format("money", r"£\d+\.\d{2}", parse, format);

    // Returns the WRONG money on purpose; the golden pins the formatted actual
    // "£2.60", proving mismatches render through `format`.
    s.sensor("The late fee is {money}", |_state, _expected| {
        Ok(Some(Value::Float(2.6)))
    });
    s.into_registry()
}

pub fn state() -> Value {
    Value::Null
}
