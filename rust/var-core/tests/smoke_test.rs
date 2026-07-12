//! Port of `SmokeTest.java` — proves the crate compiles and tests run.

#[test]
fn module_is_importable_and_testable() {
    assert_eq!(2, 1 + 1);
}
