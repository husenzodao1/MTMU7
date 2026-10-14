package tj.mtmu7.shared.messenger

/** The mark after one's own message (src/features/messages/tick-state.ts). */
enum class Tick { Sending, Failed, Sent, Delivered, Read }

/** Read once the other side has read up to it; delivered once it reached their phone. */
fun tickState(createdAt: Long, deliveredAt: Long?, readAt: Long?): Tick = when {
    readAt != null && readAt >= createdAt -> Tick.Read
    deliveredAt != null && deliveredAt >= createdAt -> Tick.Delivered
    else -> Tick.Sent
}

/**
 * How far the others have got, for the ticks: the one who is furthest behind
 * (a group's message is read once everybody read it), each person's delivery
 * being at least their reading. The support desk is one side however many
 * staff it has (list_my_conversations, 00094).
 */
data class PeerMarks(val readAt: Long?, val deliveredAt: Long?)

fun peerMarks(
    type: String,
    createdBy: String?,
    me: String,
    others: List<Pair<String, Pair<Long?, Long?>>>,
): PeerMarks {
    if (others.isEmpty()) return PeerMarks(null, null)
    fun delivered(read: Long?, delivered: Long?): Long? = listOfNotNull(read, delivered).maxOrNull()
    if (type == "support") {
        val relevant = if (createdBy == me) others else others.filter { it.first == createdBy }
        return PeerMarks(
            relevant.mapNotNull { it.second.first }.maxOrNull(),
            relevant.mapNotNull { delivered(it.second.first, it.second.second) }.maxOrNull(),
        )
    }
    val reads = others.map { it.second.first }
    val deliveries = others.map { delivered(it.second.first, it.second.second) }
    return PeerMarks(
        if (reads.any { it == null }) null else reads.filterNotNull().minOrNull(),
        if (deliveries.any { it == null }) null else deliveries.filterNotNull().minOrNull(),
    )
}

/** Broadcast conversations: posts come from the channel, with no ticks. */
fun isBroadcast(type: String): Boolean = type == "announcement" || type == "channel"
