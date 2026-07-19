//! Port of `CanonicalJsonTest.java` / `canonical-json.test.ts`.

mod common;

use common::vmap;
use varar_core::canonical_json::canonical_stringify;
use varar_core::value::Value;

#[test]
fn sorts_keys_indents_and_trailing_newline() {
    let value = vmap(vec![
        ("b", Value::Int(1)),
        (
            "a",
            Value::list(vec![
                Value::Int(2),
                vmap(vec![("d", Value::Int(4)), ("c", Value::Int(3))]),
            ]),
        ),
    ]);
    assert_eq!(
        "{\n  \"a\": [\n    2,\n    {\n      \"c\": 3,\n      \"d\": 4\n    }\n  ],\n  \"b\": 1\n}\n",
        canonical_stringify(&value)
    );
}

#[test]
fn non_ascii_is_emitted_raw() {
    let value = vmap(vec![("x", Value::from("café 😀"))]);
    assert_eq!("{\n  \"x\": \"café 😀\"\n}\n", canonical_stringify(&value));
}

#[test]
fn empty_containers_render_on_one_line() {
    let value = vmap(vec![("a", Value::list(vec![])), ("b", Value::map(vec![]))]);
    assert_eq!("{\n  \"a\": [],\n  \"b\": {}\n}\n", canonical_stringify(&value));
}

#[test]
fn sorts_keys_regardless_of_input_map_iteration_order() {
    let value1 = vmap(vec![
        ("z", Value::Int(1)),
        ("a", Value::Int(2)),
        ("m", Value::Int(3)),
    ]);
    let value2 = vmap(vec![
        ("m", Value::Int(3)),
        ("a", Value::Int(2)),
        ("z", Value::Int(1)),
    ]);
    let expected = "{\n  \"a\": 2,\n  \"m\": 3,\n  \"z\": 1\n}\n";
    assert_eq!(expected, canonical_stringify(&value1));
    assert_eq!(expected, canonical_stringify(&value2));
}

#[test]
fn escapes_quotes_backslashes_and_control_characters() {
    let value = vmap(vec![("s", Value::from("a\"b\\c\nd\te"))]);
    assert_eq!("{\n  \"s\": \"a\\\"b\\\\c\\nd\\te\"\n}\n", canonical_stringify(&value));
}

#[test]
fn serializes_numbers_booleans_and_null() {
    let value = vmap(vec![
        ("int", Value::Int(1)),
        ("long", Value::Int(2)),
        ("double", Value::Float(1.5)),
        ("bool", Value::Bool(true)),
        ("nul", Value::Null),
    ]);
    assert_eq!(
        "{\n  \"bool\": true,\n  \"double\": 1.5,\n  \"int\": 1,\n  \"long\": 2,\n  \"nul\": null\n}\n",
        canonical_stringify(&value)
    );
}

#[test]
fn serializes_nested_arrays_of_objects() {
    let value = Value::list(vec![
        vmap(vec![("b", Value::Int(1))]),
        vmap(vec![("a", Value::Int(2))]),
    ]);
    assert_eq!(
        "[\n  {\n    \"b\": 1\n  },\n  {\n    \"a\": 2\n  }\n]\n",
        canonical_stringify(&value)
    );
}

#[test]
fn top_level_scalar_serializes_without_indent_but_with_trailing_newline() {
    assert_eq!("\"hello\"\n", canonical_stringify(&Value::from("hello")));
    assert_eq!("42\n", canonical_stringify(&Value::Int(42)));
    assert_eq!("null\n", canonical_stringify(&Value::Null));
}
