use super::{as_str, smap, vmap};
use crate::yahtzee_example::score;
use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.sensor("Examples of dice, category and score", |_state, row| {
        let m = smap(&row);
        let dice: Vec<i64> = as_str(&m["dice"])
            .split(',')
            .map(|d| d.trim().parse().expect("die"))
            .collect();
        let category = as_str(&m["category"]);
        Ok(Some(vmap(vec![("score", Value::Int(score(&dice, &category)))])))
    });
}
