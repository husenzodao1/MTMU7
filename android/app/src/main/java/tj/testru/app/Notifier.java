package tj.testru.app;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

/** Announcement notifications: channel, de-duplication and the background check schedule. */
final class Notifier {
    private Notifier() { }

    static final String CHANNEL = "announcements";
    static final int JOB_ID = 7001;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("testru", Context.MODE_PRIVATE);
    }

    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        return nm != null && nm.areNotificationsEnabled();
    }

    /** True while a test is running (screen pinned): nothing may pop up on top of it. */
    static boolean testRunning(Context c) {
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }

    private static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Объявления", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Объявления администратора: рубежи, тесты, сроки");
            nm.createNotificationChannel(ch);
        }
    }

    /** Shows the announcement once; returns false if it was already shown. */
    static synchronized boolean show(Context c, long id, String title, String body) {
        SharedPreferences p = prefs(c);
        if (id <= p.getLong("annLast", 0)) return false;
        p.edit().putLong("annLast", id).apply();
        if (!allowed(c)) return true;
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class)
                .putExtra("open", "news")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, (int) id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_bell)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify((int) id, n);
        return true;
    }

    /** Stores the student's session and (re)starts the background check. Empty token = logged out. */
    static void setSession(Context c, String token) {
        SharedPreferences p = prefs(c);
        String old = p.getString("token", "");
        SharedPreferences.Editor e = p.edit().putString("token", token == null ? "" : token);
        if (!old.equals(token)) e.putLong("annLast", -1);   // first check after login only remembers the latest id
        e.apply();
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        if (token == null || token.isEmpty()) { js.cancel(JOB_ID); return; }
        if (js.getPendingJob(JOB_ID) != null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, AnnounceJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build());
    }
}
