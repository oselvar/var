@file:JvmName("NumeralsSteps")

// Kotlin sibling of numerals.steps.ts / numerals.steps.py / NumeralsSteps.java
// (bundle 01-roman-numerals). Unlike the Java fixture, the file keeps the
// shared cross-language stem naming (numerals.steps.kt -> "numerals.steps" by
// plain extension-stripping) — Kotlin has no file-name/class-name coupling, so
// no PascalCase workaround is needed; @file:JvmName pins the facade class the
// harness loads instead.
package com.oselvar.varkt.conformance.bundle01

import com.oselvar.varkt.action
import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

data class Ctx(val result: String? = null)

private val ROMAN = mapOf(1 to "I", 4 to "IV", 9 to "IX", 40 to "XL")

val steps = defineState(::Ctx) {
    action("I convert {int} to roman numerals") { n: Int ->
        copy(result = ROMAN[n])
    }
    sensor("The result is {word}") { expected: String ->
        // {word} greedily captures trailing punctuation ("I."), mirroring the
        // TS/Java fixtures: strip it, assert directly, and return null to opt
        // out of the compare-against-last-captured-param convenience (which
        // would wrongly compare the raw punctuated capture).
        val cleaned = expected.replace(Regex("[.!?]$"), "")
        if (cleaned != result) throw AssertionError("expected $cleaned but got $result")
        null
    }
}
