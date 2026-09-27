package tj.mtmu7.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/**
 * What the phone allows the app, and a way to ask again.
 *
 * The app asks for everything it needs the first time it opens (MainActivity).
 * The web view cannot tell what the phone answered — its own geolocation
 * permission reads "prompt" or "granted" whatever Android decided — so the
 * portal's permissions card asks here instead: which of notifications,
 * location, camera and microphone are allowed, a way to ask for the ones that
 * are not, and, for one refused for good, the app's page in Android settings.
 */
@CapacitorPlugin(
    name = "DevicePermissions",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class DevicePermissionsPlugin extends Plugin {

    private static final String[] ALIASES = { "notifications", "location", "camera", "microphone" };

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(states());
    }

    /** Asks for the ones named in "which" (all four when none is named) that are not allowed yet. */
    @PluginMethod
    public void request(PluginCall call) {
        List<String> wanted = new ArrayList<>();
        try {
            if (call.getArray("which") != null) {
                for (Object name : call.getArray("which").toList()) wanted.add(String.valueOf(name));
            }
        } catch (Exception ignored) {
            // A malformed list asks for everything.
        }
        if (wanted.isEmpty()) {
            for (String alias : ALIASES) wanted.add(alias);
        }
        List<String> ask = new ArrayList<>();
        for (String alias : wanted) {
            if (!supported(alias)) continue;
            if (getPermissionState(alias) != PermissionState.GRANTED) ask.add(alias);
        }
        if (ask.isEmpty()) {
            call.resolve(states());
            return;
        }
        requestPermissionForAliases(ask.toArray(new String[0]), call, "answered");
    }

    @PermissionCallback
    private void answered(PluginCall call) {
        call.resolve(states());
    }

    /** The app's own page in Android settings, where a permission refused for good is turned back on. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private boolean supported(String alias) {
        // Before Android 13 notifications need no permission at all.
        return !"notifications".equals(alias) || Build.VERSION.SDK_INT >= 33;
    }

    private JSObject states() {
        JSObject result = new JSObject();
        for (String alias : ALIASES) {
            if (!supported(alias)) {
                result.put(alias, "granted");
                continue;
            }
            PermissionState state = getPermissionState(alias);
            String value;
            if (state == PermissionState.GRANTED) {
                value = "granted";
            } else if (state == PermissionState.DENIED) {
                value = "denied";
            } else {
                value = "prompt";
            }
            result.put(alias, value);
        }
        // Fine or coarse is enough for "send my location".
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            result.put("location", "granted");
        }
        return result;
    }
}
