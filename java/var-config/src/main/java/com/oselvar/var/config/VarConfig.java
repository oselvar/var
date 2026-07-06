package com.oselvar.var.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * The parsed var.config.json — the single shared config file for all var
 * tools across every language port. Same field semantics everywhere:
 * {@code docs.include} has no default (empty discovers nothing),
 * {@code docs.exclude} removes matches, both are plain globs (no {@code !}
 * prefix); {@code steps} globs step-definition files; {@code snippets} maps
 * language id to snippet template; {@code scannerPlugins} carries plugin
 * NAMES (resolution is a per-language concern — the Java port defines none
 * yet). Contract: conformance/config/README.md. All keys optional; unknown
 * keys, wrong types, and malformed JSON fail loudly (a typo'd config must
 * never silently discover nothing); a {@code $schema} key is ignored.
 */
public record VarConfig(
        List<String> docsInclude,
        List<String> docsExclude,
        List<String> steps,
        Map<String, String> snippets,
        List<String> scannerPlugins) {

    private static final Set<String> KNOWN_KEYS = Set.of("$schema", "docs", "steps", "snippets", "scannerPlugins");
    private static final Set<String> KNOWN_DOCS_KEYS = Set.of("include", "exclude");

    public VarConfig {
        docsInclude = List.copyOf(docsInclude);
        docsExclude = List.copyOf(docsExclude);
        steps = List.copyOf(steps);
        snippets = Map.copyOf(snippets);
        scannerPlugins = List.copyOf(scannerPlugins);
    }

    public static VarConfig empty() {
        return new VarConfig(List.of(), List.of(), List.of(), Map.of(), List.of());
    }

    /** Reads {@code <root>/var.config.json}; a missing file is the empty config. */
    public static VarConfig load(Path root) {
        Path path = root.resolve("var.config.json");
        if (!Files.isRegularFile(path)) return empty();
        String text;
        try {
            text = Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalArgumentException(path + ": " + e.getMessage(), e);
        }
        return parse(text, path.toString());
    }

    /** Pure parse of the config TEXT; {@code sourceName} prefixes every error message. */
    public static VarConfig parse(String jsonText, String sourceName) {
        Object data;
        try {
            data = Json.parse(jsonText);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(sourceName + ": invalid JSON: " + e.getMessage(), e);
        }
        if (!(data instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException(sourceName + ": top level must be an object");
        }
        Set<String> unknown = new TreeSet<>();
        for (Object key : map.keySet()) {
            if (!KNOWN_KEYS.contains((String) key)) unknown.add((String) key);
        }
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException(sourceName + ": unknown key(s): " + String.join(", ", unknown));
        }
        List<String> docsInclude = List.of();
        List<String> docsExclude = List.of();
        Object docs = map.get("docs");
        if (docs != null) {
            if (!(docs instanceof Map<?, ?> docsMap)) {
                throw new IllegalArgumentException(sourceName + ": 'docs' must be an object");
            }
            Set<String> unknownDocs = new TreeSet<>();
            for (Object key : docsMap.keySet()) {
                if (!KNOWN_DOCS_KEYS.contains((String) key)) unknownDocs.add((String) key);
            }
            if (!unknownDocs.isEmpty()) {
                throw new IllegalArgumentException(
                        sourceName + ": unknown docs key(s): " + String.join(", ", unknownDocs));
            }
            docsInclude = stringList(docsMap.get("include"), "docs.include", sourceName);
            docsExclude = stringList(docsMap.get("exclude"), "docs.exclude", sourceName);
        }
        Map<String, String> snippets = new LinkedHashMap<>();
        Object rawSnippets = map.get("snippets");
        if (rawSnippets != null) {
            if (!(rawSnippets instanceof Map<?, ?> snippetsMap)) {
                throw new IllegalArgumentException(sourceName + ": 'snippets' must be an object of strings");
            }
            for (Map.Entry<?, ?> entry : snippetsMap.entrySet()) {
                if (!(entry.getValue() instanceof String value)) {
                    throw new IllegalArgumentException(sourceName + ": 'snippets' must be an object of strings");
                }
                snippets.put((String) entry.getKey(), value);
            }
        }
        return new VarConfig(
                docsInclude,
                docsExclude,
                stringList(map.get("steps"), "steps", sourceName),
                snippets,
                stringList(map.get("scannerPlugins"), "scannerPlugins", sourceName));
    }

    private static List<String> stringList(Object value, String key, String sourceName) {
        if (value == null) return List.of();
        if (!(value instanceof List<?> list)) {
            throw new IllegalArgumentException(sourceName + ": '" + key + "' must be an array of strings");
        }
        List<String> out = new ArrayList<>(list.size());
        for (Object item : list) {
            if (!(item instanceof String s)) {
                throw new IllegalArgumentException(sourceName + ": '" + key + "' must be an array of strings");
            }
            out.add(s);
        }
        return List.copyOf(out);
    }
}
