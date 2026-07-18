//! Steps for `yahtzee.md`.

use super::{as_str, smap, vmap};
use crate::yahtzee_example::score;
use var::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Header-bound table: the paragraph names every header cell (dice,
    // category, score), so this sensor runs once per row with the row as a map
    // keyed by header. Returning {"score": …} checks that column; the other
    // columns are inputs.
    s.sensor("Examples of dice, category and score", |_state, row| {
        let m = smap(&row);
        let dice: Vec<i64> = as_str(&m["dice"])
            .split(',')
            .map(|d| d.trim().parse().expect("die"))
            .collect();
        let category = as_str(&m["category"]);
        Ok(Some(vmap(vec![(
            "score",
            Value::Int(score(&dice, &category)),
        )])))
    });
    s.into_registry()
}
