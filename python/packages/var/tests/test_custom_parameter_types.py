import re

import pytest

from var import steps
from var.registry import _custom_parameter_types, _reset_builder


def test_projects_name_and_pattern_source():
    _reset_builder()
    param, _stimulus, _sensor = steps(lambda: {})
    param("airport", re.compile(r"[A-Z]{3}"), parse=lambda code: code.lower())
    assert _custom_parameter_types() == [{"name": "airport", "regexp": "[A-Z]{3}"}]
    _reset_builder()
    assert _custom_parameter_types() == []


def test_string_regexp_passes_through_verbatim():
    _reset_builder()
    param, _stimulus, _sensor = steps(lambda: {})
    param("airport", "[A-Z]{3}")
    assert _custom_parameter_types() == [{"name": "airport", "regexp": "[A-Z]{3}"}]
    _reset_builder()


def test_list_form_regexp_is_rejected():
    _reset_builder()
    param, _stimulus, _sensor = steps(lambda: {})
    param("code", ["[A-Z]{3}", "[0-9]{3}"])
    with pytest.raises(TypeError, match="not supported"):
        _custom_parameter_types()
    _reset_builder()
