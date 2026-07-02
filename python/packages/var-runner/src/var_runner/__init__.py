"""Shared imperative-shell orchestration for var test runners."""

__version__ = "0.0.0"

from var_config import VarConfig, read_var_config
from var_runner.discovery import find_specs, match_spec
from var_runner.render import render_failure
from var_runner.run import RecordingReporter, examples_with_runs, plan_spec
from var_runner.steps import LoadedSteps, load_steps

__all__ = [
    "VarConfig",
    "read_var_config",
    "find_specs",
    "match_spec",
    "load_steps",
    "LoadedSteps",
    "plan_spec",
    "examples_with_runs",
    "RecordingReporter",
    "render_failure",
]
