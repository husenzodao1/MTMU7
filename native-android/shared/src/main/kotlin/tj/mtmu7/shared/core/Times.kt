package tj.mtmu7.shared.core

import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Times as the database writes them, and as the school reads them.
 *
 * PostgREST sends `2026-10-12T18:50:00.123456+00:00`; realtime sends the same
 * instant as `2026-10-12 18:50:00.123456+00`. Both become epoch milliseconds
 * here, which is what the phone stores and compares. Days and hours are shown
 * in the school's own time zone (Asia/Dushanbe unless the school says
 * otherwise), never the phone's.
 */
object Times {
    fun parse(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        var text = value.trim().replace(' ', 'T')
        // "+00" → "+00:00": an offset of hours alone, as realtime writes it.
        val offset = Regex("([+-]\\d{2})$").find(text)
        if (offset != null) text = text.substring(0, offset.range.first) + offset.value + ":00"
        if (text.endsWith("Z") || Regex("[+-]\\d{2}:\\d{2}$").containsMatchIn(text)) {
            return try {
                OffsetDateTime.parse(text).toInstant().toEpochMilli()
            } catch (_: DateTimeParseException) {
                null
            }
        }
        return try {
            Instant.parse(text + "Z").toEpochMilli()
        } catch (_: DateTimeParseException) {
            null
        }
    }

    fun iso(millis: Long): String = Instant.ofEpochMilli(millis).toString()

    fun zone(id: String?): ZoneId = try {
        ZoneId.of(id?.takeIf { it.isNotBlank() } ?: DEFAULT_ZONE)
    } catch (_: Exception) {
        ZoneId.of(DEFAULT_ZONE)
    }

    /** The school's calendar day for an instant: "2026-10-14". */
    fun dayKey(millis: Long, zone: ZoneId): String = Instant.ofEpochMilli(millis).atZone(zone).toLocalDate().toString()

    fun today(zone: ZoneId, now: Long = System.currentTimeMillis()): LocalDate = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()

    fun clock(millis: Long, zone: ZoneId): String = Instant.ofEpochMilli(millis).atZone(zone).format(HH_MM)

    /** "14 Октябр 2026" in Tajik, as the site writes it (src/lib/i18n/format.ts). */
    fun date(millis: Long, zone: ZoneId, locale: String): String = date(Instant.ofEpochMilli(millis).atZone(zone).toLocalDate(), locale)

    fun date(day: LocalDate, locale: String): String {
        val months = when (locale) {
            "ru" -> RU_MONTHS
            "en" -> EN_MONTHS
            else -> TG_MONTHS
        }
        return "${day.dayOfMonth} ${months[day.monthValue - 1]} ${day.year}"
    }

    fun shortDate(millis: Long, zone: ZoneId): String = Instant.ofEpochMilli(millis).atZone(zone).format(DD_MM_YYYY)

    /** The list's time: the hour today, the date before that. */
    fun listStamp(millis: Long, zone: ZoneId, now: Long = System.currentTimeMillis()): String {
        val at: ZonedDateTime = Instant.ofEpochMilli(millis).atZone(zone)
        return if (at.toLocalDate() == today(zone, now)) at.format(HH_MM) else at.format(DD_MM_YYYY)
    }

    const val DEFAULT_ZONE = "Asia/Dushanbe"
    private val HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    private val DD_MM_YYYY: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
    val TG_MONTHS = listOf("Январ", "Феврал", "Март", "Апрел", "Май", "Июн", "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр")
    val RU_MONTHS = listOf("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
    val EN_MONTHS = listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
}
