plugins {
    kotlin("jvm") version "2.4.21"
    kotlin("plugin.serialization") version "2.4.21"
    id("app.cash.sqldelight") version "2.4.1"
}

group = "tj.mtmu7"
version = "1.0"

kotlin {
    jvmToolchain(21)
    compilerOptions {
        // The Android app compiles for Java 17 bytecode.
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

sqldelight {
    databases {
        create("AppDatabase") {
            packageName.set("tj.mtmu7.shared.db")
            // Room for schema changes: each version a .sqm file beside the .sq ones.
            verifyMigrations.set(false)
        }
    }
}

dependencies {
    api(platform("io.github.jan-tennert.supabase:bom:3.8.0"))
    api("io.github.jan-tennert.supabase:auth-kt")
    api("io.github.jan-tennert.supabase:postgrest-kt")
    api("io.github.jan-tennert.supabase:realtime-kt")
    api("io.github.jan-tennert.supabase:storage-kt")
    api("io.ktor:ktor-client-okhttp:3.5.1")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    api("app.cash.sqldelight:runtime:2.4.1")
    api("app.cash.sqldelight:coroutines-extensions:2.4.1")

    testImplementation(kotlin("test"))
    testImplementation("app.cash.sqldelight:sqlite-driver:2.4.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
}

tasks.test {
    useJUnitPlatform()
    // Tests against the local Supabase run only when it is there (SUPABASE_URL).
    environment("SUPABASE_URL", System.getenv("SUPABASE_URL") ?: "")
    environment("SUPABASE_ANON_KEY", System.getenv("SUPABASE_ANON_KEY") ?: "")
    testLogging { events("passed", "failed", "skipped"); showStandardStreams = true; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
