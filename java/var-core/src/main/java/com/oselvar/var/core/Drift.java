package com.oselvar.var.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Spec drift detection — port of {@code var-core/src/drift.ts}.
 *
 * <p>A paragraph the committed {@code var.lock.json} baseline recorded as an example that now
 * matches no step. Pure over the existing {@link Ast.VarDoc} + {@link Plan.ExecutionPlan}, and
 * byte-identical to the TypeScript and Python ports so a baseline written by one runs green under
 * the others: the same FNV-1a fingerprint ({@link Hash}), the same {@code var.lock.json} bytes
 * (insertion-ordered keys, sorted spec paths, raw non-ASCII), and the same similarity semantics.
 */
public final class Drift {

    private Drift() {}

    /**
     * A baseline example is re-identified in the edited source by text: an exact name match, else
     * the most word-similar paragraph at or above this threshold. So a paragraph may be moved
     * anywhere and reworded up to ~half its words and still be recognized; past that it reads as a
     * fresh paragraph (remove + add), not drift.
     */
    public static final double SIMILARITY_THRESHOLD = 0.5;

    /** One example-producing paragraph, as recorded in the baseline. */
    public record BaselineExample(String name, int line) {}

    /** The committed baseline for one spec file. */
    public record SpecBaseline(String sourceHash, List<BaselineExample> examples) {
        public SpecBaseline {
            examples = List.copyOf(examples);
        }
    }

    /** The whole {@code var.lock.json}: every spec keyed by its POSIX path. */
    public record VarLock(int version, Map<String, SpecBaseline> specs) {
        public VarLock {
            specs = Collections.unmodifiableMap(new LinkedHashMap<>(specs));
        }
    }

    /** A paragraph the baseline says was an example and now matches no step. */
    public record Drifted(String name, int line, Span span) {}

    /**
     * Persistence port for {@code var.lock.json}. The core owns the format; adapters move only raw
     * text (a filesystem store on disk, an in-memory store).
     */
    public interface BaselineStore {
        /** The whole lockfile's contents, or {@code null} when there is no baseline yet. */
        String read();

        void write(String contents);
    }

    // ---- detection ---------------------------------------------------------

    private static final Pattern TOKEN = Pattern.compile("[\\p{L}\\p{N}]+");

    private static boolean within(Span inner, Span outer) {
        return inner.startOffset() >= outer.startOffset() && inner.endOffset() <= outer.endOffset();
    }

    private static boolean isLive(Span candidateSpan, Plan.ExecutionPlan plan) {
        for (Plan.PlannedExample pe : plan.examples()) {
            if (within(pe.span(), candidateSpan)) return true;
        }
        return false;
    }

    private static Set<String> tokenize(String text) {
        Set<String> set = new HashSet<>();
        Matcher m = TOKEN.matcher(text.toLowerCase(Locale.ROOT));
        while (m.find()) set.add(m.group());
        return set;
    }

    private static double similarity(Set<String> a, Set<String> b) {
        if (a.isEmpty() && b.isEmpty()) return 1.0;
        int intersection = 0;
        for (String t : a) {
            if (b.contains(t)) intersection++;
        }
        int union = a.size() + b.size() - intersection;
        return union == 0 ? 0.0 : (double) intersection / union;
    }

    /** The current example-producing paragraphs, in document order. */
    public static List<BaselineExample> liveExamples(Ast.VarDoc varDoc, Plan.ExecutionPlan plan) {
        List<BaselineExample> out = new ArrayList<>();
        for (Ast.Example c : varDoc.examples()) {
            if (isLive(c.span(), plan)) {
                out.add(new BaselineExample(
                        Plan.deriveExampleName(c.body()), c.span().startLine()));
            }
        }
        return out;
    }

    /** The full baseline record for a spec: fingerprint plus live examples. */
    public static SpecBaseline deriveSpecBaseline(String source, Ast.VarDoc varDoc, Plan.ExecutionPlan plan) {
        return new SpecBaseline(Hash.hashSource(source), liveExamples(varDoc, plan));
    }

