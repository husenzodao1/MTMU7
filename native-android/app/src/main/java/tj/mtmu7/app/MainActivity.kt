package tj.mtmu7.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.flow.MutableStateFlow
import tj.mtmu7.app.push.Notifications
import tj.mtmu7.app.ui.AppRoot
import tj.mtmu7.app.ui.theme.Mtmu7Theme

/**
 * The one window of the app. It opens straight onto the screens the phone
 * already has (the splash is only the system's first frame), in the chosen
 * language, and takes a notification's tap — tj.mtmu7.app://open/<path> —
 * to what it is about.
 */
class MainActivity : ComponentActivity() {
    private val links = MutableStateFlow<String?>(null)

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(Prefs.localized(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Notifications.ensureChannel(this)
        if (savedInstanceState == null) take(intent)
        setContent {
            var theme by remember { mutableStateOf(Prefs.theme(this)) }
            Mtmu7Theme(theme) {
                AppRoot(
                    links = links,
                    onLinkHandled = { links.value = null },
                    theme = theme,
                    onTheme = {
                        Prefs.setTheme(this, it)
                        theme = it
                    },
                    onLanguage = {
                        Prefs.setLanguage(this, it)
                        recreate()
                    },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        take(intent)
    }

    private fun take(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "tj.mtmu7.app" || data.host != "open") return
        val path = data.encodedPath.orEmpty().ifEmpty { "/" }
        links.value = path + (data.encodedQuery?.let { "?$it" } ?: "")
    }
}
