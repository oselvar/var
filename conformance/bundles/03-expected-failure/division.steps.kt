@file:JvmName("DivisionSteps")

// Kotlin sibling of division.steps.ts / division.steps.py / DivisionSteps.java
// (bundle 03-expected-failure).
package com.oselvar.varkt.conformance.bundle03

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I divide {int} by {int}") { a: Int, b: Int ->
        if (b == 0) throw ArithmeticException("division by zero")
        this
    }
}
