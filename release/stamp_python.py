"""Stamp the lockstep release version into every Python package.

Sets [project] version and pins workspace-internal dependencies to
==<version> so published wheels depend on the exact same release.
Idempotent: re-running with the same version changes nothing.
"""

import pathlib
import re
import sys

VERSION = sys.argv[1]
INTERNAL = {
    "varar",
    "varar-config",
    "varar-core",
    "varar-runner",
    "pytest-varar",
    "varar-unittest",
}


def pin(match: re.Match) -> str:
    name = match.group(1)
    if name in INTERNAL:
        return f'"{name}=={VERSION}"'
    return match.group(0)


for pyproject in sorted(pathlib.Path("python/packages").glob("*/pyproject.toml")):
    text = pyproject.read_text()
    text = re.sub(r'(?m)^version = ".*"$', f'version = "{VERSION}"', text, count=1)
    # Only apply dependency pinning to lines that don't define the package name
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if not line.strip().startswith('name ='):
            lines[i] = re.sub(r'"([A-Za-z0-9._-]+?)(?:==[0-9][^"]*)?"', pin, line)
    text = '\n'.join(lines)
    pyproject.write_text(text)

print(f"stamped {VERSION} into python/packages/*/pyproject.toml")
