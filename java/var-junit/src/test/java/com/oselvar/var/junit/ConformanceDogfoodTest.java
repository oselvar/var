package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Task 14 (Milestone 2's capstone): runs all 12 bundles under the shared, language-neutral
 * {@code conformance/bundles/} corpus through the REAL {@link VarTestEngine} via {@link
 * EngineTestKit} — the sub-project-2 analogue of the core plan's Task 19 conformance gate
 * ({@code var}'s {@code ConformanceTest}), but proving the test-runner ADAPTER end to end
 * (discovery + execution reported through JUnit Platform events) rather than diffing wire-format
 * JSON against a golden artifact directly.
 *
 * <p><b>Fixture reuse, not re-authoring:</b> each bundle's Java step-definition fixture (e.g.
 * {@code conformance/bundles/01-roman-numerals/NumeralsSteps.java}) is the exact one Task 13 of
 * the core plan authored, already proven byte-for-byte correct against {@code var}'s own {@code
 * ConformanceTest}. This module's own {@code pom.xml} carries the identical {@code
 * build-helper-maven-plugin} {@code add-test-source} wiring {@code var}'s {@code pom.xml}
 * documents at length (see that comment block for the full fixture-layout rationale): {@code
 * var-junit} is a separate Maven module with its own separate test classpath, so the same
 * fixtures need the same wiring repeated here to land on THIS module's test classpath. No new
 * reactor cycle results — verified empirically ({@code mvn -pl var-junit -am test-compile}
 * succeeds) — because the wiring adds a test-source root, not a module dependency, and {@code
 * var-junit}'s own dependency chain ({@code var-junit -> var-runner -> var -> var-core}) has
 * nothing depending back on it.
 *
 * <p><b>Discovery mechanism:</b> each bundle's {@code example.md} lives on the filesystem (a
 * sibling of {@code java/}, outside any classpath root), so discovery uses a real {@code
 * FileSelector} ({@link org.junit.platform.engine.discovery.DiscoverySelectors#selectFile}), not
 * a classpath-resource selector — resolved by {@link VarFileSelectorResolver#resolve(
 * org.junit.platform.engine.discovery.FileSelector, org.junit.platform.engine.support.discovery.
 * SelectorResolver.Context)}, which relativizes the selected file against the module's working
 * directory (Maven/Surefire's basedir for this module) to test it against {@code
 * var.vars.include}/{@code var.vars.exclude}. {@link #BUNDLES_DIR} mirrors {@code var}'s own
 * {@code ConformanceTest} — two levels up from the module directory to the repo root's {@code
 * conformance/} — and each bundle's exact relative path (no wildcards needed; only one file is
 * ever selected) becomes the {@code var.vars.include} value, so no OTHER bundle's {@code
 * example.md} can accidentally satisfy this request. {@code var.steps} names the one fixture
 * class {@link StepLoader} should load, exactly as {@link VarEngineBehaviorTest} already proves
 * end to end for classpath-resource specs — this task is the same mechanism for a real-file spec.
 *
 * <p><b>What's asserted:</b> not a JSON diff (that's {@code var}'s job) but the per-example
 * pass/fail OUTCOME the real engine reports, matching each bundle's committed {@code
 * golden/trace.json} {@code examples[].outcome} field (read directly, bundle by bundle, to derive
 * {@link #expectedPassed}/{@link #expectedFailed} below — see each case's own comment). {@code
 * trace.json}'s {@code outcome} is already the POST-inversion result (unlike {@code
 * golden/plan.json}'s {@code expectedOutcome}, which records what the author's {@code error}
 * fence declared, before inversion) — e.g. bundle 03's {@code expectedOutcome} is {@code "fail"}
 * (an {@code error} fence was written) but its {@code trace.json} {@code outcome} is {@code
 * "pass"} (the expected failure was satisfied, so the overall example passes) — so asserting
 * directly against {@code trace.json} needs no extra inversion logic in this test; the golden
 * already encodes it. {@code var-junit}'s own {@code TestExecutionResult} only has
 * SUCCESSFUL/FAILED/ABORTED, mapping 1:1 to golden {@code "pass"}/{@code "fail"}.
 *
 * <p>No JSON parsing is introduced here (there is no JSON library anywhere in this Maven
 * reactor): each bundle's expected pass/fail counts below were read directly from its real,
 * committed {@code golden/trace.json} and hardcoded as a small, explicit, compiler-checked table
 * — the same style {@code ConformanceTest#loadFixture}'s static switch already established for
 * the bundle-to-fixture-class mapping, rather than adding a hand-rolled scanner whose own
 * correctness would need separately trusting.
 *
 * <p>Each bundle is its own {@code @ParameterizedTest} case (12 independently reported, not one
 * loop hiding a failure behind the first mismatch) — same discipline as {@code ConformanceTest}
 * and the core plan's Task 19 harness.
 */
class ConformanceDogfoodTest {

    // Maven runs tests with the module directory (java/var-junit/) as the working directory, so
    // the shared corpus -- a sibling of java/, typescript/, python/ at the repo root -- is two
    // levels up, exactly as var's own ConformanceTest resolves it.
    private static final Path BUNDLES_DIR = Paths.get("..", "..", "conformance", "bundles");

    /** One bundle's dogfood expectations, read from its real {@code golden/trace.json}. */
    private record BundleCase(String bundleName, String stepsClassName, int expectedPassed, int expectedFailed) {
        @Override
        public String toString() {
            return bundleName;
        }
    }

    static Stream<Named<BundleCase>> bundleCases() {
        return Stream.of(
                        // 01-roman-numerals/golden/trace.json: one example, outcome "pass".
                        new BundleCase(
                                "01-roman-numerals",
                                "com.oselvar.var.conformance.bundle01.NumeralsSteps",
                                1,
                                0),
                        // 02-context-isolation/golden/trace.json: two examples, both "pass".
                        new BundleCase(
                                "02-context-isolation",
                                "com.oselvar.var.conformance.bundle02.CounterSteps",
                                2,
                                0),
                        // 03-expected-failure/golden/trace.json: one example, outcome "pass" --
                        // an error fence whose expected failure IS satisfied, so the core
                        // inverts the thrown exception into an overall pass (same semantics
                        // Python's Task 9 proved for var-pytest).
                        new BundleCase(
                                "03-expected-failure",
                                "com.oselvar.var.conformance.bundle03.DivisionSteps",
                                1,
                                0),
                        // 04-tables-and-docstrings/golden/trace.json: one example, "pass".
                        new BundleCase(
                                "04-tables-and-docstrings",
                                "com.oselvar.var.conformance.bundle04.EchoSteps",
                                1,
                                0),
                        // 05-ambiguous-match/golden/trace.json: one example, outcome "pass" with
                        // zero steps -- the plan stage drops the ambiguous sentence's binding
                        // (an "ambiguous-match" diagnostic, golden/plan.json) but still produces
                        // one example with no steps to run, which vacuously passes.
                        new BundleCase(
                                "05-ambiguous-match",
                                "com.oselvar.var.conformance.bundle05.CukesSteps",
                                1,
                                0),
                        // 06-doc-string-mismatch/golden/trace.json: one example, outcome "fail"
                        // -- a genuine doc-string mismatch, no error fence involved.
                        new BundleCase(
                                "06-doc-string-mismatch",
                                "com.oselvar.var.conformance.bundle06.EchoSteps",
                                0,
                                1),
                        // 07-row-check-mismatch/golden/trace.json: one example, outcome "fail"
                        // -- a genuine cell mismatch (score 99 != 10), no error fence involved.
                        new BundleCase(
                                "07-row-check-mismatch",
                                "com.oselvar.var.conformance.bundle07.ReportSteps",
                                0,
                                1),
                        // 08-string-capture/golden/trace.json: one example, "pass".
                        new BundleCase(
                                "08-string-capture",
                                "com.oselvar.var.conformance.bundle08.GreetSteps",
                                1,
                                0),
                        // 09-expected-message-mismatch/golden/trace.json: one example, outcome
                        // "fail" -- an error fence IS present (expectedOutcome "fail" in
                        // golden/plan.json), but its declared message text doesn't match the
                        // thrown exception's actual message, so the mismatch is a genuine
                        // failure, not inverted to a pass.
                        new BundleCase(
                                "09-expected-message-mismatch",
                                "com.oselvar.var.conformance.bundle09.BoomSteps",
                                0,
                                1),
                        // 10-error-fence-without-step/golden/trace.json: zero examples -- the
                        // sole paragraph matches no step, so the "error" fence has nothing to
                        // run against ("error-fence-without-step" diagnostic, golden/plan.json)
                        // and the example is dropped entirely at the plan stage. A childless
                        // VarFileDescriptor is itself pruned by the Launcher (see
                        // DiscoverySelectorResolverTest's javadoc), so this bundle reports zero
                        // test events, not zero-of-something.
                        new BundleCase(
                                "10-error-fence-without-step",
                                "com.oselvar.var.conformance.bundle10.CukesSteps",
                                0,
                                0),
                        // 11-emoji-offsets/golden/trace.json: one example, "pass".
                        new BundleCase(
                                "11-emoji-offsets",
                                "com.oselvar.var.conformance.bundle11.GreetSteps",
                                1,
                                0),
                        // 12-combining-marks/golden/trace.json: one example, "pass".
                        new BundleCase(
                                "12-combining-marks",
                                "com.oselvar.var.conformance.bundle12.GreetSteps",
                                1,
                                0))
                .map(bundleCase -> Named.of(bundleCase.bundleName(), bundleCase));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleCases")
    void bundleOutcomesMatchGoldenTrace(BundleCase bundleCase) throws IOException {
        Path bundleDir = BUNDLES_DIR.resolve(bundleCase.bundleName());
        Path exampleMd = bundleDir.resolve("example.md");
        assertTrue(Files.isRegularFile(exampleMd), () -> "missing bundle spec: " + exampleMd.toAbsolutePath());

        String varsInclude = exampleMd.toString().replace('\\', '/');

        EngineExecutionResults results =
                EngineTestKit.engine("var")
                        .selectors(selectFile(exampleMd.toFile()))
                        .configurationParameter("var.vars.include", varsInclude)
                        .configurationParameter("var.steps", bundleCase.stepsClassName())
                        .execute();

        assertEquals(
                bundleCase.expectedPassed(),
                results.testEvents().succeeded().count(),
                () -> bundleCase.bundleName() + ": expected passed-example count from golden/trace.json");
        assertEquals(
                bundleCase.expectedFailed(),
                results.testEvents().failed().count(),
                () -> bundleCase.bundleName() + ": expected failed-example count from golden/trace.json");
    }
}
