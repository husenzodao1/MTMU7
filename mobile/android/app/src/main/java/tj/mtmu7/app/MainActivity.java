package tj.mtmu7.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * The portal, opened in Capacitor's web view (capacitor.config.json).
 *
 * The one thing done here: the "messages" notification channel exists before
 * the first push arrives, so chat notifications ring and show on the lock
 * screen instead of landing silently in Android's catch-all channel.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createMessagesChannel();
    }

    private void createMessagesChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel("messages") != null) return;
        NotificationChannel channel = new NotificationChannel(
            "messages",
            getString(R.string.channel_messages),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.channel_messages_description));
        channel.enableVibration(true);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }
}
