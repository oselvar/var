//! Rust sibling of `money.steps.ts` (bundle `15-custom-parameter-format`).
//!
//! Money is encoded as a bare [`Value::Float`] (pounds); `format` renders it
//! back in document notation, so the pinned mismatch reads `£2.60` / `£2.55`.

use std::rc::Rc;
use var::{
    FormatFn, Handler, ParseFn, Registry, StepKind, Value, add_step,
    define_parameter_type_with_format,
};

pub const FILE: &str = "money.steps.rs";

pub fn register(r: Registry) -> Registry {
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
    let r = define_parameter_type_with_format(&r, "money", r"£\d+\.\d{2}", parse, format);

    // Returns the WRONG money on purpose; the golden pins the formatted actual
    // "£2.60", proving mismatches render through `format`.
    add_step(
        &r,
        "The late fee is {money}",
        FILE,
        1,
        Handler::sync1(|_state, _expected| Ok(Some(Value::Float(2.6)))),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

pub fn state() -> Value {
    Value::Null
}
