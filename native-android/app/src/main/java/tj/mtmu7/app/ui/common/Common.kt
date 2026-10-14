package tj.mtmu7.app.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import tj.mtmu7.app.R

/** A face, or the initials on a warm ground when there is no photo. */
@Composable
fun Avatar(name: String, url: String?, size: Dp = 44.dp, modifier: Modifier = Modifier) {
    val initials = name.split(' ', ' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials.ifEmpty { "•" },
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            fontWeight = FontWeight.SemiBold,
            fontSize = (size.value * 0.36f).sp,
        )
        if (!url.isNullOrBlank()) {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size).clip(CircleShape))
        }
    }
}

/** The quiet note at the top when there is no line: what is shown is the phone's own copy. */
@Composable
fun OfflineNote(visible: Boolean) {
    AnimatedVisibility(visible, enter = expandVertically(), exit = shrinkVertically()) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.inverseSurface)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Outlined.CloudOff, null, tint = MaterialTheme.colorScheme.inverseOnSurface, modifier = Modifier.size(18.dp))
            Text(
                stringResource(R.string.offline_text),
                color = MaterialTheme.colorScheme.inverseOnSurface,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

/** A small round count, as on the site's bar and list. */
@Composable
fun CountBadge(count: Long, muted: Boolean = false, color: Color = Color(0xFFE8590C)) {
    if (count <= 0) return
    Box(
        Modifier
            .clip(CircleShape)
            .background(if (muted) MaterialTheme.colorScheme.outline else color)
            .padding(horizontal = 7.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else count.toString(), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The words for an error key from the data layer. */
@Composable
fun errorText(key: String?): String = stringResource(
    when (key) {
        "errors.invalid_credentials" -> R.string.error_invalid_credentials
        "errors.rate_limited" -> R.string.error_rate_limited
        "errors.account_inactive" -> R.string.error_account_inactive
        "errors.email_not_confirmed" -> R.string.error_email_not_confirmed
        "errors.network" -> R.string.error_network
        "errors.invalid_code" -> R.string.error_invalid_code
        "errors.forbidden" -> R.string.error_forbidden
        "errors.messaging_blocked" -> R.string.error_blocked
        else -> R.string.error_unexpected
    }
)
