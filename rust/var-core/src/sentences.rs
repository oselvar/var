//! Splits a block of text into sentence-level spans so the matcher can try each
//! sentence independently — port of `sentences.ts` / `Sentences.java`. Operates
//! on `char`s with a running UTF-16 offset table (the Python-port approach): the
//! split decisions use BMP terminators, and emitted offsets are UTF-16.

use crate::offsets::{java_strip, java_strip_leading, utf16_len};

/// A sentence: the trimmed text plus its UTF-16 offsets into the input.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sentence {
    pub text: String,
    pub start_offset: usize,
    pub end_offset: usize,
}

impl Sentence {
    pub fn new(text: impl Into<String>, start_offset: usize, end_offset: usize) -> Sentence {
        Sentence {
            text: text.into(),
            start_offset,
            end_offset,
        }
    }
}

const ABBREVIATIONS: [&str; 5] = ["e.g.", "i.e.", "etc.", "cf.", "vs."];

/// Splits `text` on `.`/`!`/`?`/newline terminators, skipping backtick code-span
/// and double-quoted interiors, and treating decimals and a fixed abbreviation
/// list as non-terminating dots.
pub fn split_sentences(text: &str) -> Vec<Sentence> {
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();

    // Prefix table: cp_to_u16[i] = UTF-16 offset of char i; cp_to_u16[n] = total.
    let mut cp_to_u16 = vec![0usize; n + 1];
    for i in 0..n {
        cp_to_u16[i + 1] = cp_to_u16[i] + chars[i].len_utf16();
    }

    // Mark backtick code spans and double-quoted strings as no-split zones.
    let mut skip = vec![false; n];
    let mut j = 0;
    while j < n {
        let c = chars[j];
        if c == '`' || c == '"' {
            match find_char(&chars, j + 1, c) {
                Some(close) => {
                    for entry in skip.iter_mut().take(close + 1).skip(j) {
                        *entry = true;
                    }
                    j = close;
                }
                None => break,
            }
        }
        j += 1;
    }

    let mut out = Vec::new();
    let mut segment_start = 0usize;
    let mut i = 0;
    while i < n {
        if skip[i] {
            i += 1;
            continue;
        }
        let ch = chars[i];
        if ch == '\n' || ch == '.' || ch == '!' || ch == '?' {
            if ch == '.' && is_inside_number_or_abbrev(&chars, i) {
                i += 1;
                continue;
            }
            let end = i + 1;
            push_segment(&mut out, &chars, &cp_to_u16, segment_start, end);
            i = end;
            // Skip following whitespace so the next sentence starts at content.
            while i < n && (chars[i] == ' ' || chars[i] == '\n') {
                i += 1;
            }
            segment_start = i;
            continue;
        }
        i += 1;
    }
    push_segment(&mut out, &chars, &cp_to_u16, segment_start, n);
    out
}

fn find_char(chars: &[char], from: usize, target: char) -> Option<usize> {
    (from..chars.len()).find(|&k| chars[k] == target)
}

fn push_segment(
    out: &mut Vec<Sentence>,
    chars: &[char],
    cp_to_u16: &[usize],
    start: usize,
    end: usize,
) {
    if end <= start {
        return;
    }
    let raw: String = chars[start..end].iter().collect();
    let slice = java_strip(&raw);
    if slice.is_empty() {
        return;
    }
    let leading = utf16_len(&raw) - utf16_len(java_strip_leading(&raw));
    let trimmed_start = cp_to_u16[start] + leading;
    let trimmed_end = trimmed_start + utf16_len(slice);
    out.push(Sentence {
        text: slice.to_string(),
        start_offset: trimmed_start,
        end_offset: trimmed_end,
    });
}

fn is_inside_number_or_abbrev(chars: &[char], dot_pos: usize) -> bool {
    let prev = if dot_pos > 0 {
        chars[dot_pos - 1]
    } else {
        '\0'
    };
    let next = if dot_pos + 1 < chars.len() {
        chars[dot_pos + 1]
    } else {
        '\0'
    };
    if prev.is_ascii_digit() && next.is_ascii_digit() {
        return true;
    }
    // Known abbreviations ending at dot_pos+1.
    for abbrev in ABBREVIATIONS {
        let len = abbrev.chars().count();
        let from = (dot_pos + 1).saturating_sub(len);
        let candidate: String = chars[from..dot_pos + 1].iter().collect();
        if candidate == abbrev {
            return true;
        }
    }
    // Lowercase letter following → likely intra-word.
    next.is_ascii_lowercase()
}
