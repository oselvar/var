//! The filesystem `BaselineStore`: the committed drift baseline lives at the
//! project root as `var.lock.json`. The core owns the format; this only reads
//! and writes the raw text.

use std::path::{Path, PathBuf};
use varar_core::drift::BaselineStore;

pub struct FileBaselineStore {
    path: PathBuf,
}

impl FileBaselineStore {
    pub fn new(root: &Path) -> FileBaselineStore {
        FileBaselineStore {
            path: root.join("var.lock.json"),
        }
    }
}

impl BaselineStore for FileBaselineStore {
    fn read(&self) -> Option<String> {
        std::fs::read_to_string(&self.path).ok()
    }

    fn write(&mut self, contents: &str) {
        let _ = std::fs::write(&self.path, contents);
    }
}
