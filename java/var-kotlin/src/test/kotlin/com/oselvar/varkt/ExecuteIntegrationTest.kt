package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.core.CellDiff
import com.oselvar.`var`.core.Execute
import com.oselvar.`var`.core.Parse
import com.oselvar.`var`.core.Plan
import java.util.function.Function
import kotlinx.coroutines.delay
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ExecuteIntegrationTest {

    data class Ctx(val cukes: Int = 0)

    private fun steps() =
        steps(::Ctx) {
            stimulus("I have {int} cukes") { n: Int -> copy(cukes = n) }
            stimulus("I eat {int} cukes") { n: Int ->
                delay(1) // proves a genuinely suspending handler runs through runBlocking
                copy(cukes = cukes - n)
            }
            sensor("I should have {int} cukes left") { cukes }
        }

    private fun execute(source: String) {
        val registrar = RegistryRegistrar()
        steps().defineSteps(registrar)
        val plan = Plan.plan(Parse.parse("cukes.md", source), registrar.registry())
        val ports =
            Execute.ExecutePorts(
                Execute.Reporter {},
                Function { registrar.stateFactory()!!.get() },
                null,
            )
        Execute.executePlan(plan, ports)
    }

    @Test
    fun `passing example evolves boxed state and satisfies the sensor comparison`() {
        execute(
            "# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 5 cukes left.\n"
        )
    }

    @Test
    fun `mismatching sensor return fails with a span-anchored cell mismatch`() {
        // Sensor returns 5 but the Markdown claims 99 -> compared against the
        // last captured parameter -> CellMismatchException from the pure core.
        assertThrows(CellDiff.CellMismatchException::class.java) {
            execute(
                "# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 99 cukes left.\n"
            )
        }
    }
}
