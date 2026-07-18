# @varar/core

The pure functional core of Varar: parser, matcher, planner, executor, AST, diagnostics,
and the return-based comparison engine. Pure functions over immutable data — no
globals, no I/O, no side effects.

**Internal.** Do not depend on this package directly. Write step definitions against
`@varar/varar`; integrate with a test runner via an adapter such as
`@varar/vitest`. This package's surface is broad and may change without notice.
