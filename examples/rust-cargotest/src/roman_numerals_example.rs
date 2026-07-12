//! Decimal → Roman numeral conversion (the `roman-numerals.md` domain).
//!
//! A straight port of `examples/python-pytest/src/roman_numerals_example`.

const NUMERALS: &[(&str, u32)] = &[
    ("M", 1000),
    ("CM", 900),
    ("D", 500),
    ("CD", 400),
    ("C", 100),
    ("XC", 90),
    ("L", 50),
    ("XL", 40),
    ("X", 10),
    ("IX", 9),
    ("V", 5),
    ("IV", 4),
    ("I", 1),
];

pub fn to_roman(mut num: u32) -> String {
    let mut result = String::new();
    for (letter, value) in NUMERALS {
        while num >= *value {
            num -= *value;
            result.push_str(letter);
        }
    }
    result
}
