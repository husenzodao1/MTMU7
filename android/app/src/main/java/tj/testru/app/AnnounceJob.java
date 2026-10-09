package tj.testru.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Background check for new announcements (runs about every 15 minutes, also when the app is closed). */
public class AnnounceJob extends JobService {

    private static final String API = "https://mcbqcneytgnnzxcmxddm.supabase.co/rest/v1/rpc/my_announcements";
    private static final String KEY = "sb_publishable_m8KFtrf0lJblTvHmU4g_Gg_J8eo_x_J";

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try { check(); } catch (Exception ignored) { }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private void check() throws Exception {
        SharedPreferences p = Notifier.prefs(this);
        String token = p.getString("token", "");
        if (token.isEmpty() || Notifier.testRunning(this)) return;
        long last = p.getLong("annLast", -1);

        HttpURLConnection c = (HttpURLConnection) new URL(API).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("apikey", KEY);
        c.setRequestProperty("Content-Type", "application/json");
        JSONObject body = new JSONObject().put("p_token", token).put("p_after", Math.max(last, 0));
        try (OutputStream o = c.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        if (c.getResponseCode() != 200) return;
        String text;
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            text = b.toString("UTF-8");
        }
        if (text.isEmpty() || text.equals("null")) return;   // session ended
        JSONArray list = new JSONArray(text);                 // newest first
        if (last < 0) {                                       // first check: don't replay old announcements
            p.edit().putLong("annLast", list.length() > 0 ? list.getJSONObject(0).getLong("id") : 0).apply();
            return;
        }
        for (int i = list.length() - 1; i >= 0; i--) {
            JSONObject a = list.getJSONObject(i);
            StringBuilder s = new StringBuilder(a.optString("body"));
            if (!a.isNull("topic")) s.append("\nТема: ").append(a.optString("topic"));
            Notifier.show(this, a.getLong("id"), "Объявление", s.toString());
        }
    }
}
