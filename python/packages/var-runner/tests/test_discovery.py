from pathlib import Path

from var_runner.discovery import find_specs, match_spec


def _touch(root: Path, rel: str) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("", encoding="utf-8")
    return p


def test_find_specs_include_minus_exclude(tmp_path: Path) -> None:
    _touch(tmp_path, "features/a.md")
    _touch(tmp_path, "features/wip/b.md")
    _touch(tmp_path, "README.md")
    found = find_specs(["features/**/*.md"], ["**/wip/**"], tmp_path)
    assert found == (tmp_path / "features/a.md",)


def test_match_spec(tmp_path: Path) -> None:
    inc, exc = ["features/**/*.md"], ["**/wip/**"]
    assert match_spec(tmp_path / "features/a.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/wip/b.md", inc, exc, tmp_path) is False
    assert match_spec(tmp_path / "README.md", inc, exc, tmp_path) is False


def test_symlinked_spec_matches_by_apparent_path(tmp_path: Path) -> None:
    """A symlinked spec matches by where the link sits, not where it points.

    Mirrors Java's toAbsolutePath().normalize() (no dereference): a project may
    link its specs from a shared corpus outside the include globs.
    """
    _touch(tmp_path, "corpus/a.md")
    (tmp_path / "project").mkdir()
    (tmp_path / "project/a.md").symlink_to(tmp_path / "corpus/a.md")
    root = tmp_path / "project"
    assert match_spec(root / "a.md", ["*.md"], [], root) is True


def test_deeply_nested_spec_matches(tmp_path: Path) -> None:
    """features/**/*.md must match specs nested more than one level deep."""
    inc, exc = ["features/**/*.md"], []
    assert match_spec(tmp_path / "features/sub/deep/c.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/sub/c.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/c.md", inc, exc, tmp_path) is True


def test_leading_doublestar_matches_root_level_file(tmp_path: Path) -> None:
    """**/*.md must match a file directly under root (zero preceding dirs)."""
    assert match_spec(tmp_path / "README.md", ["**/*.md"], [], tmp_path) is True


def test_leading_doublestar_exclude_root_level_dir(tmp_path: Path) -> None:
    """find_specs with **/wip/** must exclude wip/ directly under root."""
    _touch(tmp_path, "b.md")
    _touch(tmp_path, "wip/a.md")
    found = find_specs(["**/*.md"], ["**/wip/**"], tmp_path)
    assert found == (tmp_path / "b.md",)


def test_find_specs_dedup(tmp_path: Path) -> None:
    """A file matching multiple include globs appears only once in the result."""
    _touch(tmp_path, "b.md")
    found = find_specs(["**/*.md", "**/b.md"], [], tmp_path)
    assert found == (tmp_path / "b.md",)


def test_single_star_does_not_cross_slash(tmp_path: Path) -> None:
    """* must not match a path separator."""
    assert match_spec(tmp_path / "dir/file.md", ["*.md"], [], tmp_path) is False


def test_specs_outside_root_via_parent_glob(tmp_path: Path) -> None:
    """A spec in a SIBLING of the config root is reachable via a ``../`` glob.

    This backs pointing ``var.config.json`` at a shared corpus that lives outside the
    package (e.g. ``../conformance/bundles``): ``relative_to(..., walk_up=True)``
    yields a ``../corpus/...`` path that matches a ``../corpus/**`` glob.
    """
    root = tmp_path / "proj"
    root.mkdir()
    spec = _touch(tmp_path, "corpus/features/a.md")
    inc = ["../corpus/**/*.md"]
    found = find_specs(inc, [], root)
    # find_specs returns the glob path (which carries the ``..``); compare by
    # resolved file identity, not exact Path form.
    assert len(found) == 1
    assert found[0].resolve() == spec.resolve()
    assert match_spec(spec, inc, [], root) is True
    # a sibling file NOT under the glob is not matched
    other = _touch(tmp_path, "other/b.md")
    assert match_spec(other, inc, [], root) is False
