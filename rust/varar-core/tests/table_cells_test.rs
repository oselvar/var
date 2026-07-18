//! Port of `TableCellsTest.java` / the table-cell span cases of `table-cells.ts`.
//! The `cellsListIsImmutable` case is dropped (Rust `Vec` is owned/immutable by
//! construction).

use varar_core::offsets::utf16_slice;
use varar_core::span::Span;
use varar_core::table_cells::parse_row_cells;

fn slice(source: &str, span: Span) -> &str {
    utf16_slice(source, span.start_offset, span.end_offset)
}

#[test]
fn basic_row_returns_trimmed_cells() {
    let source = "| a | b |";
    let result = parse_row_cells(source, 0, source);
    assert_eq!(vec!["a".to_string(), "b".to_string()], result.cells);
}

#[test]
fn basic_row_spans_point_to_trimmed_text() {
    let source = "| a | b |";
    let result = parse_row_cells(source, 0, source);
    assert_eq!(2, result.cell_spans.len());
    assert_eq!("a", slice(source, result.cell_spans[0]));
    assert_eq!("b", slice(source, result.cell_spans[1]));
}

#[test]
fn extra_padding_is_trimmed() {
    let source = "| Bob  | 30  |";
    let result = parse_row_cells(source, 0, source);
    assert_eq!(vec!["Bob".to_string(), "30".to_string()], result.cells);
    assert_eq!("Bob", slice(source, result.cell_spans[0]));
    assert_eq!("30", slice(source, result.cell_spans[1]));
}

#[test]
fn no_pipe_returns_empty() {
    let source = "hello world";
    let result = parse_row_cells(source, 0, source);
    assert!(result.cells.is_empty());
    assert!(result.cell_spans.is_empty());
}

#[test]
fn single_pipe_returns_empty() {
    let source = "| only one";
    let result = parse_row_cells(source, 0, source);
    assert!(result.cells.is_empty());
    assert!(result.cell_spans.is_empty());
}

#[test]
fn single_column_table_row() {
    let source = "| n |";
    let result = parse_row_cells(source, 0, source);
    assert_eq!(vec!["n".to_string()], result.cells);
    assert_eq!("n", slice(source, result.cell_spans[0]));
}

#[test]
fn line_start_offset_shifts_spans() {
    let prefix = "# T\n\n";
    let row = "| a | b |";
    let source = format!("{prefix}{row}");
    let line_start = prefix.len(); // ASCII prefix: byte len == utf16 len
    let result = parse_row_cells(row, line_start, &source);
    assert_eq!(vec!["a".to_string(), "b".to_string()], result.cells);
    assert_eq!("a", slice(&source, result.cell_spans[0]));
    assert_eq!("b", slice(&source, result.cell_spans[1]));
}

#[test]
fn astral_cell_shifts_following_span() {
    let source = "| 🎉 | a |"; // U+1F389 PARTY POPPER (2 UTF-16 code units)
    let result = parse_row_cells(source, 0, source);
    assert_eq!(vec!["🎉".to_string(), "a".to_string()], result.cells);
    assert_eq!(2, result.cell_spans[0].start_offset);
    assert_eq!(4, result.cell_spans[0].end_offset);
    assert_eq!(7, result.cell_spans[1].start_offset);
    assert_eq!(8, result.cell_spans[1].end_offset);
    assert_eq!("🎉", slice(source, result.cell_spans[0]));
    assert_eq!("a", slice(source, result.cell_spans[1]));
}

#[test]
fn three_column_row() {
    let source = "| name | age | city |";
    let result = parse_row_cells(source, 0, source);
    assert_eq!(
        vec!["name".to_string(), "age".to_string(), "city".to_string()],
        result.cells
    );
    assert_eq!("name", slice(source, result.cell_spans[0]));
    assert_eq!("age", slice(source, result.cell_spans[1]));
    assert_eq!("city", slice(source, result.cell_spans[2]));
}

#[test]
fn delimiter_row_gives_dashes() {
    let source = "| --- | --- |";
    let result = parse_row_cells(source, 0, source);
    assert_eq!(vec!["---".to_string(), "---".to_string()], result.cells);
}
