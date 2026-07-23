//! Config conformance gate: reproduce `conformance/config/cases/*` byte-for-byte.
//! A case with `expect-error.txt` must fail to load; otherwise the projected
//! config, serialized with varar-core's canonical JSON, must equal `golden.json`.

use std::fs;
use std::path::{Path, PathBuf};

use varar_config::{VarConfig, read_var_config};
use varar_core::canonical_json::canonical_stringify;
use varar_core::value::Value;

fn cases_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance/config/cases")
}

fn list(strings: &[String]) -> Value {
    Value::List(strings.iter().map(|s| Value::from(s.as_str())).collect())
}

/// Project to `{ docs: { include, exclude }, steps, snippets }`.
fn artifact(config: &VarConfig) -> Value {
    let docs = Value::map(vec![
        ("include".to_string(), list(&config.docs_include)),
        ("exclude".to_string(), list(&config.docs_exclude)),
    ]);
    let snippets = Value::map(
        config
            .snippets
            .iter()
            .map(|(k, v)| (k.clone(), Value::from(v.as_str()))),
    );
    Value::map(vec![
        ("docs".to_string(), docs),
        ("steps".to_string(), list(&config.steps)),
        ("snippets".to_string(), snippets),
    ])
}

#[test]
fn config_cases_match_golden() {
    let mut dirs: Vec<PathBuf> = fs::read_dir(cases_dir())
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    assert!(!dirs.is_empty(), "no config cases found");

    let mut fails = Vec::new();
    for dir in dirs {
        let name = dir.file_name().unwrap().to_string_lossy().into_owned();
        let result = read_var_config(&dir);
        if dir.join("expect-error.txt").is_file() {
            if result.is_ok() {
                fails.push(format!("{name}: expected an error, got Ok"));
            }
            continue;
        }
        match result {
            Err(e) => fails.push(format!("{name}: unexpected error: {e}")),
            Ok(config) => {
                let actual = canonical_stringify(&artifact(&config));
                let expected = fs::read_to_string(dir.join("golden.json")).unwrap();
                if actual != expected {
                    fails.push(format!("{name}: golden mismatch"));
                }
            }
        }
    }
    assert!(fails.is_empty(), "config conformance failures: {fails:#?}");
}
