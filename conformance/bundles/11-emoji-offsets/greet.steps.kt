@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 11-emoji-offsets): the example's non-header-bound trailing table arrives as
// the trailing argument after the {string} capture; the null return skips
// every comparison (mirrors TS's `() => undefined`).
package com.oselvar.varkt.conformance.bundle11

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

class Ctx

val steps = defineState(::Ctx) {
    sensor("I greet {string}") { name: String, table: List<List<String>> -> null }
}
