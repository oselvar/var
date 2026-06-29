# @oselvar/var-core

The pure functional core of Vár: parser, matcher, planner, executor, AST, diagnostics,
and the return-based comparison engine. Pure functions over immutable data — no
globals, no I/O, no side effects.

**Internal.** Do not depend on this package directly. Write step definitions against
`@oselvar/var`; integrate with a test runner via an adapter such as
`@oselvar/var-vitest`. This package's surface is broad and may change without notice.
