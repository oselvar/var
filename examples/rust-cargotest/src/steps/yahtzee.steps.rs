use super::Ctx;
use crate::yahtzee::score;
use std::collections::BTreeMap;
use varar::Steps;

pub fn register(s: &mut Steps<Ctx>) {
    // Header-bound row: the row arrives keyed by column, and the computed
    // columns go back the same way for the core to diff cell by cell.
    s.sensor("Examples of dice, category and score", |_ctx: Ctx, row: BTreeMap<String, String>| {
        let dice: Vec<i64> = row["dice"]
            .split(',')
            .map(|d| d.trim().parse().expect("die"))
            .collect();
        Ok(BTreeMap::from([("score".to_string(), score(&dice, &row["category"]).to_string())]))
    });
}
