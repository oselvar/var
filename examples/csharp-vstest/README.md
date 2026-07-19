# Vár sample: C# + dotnet test

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://varar.dev), driven by `dotnet test` via the `Varar.TestAdapter`
VSTest adapter. Copy it as the starting point for your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
dotnet test                          # one test per example, all green
dotnet test --filter yahtzee         # run a single spec's examples
```

Each example in the Markdown specs becomes one independently selectable test,
reported as `spec.md::name` and pointing at the `.md` source line.

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs the
  Markdown specs. (`steps` is carried for parity with the other ports; C# compiles
  its step files in, so there is nothing to glob at runtime.)
- **`steps/*.steps.cs`** define the steps. C# has no import-for-side-effect, so —
  like the Java/Kotlin/Rust ports and unlike TypeScript/Python — each file exposes
  a `static Registry Register(Registry r)` that adds its steps explicitly; the
  adapter discovers them by reflection. State is a full-replacement value: a
  stimulus returns the whole next state.
- **`src/*.cs`** are the code under test (roman numerals, Yahtzee, the library).
- **`Varar.TestAdapter`** is a VSTest adapter, so installing the package is the
  whole integration story — `dotnet test` discovers one test per Markdown example.

In this monorepo the Vár packages resolve from source (project references); a real
project depends on the published NuGet packages instead (see the `.csproj`).
