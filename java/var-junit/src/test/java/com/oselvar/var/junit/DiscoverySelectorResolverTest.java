package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectPackage;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;

/**
 * Proves {@link DiscoverySelectorResolver} (wired via {@link VarTestEngine#discover}) resolves a
 * {@code PackageSelector} — which expands to a {@code ClasspathResourceSelector} per resource,
 * via {@code junit-platform-engine}'s own {@code addResourceContainerSelectorResolver} — into
 * exactly one {@link VarFileDescriptor} container per {@code .md} resource matching {@code
 * docsInclude} minus {@code docsExclude}, not one for every {@code .md} resource on
 * the classpath.
 *
 * <p>Fixture: {@code src/test/resources/discoveryfixture/included.md} and {@code
 * .../excluded.md} — both match {@code docs.include=["discoveryfixture/**\/*.md"]}, but only
 * {@code included.md} survives {@code docs.exclude=["**\/excluded.md"]}.
 *
 * <p><strong>Why this calls {@link VarTestEngine#discover} directly instead of going through
 * {@code EngineTestKit.engine("var")...discover()}/{@code .execute()}:</strong> both of those
 * convenience entry points route through {@code
 * org.junit.platform.launcher.core.EngineDiscoveryOrchestrator}, which — confirmed by reading its
 * source and {@code TestDescriptor#prune()}'s default implementation
 * (({@code if (!isRoot() && !containsTests(this)) removeFromHierarchy();})) — <em>prunes every
 * non-root container with no test descendants</em> after discovery. A {@link VarFileDescriptor}
 * has {@code Type.CONTAINER} and, in this task, deliberately no children yet (leaf {@code
 * VarExampleDescriptor}s are the next task), so it is exactly the kind of node the Launcher
 * prunes — an {@code EngineTestKit}-routed assertion would see zero children regardless of
 * whether this resolver worked correctly (verified empirically: it does, in isolation, produce
 * the container; only the Launcher's own pruning removes it). Calling {@link
 * VarTestEngine#discover} directly with a real {@link LauncherDiscoveryRequest} (which IS an
 * {@code EngineDiscoveryRequest} — {@code LauncherDiscoveryRequest extends
 * EngineDiscoveryRequest}) exercises the exact same production code this task is responsible
 * for, without the orthogonal, unrelated Launcher-level pruning concern the next task resolves by
 * giving every container at least one child.
 */
class DiscoverySelectorResolverTest {

    @Test
    void resolvesOneContainerPerMatchingSpecResource(@TempDir Path workspace) throws Exception {
        Files.writeString(workspace.resolve("var.config.json"), """
                { "docs": { "include": ["discoveryfixture/**/*.md"], "exclude": ["**/excluded.md"] } }
                """, StandardCharsets.UTF_8);
        LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request()
                .selectors(selectPackage("discoveryfixture"))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .build();

        TestDescriptor engineDescriptor = new VarTestEngine().discover(request, UniqueId.forEngine("var"));
        List<? extends TestDescriptor> children = List.copyOf(engineDescriptor.getChildren());

        assertEquals(1, children.size(), "expected exactly one container for the included spec");

        TestDescriptor specDescriptor = children.get(0);
        assertEquals(TestDescriptor.Type.CONTAINER, specDescriptor.getType());
        assertEquals("discoveryfixture/included.md", specDescriptor.getDisplayName());

        UniqueId.Segment lastSegment = specDescriptor.getUniqueId().getLastSegment();
        assertEquals("spec", lastSegment.getType());
        assertEquals("discoveryfixture/included.md", lastSegment.getValue());

        assertTrue(specDescriptor.getChildren().isEmpty(), "Task 9 creates containers only, no example leaves yet");
    }

    @Test
    void noSelectorsMatchWhenIncludeIsEmpty() {
        LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request()
                .selectors(selectPackage("discoveryfixture"))
                .build();

        TestDescriptor engineDescriptor = new VarTestEngine().discover(request, UniqueId.forEngine("var"));

        assertTrue(
                engineDescriptor.getChildren().isEmpty(),
                "an empty docsInclude must discover nothing, per CLAUDE.md's include-has-no-default rule");
    }
}
