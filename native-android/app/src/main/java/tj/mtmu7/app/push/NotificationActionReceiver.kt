package tj.mtmu7.app.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import tj.mtmu7.app.app
import tj.mtmu7.shared.core.Portal

/**
 * "Reply" and "Mark as read" on a notification, without opening the app: the
 * reply key the school sent with it, to /api/push/reply (the same as before).
 */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val data = extras.keySet().associateWith { extras.getString(it).orEmpty() }
        val token = data["reply"].orEmpty()
        if (token.isEmpty()) return
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(Notifications.KEY_TEXT)?.toString()?.trim()
        val reading = intent.action == Notifications.ACTION_READ
        if (!reading && text.isNullOrEmpty()) return
        val pending = goAsync()
        val portal = Portal(context.app.services.value?.backend?.config?.portalUrl ?: tj.mtmu7.app.BuildConfig.PORTAL_URL) { null }
        CoroutineScope(Dispatchers.IO).launch {
            val answer = runCatching {
                portal.post(
                    "/api/push/reply",
                    buildJsonObject {
                        put("action", if (reading) "read" else "reply")
                        put("token", token)
                        if (!reading) put("text", text!!)
                    },
                    signed = false,
                )
            }.getOrNull()
            val ok = answer != null && answer.status in 200..299
            if (ok) Notifications.cancel(context, data["tag"].orEmpty().ifEmpty { "messages" })
            else Notifications.show(context, data, failed = true)
            context.app.services.value?.let { s ->
                val id = data["tag"]?.removePrefix("conversation:")
                if (ok && id != null) {
                    s.messenger.refreshConversations()
                    s.messenger.refreshThread(id)
                }
            }
            pending.finish()
        }
    }
}
