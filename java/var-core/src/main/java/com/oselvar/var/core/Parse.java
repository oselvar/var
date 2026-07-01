package com.oselvar.var.core;

/**
 * Top-level entry point of the pure core: {@code scan} the source into blocks, then {@code
 * structure} those blocks into a {@link Ast.VarDoc}.
 *
 * <p>Port of {@code var-core/src/parse.ts}. That file's {@code plugins} parameter is intentionally
 * out of scope here, mirroring {@link Scanner#scan}, which takes no plugins parameter in this port.
 */
public final class Parse {

    private Parse() {}

    /** Parses {@code source} into a {@link Ast.VarDoc}: {@code scan} then {@code structure}. */
    public static Ast.VarDoc parse(String path, String source) {
        return Structurer.structure(path, source, Scanner.scan(source));
    }
}
