package tj.mtmu7.shared

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import tj.mtmu7.shared.auth.AuthRepository
import tj.mtmu7.shared.content.ContentRepository
import tj.mtmu7.shared.core.AppConfig
import tj.mtmu7.shared.core.Backend
import tj.mtmu7.shared.messenger.MessengerRepository
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The data layer against a real Supabase (the local one: SUPABASE_URL and
 * SUPABASE_ANON_KEY), the way the phone will use it: sign in, the list, a
 * conversation, a message sent, one received live, read.
 */
class LocalSupabaseTest {
    private val url = System.getenv("SUPABASE_URL").orEmpty()
    private val key = System.getenv("SUPABASE_ANON_KEY").orEmpty()

    private fun backend(): Backend {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        Backend.createSchema(driver)
        return Backend(AppConfig(url, key, "http://localhost:3000"), driver)
    }

    private fun psql(sql: String): String =
        ProcessBuilder("docker", "exec", "supabase_db_sb", "psql", "-U", "postgres", "-tAc", sql)
            .redirectErrorStream(true).start().inputStream.bufferedReader().readText().trim()

    @Test
    fun messengerEndToEnd() = runBlocking {
        if (url.isEmpty()) {
            println("SUPABASE_URL not set: skipped")
            return@runBlocking
        }
        val backend = backend()
        val auth = AuthRepository(backend)
        backend.supabase.auth.signInWith(Email) {
            email = "muhammad.najmiddinov.1@demo-mtmu7.test"
            password = "u7awz5cpnt"
        }
        val access = auth.loadAccess()
        assertNotNull(access.userId)
        println("signed in as ${access.displayName}, school tz ${access.school?.timezone}, roles ${access.roles.map { it.slug }}")

        val messenger = MessengerRepository(backend, auth)
        assertTrue(messenger.refreshConversations())
        val list = backend.db.conversationQueries.all().executeAsList()
        println("conversations: ${list.size} — ${list.joinToString { "${it.type}:${it.name ?: "-"}:${it.unread_count}" }}")
        assertTrue(list.isNotEmpty())

        val manizha = psql("select id from users where public_id = 'MT10003'")
        val direct = list.first { it.type == "direct" && it.members_json.contains(manizha) }
        messenger.refreshThread(direct.id)
        val before = backend.db.messageQueries.latest(direct.id, 500).executeAsList()
        println("thread ${direct.id}: ${before.size} messages, members ${messenger.membersNow(direct.id).map { it.first_name }}")

        // Sent from the phone: on the server once, in the order written.
        val text = "native-${UUID.randomUUID().toString().take(6)}"
        val id = messenger.sendText(direct.id, text)!!
        assertEquals(1L, backend.db.messageQueries.byId(id).executeAsOne().state)
        val t0 = System.currentTimeMillis()
        while (backend.db.messageQueries.byId(id).executeAsOne().state != 0L && System.currentTimeMillis() - t0 < 20_000) delay(100)
        println("sent in ${System.currentTimeMillis() - t0} ms")
        assertEquals("1", psql("select count(*) from messages where id = '$id' and content = '$text'"))
        assertTrue(messenger.flushOutbox(), "nothing left waiting")
        assertEquals("1", psql("select count(*) from messages where id = '$id'"), "sent once, not twice")

        // Received live: the other side writes, the phone has it within moments.
        messenger.startLive()
        delay(2500)
        val incoming = "live-${UUID.randomUUID().toString().take(6)}"
        val school = psql("select school_id from conversations where id = '${direct.id}'")
        psql("insert into messages (conversation_id, school_id, sender_id, content, type) values ('${direct.id}', '$school', '$manizha', '$incoming', 'text')")
        val t1 = System.currentTimeMillis()
        var got = false
        while (System.currentTimeMillis() - t1 < 15_000) {
            if (backend.db.messageQueries.latest(direct.id, 5).executeAsList().any { it.content == incoming }) {
                got = true
                break
            }
            delay(100)
        }
        println("live message arrived: $got after ${System.currentTimeMillis() - t1} ms")
        assertTrue(got, "the live message reached the phone")
        val unread = backend.db.conversationQueries.byId(direct.id).executeAsOne().unread_count
        println("unread after it: $unread")
        assertTrue(unread >= 1)

        // Read: on the phone at once, on the server too.
        messenger.markRead(direct.id)
        assertEquals(0L, backend.db.conversationQueries.byId(direct.id).executeAsOne().unread_count)
        val readOnServer = psql(
            "select cm.last_read_at >= (select max(created_at) from messages where conversation_id = '${direct.id}') " +
                "from conversation_members cm join users u on u.id = cm.user_id where cm.conversation_id = '${direct.id}' and u.public_id = 'MT10002'"
        )
        println("read on the server: $readOnServer")
        assertEquals("t", readOnServer)

        // Older pages.
        println("older pages: more = ${messenger.loadOlder(direct.id)}")
        messenger.stopLive()

        // Signing out leaves nothing of this person on the phone.
        auth.signOut()
        assertTrue(backend.db.conversationQueries.all().executeAsList().isEmpty())
        assertTrue(backend.db.messageQueries.latest(direct.id, 10).executeAsList().isEmpty())
        println("signed out: the phone is empty")
    }

    @Test
    fun homeFeedForATeacher() = runBlocking {
        if (url.isEmpty()) return@runBlocking
        val backend = backend()
        val auth = AuthRepository(backend)
        backend.supabase.auth.signInWith(Email) {
            email = "muhammad.najmiddinov.1@demo-mtmu7.test"
            password = "u7awz5cpnt"
        }
        auth.loadAccess()
        val content = ContentRepository(backend, auth)
        assertTrue(content.refreshHome())
        val home = content.home.value
        println("home: ${home.announcements.size} announcements, ${home.news.size} news, ${home.events.size} events, teacher lessons: ${home.teacher?.get("lessons")?.toString()?.take(120)}")
        assertTrue(home.announcements.isNotEmpty() || home.news.isNotEmpty())
        assertNotNull(home.teacher)
        // Kept: a second start has it before any network.
        val again = ContentRepository(backend, auth)
        assertEquals(home.announcements.size, again.home.value.announcements.size)
        assertTrue(content.refreshNotifications())
        println("notifications: ${content.notifications.value.size}")
    }
}
