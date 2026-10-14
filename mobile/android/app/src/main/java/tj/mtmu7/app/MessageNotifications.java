package tj.mtmu7.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;

/**
 * A chat message on the lock screen: who, what, and — when the portal sent a
 * reply key with it — a box to answer in and a button to mark it read, both
 * handled by NotificationActionReceiver without opening the app.
 *
 * One notification per conversation (its tag), so a busy group replaces its
 * own notification rather than stacking twenty.
 */
final class MessageNotifications {

    static final String CHANNEL = "messages";
    static final String KEY_TEXT = "reply_text";
    static final String ACTION_REPLY = "tj.mtmu7.app.action.REPLY";
    static final String ACTION_READ = "tj.mtmu7.app.action.READ";
    static final int ID = 1;

    private MessageNotifications() {}

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL,
            context.getString(R.string.channel_messages),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.channel_messages_description));
        channel.enableVibration(true);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    /** The conversation's notification; `failed` says a reply from it did not go. */
    static void show(Context context, Bundle data, boolean failed) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ensureChannel(context);

        String tag = text(data, "tag", "messages");
        String title = text(data, "title", context.getString(R.string.app_name));
        String body = text(data, "body", "");
        if (failed) body = "⚠ " + text(data, "failedLabel", "") + "\n" + body;
        int code = tag.hashCode() & 0x0fffffff;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(ContextCompat.getColor(context, R.color.notification))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(failed)
            .setShowWhen(true)
            .setContentIntent(open(context, data, code * 3));

        String reply = data.getString("reply");
        if (reply != null && !reply.isEmpty()) {
            RemoteInput input = new RemoteInput.Builder(KEY_TEXT)
                .setLabel(text(data, "placeholder", text(data, "replyLabel", "…")))
                .build();
            PendingIntent answer = PendingIntent.getBroadcast(
                context,
                code * 3 + 1,
                action(context, ACTION_REPLY, data),
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0)
            );
            builder.addAction(
                new NotificationCompat.Action.Builder(R.drawable.ic_stat_notify, text(data, "replyLabel", "Reply"), answer)
                    .addRemoteInput(input)
                    .setAllowGeneratedReplies(true)
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                    .setShowsUserInterface(false)
                    .build()
            );
            PendingIntent read = PendingIntent.getBroadcast(
                context,
                code * 3 + 2,
                action(context, ACTION_READ, data),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(
                new NotificationCompat.Action.Builder(R.drawable.ic_stat_notify, text(data, "readLabel", "Mark as read"), read)
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                    .setShowsUserInterface(false)
                    .build()
            );
        }

        try {
            NotificationManagerCompat.from(context).notify(tag, ID, builder.build());
        } catch (SecurityException ignored) {
            // Notifications were turned off between the check and here.
        }
    }

    static void cancel(Context context, Bundle data) {
        NotificationManagerCompat.from(context).cancel(text(data, "tag", "messages"), ID);
    }

    /** Tapping the notification: the conversation, through the app's own link. */
    private static PendingIntent open(Context context, Bundle data, int code) {
        String path = text(data, "url", "/messages");
        if (!path.startsWith("/") || path.startsWith("//")) path = "/messages";
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse(context.getString(R.string.custom_url_scheme) + "://open" + path))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Intent action(Context context, String name, Bundle data) {
        return new Intent(context, NotificationActionReceiver.class).setAction(name).putExtras(data);
    }

    private static String text(Bundle data, String key, String fallback) {
        String value = data.getString(key);
        return value == null || value.isEmpty() ? fallback : value;
    }
}
