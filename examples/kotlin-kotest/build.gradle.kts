plugins {
    kotlin("jvm") version "2.4.0"
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
    testImplementation("com.oselvar:var-kotlin:$varVersion")
    // Brings the Kotest JUnit Platform runner transitively (VarSpec extends FunSpec).
    testImplementation("com.oselvar:var-kotest:$varVersion")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:6.1.1")
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}
