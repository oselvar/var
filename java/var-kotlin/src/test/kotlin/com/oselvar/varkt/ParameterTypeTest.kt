package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.core.Parse
import com.oselvar.`var`.core.Plan
import io.cucumber.cucumberexpressions.UndefinedParameterTypeException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ParameterTypeTest {

    data class Ctx(val color: String = "")

    @Test
    fun `custom parameter type transforms captures before the handler sees them`() {
        val registrar = RegistryRegistrar()
        steps(::Ctx) {
                param("color", Regex("red|green|blue")) { captures ->
                    captures[0].uppercase()
                }
                stimulus("I pick {color}") { c: String -> copy(color = c) }
            }
            .defineSteps(registrar)

        val plan =
            Plan.plan(
                Parse.parse("colors.md", "# Colors\n\n## Picking\n\nI pick red.\n"),
                registrar.registry(),
            )
        assertEquals(listOf<Any>("RED"), plan.examples()[0].steps()[0].args())
    }

    @Test
    fun `a step using a not-yet-declared parameter type fails at replay with the cucumber error`() {
        val registrar = RegistryRegistrar()
        val definitions =
            steps(::Ctx) {
                stimulus("I pick {color}") { c: String -> copy(color = c) }
                param("color", Regex("red|green|blue")) { captures -> captures[0] }
            }
        assertThrows(UndefinedParameterTypeException::class.java) {
            definitions.defineSteps(registrar)
        }
    }
}
