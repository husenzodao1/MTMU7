package tj.mtmu7.app.ui.messages

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import tj.mtmu7.app.ui.theme.LocalChatColors
import tj.mtmu7.shared.messenger.Tick

/**
 * The mark after one's own message, drawn as on the site (ticks.tsx): a small
 * clock on its way, one tick on the server, two grey ticks on the other
 * phone, two blue ones read, a red mark when it was refused.
 */
@Composable
fun TickMark(tick: Tick, modifier: Modifier = Modifier) {
    val chat = LocalChatColors.current
    val color = when (tick) {
        Tick.Read -> chat.read
        Tick.Failed -> Color(0xFFD93025)
        else -> chat.meta
    }
    Canvas(modifier.size(width = 18.dp, height = 12.dp)) {
        val s = size.height / 12f
        val stroke = Stroke(width = 1.55f * s, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun line(vararg points: Pair<Float, Float>) {
            val path = Path()
            points.forEachIndexed { i, (x, y) -> if (i == 0) path.moveTo(x * s, y * s) else path.lineTo(x * s, y * s) }
            drawPath(path, color, style = stroke)
        }
        when (tick) {
            Tick.Sending -> {
                drawCircle(color, radius = 5.2f * s, center = Offset(9f * s, 6f * s), style = Stroke(width = 1.3f * s))
                line(9f to 3.2f, 9f to 6f, 10.8f to 7.2f)
            }
            Tick.Failed -> {
                drawCircle(color, radius = 5.4f * s, center = Offset(9f * s, 6f * s))
                line(9f to 3.4f, 9f to 6.6f)
                drawCircle(Color.White, radius = 0.8f * s, center = Offset(9f * s, 8.6f * s))
            }
            Tick.Sent -> line(3.4f to 6.3f, 6.4f to 9.3f, 13.1f to 2.6f)
            Tick.Delivered, Tick.Read -> {
                line(1.2f to 6.3f, 4.2f to 9.3f, 10.9f to 2.6f)
                line(7.6f to 8.6f, 8.3f to 9.3f, 15f to 2.6f)
            }
        }
    }
}
