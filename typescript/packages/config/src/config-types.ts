// Spec-doc discovery globs. `include` is globbed; anything also matching
// `exclude` is dropped. Both are plain globs — no `!` prefix semantics.
export type VarGlobs = {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

// The parsed shape of varar.config.json — pure data, shared byte-for-byte with
// the Python/Java/Kotlin readers (see conformance/config/README.md).
export type ParsedVarConfig = {
  readonly docs: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippets: Readonly<Record<string, string>>
}

// The resolved config consumers receive.
export type VarConfig = {
  readonly docs: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippets: Readonly<Record<string, string>>
}
