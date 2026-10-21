package tj.mtmu7.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.shared.core.Times

/**
 * What the school told this person: from the phone's copy at once, brought up
 * to date as the screen opens. A notice with a link opens what it is about —
 * a conversation in the app's messenger, anything else in its section.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(services: Services, onBack: () -> Unit, openLink: (String) -> Unit) {
    val notices by services.content.notifications.collectAsState()
    val access by services.auth.access.collectAsState()
    val zone = remember(access) { Times.zone(access?.school?.timezone) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { services.content.refreshNotifications() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.nav_notifications), fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.back)) }
                },
                actions = {
                    if (notices.any { !it.isRead }) {
                        IconButton(onClick = { scope.launch { services.content.markAllNotificationsRead() } }) {
                            Icon(Icons.Outlined.DoneAll, stringResource(R.string.mark_all_read))
                        }
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                scope.launch {
                    services.content.refreshNotifications()
                    refreshing = false
                }
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            if (notices.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.no_notifications), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    items(notices, key = { it.id }) { n ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !n.linkUrl.isNullOrBlank()) { n.linkUrl?.let(openLink) }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Box(
                                Modifier
                                    .padding(top = 6.dp)
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (n.isRead) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.primary)
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    n.title.orEmpty(),
                                    fontWeight = if (n.isRead) FontWeight.Normal else FontWeight.SemiBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (!n.body.isNullOrBlank()) {
                                    Text(
                                        n.body.orEmpty(),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 3,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Text(
                                    Times.parse(n.createdAt)?.let { Times.listStamp(it, zone) }.orEmpty(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.outline,
                                )
                            }
                        }
                        HorizontalDivider(Modifier.padding(start = 36.dp))
                    }
                }
            }
        }
    }
}
