package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Translation of {@code python/packages/var-runner/tests/test_discovery.py} — same
 * glob-matching semantics ({@code /**\/}, leading {@code **\/}, bare {@code **}, {@code *},
 * {@code ?}), same {@link Discovery#matchSpec}/{@link Discovery#findSpecs} split. See
 * {@code discovery.py}'s {@code _glob_to_regex} docstring for the semantics being ported.
 */
class DiscoveryTest {

    private static Path touch(Path root, String rel) throws IOException {
        Path p = root.resolve(rel);
        Files.createDirectories(p.getParent());
        Files.writeString(p, "");
        return p;
    }

    @Test
    void findSpecsIncludeMinusExclude(@TempDir Path tmp) throws IOException {
        touch(tmp, "features/a.md");
        touch(tmp, "features/wip/b.md");
        touch(tmp, "README.md");

        List<Path> found =
                Discovery.findSpecs(List.of("features/**/*.md"), List.of("**/wip/**"), tmp);

        assertEquals(List.of(tmp.resolve("features/a.md")), found);
    }

    @Test
    void matchSpec(@TempDir Path tmp) throws IOException {
        List<String> inc = List.of("features/**/*.md");
        List<String> exc = List.of("**/wip/**");

        assertTrue(Discovery.matchSpec(tmp.resolve("features/a.md"), inc, exc, tmp));
        assertFalse(Discovery.matchSpec(tmp.resolve("features/wip/b.md"), inc, exc, tmp));
        assertFalse(Discovery.matchSpec(tmp.resolve("README.md"), inc, exc, tmp));
    }

    @Test
    void deeplyNestedSpecMatches(@TempDir Path tmp) {
        // features/**/*.md must match specs nested more than one level deep.
        List<String> inc = List.of("features/**/*.md");
        List<String> exc = List.of();

        assertTrue(Discovery.matchSpec(tmp.resolve("features/sub/deep/c.md"), inc, exc, tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("features/sub/c.md"), inc, exc, tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("features/c.md"), inc, exc, tmp));
    }

    @Test
    void leadingDoubleStarMatchesRootLevelFile(@TempDir Path tmp) {
        // **/*.md must match a file directly under root (zero preceding dirs).
        assertTrue(Discovery.matchSpec(tmp.resolve("README.md"), List.of("**/*.md"), List.of(), tmp));
    }

    @Test
    void leadingDoubleStarExcludeRootLevelDir(@TempDir Path tmp) throws IOException {
        // find_specs with **/wip/** must exclude wip/ directly under root.
        touch(tmp, "b.md");
        touch(tmp, "wip/a.md");

        List<Path> found = Discovery.findSpecs(List.of("**/*.md"), List.of("**/wip/**"), tmp);

        assertEquals(List.of(tmp.resolve("b.md")), found);
    }

    @Test
    void findSpecsDedup(@TempDir Path tmp) throws IOException {
        // A file matching multiple include globs appears only once in the result.
        touch(tmp, "b.md");

        List<Path> found = Discovery.findSpecs(List.of("**/*.md", "**/b.md"), List.of(), tmp);

        assertEquals(List.of(tmp.resolve("b.md")), found);
    }

    @Test
    void singleStarDoesNotCrossSlash(@TempDir Path tmp) {
        // * must not match a path separator.
        assertFalse(Discovery.matchSpec(tmp.resolve("dir/file.md"), List.of("*.md"), List.of(), tmp));
    }

    @Test
    void specsOutsideRootViaParentGlob(@TempDir Path tmp) throws IOException {
        // A spec in a SIBLING of the config root is reachable via a "../" glob — this backs
        // pointing config at a shared corpus that lives outside the package (e.g.
        // ../conformance/bundles).
        Path root = tmp.resolve("proj");
        Files.createDirectories(root);
        Path spec = touch(tmp, "corpus/features/a.md");
        List<String> inc = List.of("../corpus/**/*.md");

        List<Path> found = Discovery.findSpecs(inc, List.of(), root);

        assertEquals(1, found.size());
        assertEquals(spec.toRealPath(), found.get(0).toRealPath());
        assertTrue(Discovery.matchSpec(spec, inc, List.of(), root));

        // a sibling file NOT under the glob is not matched
        Path other = touch(tmp, "other/b.md");
        assertFalse(Discovery.matchSpec(other, inc, List.of(), root));
    }

    @Test
    void slashDoubleStarSlashMatchesIntermediateDirs(@TempDir Path tmp) {
        // /**/ (slash-doublestar-slash) matches zero or more intermediate directory segments.
        List<String> inc = List.of("a/**/z.md");

        assertTrue(Discovery.matchSpec(tmp.resolve("a/z.md"), inc, List.of(), tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("a/b/z.md"), inc, List.of(), tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("a/b/c/z.md"), inc, List.of(), tmp));
        assertFalse(Discovery.matchSpec(tmp.resolve("a/other.md"), inc, List.of(), tmp));
    }

    @Test
    void slashBareDoubleStarAtEndMatchesOptionalTrailingPath(@TempDir Path tmp) {
        // /** at the end of a pattern is an optional trailing /anything.
        List<String> inc = List.of("a/**");

        assertTrue(Discovery.matchSpec(tmp.resolve("a"), inc, List.of(), tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("a/b"), inc, List.of(), tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("a/b/c.md"), inc, List.of(), tmp));
        assertFalse(Discovery.matchSpec(tmp.resolve("other"), inc, List.of(), tmp));
    }

    @Test
    void bareDoubleStarAloneMatchesAnything(@TempDir Path tmp) {
        // A bare ** with no adjacent slash (e.g. at the very start of the pattern) degrades to
        // `.*`, matching anything including nested paths.
        List<String> inc = List.of("**");

        assertTrue(Discovery.matchSpec(tmp.resolve("README.md"), inc, List.of(), tmp));
        assertTrue(Discovery.matchSpec(tmp.resolve("a/b/c.md"), inc, List.of(), tmp));
    }
}
