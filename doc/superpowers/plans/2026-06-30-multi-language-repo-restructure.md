# Multi-language repository restructure + uv bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into sibling `typescript/` + `python/` language trees with a root-level, language-neutral `conformance/` corpus and shared `docs/`, and bootstrap an empty-but-green Python (uv) workspace — prep for the Python port (ADR 0001, issue #2). No runtime porting, no tree-sitter.

**Architecture:** Promote the existing on-main conformance corpus to root, then `git mv` the entire pnpm workspace into `typescript/`, fixing the relative paths the move breaks. Add a `python/` uv workspace with three empty skeleton packages and one smoke test. Update CI for the new paths.

**Tech Stack:** pnpm@9.12.0 workspace · biome · vitest · knip · jscpd · TypeScript (ESM) on the TS side; uv 0.11+ · pytest · ruff · hatchling on the Python side.

## Global Constraints

- Node ≥ 22; pnpm `9.12.0` (pinned via `packageManager`).
- Python ≥ 3.11; uv workspace; pytest as runner; ruff as lint/format.
- **All moves use `git mv`** — history must follow (`git log --follow` resolves through the move).
- ESM-only on the TS side; `node:` import protocol.
- Trunk-based: every task ends green (`build` + tests pass) and is committed.
- After the move, **all pnpm/vitest/tsc commands run from `typescript/`**; the `conformance/` corpus and `docs/`/`doc/` stay at the repo root.
- `uv.lock` is committed; Python caches (`.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`) are gitignored.

---

## File Structure

**Promoted to root (Task 1):**
- `conformance/bundles/<n>/` — was `packages/var/bundles/<n>/`. Each holds `example.md`, `*.steps.ts`, `golden/*.json`. Language-neutral; both languages' harnesses read it.

**Moved into `typescript/` (Task 2)** — the whole pnpm workspace, unchanged internally:
- Config: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `biome.json`, `knip.json`, `.jscpd.json`, `tsconfig.base.json`, `tsconfig.tests.json`, `var.config.ts`, `vitest.config.ts`, `vitest.plugins.ts`.
- Dirs: `packages/` (sans `bundles/`), `scripts/`.

**Stay at repo root (shared / repo-wide):** `docs/`, `doc/`, `.github/`, `.gitignore`, `.vscode/`, `CLAUDE.md`, `ANNOUNCEMENT.md`, `IDEA.md`, `TODO.md`.

**Created (Tasks 5–6):**
- `python/pyproject.toml` — uv virtual workspace root (dev deps, pytest, ruff config).
- `python/packages/{var,var-pytest,var-unittest}/` — skeleton packages (one importable module each).
- `python/packages/var/tests/test_smoke.py` — the single green test.
- `.github/workflows/python.yml` — Python CI lane.

---

### Task 1: Promote conformance corpus to root `conformance/`

Done while the TS workspace is still at the repo root, so it verifies independently before the big move.

**Files:**
- Move: `packages/var/bundles/` → `conformance/bundles/` (10 bundle dirs)
- Modify: `packages/var/tests/conformance.test.ts:8`
- Modify: `knip.json` (the `packages/var` workspace block)

**Interfaces:**
- Produces: corpus at repo-root `conformance/bundles/`; harness `BUNDLES` constant now resolves there.

- [ ] **Step 1: Move the corpus with history preserved**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
mkdir -p conformance
git mv packages/var/bundles conformance/bundles
```

- [ ] **Step 2: Repoint the harness at the new location**

In `packages/var/tests/conformance.test.ts`, line 8, change:

```ts
const BUNDLES = resolve(import.meta.dirname, '../bundles')
```

to (tests → var → packages → repo root, then into `conformance`):

```ts
const BUNDLES = resolve(import.meta.dirname, '../../../conformance/bundles')
```

- [ ] **Step 3: Drop the now-invalid `bundles` globs from knip**

In `knip.json`, replace the `packages/var` block:

```json
    "packages/var": {
      "entry": ["src/index.ts", "tests/**/*.test.ts", "bundles/**/*.steps.ts", "bundles/**/*.md"],
      "project": ["src/**/*.ts", "tests/**/*.ts", "bundles/**/*.{ts,md}"]
    },