    /**
     * Paragraphs the baseline recorded as examples that now match zero steps. Each is re-identified
     * by the most word-similar current paragraph at/above {@link #SIMILARITY_THRESHOLD} (an exact
     * name scores 1; ties break toward the nearest line). No sourceHash short-circuit — a step
     * rename leaves the hash untouched.
     */
    public static List<Drifted> detectDrift(SpecBaseline baseline, Ast.VarDoc varDoc, Plan.ExecutionPlan plan) {
        List<Drifted> drifts = new ArrayList<>();
        if (baseline == null) return drifts;
        List<Ast.Example> candidates = varDoc.examples();
        int n = candidates.size();
        List<Set<String>> tokens = new ArrayList<>(n);
        boolean[] live = new boolean[n];
        for (int i = 0; i < n; i++) {
            tokens.add(tokenize(Plan.deriveExampleName(candidates.get(i).body())));
            live[i] = isLive(candidates.get(i).span(), plan);
        }
        for (BaselineExample b : baseline.examples()) {
            Set<String> bTokens = tokenize(b.name());
            int bestIdx = -1;
            double bestScore = 0.0;
            for (int i = 0; i < n; i++) {
                double score = similarity(bTokens, tokens.get(i));
                if (score < SIMILARITY_THRESHOLD) continue;
                int line = candidates.get(i).span().startLine();
                int bestLine = bestIdx >= 0 ? candidates.get(bestIdx).span().startLine() : 0;
                if (bestIdx < 0
                        || score > bestScore
                        || (score == bestScore && Math.abs(line - b.line()) < Math.abs(bestLine - b.line()))) {
                    bestIdx = i;
                    bestScore = score;
                }
            }
            if (bestIdx < 0 || live[bestIdx]) continue;
            Ast.Example cand = candidates.get(bestIdx);
            drifts.add(new Drifted(b.name(), cand.span().startLine(), cand.span()));
        }
        return drifts;
    }

    /** The human-readable message for a drift — same wording as the TS/Python drift diagnostic. */
    public static String message(Drifted d) {
        return "This paragraph was an example and no longer matches any step (drift): \""
                + d.name()
                + "\".\nFix the step so it matches again, or accept it as prose (run in update mode).";
    }

    /**
     * One spec's baseline reconciliation against a {@link BaselineStore}. {@code update} accepts
     * all drift (re-record, report nothing). Otherwise detect drift; rewrite the baseline only on a
     * clean run so an unacknowledged drift keeps its old entry (and stays red).
     */
    public static List<Drifted> reconcileDrift(
            BaselineStore store,
            String specPath,
            String source,
            Ast.VarDoc varDoc,
            Plan.ExecutionPlan plan,
            boolean update) {
        String text = store.read();
        VarLock lock = text != null ? parseVarLock(text) : null;
        SpecBaseline baseline = lock != null ? lock.specs().get(specPath) : null;
        List<Drifted> drifts = update ? new ArrayList<>() : detectDrift(baseline, varDoc, plan);
        if (update || drifts.isEmpty()) {
            SpecBaseline next = deriveSpecBaseline(source, varDoc, plan);
            Map<String, SpecBaseline> specs = new LinkedHashMap<>();
            if (lock != null) specs.putAll(lock.specs());
            specs.put(specPath, next);
            store.write(stringifyVarLock(new VarLock(1, specs)));
        }
        return drifts;
    }

    // ---- serialize (byte-identical to JSON.stringify(...,null,2)+"\n") ------

    /**
     * Serializes {@code var.lock.json} deterministically: {@code version} then {@code specs} (spec
     * paths sorted), examples in document order, two-space indent, trailing newline, non-ASCII
     * raw. NOT {@link CanonicalJson} (which sorts every key) — the lockfile keeps insertion order.
     */
    public static String stringifyVarLock(VarLock lock) {
        List<String> paths = new ArrayList<>(lock.specs().keySet());
        Collections.sort(paths);
        StringBuilder sb = new StringBuilder();
        sb.append("{\n  \"version\": 1,\n  \"specs\": ");
        if (paths.isEmpty()) {
            sb.append("{}");
        } else {
            sb.append("{\n");
            for (int p = 0; p < paths.size(); p++) {
                String path = paths.get(p);
                SpecBaseline b = lock.specs().get(path);
                sb.append("    ");
                writeString(sb, path);
                sb.append(": {\n      \"sourceHash\": ");
                writeString(sb, b.sourceHash());
                sb.append(",\n      \"examples\": ");
                if (b.examples().isEmpty()) {
                    sb.append("[]");
                } else {
                    sb.append("[\n");
                    for (int e = 0; e < b.examples().size(); e++) {
                        BaselineExample ex = b.examples().get(e);
                        sb.append("        {\n          \"name\": ");
                        writeString(sb, ex.name());
                        sb.append(",\n          \"line\": ").append(ex.line()).append("\n        }");
                        if (e + 1 < b.examples().size()) sb.append(',');
                        sb.append('\n');
                    }
                    sb.append("      ]");
                }
                sb.append("\n    }");
                if (p + 1 < paths.size()) sb.append(',');
                sb.append('\n');
            }
            sb.append("  }");
        }
        sb.append("\n}\n");
        return sb.toString();
    }

    // Same escaping as CanonicalJson.writeString: standard JSON escapes, control chars as \\uXXXX,
    // everything else (including non-ASCII) raw.
    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    // ---- parse (a minimal JSON reader; no library in the project) ----------

