package dev.varar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.Ast;
import dev.varar.core.CanonicalJson;
import dev.varar.core.Conformance;
import dev.varar.core.Parse;
import dev.varar.core.Plan;
import dev.varar.core.Registry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The Milestone 2 conformance gate: for every bundle under the shared, language-neutral
 * {@code conformance/bundles/} corpus, loads that bundle's Java step-definition fixture
 * (see {@link #loadFixture}), registers it against a fresh {@link Steps},
 * projects the resulting {@link Registry} via {@link Conformance#toRegistryArtifact},
 * serializes with {@link CanonicalJson#canonicalStringify(Object)}, and asserts
 * byte-for-byte equality with the committed {@code golden/registry.json}.
 *
 * <p>Port of the registry stage of {@code typescript/packages/varar/tests/
 * conformance.test.ts} and {@code python/packages/varar/tests/
 * test_conformance.py::test_registry_matches_golden}. This lives in the {@code var}
 * module (not {@code var-core}'s {@code ConformanceTest}, which only covers the
 * var-doc stage from Task 10): the registry stage needs both {@code var-core}'s
 * {@link Registry}/{@link Conformance} AND {@code var}'s own {@link Steps}/
 * {@link StepDefinitions} author API that every bundle's fixture is written against.
 * Wiring this into {@code var-core} instead (a test-scoped dependency from
 * {@code var-core} back onto {@code var}) was tried first and rejected — it creates a
 * real Maven reactor cycle ({@code var-core[test] -> var -> var-core[main]}),
 * confirmed empirically via {@code mvn -pl var-core -am test-compile} failing with
 * "The projects in the reactor contain a cyclic reference". {@code var}'s test scope
 * already depends on {@code var-core} (its own main dependency) with no such cycle.
 *
 * <p><b>Fixture-layout solution</b> (see {@code java/varar/pom.xml}'s {@code
 * build-helper-maven-plugin} config): every bundle directory under {@code
 * conformance/bundles/} (e.g. {@code 01-roman-numerals}) is not a valid Java package
 * segment (leading digit, hyphen), so each bundle's fixture file declares its own
 * valid package instead — {@code dev.varar.conformance.bundleNN} (zero-padded
 * two-digit bundle number) — while physically living alongside the bundle's existing
 * {@code *.steps.ts}/{@code *.steps.py}. Maven's compiler plugin does not require a
 * source file's directory to match its {@code package} declaration, only that the
 * directory be a configured source root; {@code build-helper-maven-plugin}'s
 * {@code add-test-source} goal adds {@code conformance/bundles} as exactly that kind
 * of additional root. The Java file name matches its public class name (a hard javac
 * requirement, unlike TS/Python): {@code <Stem>Steps.java}, where {@code <Stem>} is
 * the bundle's existing step-file stem PascalCased (e.g. {@code numerals.steps.ts} ->
 * {@code NumeralsSteps.java}).
 *
 * <p>Each bundle is a separately reported {@code @ParameterizedTest} case (not one loop
 * hiding failures behind the first mismatch), keyed by directory name.
 */
class ConformanceTest {

    // Maven runs tests with the module directory (java/varar/) as the working directory,
    // so the shared corpus — a sibling of java/, typescript/, python/ at the repo root —
    // is two levels up, same as var-core's own ConformanceTest.
    private static final Path BUNDLES_DIR = Paths.get("..", "..", "conformance", "bundles");

    static Stream<Named<Path>> bundleDirs() throws IOException {
        assertTrue(
                Files.isDirectory(BUNDLES_DIR), () -> "Expected conformance corpus at " + BUNDLES_DIR.toAbsolutePath());
        try (Stream<Path> entries = Files.list(BUNDLES_DIR)) {
            return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map(dir -> Named.of(dir.getFileName().toString(), dir))
                    .toList()
                    .stream();
        }
    }

    /**
     * Maps a bundle directory name to a fresh instance of its Java step-definition
     * fixture. A static switch (rather than reflective classloading by a computed
     * class name) keeps the bundle-to-fixture mapping explicit and compiler-checked —
     * every case is a real, statically resolved constructor call.
     */
    private static StepDefinitions loadFixture(String bundleName) {
        return switch (bundleName) {
            case "01-roman-numerals" -> new dev.varar.conformance.bundle01.NumeralsSteps();
            case "02-context-isolation" -> new dev.varar.conformance.bundle02.CounterSteps();
            case "03-expected-failure" -> new dev.varar.conformance.bundle03.DivisionSteps();
            case "04-tables-and-docstrings" -> new dev.varar.conformance.bundle04.EchoSteps();
            case "05-ambiguous-match" -> new dev.varar.conformance.bundle05.CukesSteps();
            case "06-doc-string-mismatch" -> new dev.varar.conformance.bundle06.EchoSteps();
            case "07-row-check-mismatch" -> new dev.varar.conformance.bundle07.ReportSteps();
            case "08-string-capture" -> new dev.varar.conformance.bundle08.GreetSteps();
            case "09-expected-message-mismatch" -> new dev.varar.conformance.bundle09.BoomSteps();
            case "10-error-fence-without-step" -> new dev.varar.conformance.bundle10.CukesSteps();
            case "11-emoji-offsets" -> new dev.varar.conformance.bundle11.GreetSteps();
            case "12-combining-marks" -> new dev.varar.conformance.bundle12.GreetSteps();
            case "13-custom-parameter-type" -> new dev.varar.conformance.bundle13.AirportsSteps();
            case "14-stateless-steps" -> new dev.varar.conformance.bundle14.SquaresSteps();
            case "15-custom-parameter-format" -> new dev.varar.conformance.bundle15.MoneySteps();
            case "16-stimulus-state-replacement" -> new dev.varar.conformance.bundle16.ReplaceSteps();
            case "17-unexpected-pass" -> new dev.varar.conformance.bundle17.QuietSteps();
            case "18-multi-table-example" -> new dev.varar.conformance.bundle18.BasketSteps();
            default -> throw new IllegalStateException("No Java step fixture registered for bundle " + bundleName);
        };
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    void registryMatchesGolden(Path bundle) throws IOException {
        String bundleName = bundle.getFileName().toString();
        StepDefinitions fixture = loadFixture(bundleName);

        Steps.Bound bound = Steps.bind(fixture);
        Registry registry = bound.registry();

        var artifact = Conformance.toRegistryArtifact(registry);
        String actual = CanonicalJson.canonicalStringify(artifact);
        String expected = Files.readString(bundle.resolve("golden").resolve("registry.json"), StandardCharsets.UTF_8);
        assertEquals(expected, actual, () -> bundle.getFileName() + "/registry.json mismatch");
    }

    /**
     * The Milestone 3 conformance gate: parses each bundle's {@code example.md}, builds its
     * {@link Registry} from its Java step-definition fixture (as {@link #registryMatchesGolden}
     * does), plans the two together via {@link Plan#plan}, projects the resulting {@link
     * Plan.ExecutionPlan} via {@link Conformance#toPlanArtifact}, and asserts byte-for-byte
     * equality with the committed {@code golden/plan.json}. Port of the plan stage of {@code
     * typescript/packages/varar/tests/conformance.test.ts} and {@code python/packages/varar/tests/
     * test_conformance.py::test_plan_matches_golden}.
     */
    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    void planMatchesGolden(Path bundle) throws IOException {
        String bundleName = bundle.getFileName().toString();
        StepDefinitions fixture = loadFixture(bundleName);

        Steps.Bound bound = Steps.bind(fixture);
        Registry registry = bound.registry();

        String source = Files.readString(bundle.resolve("example.md"), StandardCharsets.UTF_8);
        Ast.VarDoc doc = Parse.parse("example.md", source);
        Plan.ExecutionPlan plan = Plan.plan(doc, registry);

        var artifact = Conformance.toPlanArtifact(plan);
        String actual = CanonicalJson.canonicalStringify(artifact);
        String expected = Files.readString(bundle.resolve("golden").resolve("plan.json"), StandardCharsets.UTF_8);
        assertEquals(expected, actual, () -> bundle.getFileName() + "/plan.json mismatch");
    }

    /**
     * The Milestone 4 conformance gate — the final one: parses each bundle's {@code
     * example.md}, builds its {@link Registry} and initial-state {@link Supplier} from its Java
     * step-definition fixture (as {@link #planMatchesGolden} does, plus {@link
     * Steps.Bound#stateFactory()}), runs the whole plan via {@link
     * Conformance#runConformance}, and asserts byte-for-byte equality of the {@code trace}
     * artifact with the committed {@code golden/trace.json}. Port of the trace stage of {@code
     * typescript/packages/varar/tests/conformance.test.ts} and {@code python/packages/varar/tests/
     * test_conformance.py::test_trace_matches_golden}.
     *
     * <p>Kept as its own separately reported stage (mirroring the Python port and this class's
     * own {@code registryMatchesGolden}/{@code planMatchesGolden} precedent) rather than folding
     * all four artifacts into one combined assertion (TS's approach): a trace mismatch is then
     * never masked by an earlier var-doc/registry/plan pass, and this task doesn't need to
     * restructure two already-working, well-documented tests to land the final stage.
     */
    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    void traceMatchesGolden(Path bundle) throws IOException {
        String bundleName = bundle.getFileName().toString();
        StepDefinitions fixture = loadFixture(bundleName);

        Steps.Bound bound = Steps.bind(fixture);
        Registry registry = bound.registry();
        Supplier<? extends State> contextFactory = bound.stateFactory();

        String source = Files.readString(bundle.resolve("example.md"), StandardCharsets.UTF_8);
        Ast.VarDoc doc = Parse.parse("example.md", source);

        Conformance.BundleArtifacts artifacts = Conformance.runConformance(doc, registry, contextFactory);

        String actual = CanonicalJson.canonicalStringify(artifacts.trace());
        String expected = Files.readString(bundle.resolve("golden").resolve("trace.json"), StandardCharsets.UTF_8);
        assertEquals(expected, actual, () -> bundle.getFileName() + "/trace.json mismatch");
    }
}
