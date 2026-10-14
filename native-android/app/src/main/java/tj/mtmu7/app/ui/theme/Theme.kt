package tj.mtmu7.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The site's own colours (src/styles/globals.css): warm paper and ink by day,
 * deep night blue by night, the school's gold for what one taps.
 */
private val Day = lightColorScheme(
    primary = Color(0xFFA07D45),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF0E6D3),
    onPrimaryContainer = Color(0xFF45341A),
    secondary = Color(0xFF7A5E2E),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF8F3EA),
    onSecondaryContainer = Color(0xFF5F4823),
    background = Color(0xFFF4F2EC),
    onBackground = Color(0xFF141821),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF141821),
    surfaceVariant = Color(0xFFF0EDE6),
    onSurfaceVariant = Color(0xFF5D6472),
    surfaceContainer = Color(0xFFF7F5F0),
    surfaceContainerHigh = Color(0xFFF0EDE6),
    surfaceContainerHighest = Color(0xFFE8E4DB),
    surfaceContainerLow = Color(0xFFFFFFFF),
    outline = Color(0xFFC9C2B4),
    outlineVariant = Color(0xFFE1DCD1),
    error = Color(0xFFB03A2E),
    onError = Color.White,
    errorContainer = Color(0xFFFBECEA),
    onErrorContainer = Color(0xFF8E2E25),
)

private val Night = darkColorScheme(
    primary = Color(0xFFC8A46A),
    onPrimary = Color(0xFF15110A),
    primaryContainer = Color(0xFF2A2418),
    onPrimaryContainer = Color(0xFFE8D3AC),
    secondary = Color(0xFFD9BE8C),
    onSecondary = Color(0xFF15110A),
    secondaryContainer = Color(0xFF1B1A17),
    onSecondaryContainer = Color(0xFFE8D3AC),
    background = Color(0xFF0A0E17),
    onBackground = Color(0xFFEEE9DF),
    surface = Color(0xFF111723),
    onSurface = Color(0xFFEEE9DF),
    surfaceVariant = Color(0xFF161D2B),
    onSurfaceVariant = Color(0xFF8A93A6),
    surfaceContainer = Color(0xFF111723),
    surfaceContainerHigh = Color(0xFF161D2B),
    surfaceContainerHighest = Color(0xFF1C2433),
    surfaceContainerLow = Color(0xFF0D121C),
    outline = Color(0xFF313C52),
    outlineVariant = Color(0xFF222B3C),
    error = Color(0xFFE08A7F),
    onError = Color(0xFF261618),
    errorContainer = Color(0xFF261618),
    onErrorContainer = Color(0xFFEDAAA1),
)

/** The messenger's own colours, as on the site (--chat-*). */
@Immutable
data class ChatColors(
    val wallpaper: Color,
    val mine: Color,
    val theirs: Color,
    val meta: Color,
    val read: Color,
    val badge: Color,
)

private val DayChat = ChatColors(
    wallpaper = Color(0xFFEFEAE2),
    mine = Color(0xFFD9FDD3),
    theirs = Color(0xFFFFFFFF),
    meta = Color(0xFF667781),
    read = Color(0xFF53BDEB),
    badge = Color(0xFFE8590C),
)

private val NightChat = ChatColors(
    wallpaper = Color(0xFF0B141A),
    mine = Color(0xFF005C4B),
    theirs = Color(0xFF1F2C34),
    meta = Color(0xFF8696A0),
    read = Color(0xFF53BDEB),
    badge = Color(0xFFE8590C),
)

val LocalChatColors = staticCompositionLocalOf { DayChat }

private val Type = Typography().let { t ->
    t.copy(
        headlineSmall = t.headlineSmall.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = t.bodyLarge.copy(fontSize = 16.sp, lineHeight = 22.sp),
    )
}

/** The handwritten-looking greeting line, in the system's serif until a face is bundled. */
val GreetingStyle = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 30.sp)

@Composable
fun Mtmu7Theme(theme: String, content: @Composable () -> Unit) {
    val dark = when (theme) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    CompositionLocalProvider(LocalChatColors provides if (dark) NightChat else DayChat) {
        MaterialTheme(colorScheme = if (dark) Night else Day, typography = Type, content = content)
    }
}
