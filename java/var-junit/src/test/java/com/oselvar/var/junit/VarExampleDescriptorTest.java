package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClasspathResource;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectFile;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectUniqueId;

import com.oselvar.var.junit.fixtures.WidgetSteps;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.ClasspathResourceSource;
import org.junit.platform.engine.support.descriptor.FilePosition;
import org.junit.platform.engine.support.descriptor.FileSource;
import org.junit.platform.testkit.engine.EngineDiscoveryResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Proves Task 10's leaf descriptor tree: one {@link VarExampleDescriptor} per {@code
 * Plan.PlannedExample}, a {@link TestDescriptor.Type#TEST} child of its {@link
 * VarFileDescriptor}, with a {@code UniqueId} keyed by the example's source line — not its
 * Markdown-derived display name.
 *
 * <p><strong>Uses the real {@code EngineTestKit.engine("var")...discover()} path</strong>
 * (unlike {@code DiscoverySelectorResolverTest}, which had to call {@link
 * VarTestEngine#discover} directly to dodge the Launcher's {@code
 * EngineDiscoveryOrchestrator}, which {@linkplain TestDescriptor#prune() prunes} every
 * non-root, childless container after discovery — Task 9's containers had no children yet).
 * Confirmed here: now that every {@link VarFileDescriptor} gets at least one {@link
 * VarExampleDescriptor} child, it is never pruned, so the ordinary, realistic {@code
 * EngineTestKit} entry point works cleanly — Task 9's pruning finding is resolved by this task,
 * as the plan predicted.
 */
class VarExampleDescriptorTest {

    private static final String STEPS = WidgetSteps.class.getName();

    private static void writeConfig(Path workspace, String docsInclude) throws Exception {
        Files.writeString(
                workspace.resolve("var.config.json"), """
                {
                  "docs": { "include": ["%s"], "exclude": [] },
                  "steps": ["%s"]
                }
                """.formatted(docsInclude, STEPS), StandardCharsets.UTF_8);
    }

    private static EngineDiscoveryResults discoverWidgets(Path workspace) throws Exception {
        writeConfig(workspace, "examplefixture/**/*.md");
        return EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/widgets.md"))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .discover();
    }

    private static TestDescriptor onlyFileDescriptor(TestDescriptor engineDescriptor) {
        List<? extends TestDescriptor> children = List.copyOf(engineDescriptor.getChildren());
        assertEquals(1, children.size(), "expected exactly one spec container");
        return children.get(0);
    }

    @Test
    void twoExampleFileDiscoversTwoLeavesWithLineBasedUniqueIdsAndSource(@TempDir Path workspace) throws Exception {
        TestDescriptor engineDescriptor = discoverWidgets(workspace).getEngineDescriptor();
        TestDescriptor fileDescriptor = onlyFileDescriptor(engineDescriptor);
        assertEquals(TestDescriptor.Type.CONTAINER, fileDescriptor.getType());

        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(2, examples.size(), "widgets.md has two step-matched examples");

        // examplefixture/widgets.md: "I have 3 widgets. ..." starts on line 3, "I have 9
        // widgets. ..." on line 7 (confirmed directly against Run.planSpec's own
        // PlannedExample#span#startLine for this exact file content, not guessed).
        assertExampleLeaf(examples.get(0), 3);
        assertExampleLeaf(examples.get(1), 7);
    }

    private static void assertExampleLeaf(TestDescriptor example, int expectedLine) {
        assertEquals(TestDescriptor.Type.TEST, example.getType());

        UniqueId.Segment lastSegment = example.getUniqueId().getLastSegment();
        assertEquals("example", lastSegment.getType());
        assertEquals(String.valueOf(expectedLine), lastSegment.getValue());

        FilePosition position = example.getSource()
                .map(source -> {
                    if (source instanceof ClasspathResourceSource crs) {
                        return crs.getPosition().orElse(null);
                    }
                    if (source instanceof FileSource fs) {
                        return fs.getPosition().orElse(null);
                    }
                    return null;
                })
                .orElse(null);
        assertEquals(FilePosition.from(expectedLine), position);
    }

    @Test
    void selectingOneLeafByUniqueIdDiscoversOnlyThatOne(@TempDir Path workspace) throws Exception {
        TestDescriptor wholeFileEngine = discoverWidgets(workspace).getEngineDescriptor();
        TestDescriptor fileDescriptor = onlyFileDescriptor(wholeFileEngine);
        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        TestDescriptor targetLeaf = examples.get(0);
        TestDescriptor otherLeaf = examples.get(1);
        assertNotEquals(targetLeaf.getUniqueId(), otherLeaf.getUniqueId());

        EngineDiscoveryResults singleSelection = EngineTestKit.engine("var")
                .selectors(selectUniqueId(targetLeaf.getUniqueId()))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .discover();

        TestDescriptor engineDescriptor = singleSelection.getEngineDescriptor();
        TestDescriptor selectedFile = onlyFileDescriptor(engineDescriptor);
        List<? extends TestDescriptor> selectedExamples = List.copyOf(selectedFile.getChildren());

        assertEquals(1, selectedExamples.size(), "selecting one example's UniqueId must not pull in its siblings");
        assertEquals(targetLeaf.getUniqueId(), selectedExamples.get(0).getUniqueId());
    }

    /**
     * Task 17: selecting TWO DIFFERENT examples from the SAME file via two bare {@code
     * UniqueIdSelector}s (no accompanying file/classpath selector) — the shape an IDE's "run these
     * N selected tests" could plausibly emit — must merge into ONE container with BOTH examples as
     * children, not two single-child containers (the originally suspected bug) and not silently
     * lose the second example (what direct experimentation against the pre-fix code actually
     * showed: {@code VarFileSelectorResolver.resolveOneExample} built a fresh {@link
     * VarFileDescriptor} on every call, which fell victim to {@code
     * AbstractTestDescriptor}'s children {@code Set} silently no-op'ing on a same-{@code UniqueId},
     * different-object add — see {@code VarFileSelectorResolver.resolve(UniqueIdSelector, Context)}'s
     * javadoc for the full mechanism).
     */
    @Test
    void selectingTwoDifferentExamplesByBareUniqueIdMergesIntoOneContainerWithBothChildren(@TempDir Path workspace)
            throws Exception {
        TestDescriptor wholeFileEngine = discoverWidgets(workspace).getEngineDescriptor();
        TestDescriptor fileDescriptor = onlyFileDescriptor(wholeFileEngine);
        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        UniqueId line3 = examples.get(0).getUniqueId();
        UniqueId line7 = examples.get(1).getUniqueId();
        assertNotEquals(line3, line7);

        EngineDiscoveryResults twoSelectors = EngineTestKit.engine("var")
                .selectors(selectUniqueId(line3), selectUniqueId(line7))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .discover();

        List<? extends TestDescriptor> topLevel =
                List.copyOf(twoSelectors.getEngineDescriptor().getChildren());
        assertEquals(
                1,
                topLevel.size(),
                "both selectors target the same file -- exactly one container, not two, and not zero");

        TestDescriptor mergedFile = topLevel.get(0);
        assertEquals("examplefixture/widgets.md", mergedFile.getDisplayName());
        List<? extends TestDescriptor> mergedExamples = List.copyOf(mergedFile.getChildren());
        assertEquals(2, mergedExamples.size(), "both selected examples must be children of the ONE container");
        assertEquals(
                Set.of(line3, line7),
                mergedExamples.stream().map(TestDescriptor::getUniqueId).collect(Collectors.toSet()),
                "the merged container's two children must be exactly the two selected examples");
    }

    @Test
    void uniqueIdIsLineBasedNotNameBased(@TempDir Path workspace) throws Exception {
        // Same step-bearing paragraph position (line 3 in both files), deliberately different
        // leading narration ("Setup complete. ") so Plan's deriveExampleName (first sentence of
        // the example's body) differs between the two files -- proving the UniqueId tracks the
        // example's *position*, not its Markdown-derived display text (the exact risk the design
        // doc flags: an author editing wording must not change a UniqueId, or UniqueIdSelector
        // re-run-single-test silently breaks).
        TestDescriptor wordingA = discoverOneFile(workspace, "examplefixture/wording-a.md");
        TestDescriptor wordingB = discoverOneFile(workspace, "examplefixture/wording-b.md");

        TestDescriptor exampleA = onlyExample(wordingA);
        TestDescriptor exampleB = onlyExample(wordingB);

        assertNotEquals(
                exampleA.getDisplayName(),
                exampleB.getDisplayName(),
                "sanity check: the fixtures really do produce different display names");
        assertEquals(
                exampleA.getUniqueId().getLastSegment(),
                exampleB.getUniqueId().getLastSegment(),
                "the \"example\" UniqueId segment (line-based) must be identical despite the wording change");
        assertEquals("3", exampleA.getUniqueId().getLastSegment().getValue());
    }

    private static TestDescriptor discoverOneFile(Path workspace, String classpathResource) throws Exception {
        writeConfig(workspace, "examplefixture/**/*.md");
        EngineDiscoveryResults results = EngineTestKit.engine("var")
                .selectors(selectClasspathResource(classpathResource))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .discover();
        return onlyFileDescriptor(results.getEngineDescriptor());
    }

    private static TestDescriptor onlyExample(TestDescriptor fileDescriptor) {
        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(1, examples.size());
        return examples.get(0);
    }

    @Test
    void noSelectorsMatchWhenIncludeIsEmpty() {
        // Same guarantee as Task 9's discovery-level test, still true now that files get real
        // children: with no var.config.root parameter, ConfigBridge falls back to the JVM
        // working directory (java/var-junit under this module's own `mvn test`), which has no
        // var.config.json -- so docsInclude defaults to empty and nothing is discovered at all,
        // not merely "no examples inside an empty container".
        EngineDiscoveryResults results = EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/widgets.md"))
                .discover();
        assertTrue(results.getEngineDescriptor().getChildren().isEmpty());
    }

    @Test
    void fileDescriptorTypeIsStillContainer(@TempDir Path workspace) throws Exception {
        TestDescriptor fileDescriptor = discoverOneFile(workspace, "examplefixture/widgets.md");
        assertInstanceOf(TestDescriptor.class, fileDescriptor);
        assertEquals(TestDescriptor.Type.CONTAINER, fileDescriptor.getType());
    }

    /**
     * {@code DiscoverySelectorResolverTest} only ever exercises the classpath-resource branch
     * (via {@code selectPackage} &rarr; {@code ClasspathResourceSelector}); a real {@code
     * FileSelector} — Maven Surefire's own default when it walks {@code src/test/resources}
     * directly, and what an IDE passes for "run this file" on a plain filesystem path — hits an
     * entirely different branch in {@code VarFileSelectorResolver} ({@code readFile}/{@code
     * FileSource}, not {@code readClasspathResource}/{@code ClasspathResourceSource}). This test
     * exercises that branch directly, so it isn't accidentally only proven for classpath
     * resources.
     */
    @Test
    void realFileSelectorAlsoProducesLeavesWithFileSourcePositions(@TempDir Path workspace) throws Exception {
        Path widgetsFile =
                Path.of("src/test/resources/examplefixture/widgets.md").toAbsolutePath();
        assertTrue(Files.isRegularFile(widgetsFile), "fixture must exist on disk for this FileSelector-based test");

        // docs globs resolve against the config root (the workspace), not the JVM
        // working directory — so the include is the fixture's workspace-relative path.
        String docsInclude = workspace
                .toAbsolutePath()
                .normalize()
                .relativize(widgetsFile.normalize())
                .toString()
                .replace('\\', '/');
        writeConfig(workspace, docsInclude);
        EngineDiscoveryResults results = EngineTestKit.engine("var")
                .selectors(selectFile(widgetsFile.toFile()))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .discover();

        TestDescriptor fileDescriptor = onlyFileDescriptor(results.getEngineDescriptor());
        assertInstanceOf(FileSource.class, fileDescriptor.getSource().orElseThrow());

        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(2, examples.size());
        assertExampleLeaf(examples.get(0), 3);
        assertExampleLeaf(examples.get(1), 7);

        // The bare-UniqueId single-leaf-selection path must also exclude siblings for a real
        // (non-classpath) file, not just the classpath-resource case tested above.
        UniqueId targetId = examples.get(0).getUniqueId();
        EngineDiscoveryResults singleSelection = EngineTestKit.engine("var")
                .selectors(selectUniqueId(targetId))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .discover();
        TestDescriptor selectedFile = onlyFileDescriptor(singleSelection.getEngineDescriptor());
        assertEquals(1, selectedFile.getChildren().size());
        assertEquals(targetId, selectedFile.getChildren().iterator().next().getUniqueId());
    }
}
