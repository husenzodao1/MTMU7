package tj.mtmu7.app.ui.home

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
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.ui.theme.GreetingStyle
import tj.mtmu7.shared.core.Times
import java.time.Instant

/**
 * The first screen: a greeting for the time of day, what today holds for this
 * person (a teacher's lessons, a pupil's day, a parent's children), and the
 * school's announcements, news and events — all from the phone's own copy, at
 * once, refreshed behind it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(services: Services, openWeb: (String) -> Unit) {
    val access by services.auth.access.collectAsState()
    val home by services.content.home.collectAsState()
    val zone = remember(access) { Times.zone(access?.school?.timezone) }
    val language = LocalContext.current.resources.configuration.locales[0].language
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { services.content.refreshHome() }

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            scope.launch {
                services.content.refreshHome()
                refreshing = false
            }
        },
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Greeting(access?.user?.firstName.orEmpty(), zone, language) }

            home.teacher?.let { t ->
                if (t.bool("is_teacher") == true) item {
                    Card(stringResource(R.string.lessons_today)) {
                        val lessons = t.array("lessons")
                        if (lessons.isEmpty()) Text(stringResource(R.string.no_lessons_today), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        lessons.forEach { l ->
                            val marked = l.bool("attendance_marked") == true
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable {
                                    openWeb("/teach/attendance?classSubject=${l.str("class_subject_id")}&date=${t.str("date")}&period=${l.int("period_number")}")
                                }.padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                                    Text("${l.int("period_number") ?: ""}", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("${l.str("class_name").orEmpty()} · ${l.localized("subject", language)}", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOfNotNull(clockOf(l.str("start_time")) + "–" + clockOf(l.str("end_time")), l.int("students")?.let { stringResource(R.string.students_count, it) }).joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Icon(
                                    if (marked) Icons.Outlined.CheckCircle else Icons.Outlined.WarningAmber,
                                    stringResource(if (marked) R.string.attendance_marked else R.string.attendance_not_marked),
                                    tint = if (marked) Color(0xFF2F7A52) else Color(0xFF8C6118),
                                )
                            }
                        }
                    }
                }
            }

            home.student?.let { s ->
                item {
                    Card(stringResource(R.string.lessons_today)) {
                        val lessons = s.array("lessons")
                        if (lessons.isEmpty()) Text(stringResource(R.string.no_lessons_today), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        lessons.forEach { l ->
                            Text(
                                "${l.int("period_number") ?: ""}. ${l.localized("subject", language)} · ${clockOf(l.str("start_time"))}" + (l.str("room")?.let { " · $it" } ?: ""),
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                    }
                }
                val grades = s.array("latest_grades")
                if (grades.isNotEmpty()) item {
                    Card(stringResource(R.string.latest_grades), onAll = { openWeb("/grades") }) {
                        grades.take(5).forEach { g ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                Text(g.localized("subject", language), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(g.str("score").orEmpty(), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
                val homework = s.array("homework_due")
                if (homework.isNotEmpty()) item {
                    Card(stringResource(R.string.homework_due), onAll = { openWeb("/homework") }) {
                        homework.take(5).forEach { h ->
                            Text("${h.localized("subject", language)}: ${h.str("title").orEmpty()}", modifier = Modifier.padding(vertical = 4.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }

            if (home.children.isNotEmpty()) item {
                Card(stringResource(R.string.nav_children)) {
                    home.children.forEach { child ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { openWeb("/children/${child.str("id")}") }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            tj.mtmu7.app.ui.common.Avatar("${child.str("first_name").orEmpty()} ${child.str("last_name").orEmpty()}", null, 40.dp)
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text("${child.str("last_name").orEmpty()} ${child.str("first_name").orEmpty()}", style = MaterialTheme.typography.titleMedium)
                                child.str("class_name")?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                        }
                    }
                }
            }

            if (home.announcements.isNotEmpty()) item {
                Card(stringResource(R.string.announcements), onAll = { openWeb("/updates?type=announcement") }) {
                    home.announcements.take(4).forEach { a ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { openWeb("/announcements#a-${a.id}") }.padding(vertical = 8.dp)) {
                            Icon(Icons.Outlined.Campaign, null, tint = if (a.priority == "critical" || a.priority == "important") Color(0xFFB03A2E) else MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(a.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                a.body?.let { Text(plain(it), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                a.publishAt?.let { Times.parse(it) }?.let { Text(Times.date(it, zone, language), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline) }
                            }
                        }
                    }
                }
            }

            if (home.news.isNotEmpty()) item {
                Column {
                    Text(stringResource(R.string.news), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(home.news, key = { it.id }) { n ->
                            Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp, modifier = Modifier.width(260.dp).clickable { openWeb("/news/${n.slug}") }) {
                                Column {
                                    Box(Modifier.fillMaxWidth().height(130.dp).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                        if (!n.coverImageUrl.isNullOrBlank()) AsyncImage(n.coverImageUrl, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                                    }
                                    Column(Modifier.padding(12.dp)) {
                                        Text(n.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        n.summary?.let { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (home.events.isNotEmpty()) item {
                Card(stringResource(R.string.events), onAll = { openWeb("/updates?type=event") }) {
                    home.events.take(4).forEach { e ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Icon(Icons.Outlined.Event, null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(e.title, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    listOfNotNull(e.startsAt?.let { Times.parse(it) }?.let { Times.date(it, zone, language) + " · " + Times.clock(it, zone) }, e.location).joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Greeting(name: String, zone: java.time.ZoneId, language: String) {
    val hour = Instant.now().atZone(zone).hour
    val (greeting, wish, colors) = when (hour) {
        in 5..11 -> Triple(R.string.greeting_morning, R.string.wish_morning, listOf(Color(0xFF8EC5E8), Color(0xFFF6D7A7)))
        in 12..17 -> Triple(R.string.greeting_day, R.string.wish_day, listOf(Color(0xFF4F8FC0), Color(0xFFA9D2EE)))
        in 18..21 -> Triple(R.string.greeting_evening, R.string.wish_evening, listOf(Color(0xFF3C2A4D), Color(0xFFC0705A)))
        else -> Triple(R.string.greeting_night, R.string.wish_night, listOf(Color(0xFF0B1426), Color(0xFF253A5E)))
    }
    val weekday = listOf("Душанбе", "Сешанбе", "Чоршанбе", "Панҷшанбе", "Ҷумъа", "Шанбе", "Якшанбе")
    val today = Times.today(zone)
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(colors))
            .padding(20.dp)
    ) {
        Column {
            Text(
                (if (language == "tg") weekday[today.dayOfWeek.value - 1] + ", " else "") + Times.date(today, language),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White.copy(alpha = 0.85f),
            )
            Spacer(Modifier.height(6.dp))
            Text(stringResource(greeting) + if (name.isNotBlank()) ", $name!" else "!", style = GreetingStyle, color = Color.White)
            Spacer(Modifier.height(4.dp))
            Text(stringResource(wish), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.9f))
        }
    }
}

@Composable
private fun Card(title: String, onAll: (() -> Unit)? = null, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                if (onAll != null) Text(stringResource(R.string.see_all), color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable(onClick = onAll).padding(6.dp))
            }
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
private fun JsonObject.array(key: String): List<JsonObject> = (this[key] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull
private fun JsonObject.localized(prefix: String, language: String): String =
    str("${prefix}_$language") ?: str("${prefix}_tg") ?: str("${prefix}_ru") ?: str("${prefix}_en") ?: ""
private fun clockOf(time: String?): String = time?.take(5).orEmpty()
/** An announcement's text without its markdown. */
private fun plain(text: String): String = text.replace(Regex("!\\[[^]]*]\\([^)]*\\)"), "").replace(Regex("[#*_>`]"), "").replace(Regex("\\s+"), " ").trim()
