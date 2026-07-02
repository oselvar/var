@file:JvmName("AirportsSteps")

// Kotlin sibling of airports.steps.ts / airports.steps.py / AirportsSteps.java
// (bundle 13-custom-parameter-type) — exercises StepsScope.parameterType: a
// custom {airport} type (IATA code, lowercased by the transformer). The
// lowercasing is asserted by the sensor (the .md says "lhr"), so an identity
// transformer fails this bundle. parameterType MUST precede the steps —
// expressions compile eagerly.
package com.oselvar.varkt.conformance.bundle13

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

data class Ctx(val dest: String? = null)

val steps = defineState(::Ctx) {
    parameterType("airport", Regex("[A-Z]{3}")) { captures -> captures[0].lowercase() }
    action("I fly to {airport}") { dest: String ->
        copy(dest = dest)
    }
    sensor("The destination code is {word}") { expected: String ->
        // {word} greedily captures the sentence-ending period (same cleanup as
        // bundle 01) — strip it before comparing.
        val cleaned = expected.replace(Regex("[.!?]$"), "")
        if (cleaned != dest) throw AssertionError("expected $cleaned but got $dest")
        null
    }
}
