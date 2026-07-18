//! Unit tests for the runner shell: glob discovery, spec finding, and the
//! filesystem baseline store driving drift reconciliation.

use std::path::PathBuf;
use varar_config::VarConfig;
use varar_core::drift::{BaselineStore, reconcile_drift};
use varar_core::handler::Handler;
use varar_core::parse::parse;
use varar_core::plan::plan;
use varar_core::registry::{add_step, create_registry};
use varar_core::step_kind::StepKind;
use varar_runner::discovery::glob_to_regex;
use varar_runner::{FileBaselineStore, find_specs};

fn tmp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("var-runner-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn glob_star_stays_within_one_segment() {
    let re = glob_to_regex("*.md");
    assert!(re.is_match("a.md"));
    assert!(!re.is_match("sub/a.md"));
}

#[test]
fn leading_doublestar_matches_zero_or_more_segments() {
    let re = glob_to_regex("**/*.md");
    assert!(re.is_match("a.md"));
    assert!(re.is_match("sub/a.md"));
    assert!(re.is_match("x/y/a.md"));
}

#[test]
fn nested_doublestar_and_trailing_doublestar() {
    assert!(glob_to_regex("specs/**/*.md").is_match("specs/a.md"));
    assert!(glob_to_regex("specs/**/*.md").is_match("specs/x/a.md"));
    let wip = glob_to_regex("specs/wip/**");
    assert!(wip.is_match("specs/wip"));
    assert!(wip.is_match("specs/wip/draft.md"));
}

#[test]
fn find_specs_honours_include_and_exclude() {
    let root = tmp("find");
    std::fs::write(root.join("a.md"), "x").unwrap();
    std::fs::write(root.join("README.md"), "x").unwrap();
    std::fs::create_dir_all(root.join("sub")).unwrap();
    std::fs::write(root.join("sub/b.md"), "x").unwrap();

    let flat = VarConfig {
        docs_include: vec!["*.md".to_string()],
        docs_exclude: vec!["README.md".to_string()],
        ..Default::default()
    };
    let names: Vec<String> = find_specs(&flat, &root)
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec!["a.md"]);

    let recursive = VarConfig {
        docs_include: vec!["**/*.md".to_string()],
        docs_exclude: vec!["README.md".to_string()],
        ..Default::default()
    };
    assert_eq!(find_specs(&recursive, &root).len(), 2); // a.md + sub/b.md
}

#[test]
fn baseline_store_round_trips_and_reconcile_writes_lock() {
    let root = tmp("drift");
    let mut store = FileBaselineStore::new(&root);
    assert!(store.read().is_none());

    let registry = add_step(
        &create_registry(),
        "I greet {string}",
        "s.rs",
        1,
        Handler::sync1(|state, _n| Ok(Some(state))),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let source = "# Hi\n\nI greet \"world\".";
    let doc = parse("hi.md", source);
    let execution = plan(&doc, &registry);

    // Clean run: no drift, and the baseline is written.
    let drifts = reconcile_drift(&mut store, "hi.md", source, &doc, &execution, false);
    assert!(drifts.is_empty());
    assert!(store.read().is_some(), "var.lock.json should be written");
    assert!(root.join("var.lock.json").is_file());
}
