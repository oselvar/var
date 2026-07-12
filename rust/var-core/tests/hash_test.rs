//! Port of the FNV-1a vectors from `DriftTest.java` / `hash.test.ts`.

use var_core::hash::hash_source;

#[test]
fn hash_matches_the_typescript_vectors() {
    assert_eq!("fnv1a:4f9f2cab", hash_source("hello"));
    assert_eq!("fnv1a:1a47e90b", hash_source("abc"));
    assert_eq!("fnv1a:4eace75e", hash_source("# Title\n"));
}
