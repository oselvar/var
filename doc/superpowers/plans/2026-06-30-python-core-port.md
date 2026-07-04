# Python core port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native pure-Python port of the `@oselvar/var-core` runtime pipeline (parse → match → plan → execute + diffs + `define_state`) that reproduces the shared conformance goldens byte-for-byte.

**Architecture:** This is a **port**: for every task the cited TypeScript source file in `typescript/packages/var-core/src/` (and `…/var/src/internal.ts`) is the authoritative behavioural spec — translate its algorithm, do not redesign it. Two gate types per task: (1) the **translated unit test** (the Python version of the named `…/var-core/tests/*.test.ts`) and (2) the **conformance goldens** (the Python harness must match `conformance/bundles/*/golden/*.json`, the artifacts the TS reference generated). The pipeline is staged by the four golden artifacts: `var-doc.json` (M1 parse) → `registry.json` (M2 registration) → `plan.json` (M3 match+plan) → `trace.json` (M4 execute).

**Tech Stack:** Python ≥ 3.11, uv workspace at `python/`, `pytest`, `ruff`, runtime dep `cucumber-expressions==20.0.0`.

## Global Constraints

- **Pure functional core.** No filesystem, network, globals, or time in `var/` (the harness/fixtures do I/O). Immutable data: `@dataclass(frozen=True, slots=True)` nodes, `tuple[...]` for arrays, `Mapping`/`MappingProxyType` for maps.
- **Offsets are UTF-16 code units.** Every `startOffset`/`endOffset`/`startCol`/`endCol` counts UTF-16 code units (astral char = 2), matching the TS reference. Reproduce exactly; never emit code-point or byte offsets.
- **Runtime dependency:** `cucumber-expressions==20.0.0` only (exact parity with TS `@cucumber/cucumber-expressions ^20.0.0`). No JS, no Node, no other runtime deps.
- **Author API** mirrors the current `defineState` return-merge model (decorator form), NOT issue #2's `@step`/mutation sketch.
- **Canonical JSON** wire format: recursively key-sorted, 2-space indent, LF endings, trailing newline, non-ASCII emitted raw (not `\u`-escaped), step-def files referenced by stem (`x.steps.py` and `x.steps.ts` both → `x.steps`).
- **Each task ends green** from `python/`: `uv run pytest` and `uv run ruff check`, and (from M1 on) the conformance harness for the artifacts implemented so far. Commit per task.
- All code lives under `python/packages/var/src/var/` (module names snake_case) with tests in `python/packages/var/tests/`. The conformance harness + fixtures are the exception (see Tasks 8–9).

---

## File Structure

`python/packages/var/src/var/`: `span.py`, `ast.py`, `inline.py`, `table_cells.py`, `scanner.py`, `structurer.py`, `parse.py`, `step_role.py`, `registry.py`, `define_state.py`, `matcher.py`, `plan.py`, `diagnostics.py`, `execute.py`, `deep_freeze.py`, `cell_diff.py`, `doc_string_diff.py`, `param_diff.py`, `table_cells_diff` (folded into `cell_diff`), `failure.py`, `result.py`, `canonical_json.py`, `conformance.py`, and `__init__.py` (re-exports `define_state`).

`python/packages/var/tests/`: one `test_<module>.py` per module (translated from the matching `var-core/tests/*.test.ts`) plus `test_conformance.py` (the harness).

Conformance fixtures: `conformance/bundles/*/steps.py` (authored), and new multibyte bundles under `conformance/bundles/`.

---

## MILESTONE 1 — parse → `var-doc.json`

### Task 1: `span.py` — Span + UTF-16 offset primitives

**Port of:** `var-core/src/span.ts`. **New (no TS equivalent):** the UTF-16 helpers (TS gets them free from JS string semantics; Python must compute them).

**Files:**
- Create: `python/packages/var/src/var/span.py`
- Test: `python/packages/var/tests/test_span.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True, slots=True) class Span` with int fields `start_offset, end_offset, start_line, start_col, end_line, end_col`; `utf16_len(s: str) -> int`; `to_utf16_offset(source: str, cp_index: int) -> int`; `utf16_slice(source: str, start_u16: int, end_u16: int) -> str`; `line_col(source: str, offset_u16: int) -> tuple[int, int]`; `span_from_offsets(source: str, start_u16: int, end_u16: int) -> Span`.
- Note: `line_col`/`span_from_offsets` take **UTF-16** offsets (as the AST stores them) and must count code units, matching `span.ts`.

- [ ] **Step 1: Write the failing test**

