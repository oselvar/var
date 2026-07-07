@file:JvmName("DefineState")
// File annotation: the capturing-arity overloads below are top-level extension
// functions, so their frames belong to THIS file's facade class — annotate it
// so RegistryRegistrar's StackWalker attributes registrations to the author's
// call site, exactly as the @RegistrarGlue on StepsScope does for the members.
@file:RegistrarGlue

package com.oselvar.varkt

import com.oselvar.`var`.RegistrarGlue
import com.oselvar.`var`.State
import com.oselvar.`var`.StateBinder
import com.oselvar.`var`.StepDefinitions
import java.util.function.Function
import java.util.function.Supplier
import kotlinx.coroutines.runBlocking

/**
 * Bridges an author's bare data-class state into the Java engine's `C extends State` bound: the
 * factory boxes, every wrapped handler unboxes to invoke the author lambda with the state as
 * receiver, and reboxes the result. Never visible outside this module.
 */
internal class StateBox<C : Any>(val value: C) : State

/**
 * The var-kotlin author entry point. Returns an INERT, replayable [StepDefinitions]: nothing
 * registers when a top-level `val stepDefs = steps(::Ctx) { … }` initializes — the block is stored
 * and replayed against whatever fresh `Registrar` the runner injects via
 * [StepDefinitions.defineSteps]. This keeps the Java port's rule that mutable accumulation lives in
 * the shell, never in a facade-global (see Registrar's javadoc), while giving Kotlin authors a
 * file-scoped API.
 */
fun <C : Any> steps(
    factory: () -> C,
    block: StepsScope<C>.() -> Unit,
): StepDefinitions = StepDefinitions { registrar ->
    val binder = registrar.steps(Supplier { StateBox(factory()) })
    StepsScope(binder).block()
}

/**
 * Factory-less variant for a step file whose steps are pure — nothing to arrange, nothing to
 * evolve. Handlers run against [Unit]: a stimulus body simply performs its effect (its implicit
 * `Unit` return IS the unchanged state), a sensor returns the value the core compares.
 */
fun steps(block: StepsScope<Unit>.() -> Unit): StepDefinitions = steps({}, block)

/**
 * The receiver of a [steps] block: bare `stimulus`/`sensor` calls, one overload per handler arity.
 * Handlers are `suspend` with the state as receiver; they run on the Java engine's synchronous
 * executor via [runBlocking].
 *
 * ONLY the zero-parameter overloads are members; the capturing arities are the top-level extension
 * functions below. This split is load-bearing, not style: a parameterless lambda (`sensor("…") {
 * cukes }`) type-checks against both a 0-parameter and a 1-parameter function type (the parameter
 * would be `it`), so same-scope overloads are irreparably ambiguous — K2 rejects the call. Members
 * win over extensions in overload resolution, so the parameterless lambda binds the member; a
 * lambda that declares parameters (`{ n: Int -> … }`) is inapplicable to the member and falls
 * through to the matching extension. Authors outside this package import the extensions alongside
 * [steps] (IDE auto-import handles it).
 *
 * A handler may declare FEWER parameters than the step supplies (captures plus the trailing
 * data-table/doc-string argument); the surplus is dropped — the same semantics as the TS facade,
 * where `sensor('… {int} …', () => cukes)` simply ignores the capture. Declaring MORE parameters
 * than the step supplies is an authoring error, reported at execution time by [HandlerAdapter].
 *
 * Annotated [RegistrarGlue] so registration-time StackWalker frames of this class are skipped and
 * each step's source location is the author's own `.steps.kt` call site.
 */
@RegistrarGlue
class StepsScope<C : Any> internal constructor(internal val binder: StateBinder<StateBox<C>>) {

    fun stimulus(expression: String, handler: suspend C.() -> C) {
        binder.stimulus(expression, StimulusAdapter<C>(0) { c, _ -> handler(c) })
    }

    fun <R> sensor(expression: String, handler: suspend C.() -> R) {
        binder.sensor(expression, SensorAdapter<C>(0) { c, _ -> handler(c) })
    }

