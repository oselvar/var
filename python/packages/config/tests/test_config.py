import pytest

from varar_config import VarConfig, read_varar_config


def _write(tmp_path, body: str):
    (tmp_path / "varar.config.json").write_text(body, encoding="utf-8")
    return tmp_path


def test_reads_all_keys(tmp_path):
    root = _write(
        tmp_path,
        '{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},'
        ' "steps": ["**/*_steps.py"], "snippets": {"python": "P"}}',
    )
    cfg = read_varar_config(root)
    assert cfg.docs_include == ("a/**/*.md",)
    assert cfg.docs_exclude == ("a/wip/**",)
    assert cfg.steps == ("**/*_steps.py",)
    assert cfg.snippets == {"python": "P"}


def test_missing_file_is_empty_config(tmp_path):
    assert read_varar_config(tmp_path / "nowhere") == VarConfig()


def test_all_keys_optional_and_schema_key_ignored(tmp_path):
    root = _write(tmp_path, '{"$schema": "https://x/y.json"}')
    assert read_varar_config(root) == VarConfig()


def test_malformed_json_raises_with_path(tmp_path):
    root = _write(tmp_path, "{ nope")
    with pytest.raises(ValueError, match=r"varar\.config\.json.*invalid JSON"):
        read_varar_config(root)


def test_unknown_key_raises(tmp_path):
    root = _write(tmp_path, '{"vars": {}}')
    with pytest.raises(ValueError, match="unknown key"):
        read_varar_config(root)


def test_wrong_type_raises(tmp_path):
    root = _write(tmp_path, '{"steps": "x"}')
    with pytest.raises(ValueError, match="steps"):
        read_varar_config(root)


def test_falsy_wrong_type_docs_raises(tmp_path):
    root = _write(tmp_path, '{"docs": false}')
    with pytest.raises(ValueError, match="docs"):
        read_varar_config(root)


def test_falsy_wrong_type_snippets_raises(tmp_path):
    root = _write(tmp_path, '{"snippets": []}')
    with pytest.raises(ValueError, match="snippets"):
        read_varar_config(root)
