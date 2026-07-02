@file:JvmName("CukeSteps")

package com.oselvar.varkt.fixtures

import com.oselvar.varkt.action
import com.oselvar.varkt.context
import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

data class CukeCtx(val cukes: Int = 0)

val steps = defineState(::CukeCtx) {
    context("I have {int} cukes") { n: Int ->
        copy(cukes = n)
    }
    action("I eat {int} cukes") { n: Int ->
        copy(cukes = cukes - n)
    }
    sensor("I should have {int} cukes left") {
        cukes
    }
}
