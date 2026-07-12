//! UTF-16 offset helpers — the conversion layer the Python port needed and Java
//! did not. All spans/offsets in the shared conformance goldens are UTF-16
//! code-unit offsets (Java `String`/`char` are UTF-16 natively); Rust `str` is
//! UTF-8, so byte offsets from `str::find`/the `regex` crate must be converted
//! to UTF-16 at every span-production site. Byte offsets exist only as transient
//! locals; every *stored* offset is UTF-16.

/// UTF-16 code-unit length of `s` (Java `String.length()`).
pub fn utf16_len(s: &str) -> usize {
    s.chars().map(char::len_utf16).sum()
}

/// Converts a byte index within `s` to a UTF-16 code-unit offset.
/// `byte_idx` must fall on a `char` boundary.
pub fn utf16_index(s: &str, byte_idx: usize) -> usize {
    utf16_len(&s[..byte_idx])
}

/// Converts a UTF-16 code-unit offset within `s` to a byte index. Clamps to
/// `s.len()` when `u16_idx` runs past the end (mirrors JS `String.slice`).
pub fn byte_index(s: &str, u16_idx: usize) -> usize {
    let mut u16 = 0usize;
    for (byte, c) in s.char_indices() {
        if u16 >= u16_idx {
            return byte;
        }
        u16 += c.len_utf16();
    }
    s.len()
}

/// Java `s.substring(startU16, endU16)` with UTF-16 indices.
pub fn utf16_slice(s: &str, start_u16: usize, end_u16: usize) -> &str {
    let start = byte_index(s, start_u16);
    let end = byte_index(s, end_u16);
    &s[start..end]
}

/// Java `String.trim()`: strips leading/trailing chars `<= U+0020`.
pub fn java_trim(s: &str) -> &str {
    s.trim_matches(|c: char| (c as u32) <= 0x20)
}

/// Java `String.strip()`: strips leading/trailing `Character.isWhitespace`.
pub fn java_strip(s: &str) -> &str {
    s.trim_matches(is_java_whitespace)
}

/// Java `String.stripLeading()`.
pub fn java_strip_leading(s: &str) -> &str {
    s.trim_start_matches(is_java_whitespace)
}

/// Java `Character.isWhitespace`: Unicode whitespace excluding the no-break
/// spaces U+00A0/U+2007/U+202F, plus the separator range U+001C–U+001F.
fn is_java_whitespace(c: char) -> bool {
    match c {
        '\u{00A0}' | '\u{2007}' | '\u{202F}' => false,
        '\u{001C}'..='\u{001F}' => true,
        _ => c.is_whitespace(),
    }
}
