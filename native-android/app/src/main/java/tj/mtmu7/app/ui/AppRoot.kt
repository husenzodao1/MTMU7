package tj.mtmu7.app.ui

import android.net.Uri
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.app
import tj.mtmu7.app.push.DeviceToken
import tj.mtmu7.app.ui.login.LoginScreen
import tj.mtmu7.app.ui.main.HOME
import tj.mtmu7.app.ui.main.MESSAGES
import tj.mtmu7.app.ui.main.MainScreen
import tj.mtmu7.app.ui.main.bottomBar
import tj.mtmu7.app.ui.main.sections
import tj.mtmu7.app.ui.messages.ChatScreen
import tj.mtmu7.app.ui.messages.NewChatScreen
import tj.mtmu7.app.ui.settings.NotificationsScreen
import tj.mtmu7.app.ui.settings.SettingsScreen
import tj.mtmu7.app.ui.web.LocalWebViews
import tj.mtmu7.app.ui.web.WebScreen
import tj.mtmu7.app.ui.web.WebSession
import tj.mtmu7.app.ui.web.WebViews

private const val LOGIN = "login"
private const val MAIN = "main"

/**
 * The app's screens. Nothing waits on the network to appear: the signed-in
 * person, their conversations and their home are the phone's own copy, and
 * the screens bring them up to date while they are already on view.
 *
 * `links` carries a notification's tap (a path of the site, /messages/<id>).
 */
@Composable
fun AppRoot(
    links: StateFlow<String?>,
    onLinkHandled: () -> Unit,
    theme: String,
    onTheme: (String) -> Unit,
    onLanguage: (String) -> Unit,
) {
    val app = LocalContext.current.app
    val services by app.services.collectAsState()
    val configFailed by app.configFailed.collectAsState()
    val s = services
    if (s == null) {
        // Only the very first launch, before the app knows its database.
        if (configFailed) NoConnection { app.scope.launch { app.fetchConfig() } } else LoginScreen(null) {}
        return
    }
    val webViews = remember { WebViews() }
    DisposableEffect(Unit) { onDispose { webViews.clear() } }
    CompositionLocalProvider(LocalWebViews provides webViews) {
        Screens(s, webViews, links, onLinkHandled, theme, onTheme, onLanguage)
    }
}

