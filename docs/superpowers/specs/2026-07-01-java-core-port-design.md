# Java core port — pure runtime core (sub-project 1 of the Java port)

Date: 2026-07-01
Status: design, pending implementation (TDD)

First sub-project of the Java port, following the same shape as the Python port
([`2026-06-30-python-core-port-design.md`](2026-06-30-python-core-port-design.md),
[`2026-06-30-python-core-split.md`](../plans/2026-06-30-python-core-split.md)) and the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill. Scope is the **pure Java runtime core only** — a native port of
`@oselvar/var-core`'s pipeline plus the `@oselvar/var` author facade. The JUnit engine
(`var-junit`) is deliberately deferred to sub-project 2
([`2026-07-01-java-junit-engine-design.md`](2026-07-01-java-junit-engine-design.md)),
which binds a proven core to JUnit and adds nothing the conformance suite can police.

Unlike Python, Java starts **already split** into `var-core` + `var` (Python had to
retrofit this split after the fact) — see "Package layout" below.

## Why this scope

Same rationale as the Python core port: the pure core has an objective, byte-exact
"done" signal — reproducing the shared conformance goldens — and needs no test-runner
ergonomics to prove correctness. TypeScript is the reference; Python is a second,
completed proof that the architecture ports cleanly to a different language family.
Java is the third proof point and the first statically-typed, JVM-targeted one.

## Package layout — `com.oselvar.var` (already split)

Maven `groupId` **`com.oselvar`**, Java base package **`com.oselvar.var`** (per explicit
instruction), workspace at `java/` (sibling of `typescript/` and `python/`, per the
[multi-language restructure](../plans/2026-06-30-multi-language-repo-restructure.md)
precedent):

| Artifact (`artifactId`) | Java package | Depends on | Owns |
|---|---|---|---|
| `var-core` | `com.oselvar.var.core` | `cucumber-expressions` only | pure pipeline: parse → match → plan → execute, diffs, conformance projections |
| `var` | `com.oselvar.var` | `var-core` | author facade: `defineState`-equivalent, `context`/`action`/`sensor` |
| `var-runner` | `com.oselvar.var.runner` | `var` | *(sub-project 2)* discovery, config, `runSpec`/`planSpec` |
| `var-junit` | `com.oselvar.var.junit` | `var-runner` | *(sub-project 2)* JUnit Platform `TestEngine` — see [ADR 0003](../../adr/0003-java-junit-integration.md) |

`java/pom.xml` is the multi-module aggregator (parent POM), mirroring `python/pyproject.toml`'s
`[tool.uv.workspace]` and `typescript/pnpm-workspace.yaml`.

## Architecture — idiomatic-Java mirror of the immutable functional core

The project's non-negotiables (CLAUDE.md) translate to Java idiom as:

- **Immutable types** → `record` for every AST/plan/diff node (records are final,
  all-fields-final, structurally-equal by default — a closer match to TS's `readonly`
  object literals than Python's `@dataclass(frozen=True)`, no `deep-freeze` runtime
  guard needed for the AST layer itself). `List.copyOf(...)` /
  `Collections.unmodifiableList` for `ReadonlyArray<T>`; `Map.copyOf(...)` for
  `ReadonlyMap<K, V>`. Updates produce new record instances (`with`-style copy methods,
  since Java records have no native `with` syntax pre-Valhalla — write small
  `withX(...)` helper methods or a builder where more than one field needs updating at
  once).
