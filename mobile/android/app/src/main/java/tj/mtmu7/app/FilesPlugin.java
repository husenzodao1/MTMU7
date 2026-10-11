package tj.mtmu7.app;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;

/**
 * Saves a file the page made itself into the phone's Downloads.
 *
 * The import's result workbook — the only copy of the passwords it issued —
 * is built by the server in answer to a POST and handed to the page, which in
 * a browser saves it through a blob: link. A web view drops such a link, so in
 * the app the page sends the bytes here instead (features/native/files.ts).
 * Files with an address of their own go through Downloads.listen.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    /** Bigger than any workbook the portal makes; a guard, not a limit anyone meets. */
    private static final int MAX_BYTES = 20 * 1024 * 1024;

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String name = Downloads.safeName(call.getString("name"), "file");
        String mime = call.getString("mime", "application/octet-stream");
        if (data == null || data.isEmpty()) {
            call.reject("Nothing to save", "empty");
            return;
        }
        if (data.length() > MAX_BYTES / 3 * 4 + 4) {
            call.reject("The file is too large", "too_large");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("Not a file", "invalid");
            return;
        }
        try {
            JSObject result = new JSObject();
            result.put("name", Downloads.write(getActivity(), bytes, name, mime));
            call.resolve(result);
        } catch (IOException | RuntimeException error) {
            call.reject(error.getMessage(), "failed");
        }
    }
}
