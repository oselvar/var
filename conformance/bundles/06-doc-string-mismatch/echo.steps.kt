@file:JvmName("EchoSteps")

// Kotlin sibling of echo.steps.ts / echo.steps.py / EchoSteps.java (bundle
// 06-doc-string-mismatch): deliberately returns the WRONG string so the core's
// doc-string comparison fails at the trace stage.
package com.oselvar.varkt.conformance.bundle06

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class Ctx

val steps = defineState(::Ctx) {
    sensor("I echo the following:") { doc: String -> "goodbye" }
}
