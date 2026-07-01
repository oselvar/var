package com.oselvar.var.junit;

import com.oselvar.var.runner.StepLoader;
import com.oselvar.var.runner.VarConfig;
import org.junit.platform.commons.io.ResourceFilter;
import org.junit.platform.engine.EngineDiscoveryRequest;
import org.junit.platform.engine.support.discovery.DiscoveryIssueReporter;
import org.junit.platform.engine.support.discovery.EngineDiscoveryRequestResolver;

/**
 * Resolves an {@link EngineDiscoveryRequest}'s selectors into one {@link VarFileDescriptor} per
 * matching {@code .md} spec, added as a child of {@link VarEngineDescriptor}.
 *
 * <p>Built on {@code junit-platform-engine}'s real generic selector-resolution machinery
 * ({@link EngineDiscoveryRequestResolver}/{@code SelectorResolver}) rather than hand-dispatching
 * each {@code EngineDiscoveryRequest} selector kind manually — this is exactly what {@code
 * cucumber-junit-platform-engine}'s own {@code DiscoverySelectorResolver} does (confirmed by
 * reading both its source and the real {@code EngineDiscoveryRequestResolver}/{@code
 * SelectorResolver} sources, not assumed): build a resolver via {@code .builder()}, register a
 * handful of {@code SelectorResolver}s, call {@code .build().resolve(request, engineDescriptor,
 * issueReporter)} once. That one call drives a queue-based algorithm (see {@code
 * EngineDiscoveryRequestResolver#resolve}'s javadoc) that tries every registered resolver against
 * every selector — including selectors newly produced by a previous resolver's {@code
 * Resolution.selectors(...)} — until nothing new resolves. This is why a {@code
 * ClasspathRootSelector}/{@code PackageSelector}/{@code ModuleSelector} and a directly-supplied
 * {@code ClasspathResourceSelector}/{@code FileSelector}/{@code DirectorySelector} all end up
 * producing the same {@link VarFileDescriptor} shape without this class dispatching on selector
 * type itself:
 *
 * <ul>
 *   <li>{@code ClasspathRootSelector}/{@code ModuleSelector}/{@code PackageSelector} &rarr;
 *       {@code ClasspathResourceSelector} (candidate {@code .md} resources matching {@code
 *       var.vars.include}/{@code varsExclude()}) — the platform's own built-in {@code
 *       addResourceContainerSelectorResolver(ResourceFilter)}, which performs exactly this
 *       expansion generically (classpath/module/package scanning) for any engine; var supplies
 *       only the {@link ResourceFilter} predicate (delegating to {@code
 *       com.oselvar.var.runner.Discovery.matchSpec}).
 *   <li>{@code ClasspathResourceSelector}/{@code FileSelector}/{@code DirectorySelector} &rarr;
 *       one {@link VarFileDescriptor} (a directory first expands into candidate {@code
 *       FileSelector}s, which the same resolver then re-resolves) &mdash; {@link
 *       VarFileSelectorResolver}.
 * </ul>
 *
 * <p>var's needs are simpler than Cucumber's (no scenario-outline/rule/example nesting), so this
 * is deliberately ONE var-specific {@code SelectorResolver} class rather than Cucumber's several
 * (one per selector-kind concern) — there is no equivalent of Cucumber's separate {@code
 * FeatureWithLinesFileResolver}/{@code FeatureFileResolver} split to preserve.
 *
 * <p><strong>Task 9/10 split:</strong> {@link VarFileSelectorResolver} now also parses+plans each
 * resolved file's content (against the {@link StepLoader.LoadedSteps} threaded through this
 * class's constructor, loaded once per discovery pass by {@link VarTestEngine#discover}) and adds
 * one {@link VarExampleDescriptor} leaf per {@code PlannedExample} — closing the Task 9 gap where
 * a childless {@code VarFileDescriptor} container was silently pruned by the Launcher.
 *
 * <p>{@code UniqueIdSelector} (re-running a single file or example by id, standalone — no
 * accompanying file/classpath selector) is handled too, by {@code
 * VarFileSelectorResolver.resolve(UniqueIdSelector, Context)} — see that method's javadoc for the
 * file-vs-example distinction, and Task 17's fix for merging multiple bare {@code
 * UniqueIdSelector}s that target different examples in the same file into one container.
 */
final class DiscoverySelectorResolver {

    private final EngineDiscoveryRequestResolver<VarEngineDescriptor> resolver;

    DiscoverySelectorResolver(VarConfig config, StepLoader.LoadedSteps loadedSteps) {
        VarFileSelectorResolver fileSelectorResolver = new VarFileSelectorResolver(config, loadedSteps);
        this.resolver =
                EngineDiscoveryRequestResolver.<VarEngineDescriptor>builder()
                        .addResourceContainerSelectorResolver(
                                ResourceFilter.of(resource -> fileSelectorResolver.matchesSpec(resource.getName())))
                        .addSelectorResolver(fileSelectorResolver)
                        .build();
    }

    void resolveSelectors(
            EngineDiscoveryRequest request,
            VarEngineDescriptor engineDescriptor,
            DiscoveryIssueReporter issueReporter) {
        resolver.resolve(request, engineDescriptor, issueReporter);
    }
}
