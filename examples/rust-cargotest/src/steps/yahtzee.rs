//! Steps for `yahtzee.md`.

use super::{as_str, smap, vmap};
use crate::yahtzee_example::score;
use var_core::handler::Handler;
use var_core::registry::{Registry, add_step};
use var_core::step_kind::StepKind;
use var_core::value::Value;

pub const FILE: &str = "yahtzee.steps";

pub fn register(r: Registry) -> Registry {
    // Header-bound table: the paragraph names every header cell (dice,
    // category, score), so this sensor runs once per row with the row as a map
    // keyed by header. Returning {"score": …} checks that column; the other
    // columns are inputs.
    add_step(
        &r,
        "Examples of dice, category and score",
        FILE,
        1,
        Handler::sync1(|_state, row| {
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
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}
