package tj.mtmu7.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import tj.mtmu7.app.MainActivity
import tj.mtmu7.app.R

/**
 * A chat message on the lock screen: who, what, a box to answer in and a
 * button to mark it read when the school sent a reply key — one notification
 * per conversation, so a busy group replaces its own rather than stacking.
 */
object Notifications {
    const val CHANNEL = "messages"
    const val KEY_TEXT = "reply_text"
    const val ACTION_REPLY = "tj.mtmu7.app.action.REPLY"
    const val ACTION_READ = "tj.mtmu7.app.action.READ"
    private const val ID = 1

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL) != null) return
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.channel_messages), NotificationManager.IMPORTANCE_HIGH).apply {
            description = context.getString(R.string.channel_messages_description)
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
    }

    fun show(context: Context, data: Map<String, String>, failed: Boolean) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        ensureChannel(context)
        val tag = data["tag"].orEmpty().ifEmpty { "messages" }
        val title = data["title"].orEmpty().ifEmpty { context.getString(R.string.app_name) }
        var body = data["body"].orEmpty()
        if (failed) body = "⚠ " + data["failedLabel"].orEmpty() + "\n" + body
        val code = tag.hashCode() and 0x0fffffff
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(ContextCompat.getColor(context, R.color.notification))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(failed)
            .setShowWhen(true)
            .setContentIntent(open(context, data, code * 3))
        val reply = data["reply"]
        if (!reply.isNullOrEmpty()) {
            val input = RemoteInput.Builder(KEY_TEXT)
                .setLabel(data["placeholder"].orEmpty().ifEmpty { data["replyLabel"].orEmpty().ifEmpty { "…" } })
                .build()
            val answer = PendingIntent.getBroadcast(
                context, code * 3 + 1, action(context, ACTION_REPLY, data),
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0),
            )
            builder.addAction(
                NotificationCompat.Action.Builder(R.drawable.ic_stat_notify, data["replyLabel"].orEmpty().ifEmpty { "Reply" }, answer)
                    .addRemoteInput(input)
                    .setAllowGeneratedReplies(true)
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                    .setShowsUserInterface(false)
                    .build()
            )
            val read = PendingIntent.getBroadcast(
                context, code * 3 + 2, action(context, ACTION_READ, data),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            builder.addAction(
                NotificationCompat.Action.Builder(R.drawable.ic_stat_notify, data["readLabel"].orEmpty().ifEmpty { "Mark as read" }, read)
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                    .setShowsUserInterface(false)
                    .build()
            )
        }
        try {
            NotificationManagerCompat.from(context).notify(tag, ID, builder.build())
        } catch (_: SecurityException) {
            // Notifications were turned off between the check and here.
        }
    }

    fun cancel(context: Context, tag: String) {
        NotificationManagerCompat.from(context).cancel(tag, ID)
    }

    /** The conversation's notification, cleared once it is read in the app. */
    fun cancelConversation(context: Context, conversationId: String) = cancel(context, "conversation:$conversationId")

    private fun open(context: Context, data: Map<String, String>, code: Int): PendingIntent {
        var path = data["url"].orEmpty().ifEmpty { "/messages" }
        if (!path.startsWith("/") || path.startsWith("//")) path = "/messages"
        val intent = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("tj.mtmu7.app://open$path"))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun action(context: Context, name: String, data: Map<String, String>): Intent {
        val intent = Intent(context, NotificationActionReceiver::class.java).setAction(name)
        data.forEach { (k, v) -> intent.putExtra(k, v) }
        return intent
    }
}
