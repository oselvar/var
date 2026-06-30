# test_inline.py — tests for strip_inline, translated from inline.test.ts + astral cases
from var.inline import strip_inline
from var.ast import InlineOffset


def _lift_offset(m: tuple[InlineOffset, ...], t: int) -> int:
    """Reproduce the liftOffset helper from inline.test.ts."""
    best = m[0]
    for e in m:
        if e.text_offset <= t:
            best = e
    return best.source_offset + (t - best.text_offset)


def test_plain_text_identity():
    text, m = strip_inline("hello", 10)
    assert text == "hello"
    assert m[0].text_offset == 0 and m[0].source_offset == 10


def test_strips_bold_and_italic_markers_preserving_inner_text():
    # Translated from: 'strips bold and italic markers, preserving inner text'
    text, m = strip_inline("Given I have **100** in *my* account", 10)
    assert text == "Given I have 100 in my account"
    # 'Given I have ' = 13 chars; '**' opens at utf16 offset 13; inner '100' at 15
    # source_base=10, so sourceOffset = 10 + 15 = 25
    entry = next((e for e in m if e.text_offset == 13), None)
    assert entry is not None
    assert entry.source_offset == 10 + len("Given I have **")  # 10 + 15 = 25


def test_reduces_inline_links_to_their_text():
    # Translated from: 'reduces inline links to their text, drops the URL'
    text, _ = strip_inline("See [the docs](https://example.com).", 0)
    assert text == "See the docs."


def test_preserves_backtick_code_spans_verbatim():
    # Translated from: 'preserves backtick code spans verbatim (including the backticks)'
    text, _ = strip_inline("Run `npm test` first.", 0)
    assert text == "Run `npm test` first."


def test_map_lifts_text_offset_to_source_offset():
    # Translated from: 'map allows lifting text offsets back to source offsets'
    text, m = strip_inline("a **bold** word", 100)
    assert text == "a bold word"
    # 'bold' starts at text offset 2; source: 100 + len('a **') = 104
    assert _lift_offset(m, 2) == 104


def test_mid_word_underscores_are_preserved():
    # Translated from: 'mid-word underscores are preserved (snake_case is not mangled)'
    text, _ = strip_inline("the field do_something_now is set", 0)
    assert text == "the field do_something_now is set"


def test_leading_underscore_at_word_boundary_emphasizes():
    # Translated from: 'leading underscore at a word boundary still emphasizes'
    text, _ = strip_inline("Hello _world_ today", 0)
    assert text == "Hello world today"


def test_mid_word_asterisk_still_strips():
    # Translated from: 'mid-word asterisk still strips (CommonMark allows it)'
    text, _ = strip_inline("we *love* code", 0)
    assert text == "we love code"


def test_bold_unwrapped_with_inner_span():
    text, m = strip_inline("a **b** c", 0)
    assert text == "a b c"


def test_astral_before_marker_keeps_utf16_offsets():
    # "😀 *x*" : 😀 is 2 u16 units, space 1, then emphasis at u16 offset 3
    text, m = strip_inline("😀 *x*", 0)
    assert text == "😀 x"
    # the entry for inner "x" must carry a UTF-16 source_offset >= 4
    # (😀=2 units + ' '=1 + '*'=1 = offset 4 for 'x')
    assert any(e.source_offset >= 4 for e in m)


def test_empty_string_returns_fallback_map():
    text, m = strip_inline("", 5)
    assert text == ""
    assert len(m) == 1
    assert m[0].text_offset == 0
    assert m[0].source_offset == 5
