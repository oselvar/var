# Java core port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native pure-Java port of `@oselvar/var-core` + `@oselvar/var` (parse → match
→ plan → execute + diffs + the author facade) that reproduces the shared conformance
goldens byte-for-byte, following
[`2026-07-01-java-core-port-design.md`](../specs/2026-07-01-java-core-port-design.md).

**Architecture:** This is a **port**: for every task the cited TypeScript source file in
`typescript/packages/var-core/src/` (and `.../var/src/internal.ts`) is the authoritative
behavioural spec — translate its algorithm, do not redesign it. Where Python already
translated the same module (`python/packages/var-core/src/var_core/*.py`), read that
too — it already solved "how does this port to a non-JS host language" once. Two gate
types per task: (1) the **translated unit test** (the Java version of the named
`.../var-core/tests/*.test.ts`, cross-checked against Python's `test_*.py` equivalent)
and (2) the **conformance goldens**. Staged by the four golden artifacts: `var-doc.json`
(M1 parse) → `registry.json` (M2 registration) → `plan.json` (M3 match+plan) →
`trace.json` (M4 execute).

**Tech stack:** Java 21 (LTS; confirm against sub-project 2's JUnit dependency before
Task 1 completes), Maven multi-module workspace at `java/`, JUnit 5 (Jupiter) for the
core's own test suite, runtime dep `io.cucumber:cucumber-expressions==20.0.0` (confirmed
against `repo1.maven.org` directly — exact version parity with JS/Python; see the
design doc's Dependencies section for why the `search.maven.org` index shouldn't be
trusted for this).

## Global constraints

- **Pure functional core.** No filesystem, network, `System.currentTimeMillis()`/
  `Instant.now()`, or JUnit-Platform types in `var-core`/`var`. Immutable data:
  `record` AST/plan/diff nodes, `List.copyOf`/`Map.copyOf` for arrays/maps.
- **Offsets are UTF-16 code units**, and Java's `String`/`char` already are — verify,
  don't assume (see design doc). Never emit code-point offsets.
- **Runtime dependency:** `io.cucumber:cucumber-expressions==20.0.0` (pinned; exact
  parity with JS/Python — see Task 1).
- **Author API:** decide the registration shape in Task 2 (prototype 2–3 options, pick
  one, document why) before any other task depends on it.
- **Canonical JSON:** hand-rolled (no library) — recursively key-sorted, 2-space indent,
  LF + trailing newline, non-ASCII raw, step-def files by stem.
- **Each task ends green** from `java/`: `mvn -q -pl <module> test`. Commit per task.
- Package `com.oselvar.var.core` for the engine (`var-core` module), `com.oselvar.var`
  for the facade (`var` module). Both under `java/<module>/src/main/java/...` with
  tests in `java/<module>/src/test/java/...` (standard Maven layout).

---

## Task 1: Scaffold the `java/` Maven workspace

**Files:**
- Create: `java/pom.xml` (parent, `packaging=pom`, modules `var-core`, `var`; declares
  `maven.compiler.release=21`, a `junit-bom`/`cucumber-expressions` dependency
  management block).
- Create: `java/var-core/pom.xml`, `java/var-core/src/main/java/com/oselvar/var/core/package-info.java`.
- Create: `java/var/pom.xml` (depends on `var-core`),
  `java/var/src/main/java/com/oselvar/var/package-info.java`.
- Create: root `java/.gitignore` (`target/`).

**Interfaces:** after this task, `mvn -q -f java/pom.xml compile` succeeds with two
empty-but-real modules, mirroring the "skeleton already exists, importable, green smoke
test" state the Python port started sub-project 1 from.

- [x] **Step 1:** Confirmed directly against `repo1.maven.org`'s `maven-metadata.xml`
  (not the `search.maven.org` index, which was stale and under-reported `18.0.1`):
  `io.cucumber:cucumber-expressions` **20.0.0** is published (`<latest>`/`<release>`
  both `20.0.0`, `lastUpdated` 2026-06-11) — exact version parity with JS/Python, no
  gap-audit needed. Latest `org.junit:junit-bom`/`junit-jupiter` GA is **5.11.4**
  (a 5.13.0-M3 milestone also exists; pinned to the GA release, not the milestone).
