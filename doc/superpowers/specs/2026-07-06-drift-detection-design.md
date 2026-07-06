# Spec drift detection and acknowledgment — design

Date: 2026-07-06
Status: design, docs written first (reference/examples §Drift detection), implementation pending
Implements: [ADR 0002](../../adr/0002-drift-detection-and-acknowledgment.md)

## Why

Vár treats a Markdown paragraph as an **example** only if ≥1 of its sentences
matches a step definition; zero matches → prose, silently ignored (see
[reference/examples](../../../typescript/packages/website/src/content/docs/reference/examples.mdx)).
The footgun: a paragraph that **was** an example can stop matching — a step is
renamed or deleted, or a typo creeps into the Markdown — and it silently reverts
to prose. The suite stays green while testing *less* than it did. This is silent
coverage loss: the worst failure mode a test system has, because it looks exactly
like success.

**Drift** = *a paragraph that a recorded baseline says was an example, and that
now yields zero matched steps*. Vár must detect it and **fail** until the user
**explicitly acknowledges** it. Never silently drop, never silently pass.

## Portability facts that shape this design

- The detector must run **at run time in the runner**, in **every port**
  (TS, Python, Java, Kotlin), with **identical semantics** — same fingerprint,
  same baseline format, same drift verdict. (ADR 0002; cross-implementation
  consistency design.)
- The core already knows which paragraphs are examples: `parse()` → `VarDoc`
  (all structural candidate paragraphs, `varDoc.examples`) and
  `plan(varDoc, registry)` → `ExecutionPlan` (only the paragraphs that matched
  ≥1 step). The detector is a **pure function over those two**, so it ports the
  same way the parser and planner do.
- Ports have **no shared CLI**: `var run` exists, but vitest/pytest/JUnit/Kotest
  drive the runner from their own harness. So the *acknowledge* affordance must
  be a **mode read from the environment**, not a CLI flag (see §Acknowledgment).
- `hashSource` (FNV-1a 32-bit over UTF-16 code units, `fnv1a:` prefix,
  `var-core/src/hash.ts`) is already the cross-language change-detector. Keep it.

## What `.var/` is — and why the baseline is separate

`.var/<spec>.json` is the **transient editor-decoration cache**: after a run the
reporter writes each spec's `SpecResults` (sourceHash + per-example status +
failure `actual` values + source offsets); the LSP reads it
(`var-lsp/src/server.ts` globs `**/.var/**/*.json`) to redden failing spans and
show `actual` on hover, and invalidates it the instant the source hash changes
(`run-diagnostics.ts`). It is per-developer, machine-specific, and rewritten
every run — correctly **gitignored**.

The drift baseline is the opposite: **committed, stable, identity-only**. It
must be shared so the gate holds in CI. These two cannot be the same file —
committing `.var/` would churn on every run and leak runtime values. So the
baseline is a new, separate artifact.

### Decision: `var.lock.json` at the project root

One committed file per project, not N per-spec sidecars (the baseline is tiny;
one file reviews cleanly in a PR and reads unambiguously as committed state).
`.var/` is unchanged.

```jsonc
// var.lock.json  (committed)
{
  "version": 1,
  "specs": {
    "library.md": {                    // POSIX path, relative to project root
      "sourceHash": "fnv1a:1a2b3c4d",
      "examples": [                     // one entry per example-producing paragraph
        { "name": "I check out The Hobbit", "line": 7 }
      ]
    }
  }
}
```

- `name` — the example-producing paragraph's normalized primary text
  (`deriveExampleName` over the candidate body). For a header-bound table it is
  the **binding paragraph** text, recorded **once** (not one entry per row).
- `line` — 1-based start line of the candidate's primary block. The anchor used
  when the paragraph's text changed (typo case) so `name` no longer matches.

Concurrency: many processes may **read** `var.lock.json` (safe); exactly one
**writes** it — the run's session-end aggregator (vitest reporter
`onTestRunEnd`, pytest session finish, JUnit launcher summary, `var run` after
its loop). Single writer ⇒ no race.

## Detection (pure, in `var-core`)

A new pure function, ported identically:

```
detectDrift(baselineForSpec, varDoc, plan) → ReadonlyArray<Drift>
  Drift = { name: string, line: number }
```

Definitions for the current run of one spec:

- **candidate** — a structural paragraph, `varDoc.examples[i]` (every
  paragraph/list-item/blockquote, before zero-match ones are dropped).
