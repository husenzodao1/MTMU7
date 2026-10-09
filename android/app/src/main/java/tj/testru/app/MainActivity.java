package tj.testru.app;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Testru: a locked-down WebView for https://testru.vercel.app.
 *
 * Protection provided by the OS (cannot be bypassed from the page):
 *  - FLAG_SECURE: screenshots and screen recording show a black screen.
 *  - Screen pinning (lock task) during a test: the student cannot switch apps
 *    without unpinning, and unpinning is detected by the page (grade 0).
 *  - No split-screen / picture-in-picture, no WebView remote debugging.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://testru.vercel.app/";
    private static final String[] ALLOWED_HOSTS = {
            "testru.vercel.app", "testho123.vercel.app", "mcbqcneytgnnzxcmxddm.supabase.co"
    };
    private static final int REQ_PERMISSIONS = 1;

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Block screenshots, screen recording and the recent-apps preview.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

        WebView.setWebContentsDebuggingEnabled(false);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F7F7F8"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " TestruApp/" + BuildInfo.version(this));
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new Bridge(), "TestruApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAllowed(uri)) return false;
                openExternally(uri);   // WhatsApp, app stores, downloads, ...
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(isNews(getIntent()) ? HOME + "#/news" : HOME);

        showOnboardingIfNeeded();
    }

    private static boolean isNews(Intent i) {
        return i != null && "news".equals(i.getStringExtra("open"));
    }

    /** A notification was tapped while the app is open: show announcements (never during a test). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (isNews(intent) && web != null && !isPinned()) {
            web.evaluateJavascript("if(typeof RUN==='undefined'||!RUN)location.hash='#/news'", null);
        }
    }

    private boolean isAllowed(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null) return false;
        for (String h : ALLOWED_HOSTS) if (h.equalsIgnoreCase(uri.getHost())) return true;
        return false;
    }

    private void openExternally(Uri uri) {
        if (isPinned()) return;   // nothing may open on top of a running test
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    /* ---------- first launch: explain protections and ask for permissions ---------- */

    private void showOnboardingIfNeeded() {
        final SharedPreferences prefs = getSharedPreferences("testru", MODE_PRIVATE);
        if (prefs.getBoolean("onboarded", false)) {
            requestPermissionsIfNeeded();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Защищённый режим тестов")
                .setMessage("Это приложение нужно для честного прохождения тестов.\n\n"
                        + "• Снимки экрана и запись экрана заблокированы.\n"
                        + "• Во время теста экран будет закреплён — подтвердите «Закрепить», когда система спросит.\n"
                        + "• Выход из приложения, открепление экрана или переход в другое приложение завершат тест с баллом 0.\n"
                        + "• Объявления администратора (рубежи, сроки) будут приходить уведомлениями.\n\n"
                        + "Сейчас приложение попросит разрешения. Пожалуйста, разрешите их.")
                .setCancelable(false)
                .setPositiveButton("Продолжить", (d, w) -> {
                    prefs.edit().putBoolean("onboarded", true).apply();
                    requestPermissionsIfNeeded();
                })
                .show();
    }

    private void requestPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERMISSIONS);
        }
    }

    /* ---------- screen pinning ---------- */

    private boolean isPinned() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }

    /** Called from the page as window.TestruApp.* */
    private class Bridge {
        @JavascriptInterface
        public void lockTask() {
            runOnUiThread(() -> {
                try { startLockTask(); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void unlockTask() {
            runOnUiThread(() -> {
                try { stopLockTask(); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public boolean isPinned() {
            return MainActivity.this.isPinned();
        }

        /** Logged-in student's session, used by the background announcement check. Empty = logged out. */
        @JavascriptInterface
        public void setSession(String token) {
            Notifier.setSession(MainActivity.this, token);
        }

        @JavascriptInterface
        public void showNotice(long id, String title, String body) {
            if (!MainActivity.this.isPinned()) Notifier.show(MainActivity.this, id, title, body);
        }

        @JavascriptInterface
        public boolean canNotify() {
            return Notifier.allowed(MainActivity.this);
        }

        @JavascriptInterface
        public void requestNotify() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && !getSharedPreferences("testru", MODE_PRIVATE).getBoolean("ntfAsked", false)) {
                    getSharedPreferences("testru", MODE_PRIVATE).edit().putBoolean("ntfAsked", true).apply();
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERMISSIONS);
                } else {
                    // Denied before (or switched off): open the app's notification settings.
                    try {
                        startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
                    } catch (Exception ignored) { }
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return BuildInfo.version(MainActivity.this);
        }
    }

    /* ---------- tell the page when the app loses the screen ---------- */

    private void notifyPage(String event) {
        if (web != null) web.evaluateJavascript("window.__appEvent&&window.__appEvent('" + event + "')", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        notifyPage("hidden");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Notification shade, assistant, another app's window on top, ...
        if (!hasFocus) notifyPage("hidden");
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else if (!isPinned()) super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
