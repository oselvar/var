package examples

import com.oselvar.varkt.kotest.VarSpec

// VarSpec is a Kotest FunSpec: it loads var.config.json from the given root
// (default: the test working directory), plans every matching Markdown spec,
// and registers one Kotest test per example. Being a plain class, it needs no
// discovery workarounds — Gradle finds it like any other Kotest spec.
class ExamplesSpec : VarSpec()
