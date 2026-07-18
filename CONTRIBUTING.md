# Contributing

All of the code in this repository is written by AI agents, supervised by
humans. We like it that way, and we welcome contributions built the same way:
**agent-written, with serious human oversight**. What we don't welcome is
unsupervised agent output — code the submitting human hasn't read, run, or
understood. The agent does the typing; you are the engineer.

## Before you open a PR: open an issue

Open an issue first and wait for a maintainer's go-ahead, so neither of us
wastes time on a PR that won't land. **The issue must be written by a human**,
in your own words: what problem you hit, what you propose, why it belongs
here. An agent-generated issue tells us nothing about whether a human
actually wants the change.

PR descriptions may be agent-drafted, but edit them down yourself — no raw
agent walls of text. If it reads like a transcript, it isn't done.

## What "serious human oversight" means

By opening a PR you're saying all of the following are true:

- **You have read and understood every line of the diff**, and can explain
  any of it when asked in review.
- **You ran the gates locally** — `make check` (or `make typescript` /
  `make python` / `make java` for a single port) — and they pass.
- **You exercised the change by hand** at least once. Green gates are
  necessary, not sufficient.
- **You answer review comments yourself.** Feel free to consult your agent,
  but pasting its replies unedited is not a conversation.

## Guardrails

Agents produce mistakes at scale, so this repo is fenced accordingly. Your
PR passes through all of these:

- **`make check`** — the root gate. Builds and tests all three ports with
  exactly the same commands as CI (`.github/workflows/*.yml`).
- **Conformance corpus** — `conformance/bundles/` is a language-neutral
  test suite; every port must match the golden files byte-for-byte.
- **Commit lint** — commits must follow Conventional Commits
  (`release/lint-commits.sh`); they generate the changelog and decide the
  next version, so the format is enforced, not suggested.
- **Type-checking as a separate gate** — vitest strips types without
  checking them, so TypeScript is verified by `pnpm -r build` (src) and
  `pnpm typecheck` (tests). A green test run alone proves nothing.
- **Static analysis** — biome (lint/format), knip (dead exports), jscpd
  (copy-paste detection) in TypeScript; ruff in Python.
- **No cross-package re-exports** — enforced by a lint in every port;
  packages expose their own API only.
- **Coverage** — all three ports report test coverage; TypeScript and
  Python enforce ratcheting floors (raise, never lower).
- **Dogfooding** — the tool's own specs (the `.md` files in `examples/`,
  run by each language's sample project) run in the test suite, so
  regressions in the product break the build.
- **Architecture rules** — immutable data, pure functional core, hexagonal
  ports & adapters. These live in [CLAUDE.md](CLAUDE.md) and are enforced
  in review.

## Working with your agent

[CLAUDE.md](CLAUDE.md) is the standing briefing for agents working in this
repo — layout, architecture rules, workflow, commit convention. Point your
agent at it whatever tool you use; with Claude Code it's picked up
automatically.

**Language ports (Go, Rust, .NET, …) are welcome.** There is a checked-in
skill for exactly this: `.claude/skills/adding-a-language-port/` walks an
agent through porting the pure core, the runner shell, and a test-framework
adapter against the conformance suite. Start there — and start with an
issue, as above.

## Security

Varar is a development tool — a testing framework that runs on developer
machines and CI, not in production. Its threat model is correspondingly
simple: a bug in Varar means it might fail to catch a bug in the software you
test with it. That's it. So there is no embargoed disclosure process —
report security-relevant bugs (a matcher that passes when it should fail, a
comparison that silently skips) as ordinary GitHub issues, like any other
correctness bug.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
