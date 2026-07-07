from var_core.hash import hash_source


def test_deterministic() -> None:
    assert hash_source("abc") == hash_source("abc")


def test_changes_for_a_one_character_difference() -> None:
    assert hash_source("abc") != hash_source("abd")


def test_namespaced_with_the_algorithm_prefix() -> None:
    assert hash_source("abc").startswith("fnv1a:")


def test_matches_the_typescript_vectors() -> None:
    # The exact vectors pinned in typescript/.../tests/hash.test.ts — proves
    # the fingerprint is byte-identical across ports.
    assert hash_source("hello") == "fnv1a:4f9f2cab"
    assert hash_source("abc") == "fnv1a:1a47e90b"
    assert hash_source("# Title\n") == "fnv1a:4eace75e"
