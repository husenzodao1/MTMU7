package tj.mtmu7.shared

import tj.mtmu7.shared.core.Times
import tj.mtmu7.shared.core.fold
import tj.mtmu7.shared.messenger.Tick
import tj.mtmu7.shared.messenger.peerMarks
import tj.mtmu7.shared.messenger.tickState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PureTest {
    @Test
    fun readsBothTimeFormats() {
        val a = Times.parse("2026-10-12T18:50:00.123456+00:00")
        val b = Times.parse("2026-10-12 18:50:00.123456+00")
        val c = Times.parse("2026-10-12T23:50:00.123+05:00")
        assertEquals(a, b)
        assertEquals(a, c)
        assertNull(Times.parse(null))
        assertEquals("23:50", Times.clock(a!!, Times.zone("Asia/Dushanbe")))
        assertEquals("12 Октябр 2026", Times.date(a, Times.zone("Asia/Dushanbe"), "tg"))
    }

    @Test
    fun foldsTajikLetters() {
        assertEquals(fold("Мехровар"), fold("Меҳровар"))
        assertEquals("кодиров", fold("Қодиров"))
    }

    @Test
    fun ticks() {
        assertEquals(Tick.Read, tickState(100, 50, 150))
        assertEquals(Tick.Delivered, tickState(100, 120, 50))
        assertEquals(Tick.Sent, tickState(100, null, null))
        // A group is read when the last of them read.
        val marks = peerMarks("group", null, "me", listOf("a" to (200L to 200L), "b" to (null to 150L)))
        assertNull(marks.readAt)
        assertEquals(150L, marks.deliveredAt)
    }
}