@Composable
private fun Screens(
    s: Services,
    webViews: WebViews,
    links: StateFlow<String?>,
    onLinkHandled: () -> Unit,
    theme: String,
    onTheme: (String) -> Unit,
    onLanguage: (String) -> Unit,
) {
    val context = LocalContext.current
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val access by s.auth.access.collectAsState()
    var tab by rememberSaveable { mutableStateOf(HOME.key) }
    val start = remember { if (s.auth.isSignedIn) MAIN else LOGIN }

    fun toMain(section: String) {
        tab = section
        if (!nav.popBackStack(MAIN, inclusive = false)) nav.navigate(MAIN)
    }

    /** A path of the site, opened the app's way wherever the app has its own screen. */
    fun openPath(path: String) {
        val clean = if (path.startsWith("/") && !path.startsWith("//")) path else "/" + path.substringAfter("://").substringAfter('/', "")
        val chat = Regex("^/messages/([0-9a-f-]{36})").find(clean)?.groupValues?.get(1)
        val bar = bottomBar(sections(access))
        val onBar = bar.firstOrNull { !it.native && (clean == it.path || clean.startsWith(it.path + "?")) }
        when {
            chat != null -> nav.navigate("chat/$chat") { launchSingleTop = true }
            clean == "/messages" || clean.startsWith("/messages?") -> toMain(MESSAGES.key)
            clean == "/" || clean == "/dashboard" -> toMain(HOME.key)
            clean.startsWith("/notifications") -> nav.navigate("notifications") { launchSingleTop = true }
            onBar != null -> toMain(onBar.key)
            else -> nav.navigate("web?path=" + Uri.encode(clean)) { launchSingleTop = true }
        }
    }

    fun signOut() {
        scope.launch {
            runCatching { s.messenger.stopLive() }
            s.auth.signOut(beforeLeaving = { DeviceToken.forget(context, s) })
            WebSession.forget()
            webViews.clear()
            NotificationManagerCompat.from(context).cancelAll()
            tab = HOME.key
            nav.navigate(LOGIN) { popUpTo(nav.graph.id) { inclusive = true } }
        }
    }

    // A session the school ended (a password changed elsewhere, the account
    // blocked): the phone signs out as well, instead of failing quietly.
    LaunchedEffect(s) {
        s.backend.supabase.auth.sessionStatus.collect { status ->
            if (status is SessionStatus.NotAuthenticated && !status.isSignOut &&
                s.backend.store.get("session") == null && s.auth.access.value != null
            ) signOut()
        }
    }

    // A notification's tap: opened once someone is signed in.
    val link by links.collectAsState()
    LaunchedEffect(link, access?.userId) {
        val path = link ?: return@LaunchedEffect
        if (access?.userId == null || !s.auth.isSignedIn) return@LaunchedEffect
        onLinkHandled()
        openPath(path)
    }

    NavHost(
        navController = nav,
        startDestination = start,
        modifier = Modifier.background(MaterialTheme.colorScheme.background),
        enterTransition = { slideInHorizontally(tween(220)) { it / 6 } + fadeIn(tween(220)) },
        exitTransition = { fadeOut(tween(160)) },
        popEnterTransition = { fadeIn(tween(160)) },
        popExitTransition = { slideOutHorizontally(tween(200)) { it / 6 } + fadeOut(tween(200)) },
    ) {
        composable(LOGIN) {
            LoginScreen(s) {
                context.app.onSignedIn()
                nav.navigate(MAIN) { popUpTo(LOGIN) { inclusive = true } }
            }
        }
        composable(MAIN) {
            MainScreen(
                services = s,
                tab = tab,
                onTab = { tab = it },
                openChat = { nav.navigate("chat/$it") { launchSingleTop = true } },
                newChat = { nav.navigate("newchat") { launchSingleTop = true } },
                openWeb = ::openPath,
                openNotifications = { nav.navigate("notifications") { launchSingleTop = true } },
                openSettings = { nav.navigate("settings") { launchSingleTop = true } },
                signOut = ::signOut,
            )
        }
        composable("chat/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            ChatScreen(s, entry.arguments?.getString("id").orEmpty(), onBack = { nav.back() })
        }
        composable("newchat") {
            NewChatScreen(s, onBack = { nav.back() }, onOpen = { id ->
                nav.navigate("chat/$id") { popUpTo("newchat") { inclusive = true } }
            })
        }
        composable(
            "web?path={path}",
            arguments = listOf(navArgument("path") { type = NavType.StringType; defaultValue = "/dashboard" }),
        ) { entry ->
            WebPage(s, entry.arguments?.getString("path") ?: "/dashboard", onBack = { nav.back() }, openChat = {
                nav.navigate("chat/$it") { launchSingleTop = true }
            })
        }
        composable("notifications") {
            NotificationsScreen(s, onBack = { nav.back() }, openLink = ::openPath)
        }
        composable("settings") {
            SettingsScreen(
                services = s,
                theme = theme,
                onTheme = onTheme,
                onLanguage = onLanguage,
                openWeb = ::openPath,
                onBack = { nav.back() },
                signOut = ::signOut,
            )
        }
    }
}

/** Back, or home when this screen was opened from a notification with nothing under it. */
private fun NavHostController.back() {
    if (!popBackStack()) navigate(MAIN) { popUpTo(graph.id) { inclusive = true } }
}

/** A section of the site opened from the menu, a notice or the home screen, under the app's own bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WebPage(s: Services, path: String, onBack: () -> Unit, openChat: (String) -> Unit) {
    val access by s.auth.access.collectAsState()
    val title = sections(access).firstOrNull { path == it.path || path.startsWith(it.path + "/") || path.startsWith(it.path + "?") }?.label
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (title != null) stringResource(title) else stringResource(R.string.app_name),
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.back)) }
                },
            )
        },
    ) { padding ->
        WebScreen(s, path, onOpenChat = openChat, modifier = Modifier.padding(padding), key = "page:$path")
    }
}

/** The first launch with no line at all: the app cannot know its school yet. */
@Composable
private fun NoConnection(onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Icon(Icons.Outlined.CloudOff, null, tint = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.offline_title), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
            Text(
                stringResource(R.string.first_launch_offline),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Button(onClick = onRetry) { Text(stringResource(R.string.try_again)) }
        }
    }
}