```

with (var no longer contains the bundles):

```json
    "packages/var": {
      "entry": ["src/index.ts", "tests/**/*.test.ts"],
      "project": ["src/**/*.ts", "tests/**/*.ts"]
    },
```

- [ ] **Step 4: Verify the conformance harness is still green**

Run: `pnpm test`
Expected: PASS, including the `conformance: 01-roman-numerals` … `10-error-fence-without-step` suites (reading the new root corpus).

- [ ] **Step 5: Verify knip is clean**

Run: `pnpm knip`
Expected: exit 0, no unused-files/exports errors for `packages/var`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(conformance): promote corpus to root conformance/ (language-neutral)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Move the pnpm workspace into `typescript/`

The atomic "the move." Each step is small, but the deliverable is one relocated, fully-green TS workspace — a reviewer approves or rejects it as a unit.

**Files:**
- Move (git mv): `packages/`, `scripts/`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `biome.json`, `knip.json`, `.jscpd.json`, `tsconfig.base.json`, `tsconfig.tests.json`, `var.config.ts`, `vitest.config.ts`, `vitest.plugins.ts` → `typescript/`
- Modify: `typescript/packages/var/tests/conformance.test.ts:8` (one level deeper now)
- Modify: `typescript/knip.json` (the `packages/var` block's cross-boundary `conformance` globs gain one `../`)

**Interfaces:**
- Consumes: root-level `conformance/bundles/` from Task 1. Note Task 1's resolution
  decisions: (a) `packages/var/vitest.config.ts` has a `resolve.alias` mapping
  `@oselvar/var` → `./src/index.ts` (config-relative, so it survives this move
  untouched); (b) `knip.json`'s `packages/var` block reaches the corpus via
  `../../conformance/bundles/**` globs (load-bearing — they keep `@oselvar/var`'s
  `defineState` export, consumed only by the bundle fixtures, from reading as unused).
- Produces: a self-contained pnpm workspace rooted at `typescript/`; all gates run from there.

- [ ] **Step 1: Create the target dir and move every workspace file/dir**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
mkdir -p typescript
git mv packages scripts \
  package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc \
  biome.json knip.json .jscpd.json \
  tsconfig.base.json tsconfig.tests.json \
  var.config.ts vitest.config.ts vitest.plugins.ts \
  typescript/
```

- [ ] **Step 2: Repoint the conformance harness for the deeper location**

In `typescript/packages/var/tests/conformance.test.ts`, line 8, change:

```ts
const BUNDLES = resolve(import.meta.dirname, '../../../conformance/bundles')
```

to (tests → var → packages → typescript → repo root, then into `conformance`):

```ts
const BUNDLES = resolve(import.meta.dirname, '../../../../conformance/bundles')
```

- [ ] **Step 2b: Deepen the knip cross-boundary globs by one level**

In `typescript/knip.json`, the `packages/var` block reaches the root corpus with
`../../conformance/...` globs that assumed the workspace was at the repo root. Now that
`packages/var` lives at `typescript/packages/var`, the corpus is one level further up.
Change the `packages/var` block from:

```json
    "packages/var": {
      "entry": [
        "src/index.ts",
        "tests/**/*.test.ts",
        "../../conformance/bundles/**/*.steps.ts",
        "../../conformance/bundles/**/*.md"
      ],
      "project": ["src/**/*.ts", "tests/**/*.ts", "../../conformance/bundles/**/*.{ts,md}"]
    },
```

to (one extra `../`):

```json
    "packages/var": {
      "entry": [
        "src/index.ts",
        "tests/**/*.test.ts",
        "../../../conformance/bundles/**/*.steps.ts",
        "../../../conformance/bundles/**/*.md"
      ],
      "project": ["src/**/*.ts", "tests/**/*.ts", "../../../conformance/bundles/**/*.{ts,md}"]
    },
