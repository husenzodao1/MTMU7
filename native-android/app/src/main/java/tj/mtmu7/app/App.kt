package tj.mtmu7.app

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import tj.mtmu7.app.push.DeviceToken
import tj.mtmu7.shared.auth.AuthRepository
import tj.mtmu7.shared.content.ContentRepository
import tj.mtmu7.shared.core.AppConfig
import tj.mtmu7.shared.core.AppJson
import tj.mtmu7.shared.core.Backend
import tj.mtmu7.shared.db.AppDatabase
import tj.mtmu7.shared.messenger.MessengerRepository

/** Everything the screens use, made once the app knows where its database is. */
class Services(
    val backend: Backend,
    val auth: AuthRepository,
    val messenger: MessengerRepository,
    val content: ContentRepository,
)

class App : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _services = MutableStateFlow<Services?>(null)
    /** Null until the app knows its database (at once after the first launch). */
    val services: StateFlow<Services?> = _services.asStateFlow()

    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online.asStateFlow()

    private val _configFailed = MutableStateFlow(false)
    val configFailed: StateFlow<Boolean> = _configFailed.asStateFlow()

    val prefs by lazy { getSharedPreferences("app", Context.MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        watchConnectivity()
        val saved = savedConfig()
        if (saved != null) start(saved) else scope.launch { fetchConfig() }
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) = onForeground()
            override fun onStop(owner: LifecycleOwner) = onBackground()
        })
    }

    private fun start(config: AppConfig) {
        val driver = AndroidSqliteDriver(AppDatabase.Schema, this, "mtmu7.db")
        val backend = Backend(config, driver)
        val auth = AuthRepository(backend)
        val services = Services(backend, auth, MessengerRepository(backend, auth), ContentRepository(backend, auth))
        _services.value = services
        onForeground()
    }

    /** The database's address and key, from the portal (once; kept after). */
    suspend fun fetchConfig() {
        _configFailed.value = false
        val http = HttpClient(OkHttp) { install(HttpTimeout) { requestTimeoutMillis = 20_000 } }
        var pause = 2_000L
        repeat(6) {
            val config = runCatching {
                val text = http.get(BuildConfig.PORTAL_URL + "/api/app/config").bodyAsText()
                AppJson.decodeFromString(RemoteConfig.serializer(), text)
            }.getOrNull()
            if (config != null && config.supabaseUrl.startsWith("https://") && config.supabaseKey.isNotBlank()) {
                prefs.edit().putString("supabase_url", config.supabaseUrl).putString("supabase_key", config.supabaseKey).apply()
                http.close()
                start(AppConfig(config.supabaseUrl, config.supabaseKey, BuildConfig.PORTAL_URL))
                return
            }
            delay(pause)
            pause = (pause * 2).coerceAtMost(15_000)
        }
        http.close()
        _configFailed.value = true
    }

    private fun savedConfig(): AppConfig? {
        val url = prefs.getString("supabase_url", null) ?: return null
        val key = prefs.getString("supabase_key", null) ?: return null
        return AppConfig(url, key, BuildConfig.PORTAL_URL)
    }

    @Volatile
    private var foreground = false

    /** Back on screen: catch up with everything, and listen live while the app is open. */
    private fun onForeground() {
        foreground = true
        val s = _services.value ?: return
        if (!s.auth.isSignedIn) return
        s.backend.scope.launch {
            s.messenger.kick()
            s.messenger.flushReads()
            s.messenger.touch()
            s.messenger.refreshConversations()
            runCatching { s.messenger.startLive() }
            s.auth.refreshAccess()
            s.content.refreshHome()
            s.content.refreshNotifications()
            DeviceToken.register(this@App, s)
        }
    }

    /** Just signed in: everything a launch would catch up with. */
    fun onSignedIn() = onForeground()

    private fun onBackground() {
        foreground = false
        val s = _services.value ?: return
        s.backend.scope.launch {
            delay(30_000)
            // Away for a while: realtime stops (pushes carry the news), the outbox keeps going.
            if (!foreground) s.messenger.stopLive()
        }
    }

    private fun watchConnectivity() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        _online.value = cm.activeNetwork?.let { cm.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } == true
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val wasOffline = !_online.value
                _online.value = true
                if (wasOffline) _services.value?.let { s ->
                    s.messenger.onLineBack()
                    s.backend.scope.launch {
                        s.messenger.refreshConversations()
                        s.messenger.openConversation?.let { s.messenger.refreshThread(it) }
                    }
                }
            }

            override fun onLost(network: Network) {
                _online.value = cm.activeNetwork != null && cm.activeNetwork != network
            }
        })
    }
}

@Serializable
private data class RemoteConfig(val supabaseUrl: String = "", val supabaseKey: String = "")

val Context.app: App get() = applicationContext as App