    /** Parses {@code var.lock.json}; {@code null} on malformed input (treated as no baseline). */
    public static VarLock parseVarLock(String text) {
        Object parsed;
        try {
            parsed = new JsonReader(text).parseWhole();
        } catch (RuntimeException e) {
            return null;
        }
        if (!(parsed instanceof Map<?, ?> obj)) return null;
        if (!(obj.get("version") instanceof Number version) || version.intValue() != 1) return null;
        if (!(obj.get("specs") instanceof Map<?, ?> specsRaw)) return null;
        Map<String, SpecBaseline> specs = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : specsRaw.entrySet()) {
            SpecBaseline b = parseSpecBaseline(entry.getValue());
            if (b == null) return null;
            specs.put((String) entry.getKey(), b);
        }
        return new VarLock(1, specs);
    }

    private static SpecBaseline parseSpecBaseline(Object value) {
        if (!(value instanceof Map<?, ?> map)) return null;
        if (!(map.get("sourceHash") instanceof String sourceHash)) return null;
        if (!(map.get("examples") instanceof List<?> examplesRaw)) return null;
        List<BaselineExample> examples = new ArrayList<>();
        for (Object item : examplesRaw) {
            if (!(item instanceof Map<?, ?> e)) return null;
            if (!(e.get("name") instanceof String name) || !(e.get("line") instanceof Number line)) {
                return null;
            }
            examples.add(new BaselineExample(name, line.intValue()));
        }
        return new SpecBaseline(sourceHash, examples);
    }

    /** A tiny recursive-descent JSON reader — enough for var.lock.json, throws on malformed. */
    private static final class JsonReader {
        private final String s;
        private int i;

        JsonReader(String s) {
            this.s = s;
        }

        Object parseWhole() {
            Object v = value();
            skipWs();
            if (i != s.length()) throw new IllegalStateException("trailing input");
            return v;
        }

        private Object value() {
            skipWs();
            char c = peek();
            return switch (c) {
                case '{' -> object();
                case '[' -> array();
                case '"' -> string();
                case 't', 'f' -> bool();
                case 'n' -> nul();
                default -> number();
            };
        }

        private Map<String, Object> object() {
            expect('{');
            Map<String, Object> map = new LinkedHashMap<>();
            skipWs();
            if (peek() == '}') {
                i++;
                return map;
            }
            while (true) {
                skipWs();
                String key = string();
                skipWs();
                expect(':');
                map.put(key, value());
                skipWs();
                char c = next();
                if (c == '}') return map;
                if (c != ',') throw new IllegalStateException("expected , or }");
            }
        }

        private List<Object> array() {
            expect('[');
            List<Object> list = new ArrayList<>();
            skipWs();
            if (peek() == ']') {
                i++;
                return list;
            }
            while (true) {
                list.add(value());
                skipWs();
                char c = next();
                if (c == ']') return list;
                if (c != ',') throw new IllegalStateException("expected , or ]");
            }
        }

        private String string() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') return sb.toString();
                if (c == '\\') {
                    char e = next();
                    switch (e) {
                        case '"' -> sb.append('"');
                        case '\\' -> sb.append('\\');
                        case '/' -> sb.append('/');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'b' -> sb.append('\b');
                        case 'f' -> sb.append('\f');
                        case 'u' -> {
                            sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                            i += 4;
                        }
                        default -> throw new IllegalStateException("bad escape");
                    }
                } else {
                    sb.append(c);
                }
            }
        }

        private Object number() {
            int start = i;
            while (i < s.length() && "-+.eE0123456789".indexOf(s.charAt(i)) >= 0) i++;
            String num = s.substring(start, i);
            if (num.isEmpty()) throw new IllegalStateException("expected value");
            if (num.indexOf('.') >= 0 || num.indexOf('e') >= 0 || num.indexOf('E') >= 0) {
                return Double.parseDouble(num);
            }
            return Long.parseLong(num);
        }

        private Boolean bool() {
            if (s.startsWith("true", i)) {
                i += 4;
                return Boolean.TRUE;
            }
            if (s.startsWith("false", i)) {
                i += 5;
                return Boolean.FALSE;
            }
            throw new IllegalStateException("bad literal");
        }

        private Object nul() {
            if (s.startsWith("null", i)) {
                i += 4;
                return null;
            }
            throw new IllegalStateException("bad literal");
        }

        private void skipWs() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++;
                else break;
            }
        }

        private char peek() {
            if (i >= s.length()) throw new IllegalStateException("unexpected end");
            return s.charAt(i);
        }

        private char next() {
            if (i >= s.length()) throw new IllegalStateException("unexpected end");
            return s.charAt(i++);
        }

        private void expect(char c) {
            if (next() != c) throw new IllegalStateException("expected " + c);
        }
    }
}
