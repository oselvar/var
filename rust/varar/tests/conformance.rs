//! Registry / plan / trace conformance gates — the three stages deferred from
//! `varar-core` (which gates only var-doc). Mirrors the Java `var` module's
//! `ConformanceTest`: for every bundle in the shared corpus, load its Rust step
//! fixture, build the registry, and assert the registry/plan/trace artifacts
//! byte-for-byte against the committed goldens.
//!
//! Fixtures live alongside every other language's `*.steps.*` in
//! `conformance/bundles/<n>/<stem>.steps.rs`, reached via `#[path]`. Each
//! exposes `register(&mut Steps)` and `state() -> Value` (the
//! per-example initial state). The bundle→fixture map is an explicit,
//! compiler-checked `match`, like Java's `loadFixture` switch.

use std::fs;
use std::path::{Path, PathBuf};

use std::any::Any;
use std::rc::Rc;

use varar::{Registry, Steps};
use varar_core::canonical_json::canonical_stringify;
use varar_core::conformance::{run_conformance, to_plan_artifact, to_registry_artifact};
use varar_core::parse::parse;
use varar_core::plan::plan;

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
#[path = "../../../conformance/bundles/16-stimulus-state-replacement/replace.steps.rs"]
mod b16;
#[path = "../../../conformance/bundles/17-unexpected-pass/quiet.steps.rs"]
mod b17;
#[path = "../../../conformance/bundles/18-multi-table-example/basket.steps.rs"]
mod b18;

// Each bundle now has its OWN context type, so the fixtures cannot share one
// function-pointer type. This macro erases that difference: it builds the
// bundle's registry with its own `Steps<Ctx>` and boxes its state factory, so
// every arm yields the same `(Registry, ContextFactory)` pair.
type ContextFactory = Box<dyn Fn() -> Rc<dyn Any>>;

macro_rules! bundle {
    ($m:ident) => {{
        let mut s = Steps::new();
        $m::register(&mut s);
        let factory: ContextFactory = Box::new(|| Rc::new($m::state()) as Rc<dyn Any>);
        (s.into_registry(), factory)
    }};
}

fn fixture(bundle: &str) -> (Registry, ContextFactory) {
    match bundle {
        "01-roman-numerals" => bundle!(b01),
        "02-context-isolation" => bundle!(b02),
        "03-expected-failure" => bundle!(b03),
        "04-tables-and-docstrings" => bundle!(b04),
        "05-ambiguous-match" => bundle!(b05),
        "06-doc-string-mismatch" => bundle!(b06),
        "07-row-check-mismatch" => bundle!(b07),
        "08-string-capture" => bundle!(b08),
        "09-expected-message-mismatch" => bundle!(b09),
        "10-error-fence-without-step" => bundle!(b10),
        "11-emoji-offsets" => bundle!(b11),
        "12-combining-marks" => bundle!(b12),
        "13-custom-parameter-type" => bundle!(b13),
        "14-stateless-steps" => bundle!(b14),
        "15-custom-parameter-format" => bundle!(b15),
        "16-stimulus-state-replacement" => bundle!(b16),
        "17-unexpected-pass" => bundle!(b17),
        "18-multi-table-example" => bundle!(b18),
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
        let (registry, _) = fixture(&name);
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
        let (registry, _) = fixture(&name);
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
        let (registry, state) = fixture(&name);
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
