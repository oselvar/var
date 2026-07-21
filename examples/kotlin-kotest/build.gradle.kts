plugins {
    kotlin("jvm") version "2.4.0"
}

// On trunk this is the SNAPSHOT that `mvn install` (run from java/) puts into
// mavenLocal, so the sample always tests the code in this repo. In your own
// project: pin the latest release and drop the mavenLocal() repository.
val varVersion = "0.5.1"

repositories {
    mavenLocal()
    mavenCentral()
}

dependencies {
    testImplementation("dev.varar:kotlin:$varVersion")
    // Brings the Kotest JUnit Platform runner transitively (VarSpec extends FunSpec).
    testImplementation("dev.varar:kotest:$varVersion")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:6.1.2")
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
