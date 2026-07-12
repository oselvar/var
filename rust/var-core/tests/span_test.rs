//! Port of `SpanTest.java` / `span.test.ts`.

use var_core::offsets::utf16_len;
use var_core::span::Span;

#[test]
fn span_from_offsets_computes_line_and_column_for_a_single_line_source() {
    let source = "hello world";
    let span = Span::from_offsets(source, 6, 11);
    assert_eq!(
        span,
        Span {
            start_offset: 6,
            end_offset: 11,
            start_line: 1,
            start_col: 7,
            end_line: 1,
            end_col: 12
        }
    );
}

#[test]
fn span_from_offsets_handles_multi_line_sources() {
    let source = "line one\nline two\nline three";
    // 'two' starts at offset 14, ends at 17
    let span = Span::from_offsets(source, 14, 17);
    assert_eq!(
        span,
        Span {
            start_offset: 14,
            end_offset: 17,
            start_line: 2,
            start_col: 6,
            end_line: 2,
            end_col: 9
        }
    );
}

#[test]
fn span_from_offsets_handles_a_range_crossing_a_newline() {
    let source = "ab\ncd";
    // From offset 1 ('b') to 4 ('d')
    let span = Span::from_offsets(source, 1, 4);
    assert_eq!(
        span,
        Span {
            start_offset: 1,
            end_offset: 4,
            start_line: 1,
            start_col: 2,
            end_line: 2,
            end_col: 2
        }
    );
}

#[test]
fn span_from_offsets_handles_astral_chars_natively() {
    let s = "a😀b"; // 😀 is a surrogate pair: 2 UTF-16 code units
    assert_eq!(4, utf16_len(s)); // UTF-16 code units, same as JS .length
    let sp = Span::from_offsets(s, 0, 4);
    assert_eq!(0, sp.start_offset);
    assert_eq!(4, sp.end_offset);
    assert_eq!(1, sp.start_line);
    assert_eq!(1, sp.start_col);
    assert_eq!(1, sp.end_line);
    assert_eq!(5, sp.end_col);
}
