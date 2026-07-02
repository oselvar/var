@file:JvmName("EchoSteps")

// Kotlin sibling of echo.steps.ts / echo.steps.py / EchoSteps.java (bundle
// 04-tables-and-docstrings): the doc string arrives as the trailing handler
// argument after the expression's own captures (here: none) and is echoed back
// for the core's doc-string comparison.
package com.oselvar.varkt.conformance.bundle04

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class Ctx

val steps = defineState(::Ctx) {
    sensor("I echo the following:") { doc: String -> doc }
}
