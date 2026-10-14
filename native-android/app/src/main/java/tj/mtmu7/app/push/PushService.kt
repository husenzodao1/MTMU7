package tj.mtmu7.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.launch
import tj.mtmu7.app.app

/**
 * The school's pushes. A chat message comes as data only (src/lib/push/fcm.ts):
 * kind, url, tag ("conversation:<id>"), title, body, and when one may answer,
 * a reply key. The app catches up with that conversation at once, so it is
 * already there when it is opened, and shows the notification unless the
 * conversation is on screen.
 */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val services = app.services.value ?: return
        services.backend.scope.launch { DeviceToken.register(this@PushService, services, token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["kind"] != "message") return
        val conversationId = data["tag"]?.removePrefix("conversation:")?.takeIf { it.length == 36 }
        val services = app.services.value
        if (services != null && conversationId != null && services.auth.isSignedIn) {
            services.backend.scope.launch {
                services.messenger.refreshThread(conversationId)
                services.messenger.refreshConversations()
                services.messenger.touch()
            }
            if (services.messenger.openConversation == conversationId) return
        }
        Notifications.show(this, data, failed = false)
    }
}
