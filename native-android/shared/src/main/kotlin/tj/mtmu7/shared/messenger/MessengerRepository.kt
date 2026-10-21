package tj.mtmu7.shared.messenger

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOne
import app.cash.sqldelight.coroutines.mapToOneOrNull
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.decodeRecord
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.storage.storage
import io.ktor.http.ContentType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import tj.mtmu7.shared.auth.AuthRepository
import tj.mtmu7.shared.core.AppJson
import tj.mtmu7.shared.core.Backend
import tj.mtmu7.shared.core.Times
import tj.mtmu7.shared.db.Conversation
import tj.mtmu7.shared.db.Member
import tj.mtmu7.shared.db.Message
import tj.mtmu7.shared.model.ContactRow
import tj.mtmu7.shared.model.ConversationRow
import tj.mtmu7.shared.model.MemberJson
import tj.mtmu7.shared.model.MemberRecord
import tj.mtmu7.shared.model.MessageRecord
import tj.mtmu7.shared.model.MessageRow
import tj.mtmu7.shared.model.OutgoingRow
import java.io.File
import java.util.UUID
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.seconds

/**
 * The messenger, kept on the phone.
 *
 * Every screen reads the phone's own database, so a conversation opens at
 * once and stays readable with no line at all. The server is caught up with
 * behind it: the list (list_my_conversations), a conversation's newest
 * messages (get_conversation_messages), and from then on whatever realtime
 * says. A message written here goes into the database first, with its clock,
 * and from there to the server — in the order it was written, again after a
 * pause or when the line returns, never twice: its id is made here, and a
 * second write of the same id is told the row exists (23505), which is
 * "sent". The same contract as the site (src/features/messages/outbox.ts).
 */
