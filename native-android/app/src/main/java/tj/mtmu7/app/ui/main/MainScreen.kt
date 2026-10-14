package tj.mtmu7.app.ui.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.app
import tj.mtmu7.app.push.DeviceToken
import tj.mtmu7.app.ui.common.Avatar
import tj.mtmu7.app.ui.common.OfflineNote
import tj.mtmu7.app.ui.home.HomeScreen
import tj.mtmu7.app.ui.messages.ChatListScreen
import tj.mtmu7.app.ui.web.LocalWebViews
import tj.mtmu7.app.ui.web.WebScreen

/**
 * The app once signed in: the school's bar on top, the person's four
 * sections along the bottom, everything else in the menu. Home and the
 * messenger are the app's own screens, drawn from the phone's copy; a
 * section still shown from the site keeps its page while another tab is
 * open, so coming back to it never loads it again.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    services: Services,
    tab: String,
    onTab: (String) -> Unit,
    openChat: (String) -> Unit,
    newChat: () -> Unit,
    openWeb: (String) -> Unit,
    openNotifications: () -> Unit,
    openSettings: () -> Unit,
    signOut: () -> Unit,
) {
    val context = LocalContext.current
    val access by services.auth.access.collectAsState()
    val online by context.app.online.collectAsState()
    val unread by services.messenger.unreadTotal().collectAsState(initial = 0L)
    val notifications by services.content.notifications.collectAsState()
    val unreadNotices = notifications.count { !it.isRead }
    val all = remember(access) { sections(access) }
    val bar = remember(all) { bottomBar(all) }
    val current = bar.firstOrNull { it.key == tab } ?: bar.first()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    // The site's sections on the bar are opened once and kept; the first ones
    // load a moment after the app is on screen, so the first tap finds them ready.
    val views = LocalWebViews.current
    val kept = remember { mutableStateListOf<String>().apply { addAll(bar.filter { !it.native && views.has("tab:" + it.key) }.map { it.key }) } }
    LaunchedEffect(current.key) { if (!current.native && current.key !in kept) kept += current.key }
    LaunchedEffect(bar) {
        delay(1_500)
        bar.filter { !it.native && it.key !in kept }.forEach { kept += it.key }
    }

    LaunchedEffect(Unit) { services.content.refreshNotifications() }
    AskForNotifications(services)

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surface) {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 12.dp)) {
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            scope.launch { drawer.close() }
                            openSettings()
                        }.padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(access?.displayName.orEmpty(), access?.user?.avatarUrl, size = 48.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(access?.displayName.orEmpty(), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                access?.user?.publicId ?: access?.school?.shortName.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    all.forEach { s ->
                        NavigationDrawerItem(
                            label = { Text(stringResource(s.label)) },
                            icon = { Icon(s.icon, null) },
                            selected = s.key == current.key,
                            onClick = {
                                scope.launch { drawer.close() }
                                if (bar.any { it.key == s.key }) onTab(s.key) else openWeb(s.path)
                            },
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                    }
                    if (canEnterAdmin(access)) {
                        NavigationDrawerItem(
                            label = { Text(stringResource(ADMIN.label)) },
                            icon = { Icon(ADMIN.icon, null) },
                            selected = false,
                            onClick = {
                                scope.launch { drawer.close() }
                                openWeb(ADMIN.path)
                            },
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                    }
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    NavigationDrawerItem(
                        label = { Text(stringResource(R.string.nav_settings)) },
                        icon = { Icon(Icons.Outlined.Settings, null) },
                        selected = false,
                        onClick = {
                            scope.launch { drawer.close() }
                            openSettings()
                        },
                        modifier = Modifier.padding(horizontal = 12.dp),
                    )
                    NavigationDrawerItem(
                        label = { Text(stringResource(R.string.sign_out)) },
                        icon = { Icon(Icons.AutoMirrored.Outlined.Logout, null) },
                        selected = false,
                        onClick = {
                            scope.launch { drawer.close() }
                            signOut()
                        },
                        modifier = Modifier.padding(horizontal = 12.dp),
                    )
                }
            }
        },
    ) {
        Scaffold(
            topBar = {
                Column {
                    TopAppBar(
                        title = {
                            Text(
                                if (current.key == HOME.key) stringResource(R.string.app_name) else stringResource(current.label),
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawer.open() } }) {
                                Icon(Icons.Outlined.Menu, stringResource(R.string.menu))
                            }
                        },
                        actions = {
                            IconButton(onClick = openNotifications) {
                                BadgedBox(badge = { if (unreadNotices > 0) Badge { Text(if (unreadNotices > 99) "99+" else "$unreadNotices") } }) {
                                    Icon(Icons.Outlined.Notifications, stringResource(R.string.nav_notifications))
                                }
                            }
                            IconButton(onClick = openSettings) {
                                Avatar(access?.displayName.orEmpty(), access?.user?.avatarUrl, size = 32.dp)
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
                    )
                    OfflineNote(!online)
                }
            },
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    bar.forEach { s ->
                        NavigationBarItem(
                            selected = s.key == current.key,
                            onClick = { onTab(s.key) },
                            icon = {
                                if (s.key == MESSAGES.key && unread > 0) {
                                    BadgedBox(badge = { Badge { Text(if (unread > 99) "99+" else "$unread") } }) { Icon(s.icon, null) }
                                } else {
                                    Icon(s.icon, null)
                                }
                            },
                            label = { Text(stringResource(s.label), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        )
                    }
                }
            },
            contentWindowInsets = WindowInsets(0),
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
                // The site's sections, each kept alive behind the others.
                kept.forEach { k ->
                    val s = all.firstOrNull { it.key == k } ?: return@forEach
                    key(k) { WebScreen(services, s.path, onOpenChat = openChat, visible = s.key == current.key, key = "tab:" + s.key) }
                }
                when (current.key) {
                    HOME.key -> HomeScreen(services, openWeb = openWeb)
                    MESSAGES.key -> ChatListScreen(services, onOpen = openChat, onNewChat = newChat)
                }
            }
        }
    }
}

/** Once, after signing in: may the app show new messages on the lock screen? */
@Composable
private fun AskForNotifications(services: Services) {
    if (Build.VERSION.SDK_INT < 33) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var asked by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scope.launch { DeviceToken.register(context, services) }
    }
    LaunchedEffect(Unit) {
        if (asked) return@LaunchedEffect
        asked = true
        val prefs = context.app.prefs
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!granted && !prefs.getBoolean("asked_notifications", false)) {
            prefs.edit().putBoolean("asked_notifications", true).apply()
            delay(1_200)
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
