package com.oselvar.varkt

import com.oselvar.`var`.runner.StepLoader
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StepLoaderKotlinTest {

    @Test
    fun `loads a top-level val steps via the file facade class`() {
        val loaded = StepLoader.loadSteps(
            listOf("com.oselvar.varkt.fixtures.CukeSteps"),
            javaClass.classLoader,
        )

        assertEquals(3, loaded.registry().steps().size)
        // Every step's location is the author's .steps.kt — the key the
        // executor uses to look up this file's state factory.
        assertTrue(loaded.registry().steps().all { it.expressionSourceFile() == "cukes.steps.kt" }) {
            loaded.registry().steps().map { it.expressionSourceFile() }.toString()
        }
        val state = loaded.createContext().apply("cukes.steps.kt")
        assertNotNull(state)
        assertTrue(state is StateBox<*>)
    }
}
