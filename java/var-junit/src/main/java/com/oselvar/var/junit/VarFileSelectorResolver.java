package com.oselvar.var.junit;

import com.oselvar.var.core.Plan;
import com.oselvar.var.runner.Discovery;
import com.oselvar.var.runner.Run;
import com.oselvar.var.runner.StepLoader;
import com.oselvar.var.runner.VarConfig;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.platform.engine.DiscoverySelector;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.discovery.ClasspathResourceSelector;
import org.junit.platform.engine.discovery.DirectorySelector;
import org.junit.platform.engine.discovery.DiscoverySelectors;
import org.junit.platform.engine.discovery.FileSelector;
import org.junit.platform.engine.discovery.UniqueIdSelector;
import org.junit.platform.engine.support.descriptor.ClasspathResourceSource;
import org.junit.platform.engine.support.descriptor.FilePosition;
import org.junit.platform.engine.support.descriptor.FileSource;
import org.junit.platform.engine.support.discovery.SelectorResolver;

/**
 * Resolves the file-shaped selectors that {@code ClasspathRootSelector}/{@code
 * PackageSelector}/{@code ModuleSelector} are reduced to (see {@link
 * DiscoverySelectorResolver}), plus {@code FileSelector}/{@code DirectorySelector} given
 * directly, into one {@link VarFileDescriptor} per {@code .md} resource/file matching {@code
 * config.varsInclude()}/{@code varsExclude()} — ported from {@code
 * cucumber-junit-platform-engine}'s {@code FeatureFileResolver} (classpath-resource case) and
 * {@code FileContainerSelectorResolver} (directory-expansion case), ONE {@code SelectorResolver}
 * covering both because var, unlike Cucumber, has no scenario-outline/rule nesting to warrant
 * splitting concerns across several resolver classes.
 *
 * <p>Filesystem-based selectors ({@link FileSelector}/{@link DirectorySelector}) are relativized
 * against the current working directory (the module's base directory under Maven/Gradle
 * Surefire) since no {@code var.root} configuration key exists yet — flagged as a follow-up if a
 * real caller ever needs a different root.
 *
 * <p><strong>Task 10:</strong> once a resolved selector's {@code specPath}/{@code TestSource} is
 * known, this resolver also reads that file's actual text ({@link #readContent}), plans it against
 * the {@link StepLoader.LoadedSteps} threaded through the constructor (loaded once per discovery
 * pass by {@link VarTestEngine#discover}, not per file — see {@link VarEngineDescriptor}'s
 * javadoc), and adds one {@link VarExampleDescriptor} leaf per {@link Plan.PlannedExample} as a
 * child of the {@link VarFileDescriptor} it creates.
 *
 * <p><strong>Task 17:</strong> {@link #fileDescriptors} caches the one {@link VarFileDescriptor}
 * built per {@code specPath}, for the lifetime of this resolver instance — one discovery pass (see
 * {@link DiscoverySelectorResolver}'s constructor, which builds a fresh {@link
 * VarFileSelectorResolver} per {@code EngineDiscoveryRequestResolver}, itself built fresh per
 * {@link VarTestEngine#discover} call). Without it, resolving two bare {@code UniqueIdSelector}s
 * for two different examples in the same file — no accompanying file/classpath selector — silently
 * dropped the second example from the discovered tree entirely (see {@link #resolveOneExample}'s
 * javadoc for why, and why it wasn't "two containers" as first suspected).
 */
final class VarFileSelectorResolver implements SelectorResolver {

    private final VarConfig config;
    private final StepLoader.LoadedSteps loadedSteps;
    private final Path root = Path.of("").toAbsolutePath().normalize();

    /**
     * One {@link VarFileDescriptor} per {@code specPath}, reused across every {@code resolve(...)}
     * call in this discovery pass (Task 17) — see this class's javadoc.
     */
    private final Map<String, VarFileDescriptor> fileDescriptors = new HashMap<>();

    VarFileSelectorResolver(VarConfig config, StepLoader.LoadedSteps loadedSteps) {
        this.config = config;
        this.loadedSteps = loadedSteps;
    }

    /** Whether a classpath resource name (already relative, POSIX-separated) is a spec. */
    boolean matchesSpec(String resourceName) {
        return Discovery.matchSpec(
                Path.of(resourceName), config.varsInclude(), config.varsExclude(), Path.of(""));
    }

    @Override
    public Resolution resolve(ClasspathResourceSelector selector, Context context) {
        String name = selector.getClasspathResourceName();
        if (!matchesSpec(name)) {
            return Resolution.unresolved();
        }
        return toResolution(context, name, ClasspathResourceSource.from(name));
    }