```python
# test_span.py
from var.span import utf16_len, to_utf16_offset, utf16_slice, line_col, span_from_offsets

def test_utf16_len_ascii_and_astral():
    assert utf16_len("abc") == 3
    assert utf16_len("é") == 1          # BMP: 1 code unit
    assert utf16_len("😀") == 2          # astral: surrogate pair
    assert utf16_len("a😀b") == 4

def test_to_utf16_offset_counts_units_before_cp_index():
    s = "a😀b"                           # cp indices: a=0 😀=1 b=2
    assert to_utf16_offset(s, 0) == 0
    assert to_utf16_offset(s, 1) == 1    # after "a"
    assert to_utf16_offset(s, 2) == 3    # after "a😀" (1+2)

def test_utf16_slice_roundtrips_through_units():
    s = "x😀y"                           # u16: x=0 😀=1..3 y=3
    assert utf16_slice(s, 0, 1) == "x"
    assert utf16_slice(s, 1, 3) == "😀"
    assert utf16_slice(s, 3, 4) == "y"

def test_line_col_counts_utf16_units():
    s = "ab\n😀x"                        # u16 offsets: a0 b1 \n2 😀3-4 x5
    assert line_col(s, 1) == (1, 2)
    assert line_col(s, 5) == (2, 3)      # col counts the astral char as 2

def test_span_from_offsets():
    sp = span_from_offsets("hello", 0, 5)
    assert (sp.start_offset, sp.end_offset, sp.start_line, sp.start_col, sp.end_line, sp.end_col) == (0, 5, 1, 1, 1, 6)
```

- [ ] **Step 2: Run, verify it fails** — `cd python && uv run pytest packages/var/tests/test_span.py -q` → FAIL (module not found).

- [ ] **Step 3: Implement**

```python
# span.py
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class Span:
    start_offset: int
    end_offset: int
    start_line: int
    start_col: int
    end_line: int
    end_col: int

def utf16_len(s: str) -> int:
    n = 0
    for ch in s:
        n += 2 if ord(ch) > 0xFFFF else 1
    return n

def to_utf16_offset(source: str, cp_index: int) -> int:
    return utf16_len(source[:cp_index])

def _cp_index_for_utf16(source: str, u16: int) -> int:
    # inverse of to_utf16_offset: code-point index at a UTF-16 offset
    count = 0
    for i, ch in enumerate(source):
        if count >= u16:
            return i
        count += 2 if ord(ch) > 0xFFFF else 1
    return len(source)

def utf16_slice(source: str, start_u16: int, end_u16: int) -> str:
    a = _cp_index_for_utf16(source, start_u16)
    b = _cp_index_for_utf16(source, end_u16)
    return source[a:b]

def line_col(source: str, offset_u16: int) -> tuple[int, int]:
    line, col, count = 1, 1, 0
    for ch in source:
        if count >= offset_u16:
            break
        if ch == "\n":
            line, col = line + 1, 1
        else:
            col += 2 if ord(ch) > 0xFFFF else 1
        count += 2 if ord(ch) > 0xFFFF else 1
    return line, col

def span_from_offsets(source: str, start_u16: int, end_u16: int) -> Span:
    sl, sc = line_col(source, start_u16)
    el, ec = line_col(source, end_u16)
    return Span(start_u16, end_u16, sl, sc, el, ec)
```

- [ ] **Step 4: Run, verify pass** — `uv run pytest packages/var/tests/test_span.py -q` → PASS. Then `uv run ruff check`.

- [ ] **Step 5: Commit** — `git add python && git commit -m "feat(py): span + UTF-16 offset primitives"`

---

### Task 2: `ast.py` — immutable AST node dataclasses

**Port of:** `var-core/src/ast.ts` (the type definitions).

**Files:**
- Create: `python/packages/var/src/var/ast.py`
- Test: `python/packages/var/tests/test_ast.py`

**Interfaces (Produces):** frozen dataclasses with **snake_case** fields (the conformance layer maps to the camelCase wire format later, Task 8):
`InlineOffset(text_offset:int, source_offset:int)`; `Heading(kind="heading", level:int, text:str, span:Span)`; `Paragraph(kind="paragraph", text:str, span:Span, inline_map:tuple[InlineOffset,...])`; `ListItem(kind="list_item", text, span, inline_map, ordered:bool, marker_span:Span)`; `Blockquote(kind="blockquote", text, span, inline_map)`; `Row(cells:tuple[str,...], cell_spans:tuple[Span,...], span:Span)`; `Table(kind="table", span, header:Row, rows:tuple[Row,...])`; `Fence(kind="fence", span, info:str, body:str, body_span:Span)`; `ThematicBreak(kind="thematic_break", span)`; `Block = Heading|Paragraph|ListItem|Blockquote|Table|Fence|ThematicBreak`; `Example(scope_stack:tuple[str,...], span:Span, body:tuple[Block,...])`; `VarDoc(path:str, source:str, examples:tuple[Example,...], orphan_attachments:tuple[Table|Fence,...])`.

- [ ] **Step 1: Failing test** — assert each dataclass constructs and is frozen:

