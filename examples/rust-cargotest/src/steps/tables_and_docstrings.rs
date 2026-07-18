//! Steps for `tables-and-docstrings.md`.

use super::{as_str, vmap};
use varar::{Registry, Steps, Value};

pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    // Whole-table mode: the table arrives as a list of rows (header row first).
    // It is this sensor's only slot, so return the reproduced table bare — Vár
    // compares every cell.
    s.sensor("Uppercase each one:", |_state, table| {
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
    });

    // Doc-string mode: two slots ({word} plus the trailing doc string), so
    // return one element per slot.
    s.sensor("Greet {word}:", |_state, name, _doc| {
        let name = as_str(&name);
        Ok(Some(Value::List(vec![
            Value::from(name.clone()),
            Value::from(format!("Hello, {name}!\n")),
        ])))
    });
    s.into_registry()
}
