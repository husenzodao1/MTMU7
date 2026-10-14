package tj.mtmu7.app.ui.messages

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.CancellationSignal
import android.location.LocationManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.push.Notifications
import tj.mtmu7.app.ui.common.Avatar
import tj.mtmu7.app.ui.theme.LocalChatColors
import tj.mtmu7.shared.core.Times
import tj.mtmu7.shared.db.Message
import tj.mtmu7.shared.messenger.MessengerRepository
import tj.mtmu7.shared.messenger.Tick
import tj.mtmu7.shared.messenger.isBroadcast
import tj.mtmu7.shared.messenger.tickState
import java.time.ZoneId
import kotlin.coroutines.resume

private sealed interface Row {
    data class Day(val key: String, val label: String) : Row
    data class Bubble(val message: Message, val firstOfRun: Boolean) : Row
}

/**
 * One conversation, from the phone's own copy: open at once, readable with no
 * line; what is written goes onto the screen with its clock and leaves when it
 * can. Read as it is looked at.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(services: Services, conversationId: String, onBack: () -> Unit) {
    val messenger = services.messenger
    val context = LocalContext.current
    val conversation by messenger.conversation(conversationId).collectAsState(initial = messenger.conversationNow(conversationId))
    val access by services.auth.access.collectAsState()
    val me = access?.userId
    val zone = remember(access) { Times.zone(access?.school?.timezone) }
    var limit by rememberSaveable { mutableLongStateOf(120L) }
    val messages by messenger.messages(conversationId, limit).collectAsState(initial = emptyList())
    var hasMore by remember { mutableStateOf(true) }
    var draft by rememberSaveable { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<Message?>(null) }
    var editing by remember { mutableStateOf<Message?>(null) }
    var confirmDelete by remember { mutableStateOf<Message?>(null) }
    var attachMenu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val chat = LocalChatColors.current
    val language = context.resources.configuration.locales[0].language

    DisposableEffect(conversationId) {
        messenger.openConversation = conversationId
        Notifications.cancelConversation(context, conversationId)
        onDispose { if (messenger.openConversation == conversationId) messenger.openConversation = null }
    }
    LaunchedEffect(conversationId) {
        messenger.markRead(conversationId)
        hasMore = messenger.refreshThread(conversationId)
        messenger.markRead(conversationId)
    }
    // A message from the others while it is open: read at once.
    val newestFromOthers = messages.lastOrNull { it.sender_id != me }?.id
    LaunchedEffect(newestFromOthers) {
        if (newestFromOthers != null && (conversation?.unread_count ?: 0) > 0) messenger.markRead(conversationId)
    }
    // Near the top: the page before.
    val nearTop by remember { derivedStateOf { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= listState.layoutInfo.totalItemsCount - 5 } == true } }
    LaunchedEffect(nearTop, hasMore) {
        if (nearTop && hasMore && messages.size >= 30) {
            hasMore = messenger.loadOlder(conversationId)
            limit += MessengerRepository.PAGE
        }
    }
    // A new message of one's own: back to the bottom.
    val newestMine = messages.lastOrNull { it.sender_id == me }?.id
    LaunchedEffect(newestMine) { if (newestMine != null) listState.animateScrollToItem(0) }

    val rows = remember(messages, zone, language) { buildRows(messages, zone, language) }
    val c = conversation
    val broadcast = c != null && isBroadcast(c.type)
    val canPost = c == null || !broadcast || c.my_role == "admin"
    val groupish = c != null && (c.type == "group" || c.type == "class_group")

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            val photo = preparePhoto(context, uri)
            if (photo != null) {
                messenger.sendMedia(conversationId, photo.file, "image", "image/jpeg", caption = draft, width = photo.width, height = photo.height, replyToId = replyTo?.id)
                draft = ""
                replyTo = null
            }
        }
    }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) scope.launch { sendHere(context, messenger, conversationId) }
    }

    Column(Modifier.fillMaxSize().background(chat.wallpaper)) {
        TopAppBar(
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back)) }
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val title = c?.title(me).orEmpty()
                    Avatar(title, c?.peer(me)?.avatarUrl, 38.dp)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                        val subtitle = when {
                            c == null -> ""
                            c.type == "channel" -> stringResource(R.string.channel)
                            c.type != "direct" && c.member_count > 0 -> stringResource(R.string.members_count, c.member_count.toInt())
                            else -> ""
                        }
                        if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            },
            actions = {
                if (c != null) {
                    val muted = c.is_muted == 1L
                    IconButton(onClick = { scope.launch { messenger.setMuted(conversationId, !muted) } }) {
                        Icon(
                            if (muted) Icons.Outlined.NotificationsOff else Icons.Outlined.Notifications,
                            stringResource(if (muted) R.string.unmute else R.string.mute),
                        )
                    }
                }
            },
        )
        LazyColumn(
            state = listState,
            reverseLayout = true,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            items(rows, key = { r -> if (r is Row.Bubble) r.message.id else "day-" + (r as Row.Day).key }) { r ->
                when (r) {
                    is Row.Day -> DaySeparator(r.label)
                    is Row.Bubble -> {
                        val m = r.message
                        val mine = m.sender_id == me
                        Bubble(
                            m = m,
                            mine = mine,
                            showName = groupish && !mine && r.firstOfRun,
                            zone = zone,
                            tick = if (!mine || broadcast) null else when (m.state) {
                                MessengerRepository.STATE_PENDING -> Tick.Sending
                                MessengerRepository.STATE_FAILED -> Tick.Failed
                                else -> tickState(m.created_at, c?.peer_delivered_at, c?.peer_read_at)
                            },
                            quote = m.reply_to_id?.let { id -> messages.firstOrNull { it.id == id } ?: messenger.message(id) },
                            messenger = messenger,
                            onReply = { replyTo = m; editing = null },
                            onEdit = { editing = m; replyTo = null; draft = m.content },
                            onDelete = { confirmDelete = m },
                            onRetry = { messenger.retry(m.id) },
                        )
                    }
                }
            }
        }
        if (!canPost) {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Text(
                    stringResource(R.string.channel_read_only),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp),
                )
            }
        } else {
            Column(Modifier.navigationBarsPadding().imePadding()) {
                val context2 = replyTo ?: editing
                if (context2 != null) {
                    Row(
                        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(start = 16.dp, end = 4.dp, top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(if (editing != null) Icons.Outlined.Edit else Icons.AutoMirrored.Filled.Reply, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (editing != null) stringResource(R.string.editing) else senderName(context2, me),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(gist(context2), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = {
                            if (editing != null) draft = ""
                            replyTo = null
                            editing = null
                        }) { Icon(Icons.Outlined.Close, stringResource(R.string.back)) }
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            TextField(
                                value = draft,
                                onValueChange = { draft = it.take(5000) },
                                placeholder = { Text(stringResource(R.string.composer_hint)) },
                                maxLines = 6,
                                colors = TextFieldDefaults.colors(
                                    focusedIndicatorColor = Color.Transparent,
                                    unfocusedIndicatorColor = Color.Transparent,
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent,
                                ),
                                modifier = Modifier.weight(1f),
                            )
                            if (editing == null) {
                                Box {
                                    IconButton(onClick = { attachMenu = true }) { Icon(Icons.Outlined.AttachFile, stringResource(R.string.attach)) }
                                    DropdownMenu(expanded = attachMenu, onDismissRequest = { attachMenu = false }) {
                                        DropdownMenuItem(
                                            text = { Text(stringResource(R.string.send_photo)) },
                                            leadingIcon = { Icon(Icons.Outlined.Image, null) },
                                            onClick = {
                                                attachMenu = false
                                                photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                            },
                                        )
                                        DropdownMenuItem(
                                            text = { Text(stringResource(R.string.send_location)) },
                                            leadingIcon = { Icon(Icons.Outlined.LocationOn, null) },
                                            onClick = {
                                                attachMenu = false
                                                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                                                    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                                                if (granted) scope.launch { sendHere(context, messenger, conversationId) }
                                                else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.width(6.dp))
                    IconButton(
                        onClick = {
                            val text = draft.trim()
                            if (text.isEmpty()) return@IconButton
                            val e = editing
                            if (e != null) {
                                scope.launch { messenger.edit(e.id, text) }
                                editing = null
                            } else {
                                messenger.sendText(conversationId, text, replyTo?.id)
                                replyTo = null
                            }
                            draft = ""
                        },
                        modifier = Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.send), tint = MaterialTheme.colorScheme.onPrimary)
                    }
                }
            }
        }
    }

    confirmDelete?.let { m ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            text = { Text(stringResource(R.string.delete_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = null
                    scope.launch {
                        if (!messenger.deleteForEveryone(m.id)) Toast.makeText(context, R.string.error_unexpected, Toast.LENGTH_SHORT).show()
                    }
                }) { Text(stringResource(R.string.delete_for_all), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text(stringResource(R.string.back)) } },
        )
    }
}

@Composable
private fun DaySeparator(label: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f), shadowElevation = 0.5.dp) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, letterSpacing = 0.6.sp, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(
    m: Message,
    mine: Boolean,
    showName: Boolean,
    zone: ZoneId,
    tick: Tick?,
    quote: Message?,
    messenger: MessengerRepository,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onRetry: () -> Unit,
) {
    val chat = LocalChatColors.current
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    val deleted = m.is_deleted == 1L
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (mine) 16.dp else 4.dp,
                bottomEnd = if (mine) 4.dp else 16.dp,
            ),
            color = if (mine) chat.mine else chat.theirs,
            shadowElevation = 0.5.dp,
            modifier = Modifier
                .widthIn(max = 300.dp)
                .padding(start = if (mine) 48.dp else 0.dp, end = if (mine) 0.dp else 48.dp)
                .combinedClickable(
                    onClick = { if (m.state == MessengerRepository.STATE_FAILED) onRetry() },
                    onLongClick = { if (!deleted) menu = true },
                ),
        ) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                if (showName) {
                    Text(
                        listOfNotNull(m.sender_first_name, m.sender_last_name).joinToString(" "),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                if (quote != null && !deleted) {
                    Row(
                        Modifier
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                            .padding(8.dp)
                    ) {
                        Column {
                            Text(listOfNotNull(quote.sender_first_name, quote.sender_last_name).joinToString(" "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(gist(quote), maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                when {
                    deleted -> Text(stringResource(R.string.message_deleted), fontStyle = FontStyle.Italic, color = chat.meta)
                    m.type == "image" && m.media_path != null -> {
                        val url by produceState<String?>(null, m.media_path) { value = messenger.mediaUrl(m.media_path!!) }
                        val (w, h) = photoBox(m.media_width, m.media_height)
                        Box(Modifier.padding(vertical = 2.dp).size(w.dp, h.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            if (url != null) AsyncImage(model = url, contentDescription = stringResource(R.string.photo), contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        }
                        if (m.content.isNotBlank()) Text(m.content, style = MaterialTheme.typography.bodyLarge)
                    }
                    m.type == "location" && m.location_lat != null && m.location_lng != null -> {
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))
                                .clickable {
                                    val uri = Uri.parse("geo:${m.location_lat},${m.location_lng}?q=${m.location_lat},${m.location_lng}")
                                    val open = Intent(Intent.ACTION_VIEW, uri)
                                    runCatching { context.startActivity(open) }.onFailure {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.openstreetmap.org/?mlat=${m.location_lat}&mlon=${m.location_lng}#map=17/${m.location_lat}/${m.location_lng}")))
                                    }
                                }
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.LocationOn, null, tint = Color(0xFFD93025), modifier = Modifier.size(32.dp))
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(m.content.ifBlank { stringResource(R.string.location) }, fontWeight = FontWeight.Medium)
                                Text(stringResource(R.string.open_map), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    m.type == "audio" && m.media_path != null -> VoiceNote(m, messenger)
                    m.type == "file" && m.media_path != null -> {
                        val scope = rememberCoroutineScope()
                        Row(
                            Modifier.clickable {
                                scope.launch {
                                    messenger.mediaUrl(m.media_path!!)?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) }
                                }
                            }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.Description, null, modifier = Modifier.size(32.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(m.media_name ?: stringResource(R.string.file), fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                m.media_size?.let { Text("${(it / 1024).coerceAtLeast(1)} KB", style = MaterialTheme.typography.bodySmall, color = chat.meta) }
                            }
                        }
                        if (m.content.isNotBlank()) Text(m.content, style = MaterialTheme.typography.bodyLarge)
                    }
                    else -> Text(m.content, style = MaterialTheme.typography.bodyLarge)
                }
                Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                    if (m.is_edited == 1L && !deleted) Text(stringResource(R.string.edited) + " · ", style = MaterialTheme.typography.labelSmall, color = chat.meta)
                    Text(Times.clock(m.created_at, zone), style = MaterialTheme.typography.labelSmall, color = chat.meta)
                    if (tick != null) {
                        Spacer(Modifier.width(3.dp))
                        TickMark(tick)
                    }
                }
                if (m.state == MessengerRepository.STATE_FAILED) {
                    Text(stringResource(R.string.failed_tap), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text(stringResource(R.string.reply)) }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.Reply, null) }, onClick = { menu = false; onReply() })
                if (m.content.isNotBlank()) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.copy)) }, leadingIcon = { Icon(Icons.Outlined.ContentCopy, null) }, onClick = {
                        menu = false
                        clipboard.setText(AnnotatedString(m.content))
                        if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, R.string.copied, Toast.LENGTH_SHORT).show()
                    })
                }
                val editable = mine && m.type == "text" && m.state == MessengerRepository.STATE_SENT &&
                    System.currentTimeMillis() - m.created_at < 48L * 3600_000
                if (editable) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.edit)) }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { menu = false; onEdit() })
                }
                if (mine) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.delete_for_all), color = MaterialTheme.colorScheme.error) },
                        leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = MaterialTheme.colorScheme.error) },
                        onClick = { menu = false; onDelete() },
                    )
                }
            }
        }
    }
}

/** A voice note: play and pause from its link (an hour long, from the private bucket). */
@Composable
private fun VoiceNote(m: Message, messenger: MessengerRepository) {
    val scope = rememberCoroutineScope()
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    DisposableEffect(m.id) { onDispose { player?.release() } }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
        IconButton(onClick = {
            val p = player
            if (p != null && playing) {
                p.pause()
                playing = false
            } else if (p != null) {
                p.start()
                playing = true
            } else scope.launch {
                val url = messenger.mediaUrl(m.media_path!!) ?: return@launch
                player = MediaPlayer().apply {
                    setDataSource(url)
                    setOnPreparedListener { start(); playing = true }
                    setOnCompletionListener { playing = false; seekTo(0) }
                    prepareAsync()
                }
            }
        }) { Icon(if (playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, stringResource(R.string.voice)) }
        Text(stringResource(R.string.voice) + (m.media_duration?.let { " · %d:%02d".format(it / 60, it % 60) } ?: ""), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun senderName(m: Message, me: String?): String =
    if (m.sender_id == me) stringResource(R.string.you) else listOfNotNull(m.sender_first_name, m.sender_last_name).joinToString(" ")

@Composable
private fun gist(m: Message): String = when {
    m.is_deleted == 1L -> stringResource(R.string.message_deleted)
    m.type == "image" -> "📷 " + m.content.ifBlank { stringResource(R.string.photo) }
    m.type == "location" -> "📍 " + m.content.ifBlank { stringResource(R.string.location) }
    m.type == "file" -> "📎 " + (m.media_name ?: stringResource(R.string.file))
    m.type == "audio" -> "🎤 " + stringResource(R.string.voice)
    else -> m.content
}

/** Newest first (the list is drawn from the bottom), a day's label before its first message. */
private fun buildRows(messages: List<Message>, zone: ZoneId, language: String): List<Row> {
    val out = ArrayList<Row>(messages.size + 8)
    val today = Times.today(zone)
    for (i in messages.indices.reversed()) {
        val m = messages[i]
        val older = messages.getOrNull(i - 1)
        val firstOfRun = older == null || older.sender_id != m.sender_id || Times.dayKey(older.created_at, zone) != Times.dayKey(m.created_at, zone)
        out += Row.Bubble(m, firstOfRun)
        val key = Times.dayKey(m.created_at, zone)
        if (older == null || Times.dayKey(older.created_at, zone) != key) {
            val day = java.time.LocalDate.parse(key)
            val label = when (day) {
                today -> if (language == "ru") "Сегодня" else if (language == "en") "Today" else "Имрӯз"
                today.minusDays(1) -> if (language == "ru") "Вчера" else if (language == "en") "Yesterday" else "Дирӯз"
                else -> Times.date(day, language)
            }
            out += Row.Day(key, label)
        }
    }
    return out
}

/** Where the phone is, now or as last known, sent as a place (location.tsx). */
@SuppressLint("MissingPermission")
private suspend fun sendHere(context: Context, messenger: MessengerRepository, conversationId: String) {
    val manager = context.getSystemService(LocationManager::class.java)
    val provider = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).firstOrNull { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
    val fix: Location? = provider?.let { p ->
        withTimeoutOrNull(12_000) {
            suspendCancellableCoroutine<Location?> { done ->
                val signal = CancellationSignal()
                done.invokeOnCancellation { signal.cancel() }
                LocationManagerCompat.getCurrentLocation(manager, p, signal, ContextCompat.getMainExecutor(context)) { location: Location? ->
                    if (done.isActive) done.resume(location)
                }
            }
        }
    } ?: listOfNotNull(
        runCatching { manager.getLastKnownLocation(LocationManager.GPS_PROVIDER) }.getOrNull(),
        runCatching { manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) }.getOrNull(),
    ).maxByOrNull { it.time }
    if (fix == null) {
        Toast.makeText(context, R.string.location_failed, Toast.LENGTH_LONG).show()
        return
    }
    messenger.sendLocation(conversationId, fix.latitude, fix.longitude)
}
