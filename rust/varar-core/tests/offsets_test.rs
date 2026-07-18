//! Unit tests for the UTF-16 conversion layer (`offsets.rs`) — port infrastructure
//! the Python port needed. Not a 1:1 of a Java test file; these pin the helpers
//! the astral conformance cases (bundles 11/12) depend on.

use varar_core::offsets::{byte_index, utf16_index, utf16_len, utf16_slice};

#[test]
fn utf16_len_counts_code_units_ascii_and_astral() {
    assert_eq!(utf16_len(""), 0);
    assert_eq!(utf16_len("abc"), 3);
    // 😀 is a surrogate pair (2 UTF-16 code units); Java "a😀b".length() == 4.
    assert_eq!(utf16_len("a😀b"), 4);
    // Combining marks are single BMP code units.
    assert_eq!(utf16_len("e\u{0301}"), 2);
}

#[test]
fn utf16_index_converts_byte_to_code_unit_offset() {
    let s = "a😀b";
    assert_eq!(utf16_index(s, 0), 0);
    assert_eq!(utf16_index(s, 1), 1); // after 'a'
    assert_eq!(utf16_index(s, 1 + 4), 3); // after 'a' + 😀 (4 bytes, 2 units)
    assert_eq!(utf16_index(s, s.len()), 4);
}

#[test]
fn byte_index_is_the_inverse_of_utf16_index() {
    let s = "a😀b";
    assert_eq!(byte_index(s, 0), 0);
    assert_eq!(byte_index(s, 1), 1);
    assert_eq!(byte_index(s, 3), 5); // start of 'b'
    assert_eq!(byte_index(s, 4), 6); // end of string
    // Past-the-end clamps to the byte length (JS String.slice semantics).
    assert_eq!(byte_index(s, 99), s.len());
}

#[test]
fn utf16_slice_matches_java_substring() {
    let s = "a😀b";
    assert_eq!(utf16_slice(s, 0, 4), "a😀b");
    assert_eq!(utf16_slice(s, 1, 3), "😀");
    assert_eq!(utf16_slice(s, 3, 4), "b");
}
