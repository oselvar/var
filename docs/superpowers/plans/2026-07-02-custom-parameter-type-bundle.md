# Custom-Parameter-Type Conformance Bundle Implementation Plan (Sub-project B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conformance bundle `13-custom-parameter-type` — the first bundle exercising a custom cucumber-expression parameter type (`{airport}`, regexp `[A-Z]{3}`, lowercasing transformer) — with fixtures in all four languages and the first non-empty `parameterTypes` goldens.

**Architecture:** No port currently projects custom parameter types into the registry artifact — every harness emits `parameterTypes: []` unconditionally. Tasks 1–3 add the plumbing per port (Java: track custom types on the `Registry` record so `toRegistryArtifact(registry)` needs no signature change; TS/Python: expose the facade's accumulated custom types via an internal accessor and pass them through the harness). Task 4 lands the bundle itself — `example.md`, four fixtures, four goldens, and the Java/Kotlin fixture registrations — in ONE commit, because the Java and Kotlin conformance tests throw on a bundle directory with no registered fixture. The transformer is load-bearing: the action stores the LOWERCASED airport code and the sensor compares it against a lowercase `{word}` in the Markdown, so an identity transformer fails the trace stage.

**Tech Stack:** TypeScript strict/ESM (pnpm, vitest, tsx), Python ≥3.11 (uv, pytest), Java 21 (Maven, JUnit Jupiter), Kotlin 2.4 facade. Spec: `docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Sub-project B).

## Global Constraints

- Run all pnpm/vitest commands from `typescript/`, uv from `python/`, mvn from `java/`.
- `pnpm -r build` + `pnpm typecheck` are separate TS gates; run both before calling a TS task done. Biome note: this worktree's path contains `.claude`, which collides with biome.json's `!**/.claude` ignore — run biome on touched files from a hardlink copy at a `.claude`-free path if needed; never modify biome.json.
- Canonical JSON goldens: recursively sorted keys, 2-space indent, LF, trailing newline; harnesses compare byte-for-byte.
- **Cross-port regexp serialization convention (this plan establishes it):** the registry artifact's `parameterTypes[].regexp` is the bare pattern source string — `[A-Z]{3}` — no delimiters, no flags. TS: `RegExp.source`. Python: `re.Pattern.pattern` (or the string as authored). Java: `Pattern.pattern()`. Only custom types are projected; built-ins (`int`, `word`, `string`, …) never appear.
- Parameter types must be registered BEFORE any step whose expression uses them (every port compiles expressions eagerly at registration).
- The shared fixture stem is `airports.steps` (files `airports.steps.ts/.py/.kt`, class `AirportsSteps.java`) — the stem appears in trace goldens as `contextKey.stepFile: "airports.steps"`, and the Java/Kotlin PascalCase convention (`NumeralsSteps` ↔ `numerals.steps`) must be followed exactly.
- Minimal public API: the new TS/Python accessors are internal-only (underscore-prefixed, exported beside `_resetBuilder` on the internal registry subpath), never from the package root.
- Immutable types; pure functions; biome style in TS (single quotes, no semicolons, 2-space indent, trailing commas); ruff line-length 100 in Python; 4-space indent in Java.
- Trunk stays green: Tasks 1–3 must not change any existing golden's bytes (all existing bundles have `parameterTypes: []`, and the plumbing defaults preserve that).

---

### Task 1: Java — track custom parameter types on `Registry`, project them in `Conformance`

**Files:**
- Modify: `java/var-core/src/main/java/com/oselvar/var/core/Registry.java`
- Modify: `java/var-core/src/main/java/com/oselvar/var/core/Conformance.java:60-65`
- Test: `java/var-core/src/test/java/com/oselvar/var/core/RegistryTest.java`, `java/var-core/src/test/java/com/oselvar/var/core/ConformanceTest.java`

**Interfaces:**
- Consumes: existing `Registry` record `(List<StepRegistration> steps, ParameterTypeRegistry parameterTypes)`; `Registry.defineParameterType(Registry, String, Pattern, Function<String[],T>)` which currently mutates the `ParameterTypeRegistry` in place and returns the same instance.
- Produces (Task 4's Java/Kotlin harnesses rely on this): `Registry` gains a third record component `List<CustomParameterType> customParameterTypes` with nested `public record CustomParameterType(String name, String regexp) {}`; `Registry.defineParameterType` returns a NEW `Registry` with the custom type appended (`regexp` stored as `regexp.pattern()`); `Conformance.toRegistryArtifact(Registry)` keeps its signature and now projects `registry.customParameterTypes()` as `[{name, regexp}]` maps.

- [ ] **Step 1: Write the failing tests**

Add to `java/var-core/src/test/java/com/oselvar/var/core/ConformanceTest.java` (alongside the existing registry-artifact unit tests; reuse the file's existing imports/builders — read them first):

```java
    @Test
    void registryArtifactProjectsCustomParameterTypes() {
        Registry r = Registry.createRegistry();
        r = Registry.defineParameterType(
                r, "airport", java.util.regex.Pattern.compile("[A-Z]{3}"), groups -> groups[0]);
        r =
                Registry.addStep(
                        r,
                        "I fly to {airport}",
                        "airports.steps",
                        1,
                        StepKind.ACTION,
                        (state, args) -> state);
        Map<String, Object> artifact = Conformance.toRegistryArtifact(r);
        assertEquals(
                List.of(Map.of("name", "airport", "regexp", "[A-Z]{3}")),
                artifact.get("parameterTypes"));
        assertEquals(
                List.of("airport"),
                ((Map<?, ?>) ((List<?>) artifact.get("steps")).get(0)).get("parameterTypeNames"));
    }
```

IMPORTANT: `Registry.addStep`'s real signature may differ from the sketch above — read `Registry.java` and the existing tests in this file first and call it exactly as they do (the assertion payload is what matters). Also add to `RegistryTest.java`:

```java
    @Test
    void defineParameterTypeRecordsTheCustomTypeImmutably() {
        Registry r0 = Registry.createRegistry();
        assertEquals(List.of(), r0.customParameterTypes());
        Registry r1 =
                Registry.defineParameterType(
                        r0, "airport", java.util.regex.Pattern.compile("[A-Z]{3}"), g -> g[0]);
        assertEquals(
                List.of(new Registry.CustomParameterType("airport", "[A-Z]{3}")),
                r1.customParameterTypes());
        // The original registry value is untouched (records are immutable views).
        assertEquals(List.of(), r0.customParameterTypes());
        assertThrows(
                UnsupportedOperationException.class,
                () -> r1.customParameterTypes().add(new Registry.CustomParameterType("x", "y")));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `java/`): `mvn --batch-mode -pl var-core -am test`
Expected: COMPILE FAILURE — `customParameterTypes()` / `CustomParameterType` do not exist.

- [ ] **Step 3: Implement**

In `Registry.java`:
- Add the record component: `public record Registry(List<StepRegistration> steps, ParameterTypeRegistry parameterTypes, List<CustomParameterType> customParameterTypes)` with `customParameterTypes = List.copyOf(customParameterTypes);` in the compact constructor, and the nested record:

```java
    /** A custom parameter type as registered by an author — name plus the bare
     * pattern source (Pattern.pattern(), no flags/delimiters), the exact string
     * the conformance registry artifact serializes. Built-ins never appear here. */
    public record CustomParameterType(String name, String regexp) {}
```

- Update every `new Registry(...)` construction site in the file (`createRegistry` passes `List.of()`; `addStep` and any other constructor preserve the incoming `registry.customParameterTypes()`).
- In `defineParameterType`, after `registry.parameterTypes().defineParameterType(parameterType);`, replace `return registry;` with:

```java
        List<CustomParameterType> recorded = new ArrayList<>(registry.customParameterTypes());
        recorded.add(new CustomParameterType(name, regexp.pattern()));
        return new Registry(registry.steps(), registry.parameterTypes(), recorded);
```

In `Conformance.java`, replace line 63's `out.put("parameterTypes", List.of());` with:

```java
        out.put(
                "parameterTypes",
                registry.customParameterTypes().stream()
                        .map(
                                p -> {
                                    Map<String, Object> pt = new LinkedHashMap<String, Object>();
                                    pt.put("name", p.name());
                                    pt.put("regexp", p.regexp());
                                    return (Object) pt;
                                })
                        .toList());
```

and update the javadoc note that said no bundle exercises defineParameterType (bundle 13 now does).

- [ ] **Step 4: Run the module tests, then the whole workspace**

Run: `mvn --batch-mode -pl var-core -am test` — new tests pass, existing registry-artifact tests still pass (`List.of()` equals an empty projected list).
Then: `mvn --batch-mode verify` (from `java/`) — all modules green; existing bundle goldens unchanged because nothing registers custom types yet.

- [ ] **Step 5: Commit**

```bash
git add java
git commit -m "feat(java-core): Registry tracks custom parameter types; conformance projects them"
```

---

### Task 2: TypeScript — expose custom types from the facade, pass them through the harness

**Files:**
- Modify: `typescript/packages/var/src/internal.ts`
- Modify: `typescript/packages/var/src/registry.ts` (add the re-export beside `_resetBuilder`)
- Modify: `typescript/packages/var/tests/conformance.test.ts:41` (pass the 4th arg)
- Test: `typescript/packages/var/tests/conformance-param-types.test.ts` (new), `typescript/packages/var-core/tests/conformance.test.ts` (one added unit test)

**Interfaces:**
- Consumes: `internal.ts`'s module-scope `customTypes` array (`{name, regexp: RegExp | ReadonlyArray<RegExp>, transformer}`); `runConformance(varDoc, registry, createContext, parameterTypes = [])` and `toRegistryArtifact(registry, parameterTypes = [])` from `@oselvar/var-core` (both already accept the list — nothing passes it yet).
- Produces (Task 4 relies on this): `_customParameterTypes(): ReadonlyArray<{ readonly name: string; readonly regexp: string }>` exported from `@oselvar/var/registry` — regexp projected via `.source`; the array form throws (`not supported by the conformance projection yet`) rather than guessing; cleared by `_resetBuilder` like everything else. The bundle harness passes it as `runConformance`'s 4th argument.

- [ ] **Step 1: Write the failing tests**

`typescript/packages/var/tests/conformance-param-types.test.ts`:

```ts
import { expect, test } from 'vitest'
import { defineState } from '../src/index.js'
import { _customParameterTypes, _resetBuilder } from '../src/registry.js'

test('_customParameterTypes projects name and regexp source', () => {
  _resetBuilder()
  defineState(() => ({}), {
    airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code.toLowerCase() },
  })
  expect(_customParameterTypes()).toEqual([{ name: 'airport', regexp: '[A-Z]{3}' }])
  _resetBuilder()
  expect(_customParameterTypes()).toEqual([])
})

test('_customParameterTypes rejects the regexp-array form for now', () => {
  _resetBuilder()
  defineState(() => ({}), {
    code: { regexp: [/[A-Z]{3}/, /[0-9]{3}/], transformer: (c: string) => c },
  })
  expect(() => _customParameterTypes()).toThrowError(/not supported/i)
  _resetBuilder()
})
```

Add to `typescript/packages/var-core/tests/conformance.test.ts` (beside the existing `toRegistryArtifact` tests, reusing its registry-building helpers — read the file first):

```ts
test('toRegistryArtifact projects passed custom parameter types', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'airport', regexp: /[A-Z]{3}/ })
  r = addStep(r, {
    expression: 'I fly to {airport}',
    expressionSourceFile: 'airports.steps',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  expect(toRegistryArtifact(r, [{ name: 'airport', regexp: '[A-Z]{3}' }])).toEqual({
    steps: [{ expression: 'I fly to {airport}', parameterTypeNames: ['airport'] }],
    parameterTypes: [{ name: 'airport', regexp: '[A-Z]{3}' }],
  })
})
```

(Adapt the `addStep` call to the exact input shape the file's existing tests use.)

- [ ] **Step 2: Run tests to verify they fail**

Run (from `typescript/`): `pnpm --filter @oselvar/var exec vitest run tests/conformance-param-types.test.ts`
Expected: FAIL — `_customParameterTypes` is not exported.

- [ ] **Step 3: Implement**

In `typescript/packages/var/src/internal.ts`, next to `_resetBuilder`:

```ts
// Conformance-harness accessor: the custom parameter types accumulated by
// defineState since the last _resetBuilder, projected to the {name, regexp}
// wire shape toRegistryArtifact serializes. regexp is the bare pattern
// source (RegExp.source — no flags/delimiters), the cross-port convention
// every language's registry golden uses. Internal-only: exported via
// @oselvar/var/registry beside _resetBuilder, never from the package root.
export function _customParameterTypes(): ReadonlyArray<{
  readonly name: string
  readonly regexp: string
}> {
  return customTypes.map((t) => {
    if (Array.isArray(t.regexp)) {
      throw new Error(
        `parameter type "${t.name}": regexp arrays are not supported by the conformance projection yet`,
      )
    }
    return { name: t.name, regexp: (t.regexp as RegExp).source }
  })
}
```

In `typescript/packages/var/src/registry.ts`, add `_customParameterTypes` to the existing re-export from `./internal.js`.

In `typescript/packages/var/tests/conformance.test.ts`: import `_customParameterTypes` alongside `_resetBuilder` (line 6), and change line 41 to:

```ts
const artifacts = await runConformance(varDoc, registry, createContext, _customParameterTypes())
```

- [ ] **Step 4: Run the gates**

Run: `pnpm --filter @oselvar/var exec vitest run && pnpm --filter @oselvar/var-core exec vitest run`
Expected: all pass — existing bundles register no custom types, so their `registry.json` goldens still compare equal (`parameterTypes: []`).
Then: `pnpm -r build && pnpm typecheck` — both exit 0.

- [ ] **Step 5: Commit**

```bash
git add typescript
git commit -m "feat(var): _customParameterTypes accessor; conformance harness projects custom types"
```

---

### Task 3: Python — same accessor and harness pass-through

**Files:**
- Modify: `python/packages/var/src/var/internal.py`
- Modify: `python/packages/var/src/var/registry.py` (re-export beside `_reset_builder` — read it first; it mirrors the TS registry subpath)
- Modify: `python/packages/var/tests/test_conformance.py` (registry + trace stages pass the list)
- Test: `python/packages/var/tests/test_custom_parameter_types.py` (new), `python/packages/var-core/tests/test_conformance.py` (one added unit test)

**Interfaces:**
- Consumes: `internal.py`'s module-global `_custom_types` (`{"name", "regexp", "transformer"}` dicts, regexp as authored: `str`, `re.Pattern`, or list); `to_registry_artifact(registry, parameter_types=None)` and `run_conformance(doc, registry, create_ctx, parameter_types=())` from `var_core.conformance` (both already accept the list).
- Produces (Task 4 relies on this): `var.registry._custom_parameter_types() -> list[dict[str, str]]` — each `{"name": ..., "regexp": <pattern string>}`; `re.Pattern` converted via `.pattern`; list-form regexp raises `TypeError`. The harness passes it to `to_registry_artifact` (registry stage) and `run_conformance` (trace stage).

- [ ] **Step 1: Write the failing tests**

`python/packages/var/tests/test_custom_parameter_types.py`:

```python
import re

import pytest

from var import define_state
from var.registry import _custom_parameter_types, _reset_builder


def test_projects_name_and_pattern_source():
    _reset_builder()
    define_state(
        lambda: {},
        param_types={
            "airport": {"regexp": re.compile(r"[A-Z]{3}"), "transformer": lambda code: code.lower()}
        },
    )
    assert _custom_parameter_types() == [{"name": "airport", "regexp": "[A-Z]{3}"}]
    _reset_builder()
    assert _custom_parameter_types() == []


def test_string_regexp_passes_through_verbatim():
    _reset_builder()
    define_state(lambda: {}, param_types={"airport": {"regexp": "[A-Z]{3}"}})
    assert _custom_parameter_types() == [{"name": "airport", "regexp": "[A-Z]{3}"}]
    _reset_builder()


def test_list_form_regexp_is_rejected():
    _reset_builder()
    define_state(lambda: {}, param_types={"code": {"regexp": ["[A-Z]{3}", "[0-9]{3}"]}})
    with pytest.raises(TypeError, match="not supported"):
        _custom_parameter_types()
    _reset_builder()
```

Add to `python/packages/var-core/tests/test_conformance.py` (beside the existing `to_registry_artifact` tests, reusing their registry-building style — read the file first):

```python
def test_to_registry_artifact_projects_passed_custom_parameter_types() -> None:
    r = create_registry()
    r = define_parameter_type(r, name="airport", regexp="[A-Z]{3}")
    r = add_step(
        r,
        expression="I fly to {airport}",
        expression_source_file="airports.steps",
        expression_source_line=1,
        handler=lambda *a: None,
        kind="action",
    )
    assert to_registry_artifact(r, [{"name": "airport", "regexp": "[A-Z]{3}"}]) == {
        "steps": [{"expression": "I fly to {airport}", "parameterTypeNames": ["airport"]}],
        "parameterTypes": [{"name": "airport", "regexp": "[A-Z]{3}"}],
    }
```

(Adapt the `add_step` kwargs to the file's existing usage.)

- [ ] **Step 2: Run tests to verify they fail**

Run (from `python/`): `uv run pytest packages/var/tests/test_custom_parameter_types.py`
Expected: FAIL — cannot import `_custom_parameter_types`.

- [ ] **Step 3: Implement**

In `python/packages/var/src/var/internal.py` (add `from re import Pattern` to the imports if absent), beside `_reset_builder`:

```python
def _custom_parameter_types() -> list[dict[str, str]]:
    """Conformance-harness accessor: the custom parameter types accumulated by
    ``define_state`` since the last ``_reset_builder``, projected to the
    ``{"name", "regexp"}`` wire shape ``to_registry_artifact`` serializes.

    ``regexp`` is the bare pattern source (``re.Pattern.pattern`` or the string
    as authored — no flags/delimiters), the cross-port convention every
    language's registry golden uses. Internal-only, mirrors the TS
    ``_customParameterTypes``.
    """
    out: list[dict[str, str]] = []
    for t in _custom_types:
        rx = t["regexp"]
        if isinstance(rx, Pattern):
            rx = rx.pattern
        elif not isinstance(rx, str):
            raise TypeError(
                f"parameter type {t['name']!r}: regexp lists are not supported by the "
                "conformance projection yet"
            )
        out.append({"name": t["name"], "regexp": rx})
    return out
```

Re-export it in `python/packages/var/src/var/registry.py` beside `_reset_builder`.

In `python/packages/var/tests/test_conformance.py`:
- add `_custom_parameter_types` to the `from var.registry import ...` line,
- registry stage: `artifact = to_registry_artifact(registry, _custom_parameter_types())`,
- trace stage: `artifacts = run_conformance(doc, registry, create_ctx, tuple(_custom_parameter_types()))`.

- [ ] **Step 4: Run the gates**

Run: `uv run pytest packages/var packages/var-core && uv run ruff check`
Expected: all pass — existing bundle goldens unchanged (no bundle registers custom types yet).

- [ ] **Step 5: Commit**

```bash
git add python
git commit -m "feat(python): _custom_parameter_types accessor; conformance harness projects custom types"
```

---

### Task 4: The bundle — example, four fixtures, four goldens, Java/Kotlin registration (ONE commit)

This must land as a single commit: the Java (`java/var`) and Kotlin (`java/var-kotlin`) conformance tests scan the bundles directory and THROW for a bundle with no registered fixture, so the directory, both JVM fixtures, and both switch/when cases are inseparable.

**Files:**
- Create: `conformance/bundles/13-custom-parameter-type/example.md`
- Create: `conformance/bundles/13-custom-parameter-type/airports.steps.ts`, `airports.steps.py`, `airports.steps.kt`, `AirportsSteps.java`
- Create (generated): `conformance/bundles/13-custom-parameter-type/golden/{var-doc,registry,plan,trace}.json`
- Modify: `java/var/src/test/java/com/oselvar/var/ConformanceTest.java` (loadFixture case), `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ConformanceTest.kt` (import alias + when case), `java/var-junit/src/test/java/com/oselvar/var/junit/ConformanceDogfoodTest.java` (add a `BundleCase`; update the stale "all 12 bundles" comment), `java/var-core/src/test/java/com/oselvar/var/core/ConformanceTest.java:44` (stale "12 bundles" comment)

**Interfaces:**
- Consumes: Task 1's `Registry.customParameterTypes` projection; Task 2's `_customParameterTypes` + harness pass-through; Task 3's Python equivalents; `Registrar.defineParameterType(String, Pattern, Function<String[],T>)` (Java, exists); `StepsScope.parameterType(name, Regex, (Array<String>) -> Any?)` (Kotlin, exists, called bare inside the `defineState` block BEFORE the steps).
- Produces: the bundle every port's harness now runs at its gate stage (TS/Python: var-doc+registry+plan+trace; Java: registry+plan+trace in `var`, var-doc in `var-core`, dogfood in `var-junit`; Kotlin: registry). Also the corpus for sub-project C's parameter-type extraction tests.

- [ ] **Step 1: Write example.md**

`conformance/bundles/13-custom-parameter-type/example.md` (exactly this content):

```markdown
# Custom parameter types

## Flying to London

I fly to LHR. The destination code is lhr.
```

The transformer is what makes the second sentence pass: the action stores `transformer("LHR")` = `"lhr"`, and the sensor compares it against the literal lowercase `{word}` capture. With an identity transformer the trace stage fails — the transformer is load-bearing, not decorative.

- [ ] **Step 2: Write the four fixtures**

`conformance/bundles/13-custom-parameter-type/airports.steps.ts`:

```ts
import { defineState } from '@oselvar/var'

// Custom {airport} parameter type: IATA code, lowercased by the transformer.
// The lowercasing is asserted by the sensor (the .md says "lhr"), so an
// identity transformer fails this bundle — proving transformers execute.
const { action, sensor } = defineState<{ dest?: string }>(() => ({}), {
  airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code.toLowerCase() },
})

action('I fly to {airport}', (_state, dest: string) => ({ dest }))

sensor('The destination code is {word}', (state, expected: string) => {
  // {word} greedily captures the sentence-ending period (same cleanup as
  // bundle 01) — strip it before comparing.
  const cleaned = expected.replace(/[.!?]$/, '')
  if (state.dest !== cleaned) throw new Error(`expected ${cleaned} but got ${state.dest}`)
})
```

`conformance/bundles/13-custom-parameter-type/airports.steps.py`:

```python
from var import define_state

# Custom {airport} parameter type: IATA code, lowercased by the transformer.
# The lowercasing is asserted by the sensor (the .md says "lhr"), so an
# identity transformer fails this bundle — proving transformers execute.
context, action, sensor = define_state(
    lambda: {},
    param_types={
        "airport": {"regexp": "[A-Z]{3}", "transformer": lambda code: code.lower()}
    },
)


@action("I fly to {airport}")
def _(state, dest):
    return {"dest": dest}


@sensor("The destination code is {word}")
def _(state, expected):
    # {word} greedily captures the sentence-ending period (same cleanup as
    # bundle 01) — strip it before comparing.
    cleaned = expected.rstrip(".!?")
    if state.get("dest") != cleaned:
        raise AssertionError(f"expected {cleaned} but got {state.get('dest')}")
```

`conformance/bundles/13-custom-parameter-type/AirportsSteps.java`:

```java
package com.oselvar.var.conformance.bundle13;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Java sibling of {@code airports.steps.ts}/{@code airports.steps.py}/{@code
 * airports.steps.kt} (bundle {@code 13-custom-parameter-type}) — the first fixture
 * exercising {@link Registrar#defineParameterType}: a custom {@code {airport}} type
 * (IATA code, lowercased by the transformer). The lowercasing is asserted by the
 * sensor (the .md says "lhr"), so an identity transformer fails this bundle. The
 * parameter type MUST be registered before the steps — expressions compile eagerly.
 */
public final class AirportsSteps implements StepDefinitions {

    record Ctx(String dest) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        registrar.defineParameterType(
                "airport",
                Pattern.compile("[A-Z]{3}"),
                groups -> groups[0].toLowerCase(Locale.ROOT));

        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(null));

        s.action("I fly to {airport}", (Ctx ctx, String dest) -> new Ctx(dest));

        s.sensor(
                "The destination code is {word}",
                (Ctx ctx, String expected) -> {
                    // {word} greedily captures the sentence-ending period (same
                    // cleanup as bundle 01) — strip it before comparing.
                    String cleaned = expected.replaceAll("[.!?]$", "");
                    if (!cleaned.equals(ctx.dest())) {
                        throw new AssertionError("expected " + cleaned + " but got " + ctx.dest());
                    }
                    return null;
                });
    }
}
```

`conformance/bundles/13-custom-parameter-type/airports.steps.kt`:

```kotlin
@file:JvmName("AirportsSteps")

// Kotlin sibling of airports.steps.ts / airports.steps.py / AirportsSteps.java
// (bundle 13-custom-parameter-type) — exercises StepsScope.parameterType: a
// custom {airport} type (IATA code, lowercased by the transformer). The
// lowercasing is asserted by the sensor (the .md says "lhr"), so an identity
// transformer fails this bundle. parameterType MUST precede the steps —
// expressions compile eagerly.
package com.oselvar.varkt.conformance.bundle13

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

data class Ctx(val dest: String? = null)

val steps = defineState(::Ctx) {
    parameterType("airport", Regex("[A-Z]{3}")) { captures -> captures[0].lowercase() }
    action("I fly to {airport}") { dest: String ->
        copy(dest = dest)
    }
    sensor("The destination code is {word}") { expected: String ->
        // {word} greedily captures the sentence-ending period (same cleanup as
        // bundle 01) — strip it before comparing.
        val cleaned = expected.replace(Regex("[.!?]$"), "")
        if (cleaned != dest) throw AssertionError("expected $cleaned but got $dest")
        null
    }
}
```

- [ ] **Step 3: Generate the four goldens from the TypeScript reference implementation**

Write this one-off script to `typescript/generate-golden-13.mts` (it is deleted before the commit — the goldens are the artifact):

```ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalStringify, runConformance } from './packages/var-core/src/conformance.js'
import { parse } from './packages/var-core/src/parse.js'
import { _customParameterTypes, _resetBuilder, buildRegistry, contextFactory } from './packages/var/src/registry.js'

const dir = resolve(import.meta.dirname, '..', 'conformance', 'bundles', '13-custom-parameter-type')
_resetBuilder()
for (const f of readdirSync(dir).filter((f) => f.endsWith('.steps.ts')).sort()) {
  await import(pathToFileURL(resolve(dir, f)).href)
}
const registry = buildRegistry()
const createContext = contextFactory()
const source = readFileSync(resolve(dir, 'example.md'), 'utf8')
const varDoc = parse('example.md', source)
const artifacts = await runConformance(varDoc, registry, createContext, _customParameterTypes())
mkdirSync(resolve(dir, 'golden'), { recursive: true })
for (const [file, key] of [
  ['var-doc', 'varDoc'],
  ['registry', 'registry'],
  ['plan', 'plan'],
  ['trace', 'trace'],
] as const) {
  writeFileSync(resolve(dir, 'golden', `${file}.json`), canonicalStringify(artifacts[key]))
}
console.log('goldens written')
```

Run (from `typescript/`): `npx tsx generate-golden-13.mts` — expected output `goldens written`. If the import names differ (e.g. `runConformance` lives elsewhere or `artifacts` keys differ), mirror EXACTLY what `typescript/packages/var/tests/conformance.test.ts` does — the script is a copy of that harness's per-bundle body.

Then verify the registry golden is exactly:

```json
{
  "parameterTypes": [
    {
      "name": "airport",
      "regexp": "[A-Z]{3}"
    }
  ],
  "steps": [
    {
      "expression": "I fly to {airport}",
      "parameterTypeNames": [
        "airport"
      ]
    },
    {
      "expression": "The destination code is {word}",
      "parameterTypeNames": [
        "word"
      ]
    }
  ]
}
```

and that `golden/trace.json` shows one example with `"outcome": "pass"` and `contextKey.stepFile` = `"airports.steps"`. Delete the script: `rm typescript/generate-golden-13.mts`.

- [ ] **Step 4: Verify TS and Python conformance against the fresh goldens**

Run (from `typescript/`): `pnpm --filter @oselvar/var exec vitest run tests/conformance.test.ts`
Expected: 13 bundles, all pass (bundle 13 auto-discovered).

Run (from `python/`): `uv run pytest packages/var/tests/test_conformance.py -k 13-custom-parameter-type`
Expected: 4 stage tests pass. If the trace stage fails on transformer behavior, the Python fixture (not the golden) is wrong — the TS run is the reference.

- [ ] **Step 5: Register the Java and Kotlin fixtures**

- `java/var/src/test/java/com/oselvar/var/ConformanceTest.java`: add before the `default`:

```java
            case "13-custom-parameter-type" ->
                    new com.oselvar.var.conformance.bundle13.AirportsSteps();
```

- `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ConformanceTest.kt`: add the import alias `import com.oselvar.varkt.conformance.bundle13.steps as bundle13Steps` (in the existing alias block) and the when-case `"13-custom-parameter-type" -> bundle13Steps` before the `else`.
- `java/var-junit/src/test/java/com/oselvar/var/junit/ConformanceDogfoodTest.java`: add a `BundleCase` for `"13-custom-parameter-type"` with fixture class `com.oselvar.var.conformance.bundle13.AirportsSteps`, expected 1 passed / 0 failed — match the exact `BundleCase` constructor shape of the existing 12 entries (read them first); update the "runs all 12 bundles" comment to 13.
- `java/var-core/src/test/java/com/oselvar/var/core/ConformanceTest.java:44`: update the "finds all 12 bundles" comment to 13.

- [ ] **Step 6: Run the Java/Kotlin gates**

Run (from `java/`):
```
mvn --batch-mode -pl var-core -am -Dtest=ConformanceTest test
mvn --batch-mode -pl var -am -Dtest=ConformanceTest test
mvn --batch-mode -pl var-kotlin -am -Dtest=ConformanceTest test
mvn --batch-mode -pl var-junit -am -Dtest=ConformanceDogfoodTest test
```
Expected: all green — 13 bundles each. Then the full workspace: `mvn --batch-mode verify`.

- [ ] **Step 7: Full root gate and commit (single commit)**

Run from the repo root: `make check` — all three ports green (TS pnpm check may need the `.claude`-free hardlink-copy workaround for biome; see Global Constraints).

```bash
git add conformance java
git status --short   # confirm: bundle dir + goldens + 4 fixtures + 4 java test-file edits, nothing else
git commit -m "feat(conformance): bundle 13-custom-parameter-type — first custom {airport} parameter type across all four languages"
```

---

### Task 5: Spec bookkeeping

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Status line)

- [ ] **Step 1: Update the spec status and commit**

Change the Status line to `**Status:** Sub-projects A and B implemented; C–D unimplemented`.

```bash
git add docs/superpowers/specs/2026-07-02-multi-language-authoring-design.md
git commit -m "docs: mark custom-parameter-type bundle (sub-project B) implemented"
```
