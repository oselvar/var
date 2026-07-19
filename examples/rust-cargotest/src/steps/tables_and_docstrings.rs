use super::{as_str, vmap};
use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.sensor("Uppercase each one:", |_state, table| {
        let rows = match &table {
            Value::List(rows) => rows,
            other => panic!("expected a table, got {other:?}"),
        };
        let out: Vec<Value> = rows
            .iter()
            .skip(1)
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

    s.sensor("Greet {word}:", |_state, name, _doc| {
        let name = as_str(&name);
        Ok(Some(Value::List(vec![
            Value::from(name.clone()),
            Value::from(format!("Hello, {name}!\n")),
        ])))
    });
}
