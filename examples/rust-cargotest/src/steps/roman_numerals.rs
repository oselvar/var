//! Steps for `roman-numerals.md`.

use super::{as_str, smap, vmap};
use crate::roman_numerals_example::to_roman;
use varar::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Header-bound table: one example per row, the row keyed by header
    // (decimal, roman). The returned {decimal, roman} is checked cell by cell.
    s.sensor("a decimal and a roman number", |_state, row| {
        let m = smap(&row);
        let decimal = as_str(&m["decimal"]);
        let roman = to_roman(decimal.parse().expect("decimal"));
        Ok(Some(vmap(vec![
            ("decimal", Value::from(decimal)),
            ("roman", Value::from(roman)),
        ])))
    });
    s.into_registry()
}
