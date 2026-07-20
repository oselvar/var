plugins {
    kotlin("jvm") version "2.4.0"
}

// On trunk this is the SNAPSHOT that `mvn install` (run from java/) puts into
// mavenLocal, so the sample always tests the code in this repo. In your own
// project: pin the latest release and drop the mavenLocal() repository.
val varVersion = "0.4.3-SNAPSHOT"

repositories {
    mavenLocal()
    mavenCentral()
}

dependencies {
    testImplementation("dev.varar:kotlin:$varVersion")
    testImplementation("dev.varar:junit:$varVersion")
    testImplementation(platform("org.junit:junit-bom:6.1.2"))
    testImplementation("org.junit.platform:junit-platform-suite")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
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
