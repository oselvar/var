//! The dynamic value model — the Rust replacement for Java var-core's `Object`
//! with `instanceof Map`/`List`/`String` duck-typing (see `CellDiff.java`,
//! `DocStringDiff.java`, `ParamDiff.java`). One closed enum carries handler
//! arguments, handler returns, thread-through state, row objects, table rows,
//! and the conformance wire values.
//!
//! Equality is derived `PartialEq`, the analog of Java's `Objects.equals`:
//! `Int(2) != Float(2.0)` (Java `Integer(2).equals(Double(2.0))` is false), and
//! `Map` equality is order-insensitive (`BTreeMap`), matching `Map.of(...)`
//! vs `LinkedHashMap` equality in the Java tests.

use std::collections::BTreeMap;

/// A dynamic JSON-ish value. `BTreeMap` gives order-insensitive map equality and
/// a free recursive key-sort for canonical JSON.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    /// Integer (Java `Integer`/`Long`; `{int}` transforms here).
    Int(i64),
    /// Floating-point (Java `Double`); serialized as an integer when integral.
    Float(f64),
    String(String),
    List(Vec<Value>),
    Map(BTreeMap<String, Value>),
}

impl Value {
    /// A short type name (for `ReturnShapeError` messages, mirroring Java's
    /// `getClass().getSimpleName()`).
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Bool(_) => "Boolean",
            Value::Int(_) => "Integer",
            Value::Float(_) => "Double",
            Value::String(_) => "String",
            Value::List(_) => "List",
            Value::Map(_) => "Map",
        }
    }

    /// Builds a [`Value::List`] from anything iterable of `Value`.
    pub fn list(items: impl IntoIterator<Item = Value>) -> Value {
        Value::List(items.into_iter().collect())
    }

    /// Builds a [`Value::Map`] from `(String, Value)` pairs.
    pub fn map(entries: impl IntoIterator<Item = (String, Value)>) -> Value {
        Value::Map(entries.into_iter().collect())
    }
}

impl From<i64> for Value {
    fn from(v: i64) -> Value {
        Value::Int(v)
    }
}

impl From<i32> for Value {
    fn from(v: i32) -> Value {
        Value::Int(i64::from(v))
    }
}

impl From<bool> for Value {
    fn from(v: bool) -> Value {
        Value::Bool(v)
    }
}

impl From<f64> for Value {
    fn from(v: f64) -> Value {
        Value::Float(v)
    }
}

impl From<&str> for Value {
    fn from(v: &str) -> Value {
        Value::String(v.to_string())
    }
}

impl From<String> for Value {
    fn from(v: String) -> Value {
        Value::String(v)
    }
}

impl From<Vec<Value>> for Value {
    fn from(v: Vec<Value>) -> Value {
        Value::List(v)
    }
}
