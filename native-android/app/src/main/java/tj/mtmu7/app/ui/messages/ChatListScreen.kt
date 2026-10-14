package tj.mtmu7.app.ui.messages

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.ui.common.Avatar
import tj.mtmu7.app.ui.common.CountBadge
import tj.mtmu7.app.ui.theme.LocalChatColors
import tj.mtmu7.shared.core.Times
import tj.mtmu7.shared.core.fold
import tj.mtmu7.shared.db.Conversation
import tj.mtmu7.shared.messenger.isBroadcast
import tj.mtmu7.shared.messenger.tickState

private enum class ChatFilter { All, Unread, Groups, Channels }

/**
 * The conversations, from the phone's own copy: on screen the moment the tab
 * is tapped, kept current by realtime and by a pull from the top.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(services: Services, onOpen: (String) -> Unit, onNewChat: () -> Unit) {
    val conversations by services.messenger.conversations().collectAsState(initial = emptyList())
    val access by services.auth.access.collectAsState()
    val me = access?.userId
    val zone = remember(access) { Times.zone(access?.school?.timezone) }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(ChatFilter.All) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val needle = fold(query.trim())
    val visible = conversations.filter { c ->
        when (filter) {
            ChatFilter.All -> true
            ChatFilter.Unread -> c.unread_count > 0
            ChatFilter.Groups -> c.type == "group" || c.type == "class_group" || c.type == "announcement"
            ChatFilter.Channels -> c.type == "channel"
        }
    }
    val titled = visible.map { it to it.title(me) }.filter { (_, title) -> needle.isEmpty() || fold(title).contains(needle) }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                scope.launch {
                    services.messenger.refreshConversations()
                    refreshing = false
                }
            },
        ) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                item {
                    TextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text(stringResource(R.string.chats_filter)) },
                        leadingIcon = { Icon(Icons.Outlined.Search, null) },
                        singleLine = true,
                        shape = RoundedCornerShape(24.dp),
                        colors = TextFieldDefaults.colors(
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        ),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(ChatFilter.entries.filter { it != ChatFilter.Channels || conversations.any { c -> c.type == "channel" } }) { f ->
                            val unread = conversations.count { it.unread_count > 0 }
                            FilterChip(
                                selected = filter == f,
                                onClick = { filter = f },
                                label = {
                                    Text(
                                        when (f) {
                                            ChatFilter.All -> stringResource(R.string.filter_all)
                                            ChatFilter.Unread -> stringResource(R.string.filter_unread) + if (unread > 0) " $unread" else ""
                                            ChatFilter.Groups -> stringResource(R.string.filter_groups)
                                            ChatFilter.Channels -> stringResource(R.string.filter_channels)
                                        }
                                    )
                                },
                                shape = RoundedCornerShape(20.dp),
                            )
                        }
                    }
                }
                if (titled.isEmpty()) {
                    item {
                        Text(
                            stringResource(if (filter == ChatFilter.Unread) R.string.no_unread else R.string.no_chats),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(24.dp),
                        )
                    }
                }
                items(titled, key = { it.first.id }) { (c, title) ->
                    ChatRow(c, title, me, zone) { onOpen(c.id) }
                }
            }
        }
        FloatingActionButton(
            onClick = onNewChat,
            containerColor = Color(0xFFE8590C),
            contentColor = Color.White,
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
        ) {
            Icon(Icons.AutoMirrored.Outlined.Chat, contentDescription = stringResource(R.string.new_chat))
        }
    }
}

@Composable
private fun ChatRow(c: Conversation, title: String, me: String?, zone: java.time.ZoneId, onClick: () -> Unit) {
    val chat = LocalChatColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (c.type) {
            "direct" -> Avatar(title, c.peer(me)?.avatarUrl, 50.dp)
            else -> Box(
                Modifier.size(50.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    when (c.type) {
                        "support" -> Icons.Outlined.HeadsetMic
                        "channel", "announcement" -> Icons.Outlined.Campaign
                        else -> Icons.Outlined.Groups
                    },
                    null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                c.last_message_at?.let {
                    Text(
                        Times.listStamp(it, zone),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (c.unread_count > 0) chat.badge else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val mineLast = c.last_message_sender_id != null && c.last_message_sender_id == me && c.last_message_deleted == 0L
                if (mineLast && !isBroadcast(c.type) && c.last_message_at != null) {
                    TickMark(tickState(c.last_message_at!!, c.peer_delivered_at, c.peer_read_at), Modifier.padding(end = 4.dp))
                }
                Text(
                    c.preview(me),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = if (c.unread_count > 0) FontWeight.Medium else FontWeight.Normal,
                    modifier = Modifier.weight(1f),
                )
                if (c.is_muted == 1L) {
                    Icon(Icons.Outlined.NotificationsOff, stringResource(R.string.muted), Modifier.size(16.dp).padding(start = 4.dp), tint = MaterialTheme.colorScheme.outline)
                }
                Spacer(Modifier.width(6.dp))
                CountBadge(c.unread_count, muted = c.is_muted == 1L, color = chat.badge)
            }
        }
    }
    HorizontalDivider(Modifier.padding(start = 78.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}