- **live candidate** — a candidate whose span contains ≥1 `plan.examples[j].span`.
  This is "still an example," and handles both the 1:1 case and the header-bound
  1:many case (row examples nest inside the binding paragraph's span).
- **dead candidate** — a candidate that is not live (matched zero steps): prose.

Algorithm, for each baseline entry `B = { name, line }`:

1. Find the current candidate `C` matching `B` — **by `name` first, else by
   `line`** (the primary block whose start line is `B.line`). Name catches the
   step-rename case (Markdown unchanged, text identical); line catches the typo
   case (text changed in place).
2. `C` is a **live** candidate → not drift.
3. `C` is a **dead** candidate → **DRIFT** `{ name: B.name, line: C.line }`.
4. No `C` found → the paragraph was deleted or moved-and-edited → **not drift**
   (a removed spec paragraph is a deliberate deletion, not silent coverage loss;
   whole-paragraph deletion is out of scope, per ADR).

Notes:

- **No `sourceHash` short-circuit for detection.** ADR 0002 step 2 suggests
  skipping when the source hash is unchanged; that is wrong, because a step
  definition can be renamed/deleted with the Markdown untouched (hash identical)
  — exactly the primary drift case. Detection always runs against the freshly
  planned current state. `sourceHash` is still recorded (for the LSP's staleness
  invalidation and human diffing), just not used to gate detection.
- Detection is **pure and registry-free** — it consumes the already-built
  `VarDoc` and `ExecutionPlan`. No new I/O in the core.

## Gate and write (the shell, per port)

Read `var.lock.json` once at the start of a run. For each spec, after planning,
run `detectDrift`. Then:

| Situation | Run outcome | `var.lock.json` |
| --- | --- | --- |
| No drift | pass/fail on the examples as today | rewrite spec entry = current live candidates |
| Drift, **not** in update mode | **FAIL** — message names each drifted example + `spec:line` | **leave untouched** (baseline keeps the old example so it stays red until fixed or accepted) |
| Drift, update mode | pass | rewrite spec entry = current live candidates (accepts the drift) |

- On drift the entry is **not** rewritten — otherwise the drifted example would
  vanish from the baseline and never fail again. New examples added in the same
  edit are baselined on the next clean (or update-mode) run.
- The failure must surface through each framework's **native** failure channel:
  a red test (vitest/pytest/JUnit/Kotest) or non-zero exit (`var run`), so CI
  gates without any Vár-specific tooling. This mirrors the existing
  `var:stale-spec-transform` guard test in `var-vitest/src/runtime.ts` — drift
  registers an analogous `var:drift` failing test at **collection time** (where
  the worker has source + plan), reading its spec's baseline entry from
  `var.lock.json`.

## Reporting — one rail, every surface

Drift is emitted as a `Diagnostic` (`code: 'drift'`, `severity: 'error'`, span
= the drifted paragraph), the same type `ambiguous-match` and
`error-fence-without-step` already use (`driftDetected` / `driftDiagnostics` in
`var-core`). Riding that rail means no bespoke reporting per surface:

- **`var run`** already exits non-zero on any error-severity diagnostic.
- **vitest / pytest** register a failing test per diagnostic (the default
  `Reporter`) — the runner gate.
- **LSP** already publishes `Diagnostic`s (it plans each open spec); it
  additionally reads `var.lock.json`, runs `detectDrift`, and publishes the
  drift diagnostic — a squiggle on the drifted paragraph in VS Code and the
  website editor. This is the authoring-time surface the ADR calls
  *complementary* to the runner gate (not a replacement — the editor alone
  never gates CI).
- **browser demo** consumes the same diagnostics for its inline drift marker.

The **acknowledge** affordance is symmetric: update mode in the runner, and an
LSP **code action** ("Accept as prose") / a button in the browser — both write
the baseline through the `BaselineStore` port.

## Persistence — the `BaselineStore` port

`var.lock.json` I/O is a side effect, so the core defines a port and adapters
implement it (hexagonal). The core owns the format (`parseVarLock` /
`stringifyVarLock`); the port moves only raw text:

```ts
export interface BaselineStore {
  read(): string | null | Promise<string | null> // whole var.lock.json, or null
  write(contents: string): void | Promise<void>
}
```

Adapters: a filesystem store on Node (CLI, vitest — one writer at session end),
an **in-memory** store in the browser (a closure over one string, optionally
mirrored to `localStorage`). The read→plan→`detectDrift`→gate→write
orchestration is one core function taking a `BaselineStore`, so browser and
Node share identical drift logic.

## Acknowledgment — one mode, many surfaces

Blanket, snapshot-style: an **update-mode** run re-records the baseline
(accepting all current drift) and goes green. The contract is a mode the shared
runner reads; each adapter maps its idiom onto it. Lowest common denominator:
the environment variable **`VAR_UPDATE`** (`1`/`true`). Nicer native surfaces
layer on top:

| Runtime | Enters update mode via |
| --- | --- |
| `var` CLI | `var run --update` |
| vitest | `-u` / `--update` (already vitest's snapshot-update flag) or `VAR_UPDATE=1` |
| pytest | `--var-update` (pytest plugin option) or `VAR_UPDATE=1` |
| JUnit (Maven/Gradle) | `-Dvar.update=true` system property, or `VAR_UPDATE=1` |
| Kotest | `-Dvar.update=true`, or `VAR_UPDATE=1` |

This is exactly how JVM snapshot libraries (Selfie, ApprovalTests) enter
write/accept mode — via system property/env, precisely because there is no CLI.
No interactive prompt (won't work headless/CI). Accepting is intentionally
review-visible: it shows up as a `var.lock.json` diff in the PR.

## Cross-language / rollout

Drift is a **runtime / run-result** concern — it lives in the shared shell
(`var-runner` and the adapters), layered on the pure core's parse/match. It is
**not** runtime-collection behaviour and **not** part of the conformance corpus
(no golden files). The `detectDrift` function and the `var.lock.json`
read/write, however, are pinned here and must be byte-identical in shape across
ports.

Implementation order (each increment green on its own):

1. **var-core (pure):** baseline types (`VarLock`, `SpecBaseline`, `Drift`),
   `detectDrift`, and pure serialize/parse for `var.lock.json`. Unit-tested in
   isolation. *(This spec's first commit.)*
2. **TS shell:** `var run` (var-cli) and vitest (var-vitest) read the lockfile,
   gate via `detectDrift`, register `var:drift`, honor update mode, and write
   the lockfile. Dogfood on `examples/typescript-vitest`.
3. **Python:** port `hash.py` + the run-result/baseline read-write + the same
   `detect_drift`; wire the pytest and unittest adapters.
4. **JVM:** port to `var-core` (Java) + wire JUnit engine and Kotest, with the
   `-Dvar.update` surface.

Out of scope: whole-file deletion/rename (the spec is gone, not drifted);
paragraph deletion (deliberate); interactive acknowledgment.
