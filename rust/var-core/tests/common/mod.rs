//! Shared helpers for the ported test suite.
#![allow(dead_code)]

use std::collections::BTreeMap;
use var_core::value::Value;

/// Builds a [`Value::Map`] from `(key, value)` pairs (test ergonomics for Java's
/// `Map.of(...)`).
pub fn vmap(pairs: Vec<(&str, Value)>) -> Value {
    let mut m = BTreeMap::new();
    for (k, v) in pairs {
        m.insert(k.to_string(), v);
    }
    Value::Map(m)
}

/// Builds a [`Value::List`] (Java `List.of(...)`).
pub fn vlist(items: Vec<Value>) -> Value {
    Value::List(items)
}
