//! Port of `SentencesTest.java` / `sentences.test.ts`. The `resultListIsImmutable`
//! case is dropped (Rust `Vec` is owned/immutable).

use var_core::offsets::utf16_len;
use var_core::sentences::{Sentence, split_sentences};

fn texts(sentences: &[Sentence]) -> Vec<String> {
    sentences.iter().map(|s| s.text.clone()).collect()
}

#[test]
fn splits_a_paragraph_on_periods_question_marks_exclamation_marks() {
    let result = split_sentences("First sentence. Second one? Third one!");
    assert_eq!(
        vec!["First sentence.", "Second one?", "Third one!"],
        texts(&result)
    );
}

#[test]
fn keeps_offsets_relative_to_the_input_text() {
    let result = split_sentences("Alpha. Beta.");
    assert_eq!(
        vec![Sentence::new("Alpha.", 0, 6), Sentence::new("Beta.", 7, 12)],
        result
    );
}

#[test]
fn does_not_split_inside_numeric_literals() {
    let result = split_sentences("The price is $1.50 today.");
    assert_eq!(vec!["The price is $1.50 today."], texts(&result));
}

#[test]
fn does_not_split_on_common_abbreviations() {
    let result = split_sentences("Use e.g. coffee. It works.");
    assert_eq!(vec!["Use e.g. coffee.", "It works."], texts(&result));
}

#[test]
fn treats_a_blank_line_as_a_sentence_boundary() {
    let result = split_sentences("First.\n\nSecond.");
    assert_eq!(vec!["First.", "Second."], texts(&result));
}

#[test]
fn treats_a_backtick_code_span_as_a_single_token() {
    let result = split_sentences("Run `npm test` first. Then `git push`.");
    assert_eq!(
        vec!["Run `npm test` first.", "Then `git push`."],
        texts(&result)
    );
}

#[test]
fn the_final_sentence_does_not_require_a_terminator() {
    let result = split_sentences("Alpha. Beta");
    assert_eq!(vec!["Alpha.", "Beta"], texts(&result));
}

#[test]
fn does_not_split_on_terminators_inside_a_double_quoted_string() {
    let result = split_sentences("Alpha \"with . and ? inside\" beta. Gamma.");
    assert_eq!(
        vec!["Alpha \"with . and ? inside\" beta.", "Gamma."],
        texts(&result)
    );
}

#[test]
fn splits_on_a_single_newline_gherkin_style_line_per_step() {
    let result = split_sentences("Given I greet \"world\"\nThen the greeting is \"Hello, world!\"");
    assert_eq!(
        vec![
            "Given I greet \"world\"",
            "Then the greeting is \"Hello, world!\""
        ],
        texts(&result)
    );
}

#[test]
fn splits_between_terminators_outside_quoted_strings_ignoring_those_inside() {
    let result = split_sentences("Alpha \"with ! inside\". Beta \"and ? inside\"!");
    assert_eq!(
        vec!["Alpha \"with ! inside\".", "Beta \"and ? inside\"!"],
        texts(&result)
    );
}

#[test]
fn astral_character_keeps_offsets_correct() {
    let text = "Party time 🎉! Next one.";
    let result = split_sentences(text);
    assert_eq!(vec!["Party time 🎉!", "Next one."], texts(&result));
    let first = &result[0];
    assert_eq!(0, first.start_offset);
    assert_eq!(utf16_len("Party time 🎉!"), first.end_offset);
    assert_eq!(
        first.text,
        var_core::offsets::utf16_slice(text, first.start_offset, first.end_offset)
    );
}
