# Config conformance corpus

Language-neutral fixtures for `var.config.json` readers. Every port's config
package must implement the same harness rule over `cases/`:

- If a case directory contains `expect-error.txt`, loading `var.config.json`
  from that directory MUST fail (any error type; the txt file documents why
  for humans and is not asserted against).
- Otherwise, load the config (a missing `var.config.json` — see
  `no-config-file/` — is legal and yields the empty config), project it to
  `{ docs: { include, exclude }, steps, snippets, scannerPlugins }` with
  scanner-plugin NAMES (strings, never resolved functions), serialize with
  the port's canonical-JSON helper, and compare byte-for-byte against
  `golden.json`.

`var.config.schema.json` is the machine-readable schema (reference it from a
config file via `"$schema"` for editor validation). Readers enforce the same
rules in code: unknown keys, wrong types, and malformed JSON fail loudly with
the file path and reason; all keys are optional and default to empty.
