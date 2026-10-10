package tj.mtmu7.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

/**
 * The portal, opened in Capacitor's web view (capacitor.config.json).
 *
 * Three things done here: the app's own plugins are registered before the
 * bridge starts, the "messages" notification channel exists before the first
 * push arrives (so chat notifications ring and show on the lock screen), and
 * the first time the app opens it asks for everything it will need —
 * notifications, location, the camera and the microphone — in Android's own
 * dialogs, once. Whatever is refused there, the portal's permissions card asks
 * about again later (DevicePermissionsPlugin).
 */
public class MainActivity extends BridgeActivity {

    private static final String PREFS = "mtmu7";
    private static final String ASKED = "permissions_asked_v1";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAccountPlugin.class);
        registerPlugin(DevicePermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        MessageNotifications.ensureChannel(this);
        askOnFirstLaunch();
    }

    private void askOnFirstLaunch() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(ASKED, false)) return;
        prefs.edit().putBoolean(ASKED, true).apply();

        List<String> wanted = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) wanted.add(Manifest.permission.POST_NOTIFICATIONS);
        wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
        wanted.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        wanted.add(Manifest.permission.CAMERA);
        wanted.add(Manifest.permission.RECORD_AUDIO);

        List<String> missing = new ArrayList<>();
        for (String permission : wanted) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) missing.add(permission);
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), 7001);
        }
    }
}
