// The app's data layer as a build of its own: plain Kotlin on the JVM, so it
// compiles and is tested anywhere — against a real Supabase and a real SQLite
// — without the Android toolchain. The Android app (../settings.gradle.kts)
// includes this build and uses it as it is.
// Maven Central by two addresses: some networks throttle the usual one.
pluginManagement {
    repositories {
        maven("https://maven-central.storage-download.googleapis.com/maven2")
        maven("https://repo1.maven.org/maven2")
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        maven("https://maven-central.storage-download.googleapis.com/maven2")
        maven("https://repo1.maven.org/maven2")
    }
}

rootProject.name = "shared"
