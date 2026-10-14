package tj.mtmu7.app;

import android.app.ActivityManager;
import android.os.Bundle;
import androidx.annotation.NonNull;
import com.google.firebase.messaging.RemoteMessage;
import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;
import java.util.Map;

/**
 * Firebase's messages, received by the app itself.
 *
 * The plugin's own service is kept underneath (super), so the portal's pages
 * still hear about every message while the app is open. What this adds is the
 * notification when it is not: the portal sends chat messages to Android as
 * data alone, and this draws them — with a reply box and a "mark as read"
 * button, which a notification Firebase draws on its own cannot have.
 */
public class AppMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        // A message that brought its own notification has already been shown.
        if (remoteMessage.getNotification() != null) return;
        Map<String, String> data = remoteMessage.getData();
        if (!"message".equals(data.get("kind"))) return;
        // Somebody using the app sees the message arrive in it.
        if (inForeground()) return;

        Bundle extras = new Bundle();
        for (Map.Entry<String, String> entry : data.entrySet()) {
            extras.putString(entry.getKey(), entry.getValue());
        }
        MessageNotifications.show(this, extras, false);
    }

    private static boolean inForeground() {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }
}
