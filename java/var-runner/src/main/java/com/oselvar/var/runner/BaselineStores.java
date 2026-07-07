package com.oselvar.var.runner;

import com.oselvar.var.core.Drift;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The Node/CLI-equivalent filesystem {@link Drift.BaselineStore}: the committed drift baseline
 * lives at the project root as {@code var.lock.json}. The core owns the format; this adapter only
 * reads and writes the raw text.
 */
public final class BaselineStores {

    private BaselineStores() {}

    /** A store backed by {@code <root>/var.lock.json}. */
    public static Drift.BaselineStore file(Path root) {
        Path path = root.resolve("var.lock.json");
        return new Drift.BaselineStore() {
            @Override
            public String read() {
                try {
                    return Files.exists(path) ? Files.readString(path) : null;
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }

            @Override
            public void write(String contents) {
                try {
                    Files.writeString(path, contents);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }
        };
    }
}
