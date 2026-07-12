//! Step definitions for every spec, plus the registry/context glue.
//!
//! Rust has no import-for-side-effect story, so — like the Java/Kotlin ports,
//! and unlike TypeScript/Python's module-scope accumulator — each step file
//! exposes a `register(Registry) -> Registry` that adds its steps explicitly,
//! and [`build_registry`] chains them. The threaded state is a **full
//! replacement** value (var-core's model), not a shallow-merged partial: a
//! `stimulus` returns the whole next state.

use std::collections::BTreeMap;
use var_core::value::Value;

pub mod deep_thought;
pub mod hello_var;
pub mod library;
pub mod roman_numerals;
pub mod tables_and_docstrings;
pub mod yahtzee;

use var_core::registry::{Registry, create_registry};

/// The combined registry for all specs.
pub fn build_registry() -> Registry {
    let r = create_registry();
    let r = hello_var::register(r);
    let r = deep_thought::register(r);
    let r = tables_and_docstrings::register(r);
    let r = yahtzee::register(r);
    let r = roman_numerals::register(r);
    library::register(r)
}

/// Fresh initial state per step file (var-core keys context by a step's source
/// file). Files whose steps are pure return [`Value::Null`]. A plain `fn` (not
/// a closure) so the adapter can move it across the libtest thread boundary.
pub fn context_value(file: &str) -> Value {
    match file {
        hello_var::FILE => vmap(vec![
            ("greeting", Value::from("")),
            ("result", Value::Int(0)),
        ]),
        library::FILE => vmap(vec![
            ("loans", Value::List(vec![])),
            ("fee", Value::Int(0)),
            ("granted", Value::Bool(false)),
        ]),
        _ => Value::Null,
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
