@file:JvmName("BasketSteps")

// Kotlin sibling of basket.steps.ts / BasketSteps.java (bundle
// 18-multi-table-example).
//
// The two Given/And paragraphs each carry a table and are separated from each
// other by a blank line (valid GFM). They must merge into ONE example sharing
// state, so the sensor reads back 1 user and 1 asset. The second example —
// separated by the prose paragraph — starts from a fresh, empty basket and reads
// back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
package dev.varar.kotlin.conformance.bundle18

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import dev.varar.kotlin.stimulus

data class Basket(val users: List<String> = emptyList(), val assets: List<String> = emptyList())

// A whole-table slot arrives as rows-of-cells including the header row, so drop
// row 0 and take the first cell of every data row.
private fun firstColumn(rows: List<List<String>>): List<String> = rows.drop(1).map { it.firstOrNull() ?: "" }

val steps = steps(::Basket) {
    stimulus("the following users have been imported") { rows: List<List<String>> ->
        copy(users = firstColumn(rows))
    }
    stimulus("the following assets have been imported") { rows: List<List<String>> ->
        copy(assets = firstColumn(rows))
    }
    sensor("the basket contains {int} user(s) and {int} asset(s)") { _: Int, _: Int ->
        listOf(users.size, assets.size)
    }
}
