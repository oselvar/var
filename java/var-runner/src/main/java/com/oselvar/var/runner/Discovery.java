package com.oselvar.var.runner;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Glob include/exclude spec discovery — port of {@code var_runner.discovery} (Python).
 *
 * <p>{@link #matchSpec} and {@link #findSpecs} share a single glob-to-regex compiler
 * ({@link #globToRegex}) so the two never independently reimplement (and silently drift from
 * each other on) the same matching rules — same discipline as {@link
 * com.oselvar.var.core.CanonicalJson CanonicalJson}'s
 * hand-rolled-not-library decision: Java has no {@code Path.full_match}
 * (Python 3.13's {@code pathlib.Path.full_match}/PEP 428) and {@code
 * FileSystem.getPathMatcher("glob:...")}'s {@code **} semantics differ from this project's
 * convention, so both entry points are built on one hand-rolled regex compiler instead.
 */
public final class Discovery {

    private Discovery() {}

    /** Returns {@code path} relativized against {@code root}, POSIX-separated. */
    private static String relPosix(Path path, Path root) {
        Path absPath = path.toAbsolutePath().normalize();
        Path absRoot = root.toAbsolutePath().normalize();
        String rel = absRoot.relativize(absPath).toString();
        return rel.replace('\\', '/');
    }

    /**
     * Translates a glob pattern with {@code **}, {@code *}, {@code ?} to a compiled regex.
     *
     * <p>Semantics (same as {@code pathlib.Path.full_match} / PEP 428):
     *
     * <ul>
     *   <li>{@code /**\/} (slash-doublestar-slash) &rarr; {@code /(?:.+/)?} zero or more
     *       intermediate directory segments (the surrounding slashes are absorbed into the
     *       token).
     *   <li>{@code /**} at end of pattern &rarr; {@code (?:/.*)?} optional trailing path.
     *   <li>{@code **\/} not preceded by {@code /} (leading or after a literal) &rarr;
     *       {@code (?:.*\/)?} zero or more path segments including the trailing slash, so a
     *       leading {@code **\/} matches both root-level paths and nested ones.
     *   <li>bare {@code **} elsewhere &rarr; {@code .*}.
     *   <li>{@code *} &rarr; {@code [^/]*} (any chars except {@code /}).
     *   <li>{@code ?} &rarr; {@code [^/]} (single char except {@code /}).
     * </ul>
     */
    private static Pattern globToRegex(String pattern) {
        StringBuilder result = new StringBuilder();
        int i = 0;
        int n = pattern.length();
        while (i < n) {
            char c = pattern.charAt(i);
            if (c == '/' && pattern.startsWith("/**/", i)) {
                // /**/ -> /(?:.+/)?  — absorb both slashes; zero or more intermediate dirs
                result.append("/(?:.+/)?");
                i += 4;
            } else if (c == '/' && pattern.startsWith("/**", i) && i + 3 == n) {
                // /** at end -> optional trailing /anything
                result.append("(?:/.*)?");
                i += 3;
            } else if (c == '*' && pattern.startsWith("**/", i)) {
                // **/ not preceded by / (leading **/ or after a literal char)
                // -> zero or more path segments with their trailing slash (optional)
                result.append("(?:.*/)?");
                i += 3;
            } else if (c == '*' && pattern.startsWith("**", i)) {
                // bare ** (e.g. at end of pattern with no following /)
                result.append(".*");
                i += 2;
            } else if (c == '*') {
                result.append("[^/]*");
                i += 1;
            } else if (c == '?') {
                result.append("[^/]");
                i += 1;
            } else {
                result.append(Pattern.quote(String.valueOf(c)));
                i += 1;
            }
        }
        return Pattern.compile(result.toString());
    }

    private static boolean matchesAny(String rel, List<String> globs) {
        for (String glob : globs) {
            if (globToRegex(glob).matcher(rel).matches()) return true;
        }
        return false;
    }

    /** Returns {@code true} iff {@code path} matches an include glob and no exclude glob. */
    public static boolean matchSpec(Path path, List<String> include, List<String> exclude, Path root) {
        String rel = relPosix(path, root);
        return matchesAny(rel, include) && !matchesAny(rel, exclude);
    }

    /**
     * The literal (wildcard-free) directory prefix of a glob pattern, resolved against {@code
     * root} — e.g. {@code "features/**\/*.md"} &rarr; {@code root/features}, and {@code
     * "../corpus/**\/*.md"} &rarr; a sibling of {@code root}, since a leading {@code ..} segment
     * has no {@code *}/{@code ?} and is walked through like any other literal segment.
     *
     * <p>This lets {@link #findSpecs} walk only the subtree a pattern can possibly match — the
     * same reason Python's {@code root.glob(g)} can escape {@code root} via a {@code ../} glob
     * (see {@code test_specs_outside_root_via_parent_glob} in {@code test_discovery.py}): the
     * literal prefix, including any {@code ..}, is resolved first, and only the remainder is
     * glob-matched.
     */
    private static Path literalPrefixDir(String pattern, Path root) {
        Path base = root.toAbsolutePath().normalize();
        for (String part : pattern.split("/", -1)) {
            if (part.isEmpty() || part.equals(".")) continue;
            if (part.indexOf('*') >= 0 || part.indexOf('?') >= 0) break;
            base = base.resolve(part);
        }
        return base.normalize();
    }

    /**
     * Returns every existing file matching an include glob (resolved against {@code root},
     * which may lie outside {@code root} via a {@code ../} prefix), minus files matching any
     * exclude glob; sorted; deduplicated.
     *
     * <p>Unlike Python's {@code root.glob(g)} (which resolves {@code **} natively per pattern),
     * this walks the file tree rooted at each pattern's {@link #literalPrefixDir} and tests each
     * file against the same regex-matching helper {@link #matchSpec} uses — deliberately not
     * {@code FileSystem.getPathMatcher("glob:...")}, whose {@code **} semantics differ from this
     * project's convention.
     */
    public static List<Path> findSpecs(List<String> include, List<String> exclude, Path root) {
        var out = new LinkedHashSet<Path>();
        for (String glob : include) {
            Path base = literalPrefixDir(glob, root);
            if (!Files.exists(base)) continue;
            try (Stream<Path> walk = Files.walk(base)) {
                walk.filter(Files::isRegularFile).forEach(p -> {
                    String rel = relPosix(p, root);
                    if (matchesAny(rel, include) && !matchesAny(rel, exclude)) {
                        out.add(p);
                    }
                });
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return List.copyOf(out.stream().sorted().toList());
    }
}