    /**
     * Registers a custom cucumber-expression parameter type. Must appear BEFORE any step whose
     * expression uses `{name}` — the underlying registrar compiles each expression eagerly against
     * the types registered so far (same ordering rule as the Java author API).
     *
     * [parse] turns the matched text into the value handlers receive; the optional [format] is its
     * inverse — value back to the document's notation — used only to render the actual side of a
     * parameter mismatch, never for matching or the comparison verdict. [format] is a named
     * parameter before the trailing [parse] lambda:
     * ```kotlin
     * param("money", Regex("""£\d+\.\d{2}"""), format = { "£%.2f".format(it.value) }) {
     *     groups -> Money.gbp(groups[0].substring(1).toBigDecimal())
     * }
     * ```
     */
    fun <T> param(
        name: String,
        regexp: Regex,
        format: ((T) -> String)? = null,
        parse: (Array<String>) -> T,
    ) {
        if (format == null) {
            binder.param(
                name,
                regexp.toPattern(),
                StateBinder.Parse<T> { captures -> parse(captures) },
            )
        } else {
            binder.param(
                name,
                regexp.toPattern(),
                StateBinder.Parse<T> { captures -> parse(captures) },
                Function<T, String> { value -> format(value) },
            )
        }
    }
}

fun <C : Any, A> StepsScope<C>.stimulus(expression: String, handler: suspend C.(A) -> C) {
    binder.stimulus(
        expression,
        StimulusAdapter<C>(1) { c, args -> @Suppress("UNCHECKED_CAST") handler(c, args[0] as A) },
    )
}

fun <C : Any, A, B> StepsScope<C>.stimulus(expression: String, handler: suspend C.(A, B) -> C) {
    binder.stimulus(
        expression,
        StimulusAdapter<C>(2) { c, args ->
            @Suppress("UNCHECKED_CAST") handler(c, args[0] as A, args[1] as B)
        },
    )
}

fun <C : Any, A, R> StepsScope<C>.sensor(expression: String, handler: suspend C.(A) -> R) {
    binder.sensor(
        expression,
        SensorAdapter<C>(1) { c, args -> @Suppress("UNCHECKED_CAST") handler(c, args[0] as A) },
    )
}

fun <C : Any, A, B, R> StepsScope<C>.sensor(expression: String, handler: suspend C.(A, B) -> R) {
    binder.sensor(
        expression,
        SensorAdapter<C>(2) { c, args ->
            @Suppress("UNCHECKED_CAST") handler(c, args[0] as A, args[1] as B)
        },
    )
}

/**
 * Arity-tolerant execution shim shared by both adapters. The Java executor ({@code
 * Execute.invokeHandler}) reflects over the registered handler object for a public method whose
 * parameter count equals state + captures + the optional trailing table/doc-string arg — it never
 * dispatches through the SAM interface. Exposing one `apply` overload per supported call shape
 * (state + 0..3 args) lets a handler that declares fewer parameters than the step supplies simply
 * drop the surplus, which is what makes the approved `sensor("… {int} …") { cukes }` run, not just
 * compile. [arity] is what the author's lambda declared; supplying fewer arguments than that is an
 * authoring error surfaced with a step-authoring message rather than an index-out-of-bounds.
 */
internal abstract class HandlerAdapter(private val arity: Int) {

    protected fun arguments(supplied: List<Any?>): List<Any?> {
        require(supplied.size >= arity) {
            "handler declares $arity parameter(s) but the step supplies only ${supplied.size} " +
                "(captured expression arguments plus any trailing data table/doc string)"
        }
        return supplied
    }
}

internal class StimulusAdapter<C : Any>(
    arity: Int,
    private val f: suspend (C, List<Any?>) -> C,
) : HandlerAdapter(arity), StateBinder.Stimulus0<StateBox<C>> {

    override fun apply(box: StateBox<C>): StateBox<C> = call(box, listOf())

    fun apply(box: StateBox<C>, a: Any?): StateBox<C> = call(box, listOf(a))

    fun apply(box: StateBox<C>, a: Any?, b: Any?): StateBox<C> = call(box, listOf(a, b))

    fun apply(box: StateBox<C>, a: Any?, b: Any?, c: Any?): StateBox<C> = call(box, listOf(a, b, c))

    private fun call(box: StateBox<C>, supplied: List<Any?>): StateBox<C> {
        val args = arguments(supplied)
        return StateBox(runBlocking { f(box.value, args) })
    }
}

internal class SensorAdapter<C : Any>(
    arity: Int,
    private val f: suspend (C, List<Any?>) -> Any?,
) : HandlerAdapter(arity), StateBinder.Sensor0<StateBox<C>, Any?> {

    override fun apply(box: StateBox<C>): Any? = call(box, listOf())

    fun apply(box: StateBox<C>, a: Any?): Any? = call(box, listOf(a))

    fun apply(box: StateBox<C>, a: Any?, b: Any?): Any? = call(box, listOf(a, b))

    fun apply(box: StateBox<C>, a: Any?, b: Any?, c: Any?): Any? = call(box, listOf(a, b, c))

    private fun call(box: StateBox<C>, supplied: List<Any?>): Any? {
        val args = arguments(supplied)
        return runBlocking { f(box.value, args) }
    }
}
