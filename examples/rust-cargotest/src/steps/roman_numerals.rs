use super::{as_str, smap, vmap};
use crate::roman_numerals_example::to_roman;
use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.sensor("a decimal and a roman number", |_state, row| {
        let m = smap(&row);
        let decimal = as_str(&m["decimal"]);
        let roman = to_roman(decimal.parse().expect("decimal"));
        Ok(Some(vmap(vec![
            ("decimal", Value::from(decimal)),
            ("roman", Value::from(roman)),
        ])))
    });
}
