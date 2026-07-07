@file:JvmName("CounterSteps")

// Kotlin sibling of counter.steps.ts / counter.steps.py / CounterSteps.java
// (bundle 02-context-isolation).
package com.oselvar.varkt.conformance.bundle02

import com.oselvar.varkt.stimulus
import com.oselvar.varkt.steps
import com.oselvar.varkt.sensor

data class Ctx(val count: Int = 0)

val steps = steps(::Ctx) {
    stimulus("I increment") { copy(count = count + 1) }
    sensor("The count is {int}") { n: Int -> count }
}
