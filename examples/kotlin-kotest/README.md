# Vár sample: Kotlin + Kotest + Gradle

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the Kotlin DSL (`var-kotlin`) and the
Kotest adapter (`var-kotest`).

In this repo the sample consumes the SNAPSHOT that `mvn install` (run from
`java/`) puts into the local Maven repository, so it always gates the code
on trunk. To copy it as the starting point for your own project, set
`varVersion` in `build.gradle.kts` to the latest release on Maven Central
and drop the `mavenLocal()` repository.

## Run it

```sh
(cd .. && mvn install)   # once, or after changing the library
./gradlew test
```

Each example in the Markdown specs becomes one Kotest test.

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs (here they live outside the project, in the repo's
  shared [`doc/examples/`](../../doc/examples) corpus — in your project they
  can sit anywhere), and `steps` lists the fully-qualified step-definition
  classes. For a Kotlin file with a top-level `val steps = defineState(...)`,
  that's the file-facade class pinned by `@file:JvmName(...)`.
- **`src/test/kotlin/examples/*.steps.kt`** define the steps with
  `defineState` + `stimulus`/`sensor`. State is the lambda receiver; a
  stimulus returns the next state (`copy(...)`), a sensor returns a value for
  Vár to compare against what the Markdown says.
- **`ExamplesSpec.kt`** extends `VarSpec`, a Kotest `FunSpec` that loads
  `var.config.json` (from the test working directory by default) and registers
  one test per planned example. Because it's an ordinary Kotest spec class, no
  discovery workarounds are needed.
