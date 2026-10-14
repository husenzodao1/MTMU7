package tj.mtmu7.app.ui.main

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.AdminPanelSettings
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CoPresent
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.FamilyRestroom
import androidx.compose.material.icons.outlined.Grade
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.People
import androidx.compose.ui.graphics.vector.ImageVector
import tj.mtmu7.app.R
import tj.mtmu7.shared.model.Access

/**
 * The portal's sections, by the same rules as the site's menu
 * (src/components/shell/navigation.ts). `native` ones the app draws itself;
 * the rest open the site's page inside the app, signed in.
 */
data class Section(
    val key: String,
    val path: String,
    @param:StringRes val label: Int,
    val icon: ImageVector,
    val native: Boolean = false,
)

val HOME = Section("dashboard", "/dashboard", R.string.nav_home, Icons.Outlined.Home, native = true)
val MESSAGES = Section("messages", "/messages", R.string.nav_messages, Icons.AutoMirrored.Outlined.Chat, native = true)
private val TEACH = Section("teach", "/teach", R.string.nav_teach, Icons.Outlined.CoPresent)
private val CHILDREN = Section("children", "/children", R.string.nav_children, Icons.Outlined.FamilyRestroom)
private val SCHEDULE = Section("schedule", "/schedule", R.string.nav_schedule, Icons.Outlined.CalendarMonth)
private val GRADES = Section("grades", "/grades", R.string.nav_grades, Icons.Outlined.Grade)
private val ATTENDANCE = Section("attendance", "/attendance", R.string.nav_attendance, Icons.Outlined.EventAvailable)
private val HOMEWORK = Section("homework", "/homework", R.string.nav_homework, Icons.Outlined.Assignment)
private val LIBRARY = Section("library", "/library", R.string.nav_library, Icons.AutoMirrored.Outlined.MenuBook)
private val NEWS = Section("news", "/updates", R.string.nav_news, Icons.Outlined.Newspaper)
private val DOCUMENTS = Section("documents", "/documents", R.string.nav_documents, Icons.Outlined.Description)
private val CONTACTS = Section("contacts", "/friends", R.string.nav_contacts, Icons.Outlined.People)
val SUPPORT = Section("support", "/support", R.string.nav_support, Icons.Outlined.HeadsetMic)
val ADMIN = Section("admin", "/admin", R.string.nav_admin, Icons.Outlined.AdminPanelSettings)

private fun Access.canAny(vararg permissions: String) = permissions.any { can(it) }
private fun Access.moduleAnd(module: String, vararg permissions: String) = hasModule(module) && (permissions.isEmpty() || canAny(*permissions))
private val Access.learner get() = hasRole("student") || hasRole("parent")

/** The menu, in the site's order (a homeroom teacher reaches their class from the teaching page). */
fun sections(access: Access?): List<Section> {
    val a = access ?: return listOf(HOME, SUPPORT)
    return buildList {
        add(HOME)
        if (a.canAny("grades.enter", "attendance.mark", "homework.create")) add(TEACH)
        if (a.hasRole("parent")) add(CHILDREN)
        if (a.moduleAnd("schedule", "timetable.view")) add(SCHEDULE)
        if (a.hasModule("grades") && a.learner) add(GRADES)
        if (a.hasModule("attendance") && a.learner) add(ATTENDANCE)
        if (a.hasModule("homework") && a.learner) add(HOMEWORK)
        if (a.moduleAnd("library", "library.view")) add(LIBRARY)
        if (a.moduleAnd("news", "news.view") || a.moduleAnd("announcements", "announcements.view") || a.moduleAnd("events", "events.view")) add(NEWS)
        if (a.moduleAnd("documents", "documents.view")) add(DOCUMENTS)
        if (a.moduleAnd("messages", "messages.use")) add(MESSAGES)
        if (a.hasModule("friends")) add(CONTACTS)
        add(SUPPORT)
    }
}

/** The four along the bottom, as on the site's phone bar. */
fun bottomBar(all: List<Section>): List<Section> {
    fun pick(key: String) = all.firstOrNull { it.key == key }
    return listOfNotNull(
        pick("dashboard"),
        pick("teach") ?: pick("schedule"),
        pick("homework") ?: pick("library"),
        pick("messages") ?: pick("news"),
    )
}

private val ADMIN_ENTRY = listOf(
    "users.view", "users.approve", "roles.view", "settings.view", "cms.manage", "modules.manage",
    "students.create", "staff.create", "guardians.manage", "classes.create", "subjects.manage", "enrollments.manage",
    "academic_years.manage", "timetable.manage", "assessments.manage", "grades.approve", "attendance.update",
    "news.publish", "announcements.publish", "announcements.create", "events.manage", "library.create", "library.update",
    "documents.create", "media.manage", "notifications.send", "messages.moderate", "invitations.manage",
    "reports.view", "analytics.view", "audit.view",
)

/** The management centre, for those the site lets in (ADMIN_ENTRY_PERMISSIONS). */
fun canEnterAdmin(access: Access?): Boolean = access != null && ADMIN_ENTRY.any { access.can(it) }