- [x] **Step 2:** Wrote the parent `pom.xml` and both module POMs
  (`groupId com.oselvar`, `maven.compiler.release=21`).
- [x] **Step 3:** Added a smoke test per module; `mvn -f java/pom.xml test` → PASS (2
  tests, both modules). Used a local JDK 21 (Temurin, installed via
  `asdf install java temurin-21.0.5+11.0.LTS`) scoped to `java/` via
  `java/.tool-versions` (`asdf set`) — does not affect the rest of the repo's toolchain.
- [ ] **Step 4: Commit** — `feat(java): scaffold java/ Maven workspace (var-core + var skeletons)`

---

## MILESTONE 1 — parse → `var-doc.json`

### Task 2: `Span.java` — Span primitives + UTF-16 verification

**Port of:** `var-core/src/span.ts`. **Cross-check:** `python/packages/var-core/src/var_core/span.py`
(for what a non-JS host had to add — expect to need *less* here, see design doc).

**Files:** Create `Span.java`; Test `SpanTest.java`.

**Interfaces (Produces):** `record Span(int startOffset, int endOffset, int startLine,
int startCol, int endLine, int endCol)`; `static Span spanFromOffsets(String source, int
start, int end)`; `static int[] lineCol(String source, int offset)` (or a small
`LineCol` record) — operating directly on `String`/`char` offsets, no conversion helper
expected (confirm with the astral test case below).

- [ ] **Step 1: Write the failing test** — translate `span.test.ts`'s cases plus an
  explicit astral-character case proving Java needs no conversion layer:
  ```java
  @Test void spanFromOffsetsHandlesAstralCharsNatively() {
      String s = "a😀b"; // "a😀b" — 😀 is a surrogate pair, 2 chars
      assertEquals(4, s.length());  // UTF-16 code units, same as JS .length
      Span sp = Span.spanFromOffsets(s, 0, 4);
      assertEquals(0, sp.startOffset());
      assertEquals(4, sp.endOffset());
  }
  ```
- [ ] **Step 2: Run → FAIL** (class doesn't exist).
- [ ] **Step 3: Implement** per `span.ts`, iterating by `char`/using `String.length()`/
  `charAt`/`substring` directly.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): Span primitives`

---

### Task 3: `Ast.java` — immutable AST node records

**Port of:** `var-core/src/ast.ts` (type definitions).

**Files:** Create `Ast.java` (or split per Task 1's file-organization decision — one
file with a `sealed interface Block` + nested records is the recommended default
unless review finds it unwieldy); Test `AstTest.java`.

**Interfaces (Produces):** `record InlineOffset(int textOffset, int sourceOffset)`;
`sealed interface Block permits Heading, Paragraph, ListItem, Blockquote, Table, Fence,
ThematicBreak`; `record Heading(int level, String text, Span span) implements Block`;
`record Paragraph(String text, Span span, List<InlineOffset> inlineMap) implements
Block`; `record ListItem(String text, Span span, List<InlineOffset> inlineMap, boolean
ordered, Span markerSpan) implements Block`; `record Blockquote(String text, Span span,
List<InlineOffset> inlineMap) implements Block`; `record Row(List<String> cells,
List<Span> cellSpans, Span span)`; `record Table(Span span, Row header, List<Row> rows)
implements Block`; `record Fence(Span span, String info, String body, Span bodySpan)
implements Block`; `record ThematicBreak(Span span) implements Block`; `record
Example(List<String> scopeStack, Span span, List<Block> body)`; `record
VarDoc(String path, String source, List<Example> examples, List<Block>
orphanAttachments)`.

- [ ] **Step 1: Failing test** — construct one of each record, assert field access;
  assert `List` fields returned are unmodifiable (`List.copyOf` in constructors, or a
  compact canonical constructor that wraps inputs) so callers can't mutate the AST.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per the Interfaces block, using compact canonical
  constructors to defensively copy `List`/`Map` fields into unmodifiable views.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): immutable AST node records`

