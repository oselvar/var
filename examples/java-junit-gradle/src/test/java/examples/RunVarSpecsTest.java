package examples;

import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectDirectories;
import org.junit.platform.suite.api.Suite;

/**
 * Maven Surefire and Gradle only discover class-based tests, so this {@code @Suite} is the
 * bridge that asks the JUnit Platform to run the {@code "var"} engine over the spec corpus.
 * var.config.json (in this project's root, the test working directory) decides which .md
 * files are specs and which classes define the steps. The {@code *Test} suffix matters:
 * Surefire only scans classes matching its naming convention.
 */
@Suite
@IncludeEngines("var")
@SelectDirectories("../../doc/examples")
public class RunVarSpecsTest {}
