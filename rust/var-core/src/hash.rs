//! FNV-1a (32-bit) change-detector over UTF-16 code units — port of `hash.ts` /
//! `Hash.java`. Byte-identical across every port so `var.lock.json` fingerprints
//! match. The `fnv1a:` prefix namespaces the algorithm.

const FNV_OFFSET: u32 = 0x811c_9dc5;
const FNV_PRIME: u32 = 0x0100_0193;

/// Hashes `source` to `fnv1a:<8 hex>` (FNV-1a over UTF-16 code units, wrapping).
pub fn hash_source(source: &str) -> String {
    let mut h: u32 = FNV_OFFSET;
    for unit in source.encode_utf16() {
        h = (h ^ u32::from(unit)).wrapping_mul(FNV_PRIME);
    }
    // `{:08x}` formats the 32-bit pattern as unsigned lowercase hex.
    format!("fnv1a:{h:08x}")
}