```

- [ ] **Step 3: Reinstall dependencies under `typescript/`**

The old root `node_modules` is stale (and gitignored). Regenerate inside the new root:

```bash
rm -rf /Users/aslakhellesoy/git/oselvar/bdd/node_modules
cd /Users/aslakhellesoy/git/oselvar/bdd/typescript
pnpm install --frozen-lockfile
```

Expected: install succeeds; `git status` shows `pnpm-lock.yaml` unchanged (relative workspace paths are unaffected by the move).

- [ ] **Step 4: Verify the build (src type-check) passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/typescript && pnpm -r build`
Expected: exit 0 for every package.

- [ ] **Step 5: Verify the full test suite (incl. conformance + dogfood) passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/typescript && pnpm test`
Expected: PASS, including conformance suites (now reading `../../../../conformance/bundles`) and the `var-examples` dogfood `.md` specs.

- [ ] **Step 6: Verify the full check gate passes**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/typescript && pnpm check`
Expected: PASS — `lint` (biome), `typecheck` (tsc over tests/), `test`, `knip`, `jscpd` all green.

- [ ] **Step 7: Verify the website still builds (Astro toolchain)**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/typescript && pnpm --filter @oselvar/website build`
Expected: Astro build succeeds; output in `typescript/packages/website/dist`.

- [ ] **Step 8: Confirm history followed the move**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd && git log --follow --oneline -3 -- typescript/packages/var/src/index.ts`
Expected: pre-move commits listed (history preserved through `git mv`).

- [ ] **Step 9: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add -A
git commit -m "refactor(repo): move pnpm workspace into typescript/ for multi-language layout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Update `CLAUDE.md` for the new layout

`CLAUDE.md` is read every session; its `packages/...` paths and "repo root" command assumptions are now wrong. Re-anchor them with one layout note rather than rewriting every line (DRY).

**Files:**
- Modify: `CLAUDE.md` (stays at repo root)

- [ ] **Step 1: Add a "Repository layout" section right after the title**

Insert immediately after the opening `# CLAUDE.md` / its one-line intro:

```markdown
## Repository layout

This is a multi-language monorepo (ADR 0001). Top level:

- `typescript/` — the pnpm workspace (pure core `@oselvar/var`, runtime, vitest
  adapter, **and** the shared authoring/LSP/VS Code/website platform). **Run all
  pnpm / vitest / tsc commands from `typescript/`.** Package paths in this file
  (e.g. `packages/var/src/...`) are relative to `typescript/`.
- `python/` — the uv workspace for the Python port (skeleton today; see issue #2).
- `conformance/` — language-neutral corpus (`bundles/<n>/{example.md, *.steps.ts,
  golden/*.json}`) read by every language's conformance harness.
- `docs/`, `doc/` — shared design docs (ADRs, specs, plans, ARCHITECTURE).
```

- [ ] **Step 2: Fix the explicit "repo root" reference for `var.config.ts`**

In the "Conventions" section, change:

```markdown
- Config: `var.config.ts` at repo root.
```

to:

```markdown
- Config: `var.config.ts` at the `typescript/` workspace root.
```

- [ ] **Step 3: Verify no remaining "repo root" claims about TS config mislead**

Run: `grep -n "repo root\|packages/var" CLAUDE.md | head`
Expected: remaining `packages/...` mentions are now covered by the layout note ("relative to `typescript/`"); no standalone "at repo root" claim about a TS file remains.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document multi-language layout; commands run from typescript/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Update the website CI workflow for the new paths

**Files:**
- Modify: `.github/workflows/website.yml`

**Interfaces:**
- Consumes: website now at `typescript/packages/website`; lockfile at `typescript/pnpm-lock.yaml`.

- [ ] **Step 1: Update the path filters**

In `.github/workflows/website.yml`, replace the `on.push.paths` list:

```yaml
    paths:
      - 'packages/website/**'
      - '.github/workflows/website.yml'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
```

with:

```yaml
    paths:
      - 'typescript/packages/website/**'
      - '.github/workflows/website.yml'
      - 'typescript/pnpm-lock.yaml'
      - 'typescript/pnpm-workspace.yaml'
```

- [ ] **Step 2: Point the pnpm cache at the moved lockfile**

In the `actions/setup-node@v4` step, add `cache-dependency-path` under `with`:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: typescript/pnpm-lock.yaml
```

- [ ] **Step 3: Run install + build from `typescript/`**

Change the two run steps:

```yaml
      - run: pnpm install --frozen-lockfile

      - run: pnpm --filter @oselvar/website build
```

to:

```yaml
      - run: pnpm install --frozen-lockfile
        working-directory: typescript

      - run: pnpm --filter @oselvar/website build
        working-directory: typescript
```

- [ ] **Step 4: Fix the artifact upload path**

Change:

```yaml
        with:
          path: packages/website/dist
```

to:

```yaml
        with:
          path: typescript/packages/website/dist
```

- [ ] **Step 5: Verify the YAML parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/website.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/website.yml
git commit -m "ci(website): point workflow at typescript/ workspace paths

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bootstrap the `python/` uv workspace

Three empty-but-importable skeleton packages and one smoke test, so the Python toolchain (uv + pytest + ruff) is proven before any porting. Names mirror issue #2: import package `var`, plugin distribution `pytest-var`.

**Files:**
- Create: `python/pyproject.toml`
- Create: `python/README.md`
- Create: `python/packages/var/pyproject.toml`, `python/packages/var/src/var/__init__.py`, `python/packages/var/tests/test_smoke.py`
- Create: `python/packages/var-pytest/pyproject.toml`, `python/packages/var-pytest/src/var_pytest/__init__.py`
- Create: `python/packages/var-unittest/pyproject.toml`, `python/packages/var-unittest/src/var_unittest/__init__.py`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `import var` exposing `var.__version__ == "0.0.0"`; a uv workspace where `uv run pytest` and `uv run ruff check` are green.

- [ ] **Step 1: Create the uv workspace root**

Create `python/pyproject.toml`:

```toml
[tool.uv.workspace]
members = ["packages/*"]

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.6"]

[tool.pytest.ini_options]
testpaths = ["packages"]

[tool.ruff]
line-length = 100
target-version = "py311"
```

Create `python/README.md`:

```markdown
# Python implementation (skeleton)

uv workspace for the Python port of `var` (ADR 0001, issue #2). Today this is
empty scaffolding proving the toolchain; the runtime port lands separately.

```sh
uv sync          # create .venv, install workspace members + dev deps
uv run pytest    # run tests
uv run ruff check
```

Packages: `var` (pure core, import name `var`), `var-pytest` (pytest plugin,
distribution `pytest-var`), `var-unittest` (unittest adapter).
```

- [ ] **Step 2: Create the `var` core skeleton + smoke test**

Create `python/packages/var/pyproject.toml`:

```toml
[project]
name = "oselvar-var"
version = "0.0.0"
description = "Markdown-native BDD — pure Python core (port of @oselvar/var)"
requires-python = ">=3.11"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var"]
```

Create `python/packages/var/src/var/__init__.py`:

```python
"""Pure Python core for var (skeleton — see issue #2)."""

__version__ = "0.0.0"
```

Create `python/packages/var/tests/test_smoke.py`:

```python
import var


def test_version():
    assert var.__version__ == "0.0.0"
```

- [ ] **Step 3: Create the `var-pytest` skeleton**

Create `python/packages/var-pytest/pyproject.toml`:

```toml
[project]
name = "pytest-var"
version = "0.0.0"
description = "pytest plugin for Markdown-native BDD (skeleton — see issue #2)"
requires-python = ">=3.11"
dependencies = ["oselvar-var"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var_pytest"]
```

Create `python/packages/var-pytest/src/var_pytest/__init__.py`:

```python
"""pytest plugin for var (skeleton — see issue #2)."""

__version__ = "0.0.0"
```

- [ ] **Step 4: Create the `var-unittest` skeleton**

Create `python/packages/var-unittest/pyproject.toml`:

```toml
[project]
name = "oselvar-var-unittest"
version = "0.0.0"
description = "unittest adapter for Markdown-native BDD (skeleton — see issue #2)"
requires-python = ">=3.11"
dependencies = ["oselvar-var"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var_unittest"]
```

Create `python/packages/var-unittest/src/var_unittest/__init__.py`:

```python
"""unittest adapter for var (skeleton — see issue #2)."""

__version__ = "0.0.0"
```

- [ ] **Step 5: Sync the workspace (creates `.venv` + `uv.lock`)**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv sync`
Expected: resolves and installs the three members (editable) plus pytest + ruff; writes `python/uv.lock` and `python/.venv/`.

- [ ] **Step 6: Run the smoke test**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv run pytest`
Expected: `1 passed` (`packages/var/tests/test_smoke.py::test_version`).

- [ ] **Step 7: Run the linter**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv run ruff check`
Expected: `All checks passed!`

- [ ] **Step 8: Ignore Python build/caches (keep `uv.lock` tracked)**

Append to repo-root `.gitignore`:

```gitignore
# Python
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
```

Then confirm `uv.lock` is NOT ignored:
Run: `git check-ignore python/uv.lock || echo "tracked-ok"`
Expected: `tracked-ok`

- [ ] **Step 9: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add python .gitignore
git commit -m "feat(python): bootstrap uv workspace skeleton (var, var-pytest, var-unittest)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Add the Python CI lane

**Files:**
- Create: `.github/workflows/python.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/python.yml`:

```yaml
name: Python

on:
  push:
    branches: [main]
    paths:
      - 'python/**'
      - '.github/workflows/python.yml'
  pull_request:
    paths:
      - 'python/**'
      - '.github/workflows/python.yml'
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: python
    steps:
      - uses: actions/checkout@v4

      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true

      - run: uv sync --locked

      - run: uv run pytest

      - run: uv run ruff check
```

- [ ] **Step 2: Verify the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/python.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 3: Confirm the lockfile is current (so `--locked` will pass in CI)**

Run: `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv lock --check`
Expected: success (lockfile up to date). If it reports drift, run `uv lock`, then `git add python/uv.lock`.

- [ ] **Step 4: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add .github/workflows/python.yml python/uv.lock
git commit -m "ci(python): add uv sync + pytest + ruff lane

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-plan housekeeping (not a task)

- Delete the stale already-merged origin branch: `git push origin --delete conformance-infra`.
- The conformance `*.steps.ts` fixtures now live outside any pnpm package, so biome/knip/jscpd no longer cover them. Acceptable (tiny deterministic fixtures); revisit if the corpus grows or gains a Python fixture (`*.steps.py`) that should be linted by ruff.

## Self-Review

**Spec coverage:**
- "Move workspace into `typescript/`" → Task 2. ✓
- "Fix every relative path the move breaks" → Task 1 Step 2/3, Task 2 Step 2, Task 3, Task 4. ✓
- "Repoint conformance harness at root corpus" / "promote `packages/var/bundles` → `conformance/`" → Task 1. ✓
- "Update the single CI workflow + add a Python lane" → Task 4, Task 6. ✓
- "Bootstrap `python/` uv workspace with empty skeletons, green `uv run pytest`" → Task 5. ✓
- "uv workspace as the pnpm-workspace analogue; ruff + pytest" → Task 5 Step 1. ✓
- "History-preserving moves" → Task 1/2 use `git mv`; Task 2 Step 8 verifies. ✓
- "Docs stay at root" → File Structure + not in any move list. ✓
- Out of scope (runtime port, tree-sitter, conformance suite itself) → none of the tasks touch them. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code/edit step shows exact content. ✓

**Type/name consistency:** Harness constant `BUNDLES` edited consistently (`../bundles` → `../../../conformance/bundles` in Task 1 → `../../../../conformance/bundles` in Task 2, matching the file's depth at each point). Python import name `var` and `__version__ = "0.0.0"` match between `__init__.py` and `test_smoke.py`. Distribution names (`oselvar-var`, `pytest-var`, `oselvar-var-unittest`) consistent with their `dependencies`. ✓