```python
# test_ast.py
import pytest
from dataclasses import FrozenInstanceError
from var.span import span_from_offsets
from var.ast import Paragraph, InlineOffset, Heading, VarDoc

def test_nodes_construct_and_are_frozen():
    p = Paragraph(kind="paragraph", text="hi", span=span_from_offsets("hi", 0, 2),
                  inline_map=(InlineOffset(0, 0),))
    assert p.text == "hi" and p.kind == "paragraph"
    with pytest.raises(FrozenInstanceError):
        p.text = "no"  # type: ignore[misc]

def test_vardoc_holds_examples():
    d = VarDoc(path="example.md", source="", examples=(), orphan_attachments=())
    assert d.path == "example.md" and d.examples == ()
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `ast.py` per the Interfaces block (frozen slotted dataclasses; `kind` is a literal default on each). Use `from __future__ import annotations` and `Union` for `Block`.
- [ ] **Step 4: Run → PASS; `uv run ruff check`.**
- [ ] **Step 5: Commit** — `feat(py): immutable AST node dataclasses`

---

### Task 3: `inline.py` — `strip_inline` (UTF-16 aware)

**Port of:** `var-core/src/inline.ts`. **Translate test:** `var-core/tests/inline.test.ts`.

**Critical portability rule:** `inline.ts` indexes `rawText` with `charCodeAt(i)` / `indexOf` / `slice` where `i` is a **UTF-16** index, and pushes `sourceOffset = sourceBase + i` (UTF-16). In Python you must reproduce UTF-16 offsets. Recommended approach: iterate by code point but maintain a running UTF-16 cursor (`u16 += 2 if ord(ch) > 0xFFFF else 1`); the pushed `source_offset` is `source_base + (u16 cursor at that char)`, and `text_offset` likewise counts UTF-16 units of the emitted text. `source_base` is the UTF-16 offset passed by the caller. Match `inline.ts`'s exact rules: backticks, `[text](url)` links (inner text kept, span at inner start), `*`/`_` emphasis (single/double; `_` only mid-word-suppressed per the CommonMark `isWord` check using `\p{L}\p{N}_`), and the `pushOffset` dedup (only push when `text_offset` changed). Final fallback `{text_offset:0, source_offset:source_base}` when map empty.

**Files:** Create `inline.py`; Test `test_inline.py`.

**Interfaces (Produces):** `strip_inline(raw_text: str, source_base: int) -> tuple[str, tuple[InlineOffset, ...]]` (returns `(text, map)`).

- [ ] **Step 1: Failing test** — translate `inline.test.ts` cases (plain text identity map; backtick code span; link unwrap; `**bold**`/`*italic*`; `snake_case` underscore preserved) and ADD astral cases:

```python
# test_inline.py (excerpt — translate the rest from inline.test.ts)
from var.inline import strip_inline

def test_plain_text_identity():
    text, m = strip_inline("hello", 10)
    assert text == "hello"
    assert m[0].text_offset == 0 and m[0].source_offset == 10

def test_bold_unwrapped_with_inner_span():
    text, m = strip_inline("a **b** c", 0)
    assert text == "a b c"

def test_astral_before_marker_keeps_utf16_offsets():
    # "😀 *x*" : 😀 is 2 u16 units, space 1, then emphasis at u16 offset 3
    text, m = strip_inline("😀 *x*", 0)
    assert text == "😀 x"
    # the entry for inner "x" must carry a UTF-16 source_offset (>=4)
    assert any(e.source_offset >= 4 for e in m)
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `strip_inline` per `inline.ts`, applying the UTF-16 cursor rule above. Port `is_word` with `regex`/`re` using `\w` over unicode or an explicit category check (`ch.isalnum() or ch == "_"` is an acceptable equivalent of `\p{L}\p{N}_`).
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): inline stripping with UTF-16 offsets`

---

### Task 4: `table_cells.py` — `parse_row_cells`

**Port of:** `var-core/src/table-cells.ts`. **Translate test:** any table-cell cases in `scanner.test.ts`/`ast.test.ts` plus author direct cases.

**Files:** Create `table_cells.py`; Test `test_table_cells.py`.

**Interfaces (Produces):** `parse_row_cells(line_text: str, line_start_offset: int, source: str) -> tuple[tuple[str,...], tuple[Span,...]]` returning `(cells, cell_spans)`. Read `table-cells.ts` for the exact pipe-splitting + trimming + per-cell span computation; reproduce its offsets in UTF-16 (line_start_offset is UTF-16; advance per the helper).

- [ ] **Step 1: Failing test** — `| a | b |` → cells `("a","b")` with spans at the trimmed cell text; include a row with a multibyte cell asserting UTF-16 span. (Mirror exact behaviour from `table-cells.ts`.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `table-cells.ts`.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): table row cell parsing`

---

### Task 5: `scanner.py` — block scanner

**Port of:** `var-core/src/scanner.ts`. **Translate test:** `var-core/tests/scanner.test.ts`.

**Files:** Create `scanner.py`; Test `test_scanner.py`.

