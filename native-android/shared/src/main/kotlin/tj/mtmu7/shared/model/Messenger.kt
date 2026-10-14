package tj.mtmu7.shared.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** One row of list_my_conversations (00094). */
@Serializable
data class ConversationRow(
    val id: String,
    val type: String,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("is_muted") val isMuted: Boolean? = false,
    @SerialName("last_message_content") val lastMessageContent: String? = null,
    @SerialName("last_message_sender_id") val lastMessageSenderId: String? = null,
    @SerialName("last_message_at") val lastMessageAt: String? = null,
    @SerialName("last_message_deleted") val lastMessageDeleted: Boolean? = false,
    @SerialName("unread_count") val unreadCount: Long? = 0,
    val members: List<MemberJson>? = null,
    @SerialName("created_by") val createdBy: String? = null,
    @SerialName("last_message_type") val lastMessageType: String? = null,
    val description: String? = null,
    @SerialName("my_role") val myRole: String? = null,
    @SerialName("member_count") val memberCount: Long? = null,
    @SerialName("peer_read_at") val peerReadAt: String? = null,
    @SerialName("peer_delivered_at") val peerDeliveredAt: String? = null,
)

/** The first members of a conversation, as the list carries them. */
@Serializable
data class MemberJson(
    @SerialName("user_id") val userId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val role: String? = null,
)

/** One row of get_conversation_messages (00071). */
@Serializable
data class MessageRow(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String? = null,
    @SerialName("sender_first_name") val senderFirstName: String? = null,
    @SerialName("sender_last_name") val senderLastName: String? = null,
    @SerialName("sender_avatar_url") val senderAvatarUrl: String? = null,
    val content: String = "",
    val type: String = "text",
    @SerialName("reply_to_id") val replyToId: String? = null,
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_edited") val isEdited: Boolean = false,
    @SerialName("is_deleted") val isDeleted: Boolean = false,
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    @SerialName("created_at") val createdAt: String,
    @SerialName("edited_at") val editedAt: String? = null,
    @SerialName("location_lat") val locationLat: Double? = null,
    @SerialName("location_lng") val locationLng: Double? = null,
    @SerialName("media_path") val mediaPath: String? = null,
    @SerialName("media_width") val mediaWidth: Int? = null,
    @SerialName("media_height") val mediaHeight: Int? = null,
    @SerialName("media_name") val mediaName: String? = null,
    @SerialName("media_size") val mediaSize: Long? = null,
    @SerialName("media_mime") val mediaMime: String? = null,
    @SerialName("media_duration") val mediaDuration: Int? = null,
    val reactions: JsonElement? = null,
)

/** A row of `messages` as realtime sends it: the table's own columns, no names. */
@Serializable
data class MessageRecord(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String? = null,
    val content: String = "",
    val type: String = "text",
    @SerialName("reply_to_id") val replyToId: String? = null,
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_edited") val isEdited: Boolean = false,
    @SerialName("is_deleted") val isDeleted: Boolean = false,
    @SerialName("created_at") val createdAt: String,
    @SerialName("edited_at") val editedAt: String? = null,
    @SerialName("location_lat") val locationLat: Double? = null,
    @SerialName("location_lng") val locationLng: Double? = null,
    @SerialName("media_path") val mediaPath: String? = null,
    @SerialName("media_width") val mediaWidth: Int? = null,
    @SerialName("media_height") val mediaHeight: Int? = null,
    @SerialName("media_name") val mediaName: String? = null,
    @SerialName("media_size") val mediaSize: Long? = null,
    @SerialName("media_mime") val mediaMime: String? = null,
    @SerialName("media_duration") val mediaDuration: Int? = null,
)

/** A row of `conversation_members`, from a select or from realtime. */
@Serializable
data class MemberRecord(
    @SerialName("conversation_id") val conversationId: String? = null,
    @SerialName("user_id") val userId: String,
    val role: String? = null,
    @SerialName("is_muted") val isMuted: Boolean? = null,
    @SerialName("joined_at") val joinedAt: String? = null,
    @SerialName("last_read_at") val lastReadAt: String? = null,
    @SerialName("last_delivered_at") val lastDeliveredAt: String? = null,
    val users: MemberUser? = null,
)

@Serializable
data class MemberUser(
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

/** What is written to `messages` when the phone sends one (outbox.ts, OutgoingRow). */
@Serializable
data class OutgoingRow(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("school_id") val schoolId: String,
    @SerialName("sender_id") val senderId: String,
    val content: String,
    val type: String,
    @SerialName("reply_to_id") val replyToId: String? = null,
    @SerialName("location_lat") val locationLat: Double? = null,
    @SerialName("location_lng") val locationLng: Double? = null,
    @SerialName("media_path") val mediaPath: String? = null,
    @SerialName("media_width") val mediaWidth: Int? = null,
    @SerialName("media_height") val mediaHeight: Int? = null,
    @SerialName("media_name") val mediaName: String? = null,
    @SerialName("media_size") val mediaSize: Long? = null,
    @SerialName("media_mime") val mediaMime: String? = null,
    @SerialName("media_duration") val mediaDuration: Int? = null,
)

/** search_message_contacts (00095). */
@Serializable
data class ContactRow(
    val id: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val nickname: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

/** One reaction on a message, in reactions_json. */
@Serializable
data class Reaction(@SerialName("user_id") val userId: String, val emoji: String? = null)
