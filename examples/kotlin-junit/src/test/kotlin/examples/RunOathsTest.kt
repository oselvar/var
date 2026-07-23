package examples

import org.junit.platform.suite.api.IncludeEngines
import org.junit.platform.suite.api.SelectDirectories
import org.junit.platform.suite.api.Suite

// Maven Surefire and Gradle only discover class-based tests, so this @Suite is
// the bridge that asks the JUnit Platform to run the "varar" engine over the spec
// corpus (the .md files in this project). varar.config.json decides which .md
// files are specs and which classes define the steps. The
// *Test suffix matters under Maven: Surefire only scans classes matching its
// naming convention.
@Suite @IncludeEngines("varar") @SelectDirectories(".") class RunVarSpecsTest
