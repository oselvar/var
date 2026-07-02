@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 10-error-fence-without-step): the example's prose matches no step, so the
// error fence has nothing to run — a plan-stage diagnostic; this stage only
// needs the one step registered.
package com.oselvar.varkt.conformance.bundle10

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I have {int} cukes") { n: Int -> this }
}
