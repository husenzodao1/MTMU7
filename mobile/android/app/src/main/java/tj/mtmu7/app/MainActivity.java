package tj.mtmu7.app;

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
        MessageNotifications.ensureChannel(this);
    }
}