    @Override
    public Resolution resolve(DirectorySelector selector, Context context) {
        Path dir = selector.getPath();
        if (!Files.isDirectory(dir)) {
            return Resolution.unresolved();
        }
        Set<DiscoverySelector> selectors = new HashSet<>();
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".md"))
                    .forEach(p -> selectors.add(DiscoverySelectors.selectFile(p.toFile())));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (selectors.isEmpty()) {
            return Resolution.unresolved();
        }
        return Resolution.selectors(selectors);
    }

    @Override
    public Resolution resolve(FileSelector selector, Context context) {
        Path path = selector.getPath();
        if (!Discovery.matchSpec(path, config.varsInclude(), config.varsExclude(), root)) {
            return Resolution.unresolved();
        }
        String relPath = root.relativize(path.toAbsolutePath().normalize()).toString().replace('\\', '/');
        return toResolution(context, relPath, FileSource.from(path.toFile()));
    }

    /**
     * Round-trips a {@link UniqueIdSelector} for one of our own descriptors (file or example) back
     * into a fresh discovery, so {@code UniqueIdSelector}-only requests (an IDE's "re-run this
     * test" action) work standalone, without an accompanying file/classpath selector.
     *
     * <p>Framework mechanics (confirmed by reading {@code EngineDiscoveryRequestResolution}'s
     * source): a bare {@code UniqueIdSelector} is NOT specially expanded by the platform itself —
     * a {@code SelectorResolver} must explicitly resolve it, or it is left unresolved.
     *
     * <ul>
     *   <li>A file-level {@code UniqueId} (no {@code "example"} segment) round-trips through {@link
     *       #fileSelectorFor}/{@link Context#resolve(DiscoverySelector)} exactly like a direct
     *       file/classpath selector — every example, since selecting the whole file means "run all
     *       of it".
     *   <li>An example-level {@code UniqueId} plans the file (unavoidable — {@code var-core}'s
     *       {@code Plan.plan} is whole-document, not per-example) but adds <strong>only</strong> the
     *       one matching {@link Plan.PlannedExample} as the container's child, via {@link
     *       #createDescriptor(TestDescriptor, String, TestSource, Integer)}'s {@code onlyLine}
     *       filter — so "discover only that one" holds: no sibling leaves appear in the tree, unlike
     *       naively resolving the whole file and picking one descriptor back out of it.
     * </ul>
     *
     * <p><strong>Task 17 — the multi-selector merge gap (was believed to produce two containers;
     * confirmed by direct experiment to actually be worse — silent loss):</strong> selecting two
     * <em>different</em> examples from the <em>same</em> file via two bare {@code UniqueIdSelector}s
     * in one request, with no accompanying file/classpath selector, used to build a brand-new {@link
     * VarFileDescriptor} object on every call. The real {@code
     * EngineDiscoveryRequestResolution.DefaultContext#createAndAdd} (decompiled/read from {@code
     * junit-platform-engine-6.1.1-sources.jar}) only substitutes a previously-added descriptor for a
     * colliding {@code UniqueId} when that id was already registered via a {@code Resolution}'s
     * {@code Match} — and the {@code Match} this method returns wraps the <em>example</em>
     * descriptor, never the file descriptor itself, so the file's own {@code UniqueId} is never in
     * that registry. The second call's freshly-built {@link VarFileDescriptor} (with the second
     * example as its only child) therefore fell through to a plain {@code
     * parent.addChild(secondDescriptor)} — and since {@link
     * org.junit.platform.engine.support.descriptor.AbstractTestDescriptor}'s children are stored in
     * a {@code Set} keyed by {@code UniqueId} equality, adding a second, different object with the
     * <em>same</em> {@code UniqueId} as the first is a silent no-op: the second object never actually
     * joins the real tree rooted at the engine descriptor, even though {@code addChild} unconditionally
     * points its {@code parent} field back at the engine descriptor (a dangling, unreachable object).
     * Net effect, confirmed empirically before this fix: exactly ONE container reaches the final tree,
     * with only the FIRST selector's example as its child — the second example silently vanishes, no
     * exception, no duplicate.
     *
     * <p>The fix: {@link #fileDescriptors} caches the one {@link VarFileDescriptor} built per {@code
     * specPath} for this resolver's lifetime (one discovery pass). A later call for the same {@code
     * specPath} reuses that exact object and adds the newly-requested example as an additional child
     * of it, via {@link #createDescriptor}/{@link #mergeChildren} — so {@code
     * context.addToParent}'s eventual {@code parent.addChild(...)} re-adds the very same object
     * already wired into the tree (a genuine no-op, not a silently-discarded duplicate), and the new
     * child is reachable because it was added to the object that IS in the tree, not a throwaway
     * clone of it.
     */
    @Override
    public Resolution resolve(UniqueIdSelector selector, Context context) {
        UniqueId uniqueId = selector.getUniqueId();
        Optional<String> specPath = segmentValue(uniqueId, VarFileDescriptor.SEGMENT_TYPE);
        if (specPath.isEmpty()) {
            return Resolution.unresolved();
        }
        Optional<String> exampleLine = segmentValue(uniqueId, VarExampleDescriptor.SEGMENT_TYPE);
        if (exampleLine.isEmpty()) {
            return context.resolve(fileSelectorFor(specPath.get()))
                    .map(Match::exact)
                    .map(Resolution::match)
                    .orElseGet(Resolution::unresolved);
        }
        return resolveOneExample(context, specPath.get(), exampleLine.get());
    }

    private Resolution resolveOneExample(Context context, String specPath, String lineValue) {
        int line;
        try {
            line = Integer.parseInt(lineValue);
        } catch (NumberFormatException e) {
            return Resolution.unresolved();
        }
        DiscoverySelector fileSelector = fileSelectorFor(specPath);
        if (!matchesFileSelector(fileSelector)) {
            return Resolution.unresolved();
        }
        TestSource source = sourceForSelector(fileSelector);
        Optional<VarFileDescriptor> fileDescriptor =
                context.addToParent(parent -> Optional.of(createDescriptor(parent, specPath, source, line)));
        // Task 17: look up the child that matches THIS call's line, rather than blindly taking
        // getChildren()'s first entry — once the cache (below) lets a second resolveOneExample call
        // for the same file return the SAME, now-two-child VarFileDescriptor, "first child" would
        // incorrectly re-resolve to the FIRST example again for every subsequent selector.
        return fileDescriptor
                .flatMap(fd -> childForLine(fd, line))
                .map(Match::exact)
                .map(Resolution::match)
                .orElseGet(Resolution::unresolved);
    }

    /** The child of {@code fileDescriptor} whose {@code UniqueId} last segment is {@code line}. */
    private static Optional<? extends TestDescriptor> childForLine(VarFileDescriptor fileDescriptor, int line) {
        String value = String.valueOf(line);
        return fileDescriptor.getChildren().stream()
                .filter(child -> value.equals(child.getUniqueId().getLastSegment().getValue()))
                .findFirst();
    }

    private static Optional<String> segmentValue(UniqueId uniqueId, String segmentType) {
        for (UniqueId.Segment segment : uniqueId.getSegments()) {
            if (segmentType.equals(segment.getType())) {
                return Optional.of(segment.getValue());
            }
        }
        return Optional.empty();
    }

    /**
     * Reconstructs the same selector kind {@link #resolve(FileSelector, Context)}/{@link
     * #resolve(ClasspathResourceSelector, Context)} would have been given for {@code specPath} —
     * a real file on disk (relative to {@link #root}) if one exists there, a classpath resource
     * otherwise (mirrors how a Maven/Gradle test-resource's classpath copy lives under {@code
     * target/test-classes}, NOT under {@code root}, so this check never misclassifies one as the
     * other).
     */
    private DiscoverySelector fileSelectorFor(String specPath) {
        Path candidate = root.resolve(specPath);
        if (Files.isRegularFile(candidate)) {
            return DiscoverySelectors.selectFile(candidate.toFile());
        }
        return DiscoverySelectors.selectClasspathResource(specPath);
    }

    /** The same {@code var.vars.include}/{@code varsExclude()} guard {@link #resolve} methods apply. */
    private boolean matchesFileSelector(DiscoverySelector selector) {
        if (selector instanceof FileSelector fileSelector) {
            return Discovery.matchSpec(fileSelector.getPath(), config.varsInclude(), config.varsExclude(), root);
        }
        if (selector instanceof ClasspathResourceSelector classpathSelector) {
            return matchesSpec(classpathSelector.getClasspathResourceName());
        }
        return false;
    }

    private static TestSource sourceForSelector(DiscoverySelector selector) {
        if (selector instanceof FileSelector fileSelector) {
            return FileSource.from(fileSelector.getPath().toFile());
        }
        if (selector instanceof ClasspathResourceSelector classpathSelector) {
            return ClasspathResourceSource.from(classpathSelector.getClasspathResourceName());
        }
        throw new IllegalStateException("unsupported selector: " + selector);
    }

    private Resolution toResolution(Context context, String specPath, TestSource source) {
        return context.addToParent(parent -> Optional.of(createDescriptor(parent, specPath, source, null)))
                .map(Match::exact)
                .map(Resolution::match)
                .orElseGet(Resolution::unresolved);
    }

    /**
     * Returns the ONE {@link VarFileDescriptor} for {@code specPath} within this discovery pass —
     * from {@link #fileDescriptors} if a previous call (for this or a different example/selector)
     * already built it, otherwise a freshly-planned one, cached for every subsequent call. Either
     * way, ensures a {@link VarExampleDescriptor} child exists for every {@link Plan.PlannedExample}
     * matching {@code onlyLine} (or, if {@code onlyLine} is {@code null}, every example in the
     * file) — via {@link #mergeChildren} — WITHOUT discarding children a previous call already
     * added. This is the Task 17 fix: reusing the same object, rather than building a new one per
     * call, is what lets a second bare {@code UniqueIdSelector} for a different example in the same
     * file add a sibling instead of silently vanishing (see {@link #resolveOneExample}'s javadoc).
     */
    private VarFileDescriptor createDescriptor(
            TestDescriptor parent, String specPath, TestSource source, Integer onlyLine) {
        VarFileDescriptor existing = fileDescriptors.get(specPath);
        if (existing != null) {
            mergeChildren(existing, source, onlyLine);
            return existing;
        }
        UniqueId uniqueId = parent.getUniqueId().append(VarFileDescriptor.SEGMENT_TYPE, specPath);
        String content = readContent(source);
        Plan.ExecutionPlan plan = Run.planSpec(specPath, content, loadedSteps.registry());
        VarFileDescriptor fileDescriptor = new VarFileDescriptor(uniqueId, specPath, source, content, loadedSteps, plan);
        mergeChildren(fileDescriptor, source, onlyLine);
        fileDescriptors.put(specPath, fileDescriptor);
        return fileDescriptor;
    }

    /**
     * Adds one {@link VarExampleDescriptor} child to {@code fileDescriptor} per {@link
     * Plan.PlannedExample} matching {@code onlyLine} (every example, if {@code onlyLine} is {@code
     * null}) that isn't ALREADY one of its children — the "already a child" check is what makes this
     * safe to call repeatedly on the same, cached {@code fileDescriptor} across several {@code
     * resolve(...)} calls in one discovery pass, adding only the genuinely new sibling each time
     * rather than re-adding (or duplicating) ones a previous call already attached.
     */
    private void mergeChildren(VarFileDescriptor fileDescriptor, TestSource source, Integer onlyLine) {
        Set<String> existingLines = new HashSet<>();
        for (TestDescriptor child : fileDescriptor.getChildren()) {
            existingLines.add(child.getUniqueId().getLastSegment().getValue());
        }
        for (Plan.PlannedExample example : fileDescriptor.plan().examples()) {
            int line = example.span().startLine();
            if (onlyLine != null && line != onlyLine) {
                continue;
            }
            if (existingLines.contains(String.valueOf(line))) {
                continue;
            }
            fileDescriptor.addChild(createExampleDescriptor(fileDescriptor, source, example));
        }
    }

    private VarExampleDescriptor createExampleDescriptor(
            VarFileDescriptor fileDescriptor, TestSource fileSource, Plan.PlannedExample example) {
        int line = example.span().startLine();
        UniqueId uniqueId =
                fileDescriptor.getUniqueId().append(VarExampleDescriptor.SEGMENT_TYPE, String.valueOf(line));
        return new VarExampleDescriptor(uniqueId, example.name(), withLine(fileSource, line), example);
    }

    /** Returns a copy of {@code fileSource} pointing at {@code line} (1-based), for IDE navigation. */
    private static TestSource withLine(TestSource fileSource, int line) {
        FilePosition position = FilePosition.from(line);
        if (fileSource instanceof ClasspathResourceSource crs) {
            return ClasspathResourceSource.from(crs.getClasspathResourceName(), position);
        }
        if (fileSource instanceof FileSource fs) {
            return FileSource.from(fs.getFile(), position);
        }
        // Every TestSource this resolver ever constructs (toResolution's two call sites) is one
        // of the two cases above; a third kind would be a bug in this class, not a runtime input.
        throw new IllegalStateException("unsupported TestSource: " + fileSource);
    }

    /** Reads a resolved spec's actual text — the classpath-resource or real-file case. */
    private static String readContent(TestSource source) {
        if (source instanceof ClasspathResourceSource crs) {
            return readClasspathResource(crs.getClasspathResourceName());
        }
        if (source instanceof FileSource fs) {
            return readFile(fs.getFile().toPath());
        }
        throw new IllegalStateException("unsupported TestSource: " + source);
    }

    private static String readClasspathResource(String name) {
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        try (InputStream in = loader.getResourceAsStream(name)) {
            if (in == null) {
                throw new UncheckedIOException(new IOException("classpath resource not found: " + name));
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String readFile(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