---

### Task 4: `Inline.java` — `stripInline`

**Port of:** `var-core/src/inline.ts`. **Translate test:** `inline.test.ts`.
**Cross-check:** `python/packages/var-core/src/var_core/inline.py` for the *shape* of
the port (Python needed a UTF-16 cursor; confirm Java's natural `char`-indexed loop
already produces the right offsets without that cursor machinery).

**Files:** Create `Inline.java`; Test `InlineTest.java`.

**Interfaces (Produces):** `static InlineResult stripInline(String rawText, int
sourceBase)` returning a small `record InlineResult(String text, List<InlineOffset>
map)`.

- [ ] **Step 1: Failing test** — translate `inline.test.ts` (plain text identity map,
  backtick code span, link unwrap, bold/italic, underscore-in-word suppression) plus an
  astral-character case (😀 before an emphasis marker) asserting offsets land correctly
  with **no** conversion helper needed.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `inline.ts`, iterating by `char`. Port `isWord` using
  `Character.isLetterOrDigit(c) || c == '_'` (Java's per-`char` equivalent of the
  `\p{L}\p{N}_` check — note: for astral letters this must consider surrogate pairs via
  `Character.isLetterOrDigit(codePoint)` on the *pair*, not each surrogate half; add a
  test case if the corpus exercises an astral letter directly adjacent to `_`/`*`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): inline stripping`

---

### Task 5: `TableCells.java` — `parseRowCells`

**Port of:** `var-core/src/table-cells.ts`.

**Files:** Create `TableCells.java`; Test `TableCellsTest.java`.

**Interfaces (Produces):** `record RowCells(List<String> cells, List<Span> cellSpans)`;
`static RowCells parseRowCells(String lineText, int lineStartOffset, String source)`.

- [ ] **Step 1: Failing test** — `| a | b |` → cells `["a","b"]` with correct spans;
  one multibyte-cell case.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `table-cells.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): table row cell parsing`

---

### Task 6: `Sentences.java`

**Port of:** `var-core/src/sentences.ts`. **Translate test:** `sentences.test.ts`.

**Files:** Create `Sentences.java`; Test `SentencesTest.java`.

**Interfaces:** mirror `sentences.ts`'s exported function(s) exactly — read the TS file
first to confirm signature/behaviour (splits text into sentence-level spans for
per-sentence step matching).

- [ ] **Step 1: Failing test** — translate `sentences.test.ts`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `sentences.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): sentence splitting`

---

### Task 7: `Scanner.java` — block scanner

**Port of:** `var-core/src/scanner.ts`. **Translate test:** `scanner.test.ts`.

**Files:** Create `Scanner.java`; Test `ScannerTest.java`.

**Interfaces:**
- Consumes: `Inline.stripInline` (Task 4), `TableCells.parseRowCells` (Task 5),
  `Span.spanFromOffsets` (Task 2), AST records (Task 3).
- Produces: `static List<Block> scan(String source)` (plugins param from the TS/Python
  signature is **out of scope** — no scanner plugin is needed unless a later audit finds
  a bundle requires one, matching Python's Task 5 note); a package-private `RawLine`
  record; helper methods named parallel to the TS ones (`tryHeading`, `tryListItem`,
  `tryBlockquote`, `consumeParagraph`, `tryFence`, `tryTable`, `tryThematicBreak`).

**Portability notes:** port the regexes (`THEMATIC_RE`, `UL_RE`, `OL_RE`, `BQ_RE`,
`FENCE_RE`, `ROW_RE`, `DELIM_RE`, heading regex) to `java.util.regex.Pattern` — these
are ASCII-structural and should translate close to verbatim. Confirm `Matcher.start()`/
`.end()` land in the same units as the JS regex `.index` (expected: yes, both UTF-16).

- [ ] **Step 1: Failing test** — translate `scanner.test.ts` (heading levels, paragraph
  continuation/break rules, ordered/unordered list items with marker spans, blockquote
  multi-line join, fenced code, thematic break, table). Add one astral-paragraph case.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `scan` + helpers per `scanner.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): markdown block scanner`

---

### Task 8: `Structurer.java` + `Parse.java`

**Port of:** `var-core/src/structurer.ts`, `parse.ts`. **Translate tests:**
`structurer.test.ts`, `parse.test.ts`.

**Files:** Create `Structurer.java`, `Parse.java`; Tests `StructurerTest.java`,
`ParseTest.java`.

**Interfaces (Produces):** `static VarDoc structure(String path, String source,
List<Block> blocks)`; `static VarDoc parse(String path, String source)` (= `scan` then
`structure`).

- [ ] **Step 1: Failing test** — translate `structurer.test.ts` + `parse.test.ts`
  (heading scope stack; example body with attached table/fence; orphan attachment).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `structurer.ts`/`parse.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): structurer + parse`

---

### Task 9: `CanonicalJson.java` — hand-rolled canonical serializer

**Port of:** `canonicalStringify` in `var-core/src/conformance.ts` (concept only — no
library, per the design doc's decision).

**Files:** Create `CanonicalJson.java`; Test `CanonicalJsonTest.java`.

**Interfaces (Produces):** `static String canonicalStringify(Object value)` where
`value` is built from `Map<String,Object>` / `List<Object>` / `String` / `Number` /
`Boolean` / `null` — the projection functions (Tasks 12/16/19/21) build these maps
directly rather than reflecting over records, keeping the serializer itself dumb and
exactly specified.

- [ ] **Step 1: Failing test** — key-sorting + 2-space indent + trailing newline; raw
  non-ASCII (café, 😀) not escaped; empty `List`/`Map` render as `[]`/`{}` on one line
  (matching `JSON.stringify([], null, 2)` === `"[]"`).
  ```java
  @Test void sortsKeysIndentsAndTrailingNewline() {
      var value = Map.of("b", 1, "a", List.of(2, Map.of("d", 4, "c", 3)));
      assertEquals(
          "{\n  \"a\": [\n    2,\n    {\n      \"c\": 3,\n      \"d\": 4\n    }\n  ],\n  \"b\": 1\n}\n",
          CanonicalJson.canonicalStringify(value));
  }
  ```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — recursive descent: `Map` → sort keys, `List` → preserve
  order, `String` → JSON-escape control chars only (not non-ASCII), numbers/booleans/
  null → literal. Watch Java `Map.of`'s **unspecified iteration order** — the serializer
  must sort keys itself, never rely on input map order.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): canonical JSON serializer`