- **Sum types for the AST union** (`Block = Heading | Paragraph | ListItem | ...`) →
  a `sealed interface Block permits Heading, Paragraph, ListItem, Blockquote, Table,
  Fence, ThematicBreak` with each variant a `record` implementing it. Exhaustive
  `switch` pattern matching (`switch (block) { case Heading h -> ...; case Paragraph p
  -> ...; }`) replaces TS's discriminated-union `kind` narrowing — the compiler enforces
  exhaustiveness, which is *stronger* than the TS/Python precedent, not weaker; keep the
  `kind`-equivalent string constant per record only where the conformance wire format
  requires it (the goldens' `"kind"` field), not for internal dispatch.
- **Pure functions** → static methods on stateless classes (or top-level functions if
  the target Java version's module system makes that awkward); `parse`, `match`,
  `plan`, the diffs, the conformance projections: same input → same output, no side
  effects.
- **Functional core / imperative shell** → `var-core` and `var` have zero filesystem,
  network, `System.currentTimeMillis()`/`Instant.now()`, or test-framework imports.
  Those stay in `var-runner`/`var-junit` (sub-project 2).
- **Evolving step state** → mirrors `defineState`'s return-merge model (see Author API),
  not a mutation model.

## Author API — mirror `defineState`

Java equivalent of Python's `define_state(factory) -> (context, action, sensor)`. Java
has no first-class multiple-return or Python-style module-level decorator registration,
so the facade is idiomatic Java: a `DefineState` (or similarly named) object created
once per step-definition class, exposing `context`/`action`/`sensor` registration
methods that take a Cucumber expression string and a handler:

```java
package com.oselvar.var.example;

import com.oselvar.var.State;
import static com.oselvar.var.Var.defineState;

public class RomanNumeralSteps {
    record Ctx(String result) implements State {}

    static final var STATE = defineState(() -> new Ctx(null));
    static final var action = STATE.action();
    static final var sensor = STATE.sensor();

    static {
        action.on("I convert {int} to roman numerals", (ctx, n) -> new Ctx(ROMAN.get(n)));
        sensor.on("The result is {word}", (ctx, expected) -> ctx.result());
    }
}
```

The exact ergonomic shape (static initializer block vs. instance constructor vs. an
annotation-driven alternative) is an **open question for Task 1** — prototype 2–3
options against the roman-numerals bundle before committing, since Java's lack of
top-level functions/module-scope side effects makes the direct Python/TS translation
(`define_state` called once at module load) awkward. Whatever shape wins, it must
preserve:

- **Evolving state is an immutable value** (a `record`/interface `State`): the factory
  returns an initial state; `context`/`action` handlers return a **new** state (not a
  partial merge — Java has no free-form object-spread; either the handler returns a
  full replacement record, or state is a `Map`-like structure supporting the same
  shallow-merge-then-freeze semantics as TS/Python. **Decide this in Task 1** and record
  the decision — it's the single biggest author-API fork point from the other two
  languages and needs to be deliberate, not incidental.)
- **One state factory per step-definition class**, fresh per example — mirrors
  `contextFactoriesByFile`/`context_factories_by_file`.
- **Source location** via `StackWalker` (modern replacement for parsing a stack trace
  string) to get the registering class/line, analogous to Python's
  `fn.__code__.co_filename`/`co_firstlineno` — cleaner than TS's `callerLocation()`
  stack-string parsing.
- **`defineParameterType(name, regexp, transformer)`** mirrors the core
  `defineParameterType`.

## Dependencies

- **Runtime: `io.cucumber:cucumber-expressions==20.0.0`.** Confirmed directly against
  `repo1.maven.org`'s `maven-metadata.xml` (`<latest>`/`<release>` both `20.0.0`,
  `lastUpdated` 2026-06-11) — exact version parity with `@cucumber/cucumber-expressions
  ^20.0.0` (JS) and Python's `cucumber-expressions==20.0.0` pin. (An earlier pass at this
  research queried the `search.maven.org` Solr index, which reported a stale
  `18.0.1` — that index lags the real repository; always confirm against
  `repo1.maven.org` directly, not the search UI/API, when pinning a Maven Central
  version for this project.)
- **Dev:** JUnit 5 (Jupiter) for the core's *own* unit tests — using Jupiter here is
  unrelated to the ADR 0003 decision about `var-junit`'s integration mechanism; the core
  module's test suite is just an ordinary Jupiter test suite like any Java library's.
- **Build:** Maven (`java/pom.xml` parent + per-module POMs) — chosen for parity with
  `cucumber-jvm` (eases porting inspiration/dependency-version cross-referencing) and
  because it's the dominant convention for JUnit Platform engine artifacts. Revisit if
  the user prefers Gradle; nothing in this design is Maven-specific beyond the POM
  files themselves.
- **Java baseline:** target **Java 21** (LTS). Records, sealed interfaces, and pattern
  matching for `switch` are all stable at 21. Confirm at implementation start whether
  the JUnit version in use (sub-project 2) raises this further — `cucumber-jvm`'s
  current development branch already assumes a newer JUnit generation (see ADR 0003
  references); align the Java baseline with whatever `var-junit`'s JUnit dependency
  actually requires.

## Character offset semantics — verify, don't assume, UTF-16 parity

