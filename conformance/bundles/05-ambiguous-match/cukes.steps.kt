@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 05-ambiguous-match): both expressions match "I have 5 cukes" -> ambiguous-
// match diagnostic at the plan stage; this stage only needs both registered.
package com.oselvar.varkt.conformance.bundle05

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I have {int} cukes") { n: Int -> this }
    action("I have 5 cukes") { this }
}