---

### Task 10: `Conformance.java` var-doc projection + harness (var-doc gate)

**Port of:** `toVarDocArtifact` in `conformance.ts`; harness mirrors
`var-core/tests/conformance.test.ts` / Python's `test_conformance.py` var-doc stage.

**Files:**
- Create: `java/var-core/src/main/java/com/oselvar/var/core/Conformance.java`
  (var-doc projection only for now).
- Create: `java/var-core/src/test/java/com/oselvar/var/core/ConformanceTest.java` (the
  harness — **resolve the `conformance/bundles/` path relative to the Maven module**,
  e.g. via a build-time property or `Paths.get("../../conformance/bundles")` from
  `java/var-core/`; confirm the relative depth against the actual module layout chosen
  in Task 1).

**Interfaces (Produces):** `static Map<String,Object> toVarDocArtifact(VarDoc doc)` →
the camelCase wire map (`path`, `examples: [{scopeStack, span, body: [...blocks]}]`,
`orphanAttachments`), with private helpers for `Span`→map, `InlineOffset`→map, each
`Block` variant → map (`switch` over the sealed interface). Field names/inclusion must
match `conformance/bundles/08-string-capture/golden/var-doc.json` exactly.

The harness: for each directory under `conformance/bundles/*`, read `example.md`,
`Parse.parse("example.md", source)`, project, `CanonicalJson.canonicalStringify`,
compare to `golden/var-doc.json`. Use `@TestFactory`/`@ParameterizedTest` over the
bundle directories so each is independently reported (this is the core's *own* Jupiter
test suite — unrelated to the ADR 0003 `var-junit` `TestEngine` decision).

