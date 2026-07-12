//! Registry / plan / trace conformance gates — the three stages deferred from
//! `var-core` (which gates only var-doc). Mirrors the Java `var` module's
//! `ConformanceTest`: for every bundle in the shared corpus, load its Rust step
//! fixture, build the registry, and assert the registry/plan/trace artifacts
//! byte-for-byte against the committed goldens.
//!
//! Fixtures live alongside every other language's `*.steps.*` in
//! `conformance/bundles/<n>/<stem>.steps.rs`, reached via `#[path]`. Each
//! exposes `register(Registry) -> Registry` and `state() -> Value` (the
//! per-example initial state). The bundle→fixture map is an explicit,
//! compiler-checked `match`, like Java's `loadFixture` switch.

use std::fs;
use std::path::{Path, PathBuf};

use var::{Registry, create_registry};
use var_core::canonical_json::canonical_stringify;
use var_core::conformance::{run_conformance, to_plan_artifact, to_registry_artifact};
use var_core::parse::parse;
use var_core::plan::plan;
use var_core::value::Value;

// Fixtures live in the shared corpus (siblings of every `*.steps.ts`), pulled
// in by path. Declared at the test's top level so the path base is
// `rust/var/tests/`.
#[path = "../../../conformance/bundles/01-roman-numerals/numerals.steps.rs"]
mod b01;
#[path = "../../../conformance/bundles/02-context-isolation/counter.steps.rs"]
mod b02;
#[path = "../../../conformance/bundles/03-expected-failure/division.steps.rs"]
mod b03;
#[path = "../../../conformance/bundles/04-tables-and-docstrings/echo.steps.rs"]
mod b04;
#[path = "../../../conformance/bundles/05-ambiguous-match/cukes.steps.rs"]
mod b05;
#[path = "../../../conformance/bundles/06-doc-string-mismatch/echo.steps.rs"]
mod b06;
#[path = "../../../conformance/bundles/07-row-check-mismatch/report.steps.rs"]
mod b07;
#[path = "../../../conformance/bundles/08-string-capture/greet.steps.rs"]
mod b08;
#[path = "../../../conformance/bundles/09-expected-message-mismatch/boom.steps.rs"]
mod b09;
#[path = "../../../conformance/bundles/10-error-fence-without-step/cukes.steps.rs"]
mod b10;
#[path = "../../../conformance/bundles/11-emoji-offsets/greet.steps.rs"]
mod b11;
#[path = "../../../conformance/bundles/12-combining-marks/greet.steps.rs"]
mod b12;
#[path = "../../../conformance/bundles/13-custom-parameter-type/airports.steps.rs"]
mod b13;
#[path = "../../../conformance/bundles/14-stateless-steps/squares.steps.rs"]
mod b14;
#[path = "../../../conformance/bundles/15-custom-parameter-format/money.steps.rs"]
mod b15;

type RegisterFn = fn(Registry) -> Registry;
type StateFn = fn() -> Value;

fn fixture(bundle: &str) -> (RegisterFn, StateFn) {
    match bundle {
        "01-roman-numerals" => (b01::register, b01::state),
        "02-context-isolation" => (b02::register, b02::state),
        "03-expected-failure" => (b03::register, b03::state),
        "04-tables-and-docstrings" => (b04::register, b04::state),
        "05-ambiguous-match" => (b05::register, b05::state),
        "06-doc-string-mismatch" => (b06::register, b06::state),
        "07-row-check-mismatch" => (b07::register, b07::state),
        "08-string-capture" => (b08::register, b08::state),
        "09-expected-message-mismatch" => (b09::register, b09::state),
        "10-error-fence-without-step" => (b10::register, b10::state),
        "11-emoji-offsets" => (b11::register, b11::state),
        "12-combining-marks" => (b12::register, b12::state),
        "13-custom-parameter-type" => (b13::register, b13::state),
        "14-stateless-steps" => (b14::register, b14::state),
        "15-custom-parameter-format" => (b15::register, b15::state),
        other => panic!("no Rust step fixture for bundle {other}"),
    }
}

fn bundles_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance/bundles")
}

fn bundle_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = fs::read_dir(bundles_dir())
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs
}

fn name_of(dir: &Path) -> String {
    dir.file_name().unwrap().to_string_lossy().into_owned()
}

fn golden(dir: &Path, artifact: &str) -> String {
    fs::read_to_string(dir.join("golden").join(artifact)).unwrap()
}

#[test]
fn registry_matches_golden() {
    let mut fails = Vec::new();
    for dir in bundle_dirs() {
        let name = name_of(&dir);
        let (register, _) = fixture(&name);
        let registry = register(create_registry());
        let actual = canonical_stringify(&to_registry_artifact(&registry));
        if actual != golden(&dir, "registry.json") {
            fails.push(name);
        }
    }
    assert!(fails.is_empty(), "registry.json mismatches: {fails:?}");
}

#[test]
fn plan_matches_golden() {
    let mut fails = Vec::new();
    for dir in bundle_dirs() {
        let name = name_of(&dir);
        let (register, _) = fixture(&name);
        let registry = register(create_registry());
        let source = fs::read_to_string(dir.join("example.md")).unwrap();
        let doc = parse("example.md", &source);
        let execution = plan(&doc, &registry);
        let actual = canonical_stringify(&to_plan_artifact(&execution));
        if actual != golden(&dir, "plan.json") {
            fails.push(name);
        }
    }
    assert!(fails.is_empty(), "plan.json mismatches: {fails:?}");
}

#[test]
fn trace_matches_golden() {
    let mut fails = Vec::new();
    for dir in bundle_dirs() {
        let name = name_of(&dir);
        let (register, state) = fixture(&name);
        let registry = register(create_registry());
        let source = fs::read_to_string(dir.join("example.md")).unwrap();
        let doc = parse("example.md", &source);
        let artifacts = run_conformance(&doc, &registry, &|| state());
        let actual = canonical_stringify(&artifacts.trace);
        if actual != golden(&dir, "trace.json") {
            fails.push(name);
        }
    }
    assert!(fails.is_empty(), "trace.json mismatches: {fails:?}");
}
