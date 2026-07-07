package com.oselvar.var.core;

/**
 * FNV-1a (32-bit) change-detector over UTF-16 code units. Port of {@code
 * var-core/src/hash.ts}; byte-identical to the TypeScript and Python ports so
 * {@code var.lock.json} fingerprints match across every language. Java {@code
 * char} is already a UTF-16 code unit (like JS {@code charCodeAt}), and {@code
 * int} arithmetic wraps mod 2^32, so this is a direct transliteration. The
 * {@code fnv1a:} prefix namespaces the algorithm.
 */
public final class Hash {

    private Hash() {}

    private static final int FNV_OFFSET = 0x811c9dc5;
    private static final int FNV_PRIME = 0x01000193;

    /** Mirrors {@code hashSource()} from hash.ts. */
    public static String hashSource(String source) {
        int h = FNV_OFFSET;
        for (int i = 0; i < source.length(); i++) {
            h = (h ^ source.charAt(i)) * FNV_PRIME;
        }
        // %08x formats the 32-bit pattern as unsigned lowercase hex.
        return String.format("fnv1a:%08x", h);
    }
}