class MessengerRepository(
    private val backend: Backend,
    private val auth: AuthRepository,
) {
    private val db = backend.db
    private val supabase get() = backend.supabase
    private val me: String? get() = auth.access.value?.userId
    private val schoolId: String? get() = auth.access.value?.schoolId

    /** The conversation on screen: its new messages are read as they come, never counted unread. */
    @Volatile
    var openConversation: String? = null

    // ------------------------------------------------------------------ what the screens read

    fun conversations(): Flow<List<Conversation>> = db.conversationQueries.all().asFlow().mapToList(Dispatchers.IO)

    fun conversation(id: String): Flow<Conversation?> = db.conversationQueries.byId(id).asFlow().mapToOneOrNull(Dispatchers.IO)

    fun messages(conversationId: String, limit: Long): Flow<List<Message>> =
        db.messageQueries.latest(conversationId, limit).asFlow().mapToList(Dispatchers.IO)

    fun members(conversationId: String): Flow<List<Member>> =
        db.memberQueries.inConversation(conversationId).asFlow().mapToList(Dispatchers.IO)

    /** The badge: unread in conversations not muted. */
    fun unreadTotal(): Flow<Long> = db.conversationQueries.unreadTotal().asFlow().mapToOne(Dispatchers.IO)

    fun message(id: String): Message? = db.messageQueries.byId(id).executeAsOneOrNull()

    fun membersNow(conversationId: String): List<Member> = db.memberQueries.inConversation(conversationId).executeAsList()

    fun conversationNow(id: String): Conversation? = db.conversationQueries.byId(id).executeAsOneOrNull()

    // ------------------------------------------------------------------ catching up with the server

    private val listLock = Mutex()

    /** The whole list, as the server has it now. False with no line: the phone's copy stays. */
    suspend fun refreshConversations(): Boolean = listLock.withLock {
        val rows = try {
            supabase.postgrest.rpc("list_my_conversations", buildJsonObject { put("p_limit", 200) }).decodeList<ConversationRow>()
        } catch (e: Exception) {
            return false
        }
        val unsentReads = db.storeQueries.pendingReads().executeAsList().map { it.conversation_id }.toSet()
        db.transaction {
            for (row in rows) {
                val lastAt = Times.parse(row.lastMessageAt)
                val updated = Times.parse(row.updatedAt)
                val unread = if (row.id in unsentReads || row.id == openConversation) 0L else row.unreadCount ?: 0L
                db.conversationQueries.upsert(
                    Conversation(
                        id = row.id,
                        type = row.type,
                        name = row.name,
                        description = row.description,
                        created_by = row.createdBy,
                        my_role = row.myRole,
                        is_muted = if (row.isMuted == true) 1L else 0L,
                        member_count = row.memberCount ?: (row.members?.size?.toLong() ?: 0L),
                        members_json = AppJson.encodeToString(ListSerializer(MemberJson.serializer()), row.members.orEmpty()),
                        last_message_content = row.lastMessageContent,
                        last_message_sender_id = row.lastMessageSenderId,
                        last_message_at = lastAt,
                        last_message_type = row.lastMessageType,
                        last_message_deleted = if (row.lastMessageDeleted == true) 1L else 0L,
                        unread_count = unread,
                        peer_read_at = Times.parse(row.peerReadAt),
                        peer_delivered_at = Times.parse(row.peerDeliveredAt),
                        updated_at = updated,
                        sort_at = lastAt ?: updated ?: 0L,
                    )
                )
            }
            if (rows.isEmpty()) db.conversationQueries.clear() else db.conversationQueries.deleteNotIn(rows.map { it.id })
        }
        true
    }

    /** A conversation's newest messages and its members. True when there may be older ones. */
    suspend fun refreshThread(conversationId: String): Boolean {
        val rows = try {
            supabase.postgrest.rpc(
                "get_conversation_messages",
                buildJsonObject {
                    put("p_conversation_id", conversationId)
                    put("p_limit", PAGE)
                },
            ).decodeList<MessageRow>()
        } catch (e: Exception) {
            return true
        }
        db.transaction { rows.forEach { db.messageQueries.upsert(it.toEntity()) } }
        refreshMembers(conversationId)
        return rows.size >= PAGE
    }

    /** The page before the oldest the phone has. True when there may be more still. */
    suspend fun loadOlder(conversationId: String): Boolean {
        val oldest = db.messageQueries.oldest(conversationId).executeAsOneOrNull() ?: return refreshThread(conversationId)
        val rows = try {
            supabase.postgrest.rpc(
                "get_conversation_messages",
                buildJsonObject {
                    put("p_conversation_id", conversationId)
                    put("p_before_created_at", Times.iso(oldest.created_at))
                    put("p_before_id", oldest.id)
                    put("p_limit", PAGE)
                },
            ).decodeList<MessageRow>()
        } catch (e: Exception) {
            return true
        }
        db.transaction { rows.forEach { db.messageQueries.upsert(it.toEntity()) } }
        return rows.size >= PAGE
    }

    suspend fun refreshMembers(conversationId: String) {
        val rows = try {
            supabase.from("conversation_members").select(
                Columns.raw("conversation_id, user_id, role, is_muted, joined_at, last_read_at, last_delivered_at, users(first_name, last_name, avatar_url)")
            ) {
                filter { eq("conversation_id", conversationId) }
                order("joined_at", Order.ASCENDING)
            }.decodeList<MemberRecord>()
        } catch (e: Exception) {
            return
        }
        db.transaction {
            db.memberQueries.deleteIn(conversationId)
            rows.forEach { r ->
                db.memberQueries.upsert(
                    Member(
                        conversation_id = conversationId,
                        user_id = r.userId,
                        role = r.role,
                        first_name = r.users?.firstName,
                        last_name = r.users?.lastName,
                        avatar_url = r.users?.avatarUrl,
                        joined_at = Times.parse(r.joinedAt),
                        last_read_at = Times.parse(r.lastReadAt),
                        last_delivered_at = Times.parse(r.lastDeliveredAt),
                    )
                )
            }
        }
        recomputePeerMarks(conversationId)
    }

    private fun recomputePeerMarks(conversationId: String) {
        val me = me ?: return
        val conversation = db.conversationQueries.byId(conversationId).executeAsOneOrNull() ?: return
        val others = db.memberQueries.inConversation(conversationId).executeAsList()
            .filter { it.user_id != me }
            .map { it.user_id to (it.last_read_at to it.last_delivered_at) }
        if (others.isEmpty()) return
        val marks = peerMarks(conversation.type, conversation.created_by, me, others)
        db.conversationQueries.setPeerMarks(marks.readAt, marks.deliveredAt, conversationId)
    }

    // ------------------------------------------------------------------ writing

    /** A message of words, on its way at once; its id. */
    fun sendText(conversationId: String, text: String, replyToId: String? = null): String? {
        val content = text.trim().take(5000)
        if (content.isEmpty()) return null
        return enqueue(conversationId, type = "text", content = content, replyToId = replyToId)
    }

    fun sendLocation(conversationId: String, lat: Double, lng: Double, label: String = ""): String? =
        enqueue(
            conversationId,
            type = "location",
            content = label.take(200),
            lat = Math.round(lat * 1e6) / 1e6,
            lng = Math.round(lng * 1e6) / 1e6,
        )

    /**
     * A photo, a file or a voice note, kept as a file of the app's own until
     * it is uploaded; the bubble shows it from there at once.
     */
    fun sendMedia(
        conversationId: String,
        file: File,
        type: String,
        mime: String,
        caption: String = "",
        width: Int? = null,
        height: Int? = null,
        name: String? = null,
        durationSeconds: Int? = null,
        replyToId: String? = null,
    ): String? = enqueue(
        conversationId,
        type = type,
        content = caption.trim().take(5000),
        replyToId = replyToId,
        mediaPath = LOCAL + file.absolutePath,
        width = width,
        height = height,
        name = name,
        size = file.length(),
        mime = mime,
        duration = durationSeconds,
    )

    private fun enqueue(
        conversationId: String,
        type: String,
        content: String,
        replyToId: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        mediaPath: String? = null,
        width: Int? = null,
        height: Int? = null,
        name: String? = null,
        size: Long? = null,
        mime: String? = null,
        duration: Int? = null,
    ): String? {
        val me = me ?: return null
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val access = auth.access.value
        db.transaction {
            db.messageQueries.upsert(
                Message(
                    id = id,
                    conversation_id = conversationId,
                    sender_id = me,
                    sender_first_name = access?.user?.firstName,
                    sender_last_name = access?.user?.lastName,
                    sender_avatar_url = access?.user?.avatarUrl,
                    content = content,
                    type = type,
                    reply_to_id = replyToId,
                    is_pinned = 0,
                    is_edited = 0,
                    is_deleted = 0,
                    is_favorite = 0,
                    created_at = now,
                    edited_at = null,
                    location_lat = lat,
                    location_lng = lng,
                    media_path = mediaPath,
                    media_width = width?.toLong(),
                    media_height = height?.toLong(),
                    media_name = name,
                    media_size = size,
                    media_mime = mime,
                    media_duration = duration?.toLong(),
                    reactions_json = "[]",
                    state = STATE_PENDING,
                    failure = null,
                )
            )
            db.conversationQueries.setLast(content, me, now, type, 0, 0, conversationId)
        }
        kick()
        return id
    }

    /** A refused message, tried again. */
    fun retry(id: String) {
        db.messageQueries.setState(STATE_PENDING, null, id)
        kick()
    }

    /** A message on its way, taken back before it went. */
    fun discard(id: String) {
        val m = message(id) ?: return
        if (m.state != STATE_SENT) db.messageQueries.deleteById(id)
    }

    private val flushLock = Mutex()
    private var flushJob: Job? = null

    /** Something waits to go: send it now, and keep trying with growing pauses. */
    fun kick() {
        if (flushJob?.isActive == true) return
        flushJob = backend.scope.launch {
            var pause = 1_500L
            while (true) {
                if (flushOutbox()) break
                delay(pause)
                pause = (pause * 2).coerceAtMost(30_000)
            }
        }
    }

    /** The line came back: whatever waits goes now, without waiting out its pause. */
    fun onLineBack() {
        flushJob?.cancel()
        flushJob = null
        kick()
        backend.scope.launch { flushReads() }
    }

    /**
     * Sends what waits, oldest first, and stops at the first that cannot go yet
     * (so the order holds). True when nothing is left waiting.
     */
    suspend fun flushOutbox(): Boolean = flushLock.withLock {
        val me = me ?: return true
        val school = schoolId ?: return true
        for (m in db.messageQueries.pending().executeAsList()) {
            var path = m.media_path
            if (path != null && path.startsWith(LOCAL)) {
                path = upload(m, school, me) ?: return false
            }
            val row = OutgoingRow(
                id = m.id,
                conversationId = m.conversation_id,
                schoolId = school,
                senderId = me,
                content = m.content,
                type = m.type,
                replyToId = m.reply_to_id,
                locationLat = m.location_lat,
                locationLng = m.location_lng,
                mediaPath = path,
                mediaWidth = m.media_width?.toInt(),
                mediaHeight = m.media_height?.toInt(),
                mediaName = m.media_name,
                mediaSize = m.media_size,
                mediaMime = m.media_mime,
                mediaDuration = m.media_duration?.toInt(),
            )
            when (val result = insert(row)) {
                Sent.Ok -> {
                    db.messageQueries.upsert(m.copy(media_path = path, state = STATE_SENT, failure = null))
                    backend.scope.launch { backend.portal.announceMessage(m.id) }
                }
                Sent.Again -> return false
                is Sent.Refused -> db.messageQueries.setState(STATE_FAILED, result.error, m.id)
            }
        }
        true
    }

    private sealed interface Sent {
        data object Ok : Sent
        data object Again : Sent
        data class Refused(val error: String) : Sent
    }

    private suspend fun insert(row: OutgoingRow): Sent = try {
        withTimeout(25.seconds) { supabase.from("messages").insert(row) }
        Sent.Ok
    } catch (e: PostgrestRestException) {
        when {
            e.code == "23505" -> Sent.Ok
            transient(e.code) -> Sent.Again
            else -> Sent.Refused(dbError(e))
        }
    } catch (e: Exception) {
        // No answer at all: the line, not the message.
        Sent.Again
    }

    /** The bytes go up first; the row only once they are there (media.ts). */
    private suspend fun upload(m: Message, school: String, me: String): String? {
        val file = File(m.media_path!!.removePrefix(LOCAL))
        if (!file.exists()) {
            db.messageQueries.setState(STATE_FAILED, "errors.file_missing", m.id)
            return null
        }
        val ext = file.extension.ifBlank { "bin" }.lowercase()
        val path = "$school/${m.conversation_id}/$me/${m.id}.$ext"
        return try {
            withTimeout(120.seconds) {
                supabase.storage.from(CHAT_MEDIA).upload(path, file.readBytes()) {
                    upsert = false
                    contentType = ContentType.parse(m.media_mime ?: "application/octet-stream")
                }
            }
            path
        } catch (e: Exception) {
            val text = e.message.orEmpty().lowercase()
            if ("exist" in text || "duplicate" in text) path else null
        }
    }

    // ------------------------------------------------------------------ reading

    /**
     * The conversation was read: on the phone at once (the list and the badge
     * clear), on the server as soon as it can be told.
     */
    suspend fun markRead(conversationId: String) {
        val me = me ?: return
        val now = System.currentTimeMillis()
        db.transaction {
            db.conversationQueries.markRead(conversationId)
            db.memberQueries.inConversation(conversationId).executeAsList().firstOrNull { it.user_id == me }?.let {
                db.memberQueries.setMarks(now, now, conversationId, me)
            }
        }
        try {
            supabase.postgrest.rpc("mark_conversation_read", buildJsonObject { put("p_conversation_id", conversationId) })
            db.storeQueries.dropPendingRead(conversationId)
        } catch (e: Exception) {
            db.storeQueries.addPendingRead(conversationId, now)
        }
    }

    suspend fun flushReads() {
        for (p in db.storeQueries.pendingReads().executeAsList()) {
            try {
                supabase.postgrest.rpc("mark_conversation_read", buildJsonObject { put("p_conversation_id", p.conversation_id) })
                db.storeQueries.dropPendingRead(p.conversation_id)
            } catch (e: Exception) {
                return
            }
        }
    }

    /** "I am here, and what was sent to me has reached me" (00094): the second tick for the others. */
    suspend fun touch() {
        runCatching { supabase.postgrest.rpc("touch_messenger") }
    }

    // ------------------------------------------------------------------ live

    private var channel: RealtimeChannel? = null
    private var liveJob: Job? = null

    /** Listens for new messages, edits, reads, and conversations one is added to. */
    suspend fun startLive(scope: CoroutineScope = backend.scope) {
        val me = me ?: return
        if (channel != null) return
        val ch = supabase.channel("messenger-$me")
        val inserts = ch.postgresChangeFlow<PostgresAction.Insert>(schema = "public") { table = "messages" }
        val updates = ch.postgresChangeFlow<PostgresAction.Update>(schema = "public") { table = "messages" }
        val memberUpdates = ch.postgresChangeFlow<PostgresAction.Update>(schema = "public") { table = "conversation_members" }
        val memberInserts = ch.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
            table = "conversation_members"
            filter = "user_id=eq.$me"
        }
        val job = Job()
        inserts.onEach { runCatching { onMessage(it.decodeRecord<MessageRecord>(), inserted = true) } }.launchIn(CoroutineScope(scope.coroutineContext + job))
        updates.onEach { runCatching { onMessage(it.decodeRecord<MessageRecord>(), inserted = false) } }.launchIn(CoroutineScope(scope.coroutineContext + job))
        memberUpdates.onEach { runCatching { onMember(it.decodeRecord<MemberRecord>()) } }.launchIn(CoroutineScope(scope.coroutineContext + job))
        memberInserts.onEach { refreshConversations() }.launchIn(CoroutineScope(scope.coroutineContext + job))
        channel = ch
        liveJob = job
        ch.subscribe()
    }

    suspend fun stopLive() {
        liveJob?.cancel()
        liveJob = null
        channel?.let { runCatching { supabase.realtime.removeChannel(it) } }
        channel = null
    }

    private suspend fun onMessage(r: MessageRecord, inserted: Boolean) {
        val me = me
        val existing = db.messageQueries.byId(r.id).executeAsOneOrNull()
        val sender = r.senderId?.let { id -> senderOf(r.conversationId, id) }
        val entity = Message(
            id = r.id,
            conversation_id = r.conversationId,
            sender_id = r.senderId,
            sender_first_name = sender?.first ?: existing?.sender_first_name,
            sender_last_name = sender?.second ?: existing?.sender_last_name,
            sender_avatar_url = sender?.third ?: existing?.sender_avatar_url,
            content = if (r.isDeleted) "" else r.content,
            type = r.type,
            reply_to_id = r.replyToId,
            is_pinned = r.isPinned.toLong(),
            is_edited = r.isEdited.toLong(),
            is_deleted = r.isDeleted.toLong(),
            is_favorite = existing?.is_favorite ?: 0,
            created_at = Times.parse(r.createdAt) ?: existing?.created_at ?: System.currentTimeMillis(),
            edited_at = Times.parse(r.editedAt),
            location_lat = r.locationLat,
            location_lng = r.locationLng,
            media_path = r.mediaPath,
            media_width = r.mediaWidth?.toLong(),
            media_height = r.mediaHeight?.toLong(),
            media_name = r.mediaName,
            media_size = r.mediaSize,
            media_mime = r.mediaMime,
            media_duration = r.mediaDuration?.toLong(),
            reactions_json = existing?.reactions_json ?: "[]",
            state = STATE_SENT,
            failure = null,
        )
        val known = db.conversationQueries.byId(r.conversationId).executeAsOneOrNull() != null
        db.transaction {
            db.messageQueries.upsert(entity)
            if (inserted && existing?.state != STATE_SENT) {
                val mine = r.senderId == me
                val open = r.conversationId == openConversation
                val unread = if (!mine && !open && existing == null) 1L else 0L
                db.conversationQueries.setLast(entity.content, r.senderId, entity.created_at, r.type, entity.is_deleted, unread, r.conversationId)
            }
        }
        if (!known) refreshConversations()
        if (inserted && r.senderId != me) {
            if (r.conversationId == openConversation) markRead(r.conversationId) else touch()
        }
    }

    private fun onMember(r: MemberRecord) {
        val conversationId = r.conversationId ?: return
        val read = Times.parse(r.lastReadAt)
        val delivered = Times.parse(r.lastDeliveredAt)
        db.memberQueries.setMarks(read, delivered, conversationId, r.userId)
        if (r.userId == me) {
            val conversation = db.conversationQueries.byId(conversationId).executeAsOneOrNull()
            if (conversation != null && read != null && (conversation.last_message_at ?: 0) <= read) {
                db.conversationQueries.markRead(conversationId)
            }
            r.isMuted?.let { db.conversationQueries.setMuted(if (it) 1 else 0, conversationId) }
        } else {
            recomputePeerMarks(conversationId)
        }
    }

    /** A sender's name and face: from the members, else from the list's first members. */
    private fun senderOf(conversationId: String, userId: String): Triple<String?, String?, String?>? {
        db.memberQueries.inConversation(conversationId).executeAsList().firstOrNull { it.user_id == userId }?.let {
            return Triple(it.first_name, it.last_name, it.avatar_url)
        }
        val conversation = db.conversationQueries.byId(conversationId).executeAsOneOrNull() ?: return null
        val members = runCatching {
            AppJson.decodeFromString(ListSerializer(MemberJson.serializer()), conversation.members_json)
        }.getOrDefault(emptyList())
        return members.firstOrNull { it.userId == userId }?.let { Triple(it.firstName, it.lastName, it.avatarUrl) }
    }

    // ------------------------------------------------------------------ the rest of a messenger

    /** Taken back for everybody (the server empties it: app.guard_message_write). */
    suspend fun deleteForEveryone(id: String): Boolean {
        val m = message(id) ?: return false
        if (m.state != STATE_SENT) {
            db.messageQueries.deleteById(id)
            return true
        }
        return try {
            supabase.from("messages").update(buildJsonObject { put("is_deleted", true) }) {
                filter { eq("id", id) }
            }
            db.messageQueries.markDeleted(id)
            m.media_path?.let { path -> runCatching { supabase.storage.from(CHAT_MEDIA).delete(path) } }
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Words changed within 48 hours of writing them. */
    suspend fun edit(id: String, text: String): Boolean {
        val content = text.trim().take(5000)
        if (content.isEmpty()) return false
        return try {
            supabase.from("messages").update(buildJsonObject { put("content", content) }) {
                filter { eq("id", id) }
            }
            message(id)?.let { db.messageQueries.upsert(it.copy(content = content, is_edited = 1, edited_at = System.currentTimeMillis())) }
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun setMuted(conversationId: String, muted: Boolean): Boolean {
        val me = me ?: return false
        return try {
            supabase.from("conversation_members").update(buildJsonObject { put("is_muted", muted) }) {
                filter {
                    eq("conversation_id", conversationId)
                    eq("user_id", me)
                }
            }
            db.conversationQueries.setMuted(if (muted) 1 else 0, conversationId)
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun searchContacts(query: String): List<ContactRow> {
        if (query.trim().length < 2) return emptyList()
        return try {
            supabase.postgrest.rpc(
                "search_message_contacts",
                buildJsonObject {
                    put("p_query", query.trim())
                    put("p_limit", 30)
                },
            ).decodeList<ContactRow>()
        } catch (e: Exception) {
            emptyList()
        }
    }

    /** The conversation with one person, made if there is none; its id. */
    suspend fun openDirect(userId: String): String? = try {
        val id = supabase.postgrest.rpc("create_direct_conversation", buildJsonObject { put("p_target_user_id", userId) })
            .decodeAs<String>()
        refreshConversations()
        id
    } catch (e: Exception) {
        null
    }

    /** The school's support desk. */
    suspend fun openSupport(): String? = try {
        val id = supabase.postgrest.rpc("open_support_conversation").decodeAs<String>()
        refreshConversations()
        id
    } catch (e: Exception) {
        null
    }

    private val urls = HashMap<String, Pair<String, Long>>()

    /** A photo or a voice note of the private bucket, by a link good for an hour. */
    suspend fun mediaUrl(path: String): String? {
        if (path.startsWith(LOCAL)) return "file://" + path.removePrefix(LOCAL)
        val now = System.currentTimeMillis()
        urls[path]?.let { (url, until) -> if (until > now + 5 * 60_000) return url }
        return try {
            val url = supabase.storage.from(CHAT_MEDIA).createSignedUrl(path, 1.hours)
            urls[path] = url to now + 3_600_000
            url
        } catch (e: Exception) {
            null
        }
    }

    private fun MessageRow.toEntity(): Message {
        val existing = db.messageQueries.byId(id).executeAsOneOrNull()
        return Message(
            id = id,
            conversation_id = conversationId,
            sender_id = senderId,
            sender_first_name = senderFirstName,
            sender_last_name = senderLastName,
            sender_avatar_url = senderAvatarUrl,
            content = content,
            type = type,
            reply_to_id = replyToId,
            is_pinned = isPinned.toLong(),
            is_edited = isEdited.toLong(),
            is_deleted = isDeleted.toLong(),
            is_favorite = isFavorite.toLong(),
            created_at = Times.parse(createdAt) ?: existing?.created_at ?: 0L,
            edited_at = Times.parse(editedAt),
            location_lat = locationLat,
            location_lng = locationLng,
            media_path = mediaPath,
            media_width = mediaWidth?.toLong(),
            media_height = mediaHeight?.toLong(),
            media_name = mediaName,
            media_size = mediaSize,
            media_mime = mediaMime,
            media_duration = mediaDuration?.toLong(),
            reactions_json = (reactions as? JsonArray)?.toString() ?: "[]",
            state = STATE_SENT,
            failure = null,
        )
    }

    companion object {
        const val STATE_SENT = 0L
        const val STATE_PENDING = 1L
        const val STATE_FAILED = 2L
        const val PAGE = 50
        const val CHAT_MEDIA = "chat-media"
        /** A file still on the phone, waiting to be uploaded. */
        const val LOCAL = "local:"

        /** No answer, or one that says try again: the line, not the message (outbox.ts). */
        fun transient(code: String?): Boolean = code.isNullOrEmpty() || Regex("^(08|53|57P|57014|PGRST00)").containsMatchIn(code)

        fun dbError(e: PostgrestRestException): String = when (e.code) {
            "42501" -> if (e.message.orEmpty().contains("blocked")) "errors.messaging_blocked" else "errors.forbidden"
            "23514", "22023" -> "errors.invalid"
            else -> "errors.unexpected"
        }
    }
}

private fun Boolean.toLong(): Long = if (this) 1L else 0L
