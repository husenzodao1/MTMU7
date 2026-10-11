package tj.mtmu7.app;

import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialInterruptedException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.Locale;

/**
 * "Sign in with Google" from the Google accounts already on the phone.
 *
 * Google will not sign anybody in inside an app's web view, and sending them
 * out to Chrome and back loses them on the way. Android's Credential Manager
 * shows the phone's own account sheet instead and hands back a Google ID token
 * for the chosen account; the portal exchanges that token for a session
 * (/auth/google/native), so the whole sign-in stays inside the app.
 *
 * The token is issued for the Firebase project's web client, whose id the
 * google-services plugin writes into the app as default_web_client_id once
 * Google sign-in is switched on in Firebase. A build without it answers
 * "not_configured", and the portal falls back to the browser.
 */
@CapacitorPlugin(name = "GoogleAccount")
public class GoogleAccountPlugin extends Plugin {

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", webClientId() != null);
        call.resolve(result);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = webClientId();
        if (clientId == null) {
            call.reject("Google sign-in is not configured in this build", "not_configured");
            return;
        }
        GetSignInWithGoogleOption.Builder option = new GetSignInWithGoogleOption.Builder(clientId);
        String nonce = call.getString("nonce");
        if (nonce != null && !nonce.isEmpty()) option.setNonce(nonce);
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option.build()).build();

        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    // Whatever goes wrong here, the page hears of it: an
                    // exception thrown out of this callback would leave the
                    // portal's button spinning for good.
                    try {
                        Credential credential = response.getCredential();
                        if (credential instanceof CustomCredential
                            && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                            JSObject result = new JSObject();
                            result.put("idToken", google.getIdToken());
                            result.put("email", google.getId());
                            call.resolve(result);
                        } else {
                            call.reject("Not a Google account: " + credential.getType(), "unexpected");
                        }
                    } catch (Exception error) {
                        call.reject(String.valueOf(error.getMessage()), "unexpected");
                    }
                }

                @Override
                public void onError(GetCredentialException error) {
                    call.reject(error.getType() + ": " + error.getMessage(), code(error));
                }
            }
        );
    }

    /**
     * What the page is told went wrong. Google answers "cancelled" both when
     * the sheet is closed and when the account chosen in it could not be
     * confirmed ("[16] Account reauth failed": the account wants its password
     * again, or Google does not know this build's signing key); only the
     * first is the person's own choice, so the second gets a code of its own.
     */
    private static String code(GetCredentialException error) {
        String message = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
        if (error instanceof GetCredentialCancellationException) {
            return message.contains("reauth") || message.contains("[16]") ? "reauth" : "cancelled";
        }
        if (error instanceof NoCredentialException) return "no_account";
        if (error instanceof GetCredentialInterruptedException) return "interrupted";
        return "failed";
    }

    /** The Firebase web client id the google-services plugin wrote, if it did. */
    private String webClientId() {
        int id = getContext().getResources().getIdentifier("default_web_client_id", "string", getContext().getPackageName());
        if (id == 0) return null;
        String value = getContext().getString(id);
        return value == null || value.isEmpty() ? null : value;
    }
}
