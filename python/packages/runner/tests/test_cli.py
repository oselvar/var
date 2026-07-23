from pathlib import Path

from varar_runner.cli import run_init


def _capture() -> tuple[list[str], object]:
    lines: list[str] = []
    return lines, lines.append


def test_init_scaffolds_the_three_files(tmp_path: Path) -> None:
    lines, write = _capture()
    exit_code = run_init(tmp_path, write)

    assert exit_code == 0
    assert (tmp_path / "varar.config.json").exists()
    assert (tmp_path / "varar-examples/deep-thought.md").exists()
    steps = (tmp_path / "varar-examples/steps/deep-thought.steps.py").read_text(encoding="utf-8")
    assert "from varar import steps" in steps
    assert "@sensor" in steps
    assert all(line.startswith("created ") for line in lines)


def test_init_skips_existing_files(tmp_path: Path) -> None:
    (tmp_path / "varar.config.json").write_text("{}\n", encoding="utf-8")
    lines, write = _capture()

    run_init(tmp_path, write)

    assert (tmp_path / "varar.config.json").read_text(encoding="utf-8") == "{}\n"
    assert any("skipped varar.config.json" in line for line in lines)
