@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 05-ambiguous-match): both expressions match "I have 5 cukes" -> ambiguous-
// match diagnostic at the plan stage; this stage only needs both registered.
package com.oselvar.varkt.conformance.bundle05

import com.oselvar.varkt.stimulus
import com.oselvar.varkt.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I have {int} cukes") { n: Int -> this }
    stimulus("I have 5 cukes") { this }
}
