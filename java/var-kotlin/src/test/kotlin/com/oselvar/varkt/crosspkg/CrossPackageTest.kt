package com.oselvar.varkt.crosspkg

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.varkt.sensor
import com.oselvar.varkt.steps
import com.oselvar.varkt.stimulus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Proves the approved author API resolves from OUTSIDE `com.oselvar.varkt` — the situation every
 * real `.steps.kt` file is in. The zero-parameter overloads are `StepsScope` members (no import
 * beyond `steps`), but the capturing arities are top-level extension functions, so an author's file
 * needs the four imports above (IDE auto-import adds them). `DefineStateTest` lives in the DSL's
 * own package and cannot catch a missing-import regression; this test can.
 */
class CrossPackageTest {

    data class Ctx(val cukes: Int = 0)

    @Test
    fun `the canonical example compiles and registers from a foreign package`() {
        val steps =
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

        val registrar = RegistryRegistrar()
        steps.defineSteps(registrar)
        assertEquals(
            listOf("I have {int} cukes", "I eat {int} cukes", "I should have {int} cukes left"),
            registrar.registry().steps().map { it.expression() },
        )
        assertEquals(
            listOf("CrossPackageTest.kt", "CrossPackageTest.kt", "CrossPackageTest.kt"),
            registrar.registry().steps().map { it.expressionSourceFile() },
        )
    }
}
