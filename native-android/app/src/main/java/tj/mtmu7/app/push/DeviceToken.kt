package tj.mtmu7.app.push

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import tj.mtmu7.app.BuildConfig
import tj.mtmu7.app.Prefs
import tj.mtmu7.app.Services
import kotlin.coroutines.resume

/**
 * This phone's push address, given to the school while somebody is signed in
 * (save_device_token, 00069) and taken back when they sign out
 * (forget_my_device_token), so the next person to sign in on the phone never
 * gets the last one's messages.
 */
object DeviceToken {
    private fun available(context: Context): Boolean =
        BuildConfig.HAS_FIREBASE && runCatching { FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null }.getOrDefault(false)

    private suspend fun token(): String? = withTimeoutOrNull(10_000) {
        suspendCancellableCoroutine { done ->
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { done.resume(it) }
                .addOnFailureListener { done.resume(null) }
        }
    }

    suspend fun register(context: Context, services: Services, known: String? = null) {
        if (!available(context) || !services.auth.isSignedIn) return
        val token = known ?: token() ?: return
        runCatching {
            services.backend.supabase.postgrest.rpc(
                "save_device_token",
                buildJsonObject {
                    put("p_token", token)
                    put("p_platform", "android")
                    put("p_locale", Prefs.language(context))
                },
            )
        }
    }

    suspend fun forget(context: Context, services: Services) {
        if (!available(context)) return
        val token = token() ?: return
        withTimeoutOrNull(3_000) {
            runCatching {
                services.backend.supabase.postgrest.rpc("forget_my_device_token", buildJsonObject { put("p_token", token) })
            }
        }
        runCatching { FirebaseMessaging.getInstance().deleteToken() }
    }
}
