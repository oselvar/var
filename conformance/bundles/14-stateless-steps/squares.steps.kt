@file:JvmName("SquaresSteps")

// Kotlin sibling of squares.steps.ts / squares.steps.py / SquaresSteps.java
// (bundle 14-stateless-steps): no state factory — these steps are pure, so
// defineState is called without one and handlers run against Unit.
package com.oselvar.varkt.conformance.bundle14

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

val steps = defineState {
    stimulus("I warm up my mental math") {}
    sensor("The square of {int} is {int}.") { n: Int -> listOf(n, n * n) }
}
