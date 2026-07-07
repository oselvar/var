"""The `var` command-line entry point.

Today it offers a single sub-command, `var init`, which scaffolds a new
project: a `var.config.json`, one Markdown spec, and its step definitions.
Specs then run through pytest (`pytest-var`) or unittest — there is no
`var run` in the Python port; the test framework is the runner.

The scaffold mirrors the TypeScript CLI (`@oselvar/var-cli`) byte-for-byte
except for the steps file, so a project started with `var init` looks the same
in every language. The `01-hello.md` spec is language-neutral.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Callable

_CONFIG = """{
  "docs": { "include": ["var-examples/**/*.md"], "exclude": [] },
  "steps": ["var-examples/**/*.steps.py"]
}
"""

_EXAMPLE_MD = """# Hello, BDD

Given I greet "world"
Then the greeting is "Hello, world!"
"""

_EXAMPLE_STEPS = '''from var import steps

param, stimulus, sensor = steps(lambda: {"greeting": ""})


@stimulus("I greet {string}")
def _(state, name):
    return {"greeting": f"Hello, {name}!"}


@sensor("the greeting is {string}")
def _(state, expected):
    return state["greeting"]
'''

_FILES: tuple[tuple[str, str], ...] = (
    ("var.config.json", _CONFIG),
    ("var-examples/01-hello.md", _EXAMPLE_MD),
    ("var-examples/steps/01-hello.steps.py", _EXAMPLE_STEPS),
)

_USAGE = """var — scaffold and run Markdown specs

Usage:
  var init               scaffold a new project
"""


def run_init(cwd: Path, write: Callable[[str], None]) -> int:
    """Write the scaffold into *cwd*, skipping any file that already exists."""
    for rel, content in _FILES:
        target = cwd / rel
        if target.exists():
            write(f"skipped {rel} (already exists)\n")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        write(f"created {rel}\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    command = args[0] if args else ""
    if command == "init":
        return run_init(Path.cwd(), sys.stdout.write)
    sys.stdout.write(_USAGE)
    return 0 if command in ("", "help", "-h", "--help") else 1


if __name__ == "__main__":
    raise SystemExit(main())
