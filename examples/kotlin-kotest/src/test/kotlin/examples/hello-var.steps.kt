@file:JvmName("HelloVarSteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor
import com.oselvar.varkt.stimulus

data class HelloCtx(val greeting: String = "", val result: Int = 0)

val helloVarSteps = defineState(::HelloCtx) {
    stimulus("I greet {string}") { name: String -> copy(greeting = "Hello, $name!") }
    sensor("the greeting should be {string}") { _: String -> greeting }
    stimulus("expression `{int}+{int}`") { a: Int, b: Int -> copy(result = a + b) }
    sensor("evaluate to `{int}`") { _: Int -> result }
}
