//! Hand-rolled canonical JSON serializer — port of `CanonicalJson.java` (concept
//! of `canonicalStringify`). Reproduces `JSON.stringify(sortKeys(v), null, 2) +
//! "\n"` byte-for-byte: recursively key-sorted objects, 2-space indent, LF +
//! trailing newline, raw non-ASCII, control chars as `\uXXXX`.

use crate::value::Value;
use std::collections::BTreeMap;
use std::fmt::Write;

/// Serializes `value` to canonical JSON, with a trailing `"\n"`.
pub fn canonical_stringify(value: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, value, 0);
    out.push('\n');
    out
}

fn write_value(out: &mut String, value: &Value, depth: usize) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Int(i) => {
            let _ = write!(out, "{i}");
        }
        Value::Float(d) => write_number(out, *d),
        Value::String(s) => write_string(out, s),
        Value::List(list) => write_array(out, list, depth),
        Value::Map(map) => write_object(out, map, depth),
    }
}

fn write_object(out: &mut String, map: &BTreeMap<String, Value>, depth: usize) {
    if map.is_empty() {
        out.push_str("{}");
        return;
    }
    out.push_str("{\n");
    let n = map.len();
    // `BTreeMap` iterates in sorted key order — the recursive key-sort is free.
    for (i, (key, val)) in map.iter().enumerate() {
        indent(out, depth + 1);
        write_string(out, key);
        out.push_str(": ");
        write_value(out, val, depth + 1);
        if i + 1 < n {
            out.push(',');
        }
        out.push('\n');
    }
    indent(out, depth);
    out.push('}');
}

fn write_array(out: &mut String, list: &[Value], depth: usize) {
    if list.is_empty() {
        out.push_str("[]");
        return;
    }
    out.push_str("[\n");
    let n = list.len();
    for (i, item) in list.iter().enumerate() {
        indent(out, depth + 1);
        write_value(out, item, depth + 1);
        if i + 1 < n {
            out.push(',');
        }
        out.push('\n');
    }
    indent(out, depth);
    out.push(']');
}

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            // Non-ASCII (and all other) characters are emitted raw.
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write_number(out: &mut String, d: f64) {
    // A finite integral double serializes as an integer (matching Java's
    // `(long) d` when `d == Math.rint(d)`, and JS `JSON.stringify`).
    if d.is_finite() && d == d.trunc() {
        let _ = write!(out, "{}", d as i64);
    } else {
        let _ = write!(out, "{d}");
    }
}

fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}
