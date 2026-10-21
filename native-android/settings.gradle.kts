// МТМУ №7 — the school portal as a native Android app (Kotlin, Jetpack Compose).
// The data layer is a build of its own (shared/), plain Kotlin, included here.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "mtmu7"
includeBuild("shared")
include(":app")
