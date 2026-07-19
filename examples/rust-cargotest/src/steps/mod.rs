//! Step definitions for every spec, plus the registry/context glue.
//!
//! Rust has no import-for-side-effect story, so — like the Java/Kotlin ports,
//! and unlike TypeScript/Python's module-scope accumulator — each step file
//! exposes a `register(&mut Steps)` that adds its steps to the injected builder,
//! and [`build_registry`] threads one builder through them all. The state is a
//! **full replacement** value (varar-core's model), not a shallow-merged
//! partial: a `stimulus` returns the whole next state.

use std::collections::BTreeMap;
use varar::Steps;
use varar_core::value::Value;

pub mod deep_thought;
pub mod hello_var;
pub mod library;
pub mod roman_numerals;
pub mod tables_and_docstrings;
pub mod yahtzee;

use varar_core::registry::{Registry, create_registry};

/// The combined registry for all specs.
pub fn build_registry() -> Registry {
    let mut s = Steps::from_registry(create_registry());
    hello_var::register(&mut s);
    deep_thought::register(&mut s);
    tables_and_docstrings::register(&mut s);
    yahtzee::register(&mut s);
    roman_numerals::register(&mut s);
    library::register(&mut s);
    s.into_registry()
}

/// Fresh initial state per step file (varar-core keys context by a step's source
/// file — the path captured at each `stimulus`/`sensor` call site). Matched by
/// filename suffix so it's independent of the path prefix `#[track_caller]`
/// reports. Files whose steps are pure return [`Value::Null`]. A plain `fn`
/// (not a closure) so the adapter can move it across the libtest thread
/// boundary.
pub fn context_value(file: &str) -> Value {
    if file.ends_with("hello_var.rs") {
        vmap(vec![("greeting", Value::from("")), ("result", Value::Int(0))])
    } else if file.ends_with("library.rs") {
        vmap(vec![
            ("loans", Value::List(vec![])),
            ("fee", Value::Int(0)),
            ("granted", Value::Bool(false)),
        ])
    } else {
        Value::Null
    }
}

// --- shared Value helpers ---------------------------------------------------

/// Builds a [`Value::Map`] from `(key, value)` pairs.
pub(crate) fn vmap(pairs: Vec<(&str, Value)>) -> Value {
    Value::Map(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

/// Clones the underlying map of a [`Value::Map`] (empty for anything else).
pub(crate) fn smap(v: &Value) -> BTreeMap<String, Value> {
    match v {
        Value::Map(m) => m.clone(),
        _ => BTreeMap::new(),
    }
}

pub(crate) fn as_int(v: &Value) -> i64 {
    match v {
        Value::Int(i) => *i,
        _ => panic!("expected an integer, got {v:?}"),
    }
}

pub(crate) fn as_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        _ => panic!("expected a string, got {v:?}"),
    }
}