**Interfaces:**
- Consumes: `strip_inline` (Task 3), `parse_row_cells` (Task 4), `span_from_offsets`/UTF-16 helpers (Task 1), AST nodes (Task 2).
- Produces: `scan(source: str, plugins: tuple[ScannerPlugin, ...] = ()) -> tuple[Block, ...]`; `RawLine` dataclass `(text:str, start_offset:int, end_offset:int)`; `ScannerPlugin` Protocol with `try_scan(input) -> tuple[Block,int]|None`. (Plugins param exists for parity; pass `()` — no plugin is in scope unless Task 9's audit finds a bundle needs one.)

**Portability rules:** `split_lines` must compute `start_offset`/`end_offset` in **UTF-16** (advance by `utf16_len` of each line + 1 for `\n`). Every `try*` helper builds spans via `span_from_offsets` with UTF-16 offsets. Port the regexes (`THEMATIC_RE`, `UL_RE`, `OL_RE`, `BQ_RE`, `FENCE_RE`, `ROW_RE`, `DELIM_RE`, heading regex) to Python `re` verbatim (they are ASCII-structural; `.` etc. behave the same). Where TS uses `line.text.indexOf(rawText)` to locate text start, use `str.find` and convert the resulting code-point index to a UTF-16 delta before adding to the UTF-16 `line.start_offset`.

- [ ] **Step 1: Failing test** — translate `scanner.test.ts` (heading levels, paragraph consumption with continuation/break rules, list items ordered/unordered with marker spans, blockquote multi-line join, fenced code with info+body+bodySpan, thematic break, table). Add one astral paragraph case asserting the paragraph span end offset is UTF-16.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `scan` and all helpers per `scanner.ts`, applying the UTF-16 rules. Keep function names parallel (`try_heading`, `try_list_item`, `try_blockquote`, `consume_paragraph`, `try_fence`, `try_table`, `try_thematic`).
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): markdown block scanner (UTF-16)`

---

### Task 6: `structurer.py` + `parse.py`

**Port of:** `var-core/src/structurer.ts` and `parse.ts`. **Translate tests:** `structurer.test.ts`, `parse.test.ts`.

**Files:** Create `structurer.py`, `parse.py`; Tests `test_structurer.py`, `test_parse.py`.

**Interfaces:**
- Produces: `structure(path: str, source: str, blocks: tuple[Block,...]) -> VarDoc`; `parse(path: str, source: str, plugins=()) -> VarDoc` (= `scan` then `structure`, mirroring `parse.ts`).
- `structure` groups blocks into `Example`s: maintains the heading `scope_stack` (outer→inner), starts an example at each primary block (paragraph/list_item/blockquote), appends trailing tables/fences to the current example body, and collects `orphan_attachments` (tables/fences with no preceding primary block). Read `structurer.ts` for the exact grouping + orphan rules.

- [ ] **Step 1: Failing test** — translate `structurer.test.ts` + `parse.test.ts` (scope stack from nested headings; example body with attached table/fence; orphan attachment). Assert `parse("example.md", src)` returns a `VarDoc` with the expected `examples`/`scope_stack`/`orphan_attachments`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `structure` per `structurer.ts`, `parse` per `parse.ts`.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): structurer + parse`

---

### Task 7: `canonical_json.py` — canonical serializer

**Port of:** `canonicalStringify` in `var-core/src/conformance.ts` (and `deep-equal.ts` if needed by the harness).

**Files:** Create `canonical_json.py`; Test `test_canonical_json.py`.

**Interfaces (Produces):** `canonical_stringify(value) -> str`.

**Exactness:** must equal JS `JSON.stringify(sortKeys(value), null, 2) + "\n"`. Python equivalent:

```python
# canonical_json.py
import json
from typing import Any

def canonical_stringify(value: Any) -> str:
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False,
                      separators=(",", ": ")) + "\n"
```

`ensure_ascii=False` keeps emojis raw (JS does too); `sort_keys=True` matches the recursive key sort; `indent=2` + `separators=(",", ": ")` matches `JSON.stringify(…, null, 2)`; trailing newline appended.

- [ ] **Step 1: Failing test**

```python
# test_canonical_json.py
from var.canonical_json import canonical_stringify

def test_sorts_keys_indents_and_trailing_newline():
    assert canonical_stringify({"b": 1, "a": [2, {"d": 4, "c": 3}]}) == (
        '{\n  "a": [\n    2,\n    {\n      "c": 3,\n      "d": 4\n    }\n  ],\n  "b": 1\n}\n'
    )

def test_non_ascii_emitted_raw():
    assert canonical_stringify({"x": "café 😀"}) == '{\n  "x": "café 😀"\n}\n'

def test_empty_containers():
    assert canonical_stringify({"a": [], "b": {}}) == '{\n  "a": [],\n  "b": {}\n}\n'
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): canonical JSON serializer`

---

### Task 8: `conformance.py` var-doc projection + harness (var-doc gate)

**Port of:** `toVarDocArtifact` + the implicit node→wire shape in `conformance.ts`; harness mirrors `var/tests/conformance.test.ts`.

**Files:**
- Create: `python/packages/var/src/var/conformance.py` (var-doc projection only for now)
- Create: `python/packages/var/tests/test_conformance.py` (the harness)

**Interfaces (Produces):** `to_var_doc_artifact(doc: VarDoc) -> dict` returning the **camelCase wire dict**: `{"path", "examples":[{"scopeStack","span","body":[…blocks…]}], "orphanAttachments":[…]}`. Provide private serializers `_span(Span)->dict` (`startOffset,endOffset,startLine,startCol,endLine,endCol`), `_inline(InlineOffset)->dict` (`textOffset,sourceOffset`), `_block(Block)->dict` (per kind: `kind`, `text`, `span`, `inlineMap`, `level`, `ordered`, `markerSpan`, `header`/`rows`+`cells`/`cellSpans`, `info`/`body`/`bodySpan`), `_example`, `_row`. Field names and inclusion must match the goldens exactly (compare against `conformance/bundles/08-string-capture/golden/var-doc.json`).

