//! Steps for `roman-numerals.md`.

use super::{as_str, smap, vmap};
use crate::roman_numerals_example::to_roman;
use var_core::handler::Handler;
use var_core::registry::{Registry, add_step};
use var_core::step_kind::StepKind;
use var_core::value::Value;

pub const FILE: &str = "roman_numerals.steps";

pub fn register(r: Registry) -> Registry {
    // Header-bound table: one example per row, the row keyed by header
    // (decimal, roman). The returned {decimal, roman} is checked cell by cell.
    add_step(
        &r,
        "a decimal and a roman number",
        FILE,
        1,
        Handler::sync1(|_state, row| {
            let m = smap(&row);
            let decimal = as_str(&m["decimal"]);
            let roman = to_roman(decimal.parse().expect("decimal"));
            Ok(Some(vmap(vec![
                ("decimal", Value::from(decimal)),
                ("roman", Value::from(roman)),
            ])))
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}
