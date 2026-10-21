package tj.mtmu7.shared.core

import app.cash.sqldelight.db.SqlDriver
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.github.jan.supabase.storage.Storage
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import tj.mtmu7.shared.db.AppDatabase
import kotlin.time.Duration.Companion.seconds

/** Where the app talks to: the school's database, and the portal for what only the server may do. */
data class AppConfig(
    val supabaseUrl: String,
    val supabaseKey: String,
    /** https://mtmuraqami7.vercel.app — sign-in by login, push requests, pages not yet in the app. */
    val portalUrl: String,
)

val AppJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
    coerceInputValues = true
}

/**
 * Everything the app shares: the local database (the phone's own copy of
 * what it shows) and one connection to Supabase. The session lives in the
 * same database, so signing out clears it with everything else.
 */
class Backend(val config: AppConfig, driver: SqlDriver) {
    val db: AppDatabase = AppDatabase(driver)
    val store = Store(db)
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val supabase: SupabaseClient = createSupabaseClient(config.supabaseUrl, config.supabaseKey) {
        defaultSerializer = KotlinXSerializer(AppJson)
        httpEngine = OkHttp.create()
        requestTimeout = 25.seconds
        install(Auth) {
            sessionManager = StoreSessionManager(store)
            alwaysAutoRefresh = true
            autoLoadFromStorage = true
            autoSaveToStorage = true
            enableLifecycleCallbacks = false
        }
        install(Postgrest)
        install(Realtime) {
            reconnectDelay = 2.seconds
        }
        install(Storage)
    }

    val portal = Portal(config.portalUrl) { supabase.auth.currentAccessTokenOrNull() }

    companion object {
        fun createSchema(driver: SqlDriver) = AppDatabase.Schema.create(driver)
    }
}

/** The session, kept in the app's own database. */
private class StoreSessionManager(private val store: Store) : SessionManager {
    override suspend fun saveSession(session: UserSession) {
        store.put(KEY, AppJson.encodeToString(UserSession.serializer(), session))
    }

    override suspend fun loadSession(): UserSession = loadSessionOrNull() ?: error("no session")

    override suspend fun loadSessionOrNull(): UserSession? = store.get(KEY)?.let {
        runCatching { AppJson.decodeFromString(UserSession.serializer(), it) }.getOrNull()
    }

    override suspend fun deleteSession() {
        store.remove(KEY)
    }

    companion object {
        const val KEY = "session"
    }
}
