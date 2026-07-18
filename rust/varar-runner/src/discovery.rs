//! Spec discovery: the shared glob→regex semantics (matching the Python/Ruby
//! runners byte-for-byte on `**`, `*`, `?`), recursive file walk, include/exclude.

use regex::Regex;
use std::path::{Path, PathBuf};
use varar_config::VarConfig;

/// Translate a glob (`/**/`, `/**`, `**/`, `**`, `*`, `?`) to an anchored regex.
/// Port of `varar_runner.discovery._glob_to_regex`.
pub fn glob_to_regex(pattern: &str) -> Regex {
    let chars: Vec<char> = pattern.chars().collect();
    let n = chars.len();
    let starts = |i: usize, pat: &str| {
        pat.chars()
            .enumerate()
            .all(|(k, pc)| chars.get(i + k) == Some(&pc))
    };

    let mut out = String::from("^");
    let mut i = 0;
    while i < n {
        if chars[i] == '/' && starts(i, "/**/") {
            out.push_str("/(?:.+/)?");
            i += 4;
        } else if chars[i] == '/' && starts(i, "/**") && i + 3 == n {
            out.push_str("(?:/.*)?");
            i += 3;
        } else if chars[i] == '*' && starts(i, "**/") {
            out.push_str("(?:.*/)?");
            i += 3;
        } else if chars[i] == '*' && starts(i, "**") {
            out.push_str(".*");
            i += 2;
        } else if chars[i] == '*' {
            out.push_str("[^/]*");
            i += 1;
        } else if chars[i] == '?' {
            out.push_str("[^/]");
            i += 1;
        } else {
            out.push_str(&regex::escape(&chars[i].to_string()));
            i += 1;
        }
    }
    out.push('$');
    Regex::new(&out).expect("valid glob regex")
}

fn matches_any(rel: &str, globs: &[String]) -> bool {
    globs.iter().any(|g| glob_to_regex(g).is_match(rel))
}

/// The path relative to `root`, forward-slashed. Falls back to the file name
/// when `path` is not under `root`.
fn rel_posix(path: &Path, root: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out);
        } else if path.is_file() {
            out.push(path);
        }
    }
}

/// True iff `path` (relative to `root`) matches an include glob and no exclude.
pub fn match_spec(path: &Path, include: &[String], exclude: &[String], root: &Path) -> bool {
    let rel = rel_posix(path, root);
    matches_any(&rel, include) && !matches_any(&rel, exclude)
}

/// Files under `root` matching any `docs.include` glob and no `docs.exclude`,
/// sorted.
pub fn find_specs(config: &VarConfig, root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    walk(root, &mut files);
    let mut kept: Vec<PathBuf> = files
        .into_iter()
        .filter(|p| match_spec(p, &config.docs_include, &config.docs_exclude, root))
        .collect();
    kept.sort();
    kept
}
