//! Port of `ParamDiffTest.java` / `param-diff.test.ts`.

mod common;

use common::vmap;
use varar_core::param_diff::compare_params;
use varar_core::span::Span;
use varar_core::value::Value;

const SOURCE: &str = "I should have 3 cukes in my big belly";

fn span(start: usize, end: usize) -> Span {
    Span::from_offsets(SOURCE, start, end)
}

#[test]
fn all_elements_equal_every_cell_ok() {
    let diffs = compare_params(
        &[Value::Int(3), Value::from("big")],
        &[Value::Int(3), Value::from("big")],
        &[span(14, 15), span(31, 34)],
        &["3".to_string(), "big".to_string()],
    );
    assert!(diffs.iter().all(|d| d.ok));
}

#[test]
fn one_mismatching_element_that_cell_is_not_ok_with_expected_actual() {
    let diffs = compare_params(
        &[Value::Int(4), Value::from("big")],
        &[Value::Int(3), Value::from("big")],
        &[span(14, 15), span(31, 34)],
        &["3".to_string(), "big".to_string()],
    );
    assert_eq!("cell 1", diffs[0].column);
    assert_eq!("3", diffs[0].expected);
    assert_eq!("4", diffs[0].actual);
    assert!(!diffs[0].ok);
    assert_eq!("cell 2", diffs[1].column);
    assert!(diffs[1].ok);
}

#[test]
fn object_actuals_compare_structurally_across_references() {
    let diffs = compare_params(
        &[vmap(vec![("iso", Value::from("NO"))])],
        &[vmap(vec![("iso", Value::from("NO"))])],
        &[span(0, 2)],
        &["NO".to_string()],
    );
    assert!(diffs[0].ok);
}