Every offset in the existing goldens is a **UTF-16 code-unit offset** (an astral
character like 😀 counts as 2). Java's `String`/`char` are **already UTF-16 code-unit
indexed**, same as JavaScript — `String.length()`, `charAt(i)`, `substring(a, b)` all
operate in UTF-16 units natively. This means, unlike Python, **the Java core likely
needs no conversion layer at all** — a direct translation of `span.ts`'s
`charCodeAt`/`.length`/`.slice`/regex `.index` logic onto `String.length()`/`charAt`/
`substring`/`Matcher.start()`/`Matcher.end()` should reproduce UTF-16 offsets for free.

**Do not skip verification.** Confirm this empirically, the same way the Python port
was gated: author (or reuse — they're language-neutral) the `11-emoji-offsets` and
`12-combining-marks` conformance bundles' `var-doc.json`/`plan.json` stages and check
byte-for-byte equality before declaring parse/match done. Two things to watch even
though the *offsets* should be free:
- **Regex matching** on strings containing astral characters: `java.util.regex.Pattern`
  operates on the UTF-16 `char` sequence directly (like JS `RegExp`), so `Matcher.start()`/
  `.end()` should already be in UTF-16 units — but confirm `cucumber-expressions`
  (Java)'s capture-group offsets are reported the same way (JS's underlying regex engine
  and Java's `java.util.regex` are different implementations; don't assume identical
  edge-case behavior around surrogate pairs inside character classes/quantifiers without
  a bundle proving it).
- **Iteration** in the scanner/inline-stripping code must iterate by `char` (UTF-16 code
  unit), not by Unicode code point (`codePoints()`/`Character.codePointAt`) — the
  natural/idiomatic Java string iteration (`for (int i = 0; i < s.length(); i++)`
  over `char`) is the *correct* one here, which is a pleasant inversion of the Python
  situation where the natural iteration was the wrong one.

## Module map (`var-core` TS → `com.oselvar.var.core`)

