use super::Ctx;
use crate::roman_numerals::to_roman;
use std::collections::BTreeMap;
use varar::Steps;

pub fn register(s: &mut Steps<Ctx>) {
    s.sensor("a decimal and a roman number", |_ctx: Ctx, row: BTreeMap<String, String>| {
        let decimal = row["decimal"].clone();
        let roman = to_roman(decimal.parse().expect("decimal"));
        Ok(BTreeMap::from([
            ("decimal".to_string(), decimal),
            ("roman".to_string(), roman),
        ]))
    });
}
