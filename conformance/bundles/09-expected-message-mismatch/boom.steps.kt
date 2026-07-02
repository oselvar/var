@file:JvmName("BoomSteps")

// Kotlin sibling of boom.steps.ts / boom.steps.py / BoomSteps.java (bundle
// 09-expected-message-mismatch): throws a message NOT containing the expected
// substring, so the error fence is not satisfied at the trace stage.
package com.oselvar.varkt.conformance.bundle09

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I always boom") {
        throw RuntimeException("actual different error")
    }
}