Port these `@oselvar/var-core` modules (pure pipeline + conformance). Java file/class
names use PascalCase per Java convention (unlike Python's snake_case 1:1 mirroring) —
keep the *concept* names parallel for reviewability, not the casing:

| Concern | TS (`var-core/src`) | Java (`var-core/src/main/java/com/oselvar/var/core/`) |
|---|---|---|
| Positions | `span.ts` | `Span.java` |
| AST | `ast.ts` | `Ast.java` (or one file per record/`sealed interface`, Java convention favors one public type per file — decide in Task 1: a single file with package-private records + one public sealed interface, or one file per node) |
| Markdown parse | `scanner.ts`, `structurer.ts`, `inline.ts`, `parse.ts` | `Scanner.java`, `Structurer.java`, `Inline.java`, `Parse.java` |
| Sentence splitting | `sentences.ts` | `Sentences.java` |
| Step roles | `step-role.ts` | `StepRole.java` |
| Registry / author API | `registry.ts` (+ `@oselvar/var` `internal.ts`) | `Registry.java` (core); facade equivalent lives in the `var` module, package `com.oselvar.var` |
| Matching | `matcher.ts`, `expression-segments.ts` | `Matcher.java` only — **`ExpressionSegments.java` was not ported** (Task 14): `parameterTypeNames` re-parses via `cucumber-expressions`' own `CucumberExpressionParser` instead, so no separate segment-splitting module was needed |
| Planning | `plan.ts` | `Plan.java` |
| Execution | `execute.ts` | `Execute.java` |
| Diffs / failures | `cell-diff.ts`, `doc-string-diff.ts`, `param-diff.ts`, `table-cells.ts`, `failure.ts`, `result.ts` | `CellDiff.java`, `DocStringDiff.java`, `ParamDiff.java`, `TableCells.java`, `Failure.java`, `Result.java` |
| Conformance | `conformance.ts`, `deep-equal.ts` (+ canonical JSON) | `Conformance.java`, `CanonicalJson.java` only — **`DeepEqual.java` was not ported** (Task 19): conformance compares canonical-JSON *strings* for byte-for-byte equality, so no separate structural deep-equality helper was needed |

**Out of scope** (matches Python and the skill's "what's shared" table): `config.ts`,
`find-files.ts`, `hash.ts`, `node.ts`, `ports.ts`, `run-diagnostics.ts`,
`snippet*.ts`, `template.ts` — these are TS-runner/authoring-platform/LSP concerns, not
part of the pure pipeline any language port needs for v1. `diagnostics.ts` is ported
only as far as `plan.ts` needs it (mirrors Python's Task 13 scope).

## Canonical JSON — no library shortcut

TS: `JSON.stringify(sortKeys(value), null, 2) + "\n"`. Python used the stdlib `json`
module with `sort_keys=True, indent=2, ensure_ascii=False`. **Java has no equivalent
stdlib JSON writer** (no `java.json` in the standard library) — decide in Task 1
between (a) a minimal hand-rolled canonical serializer (recursive key-sort + 2-space
indent + LF + trailing newline + raw non-ASCII), matching the discipline of writing
`span.py`'s UTF-16 helpers by hand, or (b) a well-known library (e.g. Jackson) configured
to match the exact byte output. **Recommendation: hand-roll it.** The format is small,
fully specified by the four rules below, and a hand-rolled serializer avoids a library's
default formatting quirks (trailing spaces after `:`, ordering of empty
containers, ` `/` ` escaping differences) silently drifting from the JS/Python
reference. This mirrors the "port the algorithm, don't reach for a bigger tool" principle
running through this whole skill.

Non-negotiable rules (same for every language): recursively **key-sorted** objects;
**2-space indent**; **LF** endings + **trailing newline**; non-ASCII emitted **raw**;
step-def files referenced **by stem** (`Steps.java`/`steps.ts`/`steps.py` all → the
bundle's configured stem, per the harness's file-naming convention — confirm the exact
stem rule against `conformance.ts`, since Java's typical step-file name won't be
`numerals.steps.java` the way TS/Python use `*.steps.ts`/`*.steps.py`; **decide the
Java step-file naming convention in Task 1** and make sure the stem-computation logic
still produces the same stem the goldens expect).

## Test oracle — conformance goldens, staged by artifact

Identical strategy to TS/Python: "done" = the Java core reproduces every bundle's
committed goldens byte-for-byte, staged in four independently-gated milestones —
`var-doc.json` (parse) → `registry.json` (registration) → `plan.json` (match+plan) →
`trace.json` (execute). See the [`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill's "Conformance-driven staging" section for the shared rationale; the task plan
(`2026-07-01-java-core-port.md`) lays out the concrete per-module tasks.

This requires authoring a **Java step-definition fixture per bundle** (today only
`*.steps.ts`/`*.steps.py` exist) from Milestone 2 on, registering the same expressions
and deterministic handlers. Decide the file name/extension convention in Task 1 (a
Maven-idiomatic layout probably wants these under `conformance/bundles/<n>/` alongside
the existing fixtures, compiled as part of the Java conformance harness's test sources —
confirm this doesn't fight Maven's `src/test/java` package-per-directory convention;
some restructuring or a dedicated small "conformance fixtures" Maven module may be
needed, since Maven (unlike `pytest`/`vitest`) does not import arbitrary files from
outside a configured source root without explicit configuration).

## Risks

- **Author API shape** (see "Author API") — Java's lack of module-level side effects and
  multiple-return makes the direct `defineState()` translation the least idiomatic part
  of the port; needs real prototyping, not just translation.
- **Fixture file layout under Maven** — Maven's convention-over-configuration source
  roots don't naturally support "language-neutral corpus outside any module's
  `src/`" the way `pytest`'s/`vitest`'s glob-based discovery does; expect to spend a task
  on this before Milestone 2's registry stage can even compile.
- **Canonical JSON hand-roll correctness** — must be pinned by a translated unit test
  (mirrors Python's `test_canonical_json.py`) before touching any conformance stage.

## Open questions

- Exact Java `cucumber-expressions` public API surface (`CucumberExpression`,
  `ParameterTypeRegistry`, capture group start/end accessors) — confirm at
  implementation start, same as Python's Task 10 did.
- Final author-API ergonomic shape (see "Author API") — prototype before committing in
  the task plan.
- Whether the Java baseline needs to move past 21 once `var-junit`'s JUnit dependency
  version is pinned (sub-project 2) — resolve before or alongside Milestone 1 if it
  affects language features used in `var-core`.

## References

- [ADR 0001 — Python as the second language](../../adr/0001-second-language-python.md)
- [ADR 0003 — Java JUnit integration](../../adr/0003-java-junit-integration.md)
- [`adding-a-language-port` skill](../../../.claude/skills/adding-a-language-port/SKILL.md)
- Python precedent: [`2026-06-30-python-core-port-design.md`](2026-06-30-python-core-port-design.md),
  [`2026-06-30-python-core-split.md`](../plans/2026-06-30-python-core-split.md)
- Reference implementation: `typescript/packages/var-core/src/*`,
  `typescript/packages/var/src/internal.ts`; completed second port:
  `python/packages/var-core/src/var_core/*.py`, `python/packages/var/src/var/*.py`
