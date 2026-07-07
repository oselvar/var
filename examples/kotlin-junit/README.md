# Vár sample: Kotlin + JUnit + Gradle

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the Kotlin DSL (`var-kotlin`) and the
JUnit Platform engine (`var-junit`). Copy it as the starting point for your
own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
./gradlew test
```

Each example in the Markdown specs becomes one JUnit test.

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs, and `steps` lists the fully-qualified step-definition
  classes. For a Kotlin file with a top-level `val steps = steps(...)`,
  that's the file-facade class pinned by `@file:JvmName(...)`.
- **`src/test/kotlin/examples/*.steps.kt`** define the steps with
  `steps` + `stimulus`/`sensor`. State is the lambda receiver; a
  stimulus returns the next state (`copy(...)`), a sensor returns a value for
  Vár to compare against what the Markdown says.
- **`RunVarSpecsTest.kt`** is a JUnit `@Suite` that includes the `"var"`
  engine. It exists only because Gradle and Maven Surefire discover tests by
  class — the engine itself needs no wiring beyond having `var-junit` on the
  test classpath.

## Versioning note

In the `oselvar/var` monorepo `varVersion` is the SNAPSHOT that `mvn install`
(run from `java/`) puts into the local Maven repository, so the sample gates
trunk; in `oselvar/var-examples` the release sync pins it to the released
Maven Central artifacts.
