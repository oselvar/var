//! Port of `CellDiffTest.java` / `cell-diff.test.ts`.

mod common;

use common::{vlist, vmap};
use varar_core::ast::{Block, Table};
use varar_core::cell_diff::{CellDiff, RowCheck, compare_row, compare_table};
use varar_core::error::StepError;
use varar_core::offsets::utf16_slice;
use varar_core::parse::parse;
use varar_core::span::Span;
use varar_core::value::Value;

const SPAN: Span = Span {
    start_offset: 0,
    end_offset: 1,
    start_line: 1,
    start_col: 1,
    end_line: 1,
    end_col: 2,
};

fn checks() -> Vec<RowCheck> {
    vec![
        RowCheck::new("dice", "3, 3, 3, 4, 4", SPAN),
        RowCheck::new("score", "9", SPAN),
    ]
}

const TABLE_SRC: &str = "# T\n\nthese:\n\n| before | after |\n| ------ | ----- |\n| var    | VAR   |\n| bdd    | BDD   |";

fn table_of(source: &str) -> Table {
    let doc = parse("t.md", source);
    doc.examples[0]
        .body
        .iter()
        .find_map(|b| {
            if let Block::Table(t) = b {
                Some(t.clone())
            } else {
                None
            }
        })
        .expect("no table parsed")
}

#[test]
fn a_returned_column_that_matches_its_cell_is_ok() {
    let diffs = compare_row(Some(&vmap(vec![("score", Value::Int(9))])), &checks());
    assert_eq!(vec![CellDiff::new("score", SPAN, "9", "9", true)], diffs);
}

#[test]
fn a_returned_column_that_differs_is_not_ok_with_expected_and_actual() {
    let diffs = compare_row(Some(&vmap(vec![("score", Value::Int(6))])), &checks());
    assert_eq!(vec![CellDiff::new("score", SPAN, "9", "6", false)], diffs);
}

#[test]
fn columns_that_are_not_returned_are_inputs_not_checked() {
    let diffs = compare_row(Some(&vmap(vec![("score", Value::Int(9))])), &checks());
    let cols: Vec<String> = diffs.iter().map(|d| d.column.clone()).collect();
    assert_eq!(vec!["score".to_string()], cols);
}

#[test]
fn a_returned_key_that_is_not_a_column_is_ignored() {
    assert_eq!(
        Vec::<CellDiff>::new(),
        compare_row(Some(&vmap(vec![("nope", Value::Int(1))])), &checks())
    );
}

#[test]
fn null_non_map_return_checks_nothing() {
    assert_eq!(Vec::<CellDiff>::new(), compare_row(None, &checks()));
    assert_eq!(Vec::<CellDiff>::new(), compare_row(Some(&Value::Int(42)), &checks()));
}

#[test]
fn cell_mismatch_carries_the_cells_and_is_detectable() {
    let err = StepError::CellMismatch(vec![CellDiff::new("score", SPAN, "9", "6", false)]);
    assert!(err.as_cell_mismatch().is_some());
    assert!(
        StepError::Handler(varar_core::error::HandlerError::new("x"))
            .as_cell_mismatch()
            .is_none()
    );
    assert_eq!("6", err.as_cell_mismatch().unwrap()[0].actual);
    assert!(err.message().contains("score"));
}

#[test]
fn compare_table_array_of_arrays_full_match_all_ok() {
    let table = table_of(TABLE_SRC);
    let diffs = compare_table(
        Some(&vlist(vec![
            vlist(vec![Value::from("var"), Value::from("VAR")]),
            vlist(vec![Value::from("bdd"), Value::from("BDD")]),
        ])),
        &table,
    )
    .unwrap();
    assert_eq!(4, diffs.len());
    assert!(diffs.iter().all(|d| d.ok));
}

