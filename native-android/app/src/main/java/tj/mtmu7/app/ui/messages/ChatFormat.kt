package tj.mtmu7.app.ui.messages

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import kotlinx.serialization.builtins.ListSerializer
import tj.mtmu7.app.R
import tj.mtmu7.shared.core.AppJson
import tj.mtmu7.shared.db.Conversation
import tj.mtmu7.shared.model.MemberJson

/** How a conversation reads in the list and its header (src/features/messages/types.ts). */
fun Conversation.members(): List<MemberJson> =
    runCatching { AppJson.decodeFromString(ListSerializer(MemberJson.serializer()), members_json) }.getOrDefault(emptyList())

fun Conversation.peer(me: String?): MemberJson? = if (type == "direct") members().firstOrNull { it.userId != me } else null

fun MemberJson.fullName(): String = listOfNotNull(firstName, lastName).joinToString(" ").trim()

@Composable
fun Conversation.title(me: String?): String = when {
    type == "support" && created_by == me -> stringResource(R.string.support_chat)
    type == "direct" -> peer(me)?.fullName()?.ifBlank { null } ?: name.orEmpty()
    else -> name.orEmpty()
}

@Composable
fun Conversation.preview(me: String?): String {
    if (last_message_at == null) return description?.takeIf { type == "channel" && it.isNotBlank() } ?: stringResource(R.string.no_messages_yet)
    if (last_message_deleted == 1L) return stringResource(R.string.message_deleted)
    val body = when (last_message_type) {
        "location" -> "📍 " + (last_message_content?.ifBlank { null } ?: stringResource(R.string.location))
        "image" -> "📷 " + (last_message_content?.ifBlank { null } ?: stringResource(R.string.photo))
        "file" -> "📎 " + (last_message_content?.ifBlank { null } ?: stringResource(R.string.file))
        "audio" -> "🎤 " + stringResource(R.string.voice)
        else -> last_message_content.orEmpty()
    }
    val groupish = type == "group" || type == "class_group"
    if (!groupish || last_message_sender_id == null || last_message_sender_id == me) return body
    val sender = members().firstOrNull { it.userId == last_message_sender_id }?.firstName
    return if (sender.isNullOrBlank()) body else "$sender: $body"
}
