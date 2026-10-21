package tj.mtmu7.shared.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class Announcement(
    val id: String,
    val title: String,
    val body: String? = null,
    val priority: String? = null,
    @SerialName("publish_at") val publishAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("attachment_path") val attachmentPath: String? = null,
    @SerialName("attachment_name") val attachmentName: String? = null,
)

@Serializable
data class NewsArticle(
    val id: String,
    val slug: String,
    val title: String,
    val summary: String? = null,
    val content: String? = null,
    @SerialName("cover_image_url") val coverImageUrl: String? = null,
    @SerialName("publish_at") val publishAt: String? = null,
    @SerialName("is_featured") val isFeatured: Boolean = false,
)

@Serializable
data class SchoolEvent(
    val id: String,
    val title: String,
    val description: String? = null,
    val category: String? = null,
    @SerialName("starts_at") val startsAt: String? = null,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("all_day") val allDay: Boolean = false,
    val location: String? = null,
    @SerialName("image_path") val imagePath: String? = null,
    val status: String? = null,
)

/** What the home screen shows, as one document kept on the phone. */
@Serializable
data class HomeFeed(
    val announcements: List<Announcement> = emptyList(),
    val news: List<NewsArticle> = emptyList(),
    val events: List<SchoolEvent> = emptyList(),
    /** teacher_today(p_date) (00034), as the server gives it. */
    val teacher: JsonObject? = null,
    /** student_overview(null, p_date) (00060), for a pupil. */
    val student: JsonObject? = null,
    /** my_children() (00029), for a parent. */
    val children: List<JsonObject> = emptyList(),
)

@Serializable
data class NotificationRow(
    val id: String,
    val type: String? = null,
    @SerialName("template_key") val templateKey: String? = null,
    val title: String? = null,
    val body: String? = null,
    @SerialName("link_url") val linkUrl: String? = null,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String,
)