The harness: for each dir in `../conformance/bundles/*` (relative to the `python/` workspace root — resolve via `Path(__file__)`), read `example.md`, `parse("example.md", source)`, project `to_var_doc_artifact`, `canonical_stringify`, and assert equality with `golden/var-doc.json`. Parametrize over bundles so each is a separate test id. (No `steps.py` needed yet — var-doc doesn't use the registry.)

- [ ] **Step 1: Write the harness test** (parametrized over `conformance/bundles/*`, comparing only `var-doc.json`).

```python
# test_conformance.py (var-doc stage)
from pathlib import Path
import pytest
from var.parse import parse
from var.conformance import to_var_doc_artifact
from var.canonical_json import canonical_stringify

BUNDLES = sorted((Path(__file__).resolve().parents[3] / "conformance" / "bundles").iterdir())

@pytest.mark.parametrize("bundle", [b for b in BUNDLES if b.is_dir()], ids=lambda b: b.name)
def test_var_doc_matches_golden(bundle):
    source = (bundle / "example.md").read_text(encoding="utf-8")
    artifact = to_var_doc_artifact(parse("example.md", source))
    expected = (bundle / "golden" / "var-doc.json").read_text(encoding="utf-8")
    assert canonical_stringify(artifact) == expected
```

(Confirm `parents[3]` resolves `python/` → repo root → `conformance`; adjust the index to match the actual file depth `python/packages/var/tests/`.)

- [ ] **Step 2: Run → FAIL** (projection missing/mismatched).
- [ ] **Step 3: Implement** `conformance.py` var-doc projection + serializers until every bundle's `var-doc.json` matches.
- [ ] **Step 4: Run → PASS for all 10 bundles; ruff.**
- [ ] **Step 5: Commit** — `feat(py): conformance var-doc projection + harness`

---

### Task 9: Multibyte / emoji conformance bundles (offset fidelity gate)

**Touches the TS reference** (to generate goldens) and the corpus.

**Files:**
- Create: `conformance/bundles/11-emoji-offsets/{example.md, steps.ts, steps.py}` and `conformance/bundles/12-combining-marks/{example.md, steps.ts, steps.py}` (+ their `golden/` generated below).

**Interfaces:** each `steps.ts`/`steps.py` registers the same deterministic step(s) the `example.md` needs (sensors returning the expected value). Content must place astral chars (😀, 👨‍👩‍👧), BMP multibyte (café, 日本語), and combining marks (e + U+0301) **before** the spans under test, across a heading, a paragraph sentence with a `{string}`/`{int}` capture, and a table cell.

- [ ] **Step 1: Author `example.md` + `steps.ts`** for `11-emoji-offsets` (and `12-combining-marks`). Example `11-emoji-offsets/example.md`:

````markdown
# 😀 Greeting

## It greets after an emoji

I greet "wörld 😀".
````

with `steps.ts`:

```ts
import { defineState } from '@oselvar/var'
const { sensor } = defineState<Record<string, never>>(() => ({}))
sensor('I greet {string}', () => undefined)
```

- [ ] **Step 2: Generate the TS goldens** — from `typescript/`, run the conformance harness in update mode for the new bundles:
  `cd typescript && VAR_UPDATE_GOLDENS=1 pnpm test -- conformance` (the env flag writes `golden/*.json`). Verify `golden/var-doc.json` shows UTF-16 offsets (the heading/paragraph offsets jump by 2 across 😀). Commit the generated goldens.

- [ ] **Step 3: Author the matching `steps.py`** for each new bundle:

```python
# conformance/bundles/11-emoji-offsets/steps.py
from var import define_state
context, action, sensor = define_state(lambda: {})

@sensor("I greet {string}")
def _(state, s):
    return None
```

(NOTE: `define_state`/`sensor` arrive in Task 10. If executing strictly in order, author `steps.py` files here but expect the Python harness to exercise them only from Task 11 on. The TS goldens + Python `var-doc` match are the M1 gate.)

- [ ] **Step 4: Verify Python `var-doc` matches the new goldens** — `cd python && uv run pytest packages/var/tests/test_conformance.py -q` → the new bundles' `var-doc.json` PASS (proves UTF-16 offset fidelity end-to-end). ruff.

- [ ] **Step 5: Commit** — `test(conformance): emoji + combining-mark bundles for UTF-16 offset fidelity`

---

## MILESTONE 2 — `registry.json`

### Task 10: `step_role.py`, `registry.py`, `define_state.py`

**Port of:** `var-core/src/step-role.ts`, `registry.ts`, and `var/src/internal.ts` (`defineState`). **Translate test:** `registry.test.ts`.

**Files:** Create `step_role.py`, `registry.py`, `define_state.py`; update `__init__.py` to export `define_state`; Tests `test_registry.py`, `test_define_state.py`.

**Interfaces (Produces):**
- `step_role.py`: `StepKind = Literal["context","action","sensor"]` (+ `infer_step_role` if `registry.test.ts`/`step-role.test.ts` needs it).
- `registry.py` (wraps Python `cucumber-expressions`): `@dataclass(frozen=True) StepRegistration(expression:str, expression_source_file:str, expression_source_line:int, handler, compiled:CucumberExpression, kind:StepKind|None)`; `@dataclass(frozen=True) Registry(steps:tuple[StepRegistration,...], parameter_types:ParameterTypeRegistry)`; `create_registry()`; `add_step(registry, *, expression, expression_source_file, expression_source_line, handler, kind) -> Registry` (compiles `CucumberExpression(expression, registry.parameter_types)`; raises on duplicate expression, message mirroring `registry.ts`); `define_parameter_type(registry, *, name, regexp, transformer=identity) -> Registry`.
- `define_state.py`: module-level `define_state(factory, param_types=None) -> tuple[context, action, sensor]` where each is a **decorator** `(expression: str) -> (fn -> fn)` that registers `(expression, fn, kind)` capturing `fn.__code__.co_filename`/`co_firstlineno`; one `define_state` per file (keyed by the *factory's* `__code__.co_filename`; raise if called twice for that file); `context_factory() -> Callable[[str], Any]`; `build_registry() -> Registry`; `_reset_builder()`. Mirror `internal.ts` semantics (module-scope `steps`, `context_factories_by_file`, `custom_types`).

- [ ] **Step 1: Failing test** — translate `registry.test.ts` (add_step compiles + stores expression; duplicate raises; define_parameter_type registers a custom type) and a `define_state` test (the three decorators register with the right kind and source line from `__code__`; second `define_state` in the same module raises; `build_registry` returns steps in registration order).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Confirm the Python `cucumber-expressions` API at the REPL first (`from cucumber_expressions.cucumber_expression import CucumberExpression`; `from cucumber_expressions.parameter_type_registry import ParameterTypeRegistry`; `from cucumber_expressions.parameter_type import ParameterType`) and adapt imports.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): registry + define_state author API`

---

### Task 11: registry projection + `steps.py` fixtures + registry gate

**Port of:** `toRegistryArtifact` + `parameterTypeNames` (reads the compiled expression AST).

**Files:**
- Modify: `python/packages/var/src/var/conformance.py` (add `to_registry_artifact`)
- Create: `conformance/bundles/*/steps.py` for the 10 existing bundles (translate each `*.steps.ts`)
- Modify: `python/packages/var/tests/test_conformance.py` (add a registry stage)

**Interfaces (Produces):** `to_registry_artifact(registry, parameter_types=()) -> dict` → `{"steps":[{"expression","parameterTypeNames":[...]}], "parameterTypes":[{"name","regexp"}]}`. `parameter_type_names(compiled)` walks the Python `CucumberExpression` AST collecting `NodeType.PARAMETER` node texts in source order (port `parameterTypeNames` from `conformance.ts`).

The harness registry stage: import the bundle's `steps.py` (resetting the builder first via `_reset_builder()`), `build_registry()`, project, compare to `golden/registry.json`.

- [ ] **Step 1: Write/extend the harness** to import `steps.py`, build the registry, and compare `registry.json`; author each `steps.py` by translating the matching `steps.ts` (e.g. `08-string-capture/steps.py` registers `sensor("I greet {string}", …)`). Handlers must be deterministic.
- [ ] **Step 2: Run → FAIL** (projection missing).
- [ ] **Step 3: Implement** `to_registry_artifact` + `parameter_type_names`; fix any `steps.py` until each bundle's `registry.json` matches.
- [ ] **Step 4: Run → PASS for all bundles (incl. 11/12); ruff.**
- [ ] **Step 5: Commit** — `feat(py): registry projection + steps.py fixtures`

---

## MILESTONE 3 — `plan.json`

### Task 12: `matcher.py`

**Port of:** `var-core/src/matcher.ts`. **Translate test:** `matcher.test.ts`.

**Files:** Create `matcher.py`; Test `test_matcher.py`.

**Interfaces (Produces):** `@dataclass(frozen=True) ParamSpan(start:int,end:int)` (UTF-16); `@dataclass(frozen=True) Hit(expression, step_def, match_start, match_end, args, param_spans)`; `find_hits(sentence: str, registry: Registry) -> tuple[Hit,...]`; `resolve_hits(hits) -> ResolvedSteps` (`("ok", steps)` | `("ambiguous", collisions)` with `AmbiguityCollision(match_start, match_end, candidates)`).

**Portability rules:** port `matcher.ts` exactly — strip the `^…$` anchors off the compiled regexp and scan all matches (`re.finditer` over the un-anchored pattern), get args via the Python `cucumber-expressions` match (`.value`/`get_value`), get each arg's group `start`/`end`. **Convert** `match.start`/`match.end` and each group start/end from Python **code-point** indices to **UTF-16** offsets (`to_utf16_offset(sentence, cp_index)`) before building `Hit`/`ParamSpan` — this is the subtlest step. Reproduce `resolve_hits` sorting + ambiguity + greedy non-overlap exactly.

- [ ] **Step 1: Failing test** — translate `matcher.test.ts` (single hit args+spans; multiple non-overlapping; ambiguity collision). ADD an astral case: a sentence with 😀 before a `{string}` capture, asserting `param_spans` are UTF-16 (start/end shifted by the emoji's 2 units).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `matcher.ts` with UTF-16 conversion.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): matcher with UTF-16 span conversion`

---

### Task 13: `diagnostics.py` + `plan.py`

**Port of:** `var-core/src/plan.ts` (and the minimal `diagnostics.ts` pieces it needs: `Diagnostic`, `DiagnosticCode`, `Severity`, `ambiguousMatch`, plus the `error`-fence → `expectedOutcome` logic). **Translate test:** `plan.test.ts`.

**Files:** Create `diagnostics.py`, `plan.py`; Tests `test_diagnostics.py` (light), `test_plan.py`.

**Interfaces (Produces):**
- `diagnostics.py`: `Severity = Literal["error","warning","info"]` (match `diagnostics.ts` values); `DiagnosticCode` literals (at least `"ambiguous-match"` + whatever the bundles hit); `@dataclass(frozen=True) Diagnostic(code, severity, span)`; constructor helpers as in `diagnostics.ts`.
- `plan.py`: frozen dataclasses `ExecutionPlan(var_doc, examples, diagnostics)`, `PlannedExample(name, scope_stack, span, steps, header_binding=None, row_checks=None, expected_outcome=None, expected_error_message=None)`, `HeaderBinding(match_span, param_spans, step_def)`, `PlannedStep(text, match_span, param_spans, step_def, args, data_table=None, doc_string=None)`; `plan(var_doc: VarDoc, registry: Registry) -> ExecutionPlan`.

**Behaviour to port from `plan.ts`** (read it in full): per example, plan each text-bearing block via the matcher; lift block-relative match offsets to source spans (`lift_span`); attach trailing `Table`/`Fence` to the last step (data table / doc string; an `error`-info fence sets `expected_outcome="fail"` + optional `expected_error_message` from the fence body); header-bound table detection (binding paragraph + `row_checks`); collect `ambiguous-match` (and other) diagnostics. The `example.name` is the example's first sentence/text per `plan.ts`.

- [ ] **Step 1: Failing test** — translate `plan.test.ts` (a simple matched step → PlannedStep with match_span/param_spans/args; data-table attachment; doc-string attachment; error-fence sets expected_outcome; ambiguous block → diagnostic). 
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `diagnostics.py` then `plan.py` per `plan.ts`.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): planner + diagnostics`

---

### Task 14: plan projection + plan gate

**Port of:** `toPlanArtifact` in `conformance.ts`.

**Files:** Modify `conformance.py` (+ `to_plan_artifact`), `test_conformance.py` (plan stage).

**Interfaces (Produces):** `to_plan_artifact(plan: ExecutionPlan) -> dict` → matches `PlanArtifact`/golden: per example `name, scopeStack, span, expectedOutcome (default "pass"), expectedErrorMessage? , steps[]`; per step `text, matchSpan, paramSpans, matchedExpression, args[{value, parameterType}], dataTable?, docString?`. **`args[i].value` = `utf16_slice(plan.var_doc.source, span.start_offset, span.end_offset)`** (Task 1) — NOT a Python code-point slice — and `parameterType = parameter_type_names(step.step_def.compiled)[i] or None`. Omit `dataTable`/`docString`/`expectedErrorMessage` when absent (mirror the conditional spreads in `toPlanArtifact`). Serialize `dataTable` (a `Table`) and `docString` via the Task-8 block serializers.

- [ ] **Step 1: Extend the harness** to compare `plan.json` for every bundle.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `to_plan_artifact` until all bundles' `plan.json` match (watch the multibyte bundles' `args.value` and `paramSpans`).
- [ ] **Step 4: Run → PASS for all bundles; ruff.**
- [ ] **Step 5: Commit** — `feat(py): plan projection + gate`

---

## MILESTONE 4 — `trace.json`

### Task 15: diff + failure modules

**Port of:** `cell-diff.ts`, `doc-string-diff.ts`, `param-diff.ts`, `failure.ts`, `result.ts`. **Translate tests:** `cell-diff.test.ts`, `doc-string-diff.test.ts`, `param-diff.test.ts`, `failure.test.ts`.

**Files:** Create `cell_diff.py`, `doc_string_diff.py`, `param_diff.py`, `failure.py`, `result.py`; Tests for each.

**Interfaces (Produces):** mirror the TS signatures: `cell_diff.py` → `RowCheck`, `CellDiff`, `compare_row(...)`, `CellMismatchError` (+ `is_cell_mismatch_error`), `ReturnShapeError`, `compare_table(returned, input_table) -> tuple[CellDiff,...]`; `doc_string_diff.py` → `DocStringDiff`, `compare_doc_string(...)`, `DocStringMismatchError` (+ `is_doc_string_mismatch_error`); `param_diff.py` → `compare_params(...)`; `failure.py` → `to_failure(...)`; `result.py` → `CellFailure`, `ExampleResult`, `SpecResults`. Read each TS file; reproduce the comparison logic and the structured error payloads (cells carry `column/expected/actual/span`; doc-string carries `expected/actual/span`) — these become the conformance `FailureArtifact` fields.

- [ ] **Step 1: Failing tests** — translate the four `*.test.ts` files (row/cell mismatch produces the expected `CellDiff`s; whole-table compare; doc-string mismatch diff; return-shape error). 
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the five modules.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): cell/doc-string/param diffs + failures`

---

### Task 16: `deep_freeze.py` + `execute.py`

**Port of:** `deep-freeze.ts`, `execute.ts`. **Translate tests:** `deep-freeze.test.ts`, `execute.test.ts`, `execute-state.test.ts`, `execute-roles.test.ts`.

**Files:** Create `deep_freeze.py`, `execute.py`; Tests for each.

**Interfaces (Produces):**
- `deep_freeze.py`: `deep_freeze(value) -> value` — recursively makes mappings read-only (`MappingProxyType`) and sequences tuples, so a handler mutating state raises (mirror `deep-freeze.ts`'s guarantee). `test_deep_freeze.py` asserts mutation raises.
- `execute.py`: `@dataclass(frozen=True) StepObservation(example_index:int, ordinal:int, outcome:Literal["pass","fail"], error:Any=None)`; `ExecutionObserver` Protocol (`step(o)`); `ExecutePorts` (`reporter`, `create_context`, `observer`); `UnexpectedPassError` + `is_unexpected_pass_error`; `QueuedExample(name, run)`; `collect_examples(plan, ports) -> tuple[QueuedExample,...]`; `execute_plan(plan, ports) -> None`. Port the return-merge state model: context/action handlers' returned partial dict is shallow-merged into a new **deep-frozen** state per example; sensor return values are compared via the Task-15 diffs; the `error`-fence inverts outcome (a pass with `expected_outcome="fail"` raises `UnexpectedPassError`; a fail with a message substring that doesn't match is reported). Handlers may be sync or `async def` — drive coroutines to completion (a simple `asyncio.run`/loop), but do not require `pytest-asyncio`.

- [ ] **Step 1: Failing tests** — translate `deep-freeze.test.ts` + the three `execute*.test.ts` (a context/action evolves state by return-merge; mutation attempt raises; sensor mismatch fails the step; expected-failure passes; unexpected pass fails). 
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `deep_freeze.py` then `execute.py` per the TS sources.
- [ ] **Step 4: Run → PASS; ruff.**
- [ ] **Step 5: Commit** — `feat(py): deep-freeze + executor (return-merge state)`

---

### Task 17: trace projection + `run_conformance` + full gate

**Port of:** `toFailureArtifact` + `runConformance` in `conformance.ts`.

**Files:** Modify `conformance.py` (+ `to_failure_artifact`, `run_conformance`), `test_conformance.py` (trace stage / full comparison).

**Interfaces (Produces):**
- `to_failure_artifact(error, line: int) -> dict` → the `FailureArtifact` union (`cell-mismatch` with filtered `cells`; `doc-string-mismatch` with `diff`; `return-shape`; `unexpected-pass`; `thrown`), dispatching on the Task-15 error types, `line` = the step's `match_span.start_line`.
- `run_conformance(var_doc, registry, create_context, parameter_types=()) -> dict` → `{"varDoc","registry","plan","trace"}` using all four projections; `trace` built by running `collect_examples` with a recording observer, per `runConformance` (contextKey.stepFile via stem; per-step outcome pass/fail/skipped; example outcome; `failure` only on fail).

The harness final stage: for each bundle, run `run_conformance` and compare all four `golden/*.json`.

- [ ] **Step 1: Extend the harness** to compare `trace.json` (and assert all four artifacts together via `run_conformance`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `to_failure_artifact` + `run_conformance` until every bundle (01–12) matches all four goldens byte-for-byte.
- [ ] **Step 4: Run → PASS: full conformance green for all bundles incl. multibyte; `uv run ruff check`; `uv lock --check`.**
- [ ] **Step 5: Commit** — `feat(py): trace projection + full conformance parity`

---

## Self-Review

**Spec coverage:**
- Pure core modules (parse→plan→execute, matcher, diffs, registry, define_state, conformance) → Tasks 1–8, 10–17. ✓
- UTF-16 offset reproduction + helper → Task 1; applied in inline/scanner/table_cells (3–6), matcher (12), plan args (14). ✓
- `cucumber-expressions==20.0.0` dependency → already in `python/`; used in Tasks 10/11/12 (confirm import surface in Task 10 Step 3). ✓
- `define_state` decorator return-merge model → Tasks 10, 16. ✓
- Conformance oracle + four-artifact staging → Tasks 8 (var-doc), 11 (registry), 14 (plan), 17 (trace). ✓
- `steps.py` fixtures authored → Tasks 9, 11. ✓
- Multibyte/emoji bundles with TS-generated goldens → Task 9. ✓
- Canonical JSON rules (sorted keys/indent/LF/trailing newline/raw non-ASCII/stem paths) → Task 7 + stem in Task 17. ✓

**Placeholder scan:** No "TBD"/"handle edge cases". Port tasks name the exact TS source as the behavioural spec and the exact TS test to translate — that is the concrete content for a translation task, not hand-waving. Foundational/exactness-critical modules (span, ast, canonical_json, harness) carry full code.

**Type/name consistency:** `Span` (snake_case fields) defined in Task 1, consumed throughout; wire serializers (Task 8) map snake_case→camelCase once and are reused by Tasks 14/17. `Registry`/`StepRegistration`/`Hit`/`PlannedStep`/`ExecutionPlan` signatures defined before use. `define_state`/`build_registry`/`_reset_builder` named consistently across Tasks 10/11/16/17. `utf16_slice` (Task 1) is the named tool for `args.value` (Task 14).

**Open risk flagged to executor:** the Python `cucumber-expressions` public API (import paths, `Argument.group.start/end`, AST `NodeType.PARAMETER`) is confirmed at Task 10 Step 3 and Task 12 — adapt wrappers to the real surface there.
