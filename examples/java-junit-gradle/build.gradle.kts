plugins {
    java
}

// On trunk this is the SNAPSHOT that `mvn install` (run from java/) puts into
// mavenLocal, so the sample always tests the code in this repo. In your own
// project: pin the latest release and drop the mavenLocal() repository.
val varVersion = "0.3.1-SNAPSHOT"

repositories {
    mavenLocal()
    mavenCentral()
}

dependencies {
    testImplementation("com.oselvar:var-junit:$varVersion")
    testImplementation(platform("org.junit:junit-bom:6.1.1"))
    // Gradle only discovers class-based tests, so the sample uses a JUnit
    // @Suite (see RunVarSpecsTest) to hand the spec corpus to the "var" engine.
    testImplementation("org.junit.platform:junit-platform-suite")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}
