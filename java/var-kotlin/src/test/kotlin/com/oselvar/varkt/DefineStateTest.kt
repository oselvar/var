package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.StepDefinitions
import com.oselvar.`var`.core.StepKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DefineStateTest {

    data class Ctx(val cukes: Int = 0)

    // The interview-approved canonical example, verbatim shape: bare context/
    // action/sensor calls, state as receiver, typed captures, a zero-parameter
    // sensor lambda. If overload resolution is ambiguous for `{ cukes }`, THIS
    // fails to compile — that is the spec's flagged spike. Do NOT "fix" it by
    // changing this test to `{ -> cukes }`; stop and report instead (the
    // approved API shape would need revisiting with the user).
    private fun canonicalSteps(): StepDefinitions =
        steps(::Ctx) {
            stimulus("I have {int} cukes") { n: Int ->
                copy(cukes = n)
            }
            stimulus("I eat {int} cukes") { n: Int ->
                copy(cukes = cukes - n)
            }
            sensor("I should have {int} cukes left") {
                cukes
            }
        }

    // Invokes a registered handler the way Execute.invokeHandler does: reflect
    // for the public `apply` overload whose parameter count matches, never
    // through the SAM interface. (The adapters expose one overload per call
    // shape — see HandlerAdapter.)
    private fun invoke(handler: Any, vararg args: Any?): Any? {
        val method =
            handler.javaClass.methods.first {
                it.name == "apply" && it.parameterCount == args.size && !it.isBridge
            }
        return method.invoke(handler, *args)
    }

    @Test
    fun `top-level steps registers nothing until replayed`() {
        val definitions = canonicalSteps() // constructing the value is inert
        val registrar = RegistryRegistrar()
        assertTrue(registrar.registry().steps().isEmpty())
        definitions.defineSteps(registrar) // replay is what registers
        assertEquals(3, registrar.registry().steps().size)
    }

    @Test
    fun `registers expressions kinds and author-side source locations`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)
        val steps = registrar.registry().steps()

        assertEquals(
            listOf("I have {int} cukes", "I eat {int} cukes", "I should have {int} cukes left"),
            steps.map { it.expression() },
        )
        assertEquals(
            listOf(StepKind.STIMULUS, StepKind.STIMULUS, StepKind.SENSOR),
            steps.map { it.kind() },
        )
        // Glue-frame skipping (Task 1 + @file:RegistrarGlue on DefineState.kt)
        // must make every location point at THIS file, on strictly increasing
        // lines (each context/action/sensor call sits on its own line above).
        assertTrue(steps.all { it.expressionSourceFile() == "DefineStateTest.kt" }) {
            "expected DefineStateTest.kt, got ${steps.map { it.expressionSourceFile() }}"
        }
        assertTrue(steps.map { it.expressionSourceLine() }.zipWithNext().all { (a, b) -> a < b }) {
            "expected increasing lines, got ${steps.map { it.expressionSourceLine() }}"
        }
    }

    @Test
    fun `context handler gets state as receiver and returns the full replacement`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)
        val initial = registrar.stateFactory()!!.get()

        val evolved = invoke(registrar.registry().steps()[0].handler(), initial, 8) as StateBox<*>
        assertEquals(Ctx(cukes = 8), evolved.value)
    }

    @Test
    fun `zero-parameter sensor on a capturing expression drops the surplus argument`() {
        // The approved canonical sensor: `{ cukes }` on "… {int} …". The
        // executor supplies (state, capture); the arity-0 handler must accept
        // the call and ignore the capture — TS-facade semantics.
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)

        val left = registrar.registry().steps()[2].handler()
        assertEquals(5, invoke(left, StateBox(Ctx(cukes = 5)), 5))
    }

    @Test
    fun `handler declaring more parameters than the step supplies fails with an authoring error`() {
        val registrar = RegistryRegistrar()
        steps(::Ctx) {
                sensor("over-declared") { a: Int, b: Int -> a + b }
            }
            .defineSteps(registrar)

        val handler = registrar.registry().steps()[0].handler()
        val e =
            assertThrows(Exception::class.java) {
                invoke(handler, StateBox(Ctx()), 1)
            }
        // Reflection wraps in InvocationTargetException; the cause carries the message.
        val cause = generateSequence(e as Throwable) { it.cause }.last()
        assertTrue(cause is IllegalArgumentException, cause.toString())
        assertTrue(cause.message!!.contains("declares 2 parameter(s)"), cause.message)
    }

    @Test
    fun `factory-less steps registers pure steps against Unit state`() {
        val registrar = RegistryRegistrar()
        steps {
                stimulus("I warm up my mental math") {}
                sensor("the square of {int} is {int}") { n: Int -> listOf(n, n * n) }
            }
            .defineSteps(registrar)

        val steps = registrar.registry().steps()
        assertEquals(
            listOf("I warm up my mental math", "the square of {int} is {int}"),
            steps.map { it.expression() },
        )
        assertEquals(listOf(StepKind.STIMULUS, StepKind.SENSOR), steps.map { it.kind() })

        val initial = registrar.stateFactory()!!.get()
        // The stimulus's implicit Unit return is the unchanged (empty) state.
        val evolved = invoke(steps[0].handler(), initial) as StateBox<*>
        assertEquals(Unit, evolved.value)
        // The sensor ignores the state and computes from its captures alone.
        assertEquals(listOf(7, 49), invoke(steps[1].handler(), initial, 7, 49))
    }

    @Test
    fun `each replay gets a fresh state factory producing fresh boxes`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)
        val factory = registrar.stateFactory()!!
        val a = factory.get() as StateBox<*>
        val b = factory.get() as StateBox<*>
        assertTrue(a !== b)
        assertEquals(Ctx(cukes = 0), a.value)
    }
}
