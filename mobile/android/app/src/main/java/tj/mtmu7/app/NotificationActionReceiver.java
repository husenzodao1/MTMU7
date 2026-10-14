package tj.mtmu7.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import com.getcapacitor.CapConfig;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * The two buttons on a chat notification, answered without opening the app.
 *
 * Both go to the portal's /api/push/reply with the signed key the push
 * brought (never a password or a session: the app does not keep one outside
 * its web view). The portal is the one in capacitor.config.json, the same one
 * the app shows. A reply that did not go puts the notification back, saying
 * so, so what was typed is not silently lost.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        final Bundle data = intent.getExtras();
        if (data == null) return;
        final String token = data.getString("reply");
        if (token == null || token.isEmpty()) return;
        final boolean replying = MessageNotifications.ACTION_REPLY.equals(intent.getAction());
        final Context app = context.getApplicationContext();

        String typed = null;
        if (replying) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            CharSequence value = results == null ? null : results.getCharSequence(MessageNotifications.KEY_TEXT);
            typed = value == null ? "" : value.toString().trim();
            if (typed.isEmpty()) {
                // Nothing typed: put the notification back as it was.
                MessageNotifications.show(app, data, false);
                return;
            }
        }

        final String text = typed;
        final PendingResult pending = goAsync();
        POOL.execute(() -> {
            try {
                boolean sent = post(app, replying ? "reply" : "read", token, text);
                if (sent) MessageNotifications.cancel(app, data);
                else if (replying) MessageNotifications.show(app, data, true);
            } finally {
                pending.finish();
            }
        });
    }

    private static boolean post(Context context, String action, String token, String text) {
        String origin = origin(context);
        if (origin == null) return false;
        HttpURLConnection connection = null;
        try {
            JSONObject body = new JSONObject();
            body.put("action", action);
            body.put("token", token);
            if (text != null) body.put("text", text);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);

            connection = (HttpURLConnection) new URL(origin + "/api/push/reply").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } catch (Exception failure) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** https://host of the portal the app shows, or null when it is not https. */
    private static String origin(Context context) {
        String server = CapConfig.loadDefault(context).getServerUrl();
        if (server == null) return null;
        Uri uri = Uri.parse(server);
        if (!"https".equals(uri.getScheme()) || uri.getEncodedAuthority() == null) return null;
        return "https://" + uri.getEncodedAuthority();
    }
}
