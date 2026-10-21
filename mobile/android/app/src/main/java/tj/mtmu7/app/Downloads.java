package tj.mtmu7.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Files the portal hands over: a workbook template, a sample, a report card, a
 * book from the library.
 *
 * A web view saves nothing by itself. Without a download listener a link that
 * answers with an attachment is simply dropped, which is why "Download sample"
 * did nothing in the app. Here such a link goes to Android's DownloadManager —
 * with the session's cookies, since most of these files are for signed-in
 * people only — and lands in Downloads with its own (Cyrillic) name and a
 * notification to open it from.
 *
 * A file the page made itself (the import result, with the passwords issued)
 * has no address to download again; the page sends its bytes to FilesPlugin,
 * which writes them here with write().
 */
final class Downloads {

    private static final Pattern ENCODED_NAME = Pattern.compile("filename\\*\\s*=\\s*([\\w-]+)''([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PLAIN_NAME = Pattern.compile("filename\\s*=\\s*\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE);

    private Downloads() {}

    /** Sends every attachment the web view is given to the DownloadManager. */
    static void listen(Activity activity, WebView webView) {
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !url.startsWith("https://")) {
                // blob: and data: addresses are the page's own; the page saves
                // those through FilesPlugin, and a page that does not is too old.
                toast(activity, activity.getString(R.string.download_unsupported));
                return;
            }
            String name = fileName(url, contentDisposition, mimeType);
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
                if (userAgent != null && !userAgent.isEmpty()) request.addRequestHeader("User-Agent", userAgent);
                if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);
                request.setTitle(name);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                if (Build.VERSION.SDK_INT >= 29) {
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                } else {
                    // Before Android 10 the shared Downloads folder needs a
                    // storage permission; the app's own one does not, and the
                    // notification opens the file all the same.
                    request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name);
                }
                DownloadManager manager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (manager == null) throw new IllegalStateException("No DownloadManager");
                manager.enqueue(request);
                toast(activity, activity.getString(R.string.download_started, name));
            } catch (RuntimeException error) {
                toast(activity, activity.getString(R.string.download_failed));
            }
        });
    }

    /**
     * Writes bytes the page made into Downloads and says what the file was
     * called there (Android adds " (1)" to a name already taken).
     */
    static String write(Activity activity, byte[] bytes, String name, String mime) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = activity.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Downloads did not take the file");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Downloads did not open the file");
                out.write(bytes);
            } catch (IOException error) {
                resolver.delete(uri, null, null);
                throw error;
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            toast(activity, activity.getString(R.string.download_saved, name));
            return name;
        }

        // Android 7–9: the app's own Downloads folder, then straight open, as
        // nothing else would show the person where it went.
        File folder = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (folder == null) folder = new File(activity.getFilesDir(), "Download");
        if (!folder.exists() && !folder.mkdirs()) throw new IOException("No folder to save in");
        File file = new File(folder, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        activity.runOnUiThread(() -> {
            try {
                Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
                Intent open = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(open);
            } catch (ActivityNotFoundException | IllegalArgumentException error) {
                Toast.makeText(activity, activity.getString(R.string.download_saved, file.getAbsolutePath()), Toast.LENGTH_LONG).show();
            }
        });
        return file.getName();
    }

    /**
     * The name the server gave the file. Android's own guess reads only the
     * plain filename="…" and turns an encoded Cyrillic one (filename*=UTF-8''…)
     * into "downloadfile.bin".
     */
    static String fileName(String url, String disposition, String mimeType) {
        String name = null;
        if (disposition != null) {
            Matcher encoded = ENCODED_NAME.matcher(disposition);
            if (encoded.find()) {
                try {
                    name = URLDecoder.decode(encoded.group(2).trim().replace("+", "%2B"), encoded.group(1));
                } catch (Exception ignored) {
                    name = null;
                }
            }
            if (name == null) {
                Matcher plain = PLAIN_NAME.matcher(disposition);
                if (plain.find()) name = plain.group(1).trim();
            }
        }
        if (name == null || name.isEmpty()) name = URLUtil.guessFileName(url, disposition, mimeType);
        return safeName(name, "file");
    }

    /** A name a folder takes: no separators, no control characters, not hidden, not endless. */
    static String safeName(String name, String fallback) {
        if (name == null) return fallback;
        String clean = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        while (clean.startsWith(".")) clean = clean.substring(1);
        if (clean.isEmpty()) return fallback;
        return clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
    }

    static void toast(Activity activity, String text) {
        activity.runOnUiThread(() -> Toast.makeText(activity, text, Toast.LENGTH_LONG).show());
    }
}