#[test]
fn compare_table_array_of_records_full_match_all_ok() {
    let table = table_of(TABLE_SRC);
    let diffs = compare_table(
        Some(&vlist(vec![
            vmap(vec![
                ("before", Value::from("var")),
                ("after", Value::from("VAR")),
            ]),
            vmap(vec![
                ("before", Value::from("bdd")),
                ("after", Value::from("BDD")),
            ]),
        ])),
        &table,
    )
    .unwrap();
    assert!(diffs.iter().all(|d| d.ok));
}

#[test]
fn compare_table_one_wrong_cell_not_ok_with_expected_actual_span() {
    let table = table_of(TABLE_SRC);
    let diffs = compare_table(
        Some(&vlist(vec![
            vlist(vec![Value::from("var"), Value::from("WRONG")]),
            vlist(vec![Value::from("bdd"), Value::from("BDD")]),
        ])),
        &table,
    )
    .unwrap();
    let bad: Vec<&CellDiff> = diffs.iter().filter(|d| !d.ok).collect();
    assert_eq!(1, bad.len());
    assert_eq!("after", bad[0].column);
    assert_eq!("VAR", bad[0].expected);
    assert_eq!("WRONG", bad[0].actual);
    assert_eq!("VAR", utf16_slice(TABLE_SRC, bad[0].span.start_offset, bad[0].span.end_offset));
}

#[test]
fn compare_table_numbers_are_stringified_before_compare() {
    let table = table_of("# T\n\nthese:\n\n| n |\n| - |\n| 7 |");
    let diffs = compare_table(Some(&vlist(vec![vlist(vec![Value::Int(7)])])), &table).unwrap();
    assert!(diffs.iter().all(|d| d.ok));
}

#[test]
fn compare_table_null_return_checks_nothing() {
    let table = table_of(TABLE_SRC);
    assert_eq!(Vec::<CellDiff>::new(), compare_table(None, &table).unwrap());
}

#[test]
fn compare_table_extra_keys_on_a_returned_record_are_ignored() {
    let table = table_of(TABLE_SRC);
    let diffs = compare_table(
        Some(&vlist(vec![
            vmap(vec![
                ("before", Value::from("var")),
                ("after", Value::from("VAR")),
                ("extra", Value::from("ignored")),
            ]),
            vmap(vec![
                ("before", Value::from("bdd")),
                ("after", Value::from("BDD")),
                ("note", Value::Int(123)),
            ]),
        ])),
        &table,
    )
    .unwrap();
    assert!(diffs.iter().all(|d| d.ok));
    let cols: Vec<String> = diffs.iter().map(|d| d.column.clone()).collect();
    assert_eq!(vec!["before", "after", "before", "after"], cols);
}

#[test]
fn compare_table_shape_type_errors_throw_return_shape() {
    let table = table_of(TABLE_SRC);
    let is_shape =
        |r: Result<Vec<CellDiff>, StepError>| matches!(r.unwrap_err(), StepError::ReturnShape(_));
    assert!(is_shape(compare_table(Some(&Value::from("nope")), &table))); // not a list
    assert!(is_shape(compare_table(
        Some(&vlist(vec![vlist(vec![Value::from("var"), Value::from("VAR")])])),
        &table
    ))); // wrong row count
    assert!(is_shape(compare_table(
        Some(&vlist(vec![
            vlist(vec![Value::from("var")]),
            vlist(vec![Value::from("bdd")])
        ])),
        &table
    ))); // wrong width
    assert!(is_shape(compare_table(
        Some(&vlist(vec![
            vmap(vec![("before", Value::from("var"))]),
            vmap(vec![("before", Value::from("bdd"))]),
        ])),
        &table
    ))); // missing key
    assert!(is_shape(compare_table(
        Some(&vlist(vec![
            vlist(vec![Value::from("var"), Value::from("VAR")]),
            vmap(vec![
                ("before", Value::from("bdd")),
                ("after", Value::from("BDD"))
            ]),
        ])),
        &table
    ))); // mixed forms
}
