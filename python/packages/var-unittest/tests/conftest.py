"""Shared harness for var-unittest tests.

Builds a throwaway project directory, calls ``generate_tests`` against it the
way a user's ``test_var.py`` would, and runs the generated cases through a
real ``unittest.TextTestRunner`` so assertions cover unittest's own view
(failures vs errors, verbose output, test ids).
"""
from __future__ import annotations

import io
import unittest
from pathlib import Path
from typing import Any

import pytest

from var_unittest import generate_tests


class Harness:
    def __init__(self, root: Path) -> None:
        self.root = root

    def write(self, rel: str, content: str) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def generate(self) -> dict[str, Any]:
        """Generate test cases the way a user's test_var.py module would."""
        ns: dict[str, Any] = {
            "__file__": str(self.root / "test_var.py"),
            "__name__": "test_var",
        }
        generate_tests(ns)
        return ns

    def run(self, ns: dict[str, Any]) -> tuple[unittest.TestResult, str]:
        """Run every generated TestCase in *ns*; return (result, verbose output)."""
        loader = unittest.TestLoader()
        suite = unittest.TestSuite()
        for value in ns.values():
            if isinstance(value, type) and issubclass(value, unittest.TestCase):
                suite.addTests(loader.loadTestsFromTestCase(value))
        stream = io.StringIO()
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
        return result, stream.getvalue()

    def generate_and_run(self) -> tuple[unittest.TestResult, str]:
        return self.run(self.generate())


@pytest.fixture
def harness(tmp_path: Path) -> Harness:
    return Harness(tmp_path)
