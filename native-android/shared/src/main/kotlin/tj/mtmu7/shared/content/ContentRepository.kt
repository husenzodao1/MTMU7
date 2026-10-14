package tj.mtmu7.shared.content

import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import tj.mtmu7.shared.auth.AuthRepository
import tj.mtmu7.shared.core.Backend
import tj.mtmu7.shared.core.Times
import tj.mtmu7.shared.model.Announcement
import tj.mtmu7.shared.model.HomeFeed
import tj.mtmu7.shared.model.NewsArticle
import tj.mtmu7.shared.model.NotificationRow
import tj.mtmu7.shared.model.SchoolEvent
import java.time.Instant

/**
 * The home screen and the school's news, kept on the phone: shown at once
 * from the last copy, fetched again behind it (the same queries as the site,
 * src/features/content/queries.ts and the dashboard's RPCs).
 */
class ContentRepository(private val backend: Backend, private val auth: AuthRepository) {
    private val supabase get() = backend.supabase
    private val _home = MutableStateFlow(backend.store.cached(HOME, HomeFeed.serializer())?.first ?: HomeFeed())
    val home: StateFlow<HomeFeed> = _home.asStateFlow()

    private val _notifications = MutableStateFlow(
        backend.store.cached(NOTIFICATIONS, ListSerializer(NotificationRow.serializer()))?.first ?: emptyList()
    )
    val notifications: StateFlow<List<NotificationRow>> = _notifications.asStateFlow()

    suspend fun refreshHome(): Boolean = coroutineScope {
        val access = auth.access.value ?: return@coroutineScope false
        val now = Instant.now().toString()
        val today = Times.today(Times.zone(access.school?.timezone)).toString()
        val announcements = async {
            runCatching {
                supabase.from("announcements").select(
                    Columns.raw("id, title, body, priority, publish_at, expires_at, attachment_path, attachment_name")
                ) {
                    filter {
                        eq("status", "published")
                        lte("publish_at", now)
                        or { exact("expires_at", null); gt("expires_at", now) }
                    }
                    order("publish_at", Order.DESCENDING)
                    limit(20)
                }.decodeList<Announcement>()
            }.getOrNull()
        }
        val news = async {
            runCatching {
                supabase.from("news_articles").select(
                    Columns.raw("id, slug, title, summary, cover_image_url, publish_at, is_featured")
                ) {
                    filter {
                        eq("status", "published")
                        lte("publish_at", now)
                    }
                    order("is_featured", Order.DESCENDING)
                    order("publish_at", Order.DESCENDING)
                    limit(20)
                }.decodeList<NewsArticle>()
            }.getOrNull()
        }
        val events = async {
            runCatching {
                supabase.from("events").select(
                    Columns.raw("id, title, description, category, starts_at, ends_at, all_day, location, image_path, status")
                ) {
                    filter {
                        isIn("status", listOf("published", "cancelled"))
                        gte("starts_at", Instant.now().minusSeconds(12 * 3600).toString())
                    }
                    order("starts_at", Order.ASCENDING)
                    limit(12)
                }.decodeList<SchoolEvent>()
            }.getOrNull()
        }
        val teaching = access.can("grades.enter") || access.can("attendance.mark")
        val teacher = async {
            if (!teaching) null else runCatching {
                supabase.postgrest.rpc("teacher_today", buildJsonObject { put("p_date", today) }).decodeAs<JsonObject>()
            }.getOrNull()
        }
        val student = async {
            if (!access.hasRole("student")) null else runCatching {
                supabase.postgrest.rpc("student_overview", buildJsonObject { put("p_date", today) }).decodeAs<JsonObject>()
            }.getOrNull()
        }
        val children = async {
            if (!access.hasRole("parent")) null else runCatching {
                supabase.postgrest.rpc("my_children").decodeList<JsonObject>()
            }.getOrNull()
        }
        val previous = _home.value
        val feed = HomeFeed(
            announcements = announcements.await() ?: previous.announcements,
            news = news.await() ?: previous.news,
            events = events.await() ?: previous.events,
            teacher = teacher.await() ?: previous.teacher.takeIf { teaching },
            student = student.await() ?: previous.student,
            children = children.await() ?: previous.children,
        )
        val fetched = announcements.await() != null || news.await() != null
        if (fetched) {
            backend.store.putCached(HOME, HomeFeed.serializer(), feed)
            _home.value = feed
        }
        fetched
    }

    suspend fun refreshNotifications(): Boolean {
        val me = auth.access.value?.userId ?: return false
        val rows = runCatching {
            supabase.from("notifications").select(
                Columns.raw("id, type, template_key, title, body, link_url, is_read, created_at")
            ) {
                filter { eq("user_id", me) }
                order("created_at", Order.DESCENDING)
                limit(60)
            }.decodeList<NotificationRow>()
        }.getOrNull() ?: return false
        backend.store.putCached(NOTIFICATIONS, ListSerializer(NotificationRow.serializer()), rows)
        _notifications.value = rows
        return true
    }

    suspend fun markAllNotificationsRead() {
        val me = auth.access.value?.userId ?: return
        _notifications.value = _notifications.value.map { it.copy(isRead = true) }
        runCatching {
            supabase.from("notifications").update(buildJsonObject {
                put("is_read", true)
                put("read_at", Instant.now().toString())
            }) {
                filter {
                    eq("user_id", me)
                    eq("is_read", false)
                }
            }
        }
    }

    /** A public picture of the school's media library (events). */
    fun publicMedia(path: String): String = "${backend.config.supabaseUrl}/storage/v1/object/public/public-media/$path"

    companion object {
        const val HOME = "home"
        const val NOTIFICATIONS = "notifications"
    }
}
