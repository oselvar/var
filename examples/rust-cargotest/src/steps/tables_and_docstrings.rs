//! Steps for `tables-and-docstrings.md`.

use super::{as_str, vmap};
use var_core::handler::Handler;
use var_core::registry::{Registry, add_step};
use var_core::step_kind::StepKind;
use var_core::value::Value;

pub const FILE: &str = "tables_and_docstrings.steps";

pub fn register(r: Registry) -> Registry {
    // Whole-table mode: the table arrives as a list of rows (header row first).
    // It is this sensor's only slot, so return the reproduced table bare — Vár
    // compares every cell.
    let r = add_step(
        &r,
        "Uppercase each one:",
        FILE,
        1,
        Handler::sync1(|_state, table| {
            let rows = match &table {
                Value::List(rows) => rows,
                other => panic!("expected a table, got {other:?}"),
            };
            let out: Vec<Value> = rows
                .iter()
                .skip(1) // drop the header row
                .map(|row| {
                    let before = match row {
                        Value::List(cells) => as_str(&cells[0]),
                        other => panic!("expected a row, got {other:?}"),
                    };
                    let after = before.to_uppercase();
                    vmap(vec![
                        ("before", Value::from(before)),
                        ("after", Value::from(after)),
                    ])
                })
                .collect();
            Ok(Some(Value::List(out)))
        }),
        Some(StepKind::Sensor),
    )
    .unwrap();

    // Doc-string mode: two slots ({word} plus the trailing doc string), so
    // return one element per slot.
    add_step(
        &r,
        "Greet {word}:",
        FILE,
        10,
        Handler::sync2(|_state, name, _doc| {
            let name = as_str(&name);
            Ok(Some(Value::List(vec![
                Value::from(name.clone()),
                Value::from(format!("Hello, {name}!\n")),
            ])))
        }),
        Some(StepKind::Sensor),
    )
    .unwrap()
}
