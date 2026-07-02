package com.oselvar.varkt.kotest

import com.oselvar.`var`.runner.Discovery
import com.oselvar.`var`.runner.Render
import com.oselvar.`var`.runner.Run
import com.oselvar.`var`.runner.StepLoader
import com.oselvar.`var`.runner.VarConfig
import io.kotest.core.spec.style.FunSpec
import java.nio.file.Files
import java.nio.file.Path
import java.util.Optional

/**
 * The Kotest adapter: subclass, point the three shared config keys
 * (var.vars.include / var.vars.exclude / var.steps — identical semantics to
 * var-junit's junit-platform.properties keys) at your specs and steps, and
 * every planned example becomes one Kotest test inside a per-spec-file
 * container. All discovery/loading/planning/failure-rendering is delegated to
 * var-runner — this class contains zero pipeline logic.
 *
 * v1 defers (matching var-pytest): no per-example fixture lifecycle, no
 * plan-diagnostic surfacing (var-junit DOES surface diagnostics via
 * ReportEntry — restoring that parity here is a known follow-up).
 *
 * @param root the directory the include/exclude globs resolve against
 *     (defaults to the module working directory).
 * @param lookup config-key lookup (defaults to JVM system properties, the
 *     top precedence tier var-junit's ConfigurationParameters also reads).
 */
abstract class VarSpec(
    root: Path = Path.of("."),
    lookup: (String) -> String? = { key -> System.getProperty(key) },
) : FunSpec() {

    init {
        val config = VarConfig.fromLookup { key -> Optional.ofNullable(lookup(key)) }
        val loaded = StepLoader.loadSteps(config.steps(), javaClass.classLoader)
        for (specPath in Discovery.findSpecs(config.varsInclude(), config.varsExclude(), root)) {
            val rel = root.toAbsolutePath().normalize()
                .relativize(specPath.toAbsolutePath().normalize())
                .toString()
                .replace('\\', '/')
            val source = Files.readString(specPath)
            val plan = Run.planSpec(rel, source, loaded.registry())
            val runs = Run.examplesWithRuns(plan, loaded.createContext(), Run.RecordingReporter())
            context(rel) {
                for (exampleRun in runs) {
                    test(exampleRun.example().name()) {
                        try {
                            exampleRun.run().run()
                        } catch (failure: Throwable) {
                            // Reuse the runner's span-anchored rendering — never
                            // re-derive failure text in an adapter.
                            throw AssertionError(Render.renderFailure(failure, source, rel), failure)
                        }
                    }
                }
            }
        }
    }
}