- [ ] **Step 1: Write the harness test**, parametrized over `conformance/bundles/*`,
  comparing only `var-doc.json`.
- [ ] **Step 2: Run → FAIL** (projection missing/mismatched).
- [ ] **Step 3: Implement** `Conformance.toVarDocArtifact` + block serializers until
  every bundle's `var-doc.json` matches.
- [ ] **Step 4: Run → PASS for all bundles** (including `11-emoji-offsets`,
  `12-combining-marks` if present in the corpus — this is the empirical UTF-16-parity
  check the design doc calls for).
- [ ] **Step 5: Commit** — `feat(java): conformance var-doc projection + harness`

---

## MILESTONE 2 — `registry.json`

### Task 11: Author API prototype + decision

**Not a direct port** — Java's lack of module-level side effects/multiple-return means
this needs real design work, per the core design doc's "Author API" section.

**Files:** a throwaway prototype directory or branch is fine for the exploration; the
committed result is `java/var/src/main/java/com/oselvar/var/Var.java` (or similarly
named) + whatever `State`-equivalent type is chosen.

- [ ] **Step 1:** Prototype 2–3 candidate shapes (static-initializer registration like
  the sketch in the design doc; an explicit `registerSteps(StepRegistrar r)` method the
  step class implements; an annotation-driven `@Action`/`@Sensor` scan) against the
  `01-roman-numerals` bundle by hand (no harness yet — just "can I write `Steps.java`
  for this bundle in a way that isn't fighting the language").
- [ ] **Step 2:** Pick one; write 2–3 sentences in this task's commit message on why,
  referencing the rejected options — this is a real fork point future porters
  (Kotlin) will ask about.
- [ ] **Step 3: Commit** — `docs(java): author API shape decision` (prototype code need
  not be committed if it's fully superseded by Task 12's real implementation).

---

### Task 12: `StepRole.java`, `Registry.java`, facade registration

**Port of:** `var-core/src/step-role.ts`, `registry.ts`, and `var/src/internal.ts`
(`defineState`) — adapted per Task 11's chosen shape. **Translate test:**
`registry.test.ts`.

**Files:** Create `java/var-core/.../StepRole.java`, `Registry.java`; Tests
`StepRoleTest.java`, `RegistryTest.java`. Create the facade class(es) in
`java/var/src/main/java/com/oselvar/var/` per Task 11's decision; Test in
`java/var/src/test/java/com/oselvar/var/`.

**Interfaces (Produces):** `enum StepKind { CONTEXT, ACTION, SENSOR }`; `record
StepRegistration(String expression, String expressionSourceFile, int
expressionSourceLine, Object handler, CucumberExpression compiled, StepKind kind)`;
`record Registry(List<StepRegistration> steps, ParameterTypeRegistry parameterTypes)`;
`static Registry createRegistry()`; `static Registry addStep(Registry r, String
expression, String sourceFile, int sourceLine, Object handler, StepKind kind)`
(compiles the expression, raises on duplicate — mirror `registry.ts`'s error message);
`static Registry defineParameterType(Registry r, String name, String regexp,
Function<String,Object> transformer)`.

- [ ] **Step 1: Failing test** — translate `registry.test.ts` (compiles + stores;
  duplicate raises; custom parameter type registers) plus a facade-level test proving
  Task 11's chosen registration shape actually registers `context`/`action`/`sensor`
  handlers with the right `StepKind` and source location (via `StackWalker`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Confirm the Java `cucumber-expressions` public API surface
  at this point (`CucumberExpression`, `ParameterTypeRegistry`, `Argument` group
  start/end accessors) and adapt.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): registry + author-API registration`

---

### Task 13: Registry projection + Java step fixtures + registry gate

**Port of:** `toRegistryArtifact` + `parameterTypeNames`.

**Files:**
- Modify: `Conformance.java` (add `toRegistryArtifact`).
- Create: a Java step-definition fixture per existing bundle. **Resolve the Maven
  source-root problem flagged in the design doc first**: either (a) a dedicated small
  Maven module (e.g. `java/var-core-conformance-fixtures`) whose `src/main/java` *is*
  `conformance/bundles/**` via a `build-helper-maven-plugin` additional-source-root
  pointing outside the module (confirm this works with Maven's compiler plugin before
  committing to it), or (b) mirror the fixtures into a Java-only staging directory the
  build copies from `conformance/bundles/` (Java package names generally can't contain
  hyphens/digits-first segments the way `conformance/bundles/01-roman-numerals` is
  named, so a raw "compile bundle dirs as Java source roots" approach may not work
  as-is — this is a real structural mismatch Python/TS didn't have, since neither
  requires bundle directory names to be valid host-language identifiers). Pick one, or
  a third option if research turns up a cleaner Maven idiom, and document the choice.
- Modify: the harness (add a registry stage).

**Interfaces (Produces):** `static Map<String,Object> toRegistryArtifact(Registry r)` →
`{"steps": [{"expression","parameterTypeNames"}], "parameterTypes": [{"name","regexp"}]}`.

- [ ] **Step 1:** Resolve the fixture-layout problem (above) and get one bundle's
  `Steps.java`-equivalent compiling and loadable by the harness.
- [ ] **Step 2: Write/extend the harness** to load each bundle's Java steps, build the
  registry, project, compare to `golden/registry.json`.
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement** `toRegistryArtifact` + author the remaining bundles' Java
  step fixtures until every bundle's `registry.json` matches.
- [ ] **Step 5: Run → PASS for all bundles.**
- [ ] **Step 6: Commit** — `feat(java): registry projection + step fixtures`

---

## MILESTONE 3 — `plan.json`

### Task 14: `Matcher.java`

**Port of:** `var-core/src/matcher.ts`. **Translate test:** `matcher.test.ts`.

**Files:** Create `Matcher.java`; Test `MatcherTest.java`.

**Interfaces (Produces):** `record ParamSpan(int start, int end)`; `record Hit(String
expression, StepRegistration stepDef, int matchStart, int matchEnd, List<Object> args,
List<ParamSpan> paramSpans)`; `static List<Hit> findHits(String sentence, Registry
registry)`; a `ResolvedSteps` sum type (`Ok(List<Hit>)` / `Ambiguous(List<Collision>)`,
mirroring TS's tagged union) + `static ResolvedSteps resolveHits(List<Hit> hits)`.

**Portability notes:** strip the compiled expression's `^…$` anchors and scan with
`Matcher.find()` in a loop (Java's un-anchored equivalent of JS's global-flag scan).
Get each capture group's `start()`/`end()` directly — **expected already UTF-16, confirm
with the astral matcher test** rather than porting Python's code-point→UTF-16
conversion step (which should not be needed here).

- [ ] **Step 1: Failing test** — translate `matcher.test.ts` (single hit args+spans,
  multiple non-overlapping, ambiguity collision) plus an astral-character case (😀
  before a `{string}` capture) asserting `paramSpans` are correct with no manual offset
  conversion.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per `matcher.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): matcher`

---

### Task 15: `Diagnostics.java` + `Plan.java`

**Port of:** `var-core/src/plan.ts` (+ the minimal `diagnostics.ts` pieces it needs).
**Translate test:** `plan.test.ts`.

**Files:** Create `Diagnostics.java`, `Plan.java`; Tests `DiagnosticsTest.java`,
`PlanTest.java`.

**Interfaces (Produces):** `enum Severity { ERROR, WARNING, INFO }`; a
`DiagnosticCode`-equivalent (enum or sealed interface — at least `AMBIGUOUS_MATCH` +
whatever the bundles hit); `record Diagnostic(DiagnosticCode code, Severity severity,
Span span)`; `record ExecutionPlan(VarDoc varDoc, List<PlannedExample> examples,
List<Diagnostic> diagnostics)`; `record PlannedExample(String name, List<String>
scopeStack, Span span, List<PlannedStep> steps, HeaderBinding headerBinding, List<?>
rowChecks, String expectedOutcome, String expectedErrorMessage)` (nullable fields as
appropriate — Java has no first-class optional-field record syntax; use `@Nullable`
annotations + `Optional<T>` accessors where read ergonomics matter, plain `null` where
it's just storage); `record HeaderBinding(Span matchSpan, List<Span> paramSpans,
StepRegistration stepDef)`; `record PlannedStep(String text, Span matchSpan, List<Span>
paramSpans, StepRegistration stepDef, List<Object> args, Table dataTable, Fence
docString)`; `static ExecutionPlan plan(VarDoc doc, Registry registry)`.

- [ ] **Step 1: Failing test** — translate `plan.test.ts` (matched step → PlannedStep;
  data-table attachment; doc-string attachment; `error`-fence sets `expectedOutcome`;
  ambiguous block → diagnostic).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `Diagnostics.java` then `Plan.java` per `plan.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): planner + diagnostics`

---

### Task 16: Plan projection + plan gate

**Port of:** `toPlanArtifact`.

**Files:** Modify `Conformance.java` (+ `toPlanArtifact`), the harness (plan stage).

**Interfaces (Produces):** `static Map<String,Object> toPlanArtifact(ExecutionPlan
plan)` → matches the `PlanArtifact`/golden shape (per example: `name`, `scopeStack`,
`span`, `expectedOutcome` default `"pass"`, `expectedErrorMessage?`, `steps[]`; per step:
`text`, `matchSpan`, `paramSpans`, `matchedExpression`, `args[{value,parameterType}]`,
`dataTable?`, `docString?`). **`args[i].value` = a direct `String.substring` of the
source using the span's UTF-16 offsets** (no `utf16Slice` helper needed, unlike
Python). Omit optional fields when absent, matching `toPlanArtifact`'s conditional
spreads.

- [ ] **Step 1: Extend the harness** to compare `plan.json` for every bundle.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `toPlanArtifact` until all bundles' `plan.json` match
  (watch the multibyte bundles' `args.value`/`paramSpans` closely — this is the
  empirical proof the "Java needs no UTF-16 conversion" claim holds all the way through
  matching, not just parsing).
- [ ] **Step 4: Run → PASS for all bundles.**
- [ ] **Step 5: Commit** — `feat(java): plan projection + gate`

---

## MILESTONE 4 — `trace.json`

### Task 17: Diff + failure records

**Port of:** `cell-diff.ts`, `doc-string-diff.ts`, `param-diff.ts`, `failure.ts`,
`result.ts`. **Translate tests:** the matching `*.test.ts` files.

**Files:** Create `CellDiff.java`, `DocStringDiff.java`, `ParamDiff.java`,
`Failure.java`, `Result.java`; Tests for each.

**Interfaces (Produces):** mirror the TS signatures: `CellDiff.java` → `record
RowCheck(...)`, `record CellDiff(...)`, `static List<CellDiff> compareRow(...)`, a
`CellMismatchException` (checked or unchecked — pick unchecked to match TS/Python's
non-checked-exception-shaped error flow, since Java checked exceptions would force
every handler signature to declare `throws`), `ReturnShapeException`, `static
List<CellDiff> compareTable(...)`; `DocStringDiff.java` → `record DocStringDiff(...)`,
`static DocStringDiff compareDocString(...)`, `DocStringMismatchException`;
`ParamDiff.java` → `static ... compareParams(...)`; `Failure.java` → `static ...
toFailure(...)`; `Result.java` → `record CellFailure(...)`, `record
ExampleResult(...)`, `record SpecResults(...)`.

- [ ] **Step 1: Failing tests** — translate the four `*.test.ts` files.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the five classes.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): cell/doc-string/param diffs + failures`

---

### Task 18: `DeepFreeze.java`-equivalent + `Execute.java`

**Port of:** `deep-freeze.ts` (**only if** Task 11's chosen state model needs a runtime
mutation guard — a pure-`record`-based state model may get immutability for free from
the language and need no `deep-freeze` port at all; **decide this explicitly here,
don't default-copy the TS/Python approach**), `execute.ts`. **Translate tests:**
`deep-freeze.test.ts` (if applicable), `execute.test.ts`, `execute-state.test.ts`,
`execute-roles.test.ts`.

**Files:** Create `Execute.java` (+ `DeepFreeze.java` only if needed per the decision
above); Tests for each.

**Interfaces (Produces):** `record StepObservation(int exampleIndex, int ordinal,
String outcome, Throwable error)`; an `ExecutionObserver` functional interface (`void
step(StepObservation o)`); an `ExecutePorts` record/interface bundling the reporter,
context factory, observer; `UnexpectedPassException`; `record QueuedExample(String
name, Runnable run)`; `static List<QueuedExample> collectExamples(ExecutionPlan plan,
ExecutePorts ports)`; `static void executePlan(ExecutionPlan plan, ExecutePorts ports)`.
Port the return-merge (or full-replacement, per Task 11) state model; sensor return
values compared via Task 17's diffs; `error`-fence inverts outcome
(`UnexpectedPassException` on an unexpected pass). Handlers may be sync or return a
`CompletableFuture`/use structured concurrency — drive either to completion; do not
require a specific async style from callers.

- [ ] **Step 1: Failing tests** — translate `execute*.test.ts` (+ `deep-freeze.test.ts`
  only if Task 11/this task's decision keeps a runtime freeze guard).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per the TS sources, adapted to Task 11's state model.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): executor (state model per Task 11)`

---

### Task 19: Trace projection + full conformance gate

**Port of:** `toFailureArtifact` + `runConformance` (built inline, no separate
`toTraceArtifact` — see the `adding-a-language-port` skill's note on this).

**Files:** Modify `Conformance.java` (+ `toFailureArtifact`, `runConformance`), the
harness (trace stage / full comparison).

**Interfaces (Produces):** `static Map<String,Object> toFailureArtifact(Throwable
error, int line)` → dispatches on the Task 17 exception types
(`cell-mismatch`/`doc-string-mismatch`/`return-shape`/`unexpected-pass`/`thrown`);
`static BundleArtifacts runConformance(VarDoc doc, Registry registry,
Supplier<State> contextFactory)` → a `record BundleArtifacts(Map<String,Object> varDoc,
Map<String,Object> registry, Map<String,Object> plan, Map<String,Object> trace)`
(typed return from the start — Java has no reason to repeat Python's later
split-plan fix here).

- [ ] **Step 1: Extend the harness** to compare `trace.json` for every bundle via
  `runConformance`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `toFailureArtifact` + `runConformance` until every bundle
  (01 through however many exist, including the multibyte bundles) matches all four
  goldens byte-for-byte.
- [ ] **Step 4: Run → PASS: full conformance green.** `mvn -q -f java/pom.xml verify`.
- [ ] **Step 5: Commit** — `feat(java): trace projection + full conformance parity`

---

## Self-review

**Spec coverage:** parse→plan→execute, matcher, diffs, registry, author API,
conformance → Tasks 2–10, 12–19. UTF-16 verification (not conversion) → Tasks 2, 4, 7,
14, 16. `cucumber-expressions==20.0.0` pinned with exact JS/Python parity → Task 1 Step 1
(no gap-audit needed). Author-API shape as an explicit decision, not an assumed
translation → Task 11. Maven fixture-layout problem → Task 13 Step 1. Canonical JSON
hand-rolled, no library → Task 9. Conformance oracle + four-artifact staging → Tasks 10
(var-doc), 13 (registry), 16 (plan), 19 (trace).

**Placeholder scan:** no "TBD"/"handle edge cases" — Tasks 11, 13, 18 name explicit
open decisions with concrete resolution steps (prototype-then-choose, resolve-layout-
then-fixture, decide-then-port) rather than hand-waving past them.

**Type/name consistency:** `Span`/`Ast` records (Task 2–3) consumed throughout;
`Registry`/`StepRegistration`/`Hit`/`PlannedStep`/`ExecutionPlan` defined (Tasks 12, 14,
15) before use (Tasks 13, 16, 19); `BundleArtifacts` typed from the start (Task 19, no
later refactor needed unlike Python).

**Known risks flagged to the executor:** Java `record`s have no native partial-update
syntax, affecting the state-merge translation (Task 11/18); Maven doesn't naturally
support compiling source outside a
module's own tree, affecting per-bundle Java step fixtures (Task 13).
