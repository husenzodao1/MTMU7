package tj.mtmu7.app.ui.web

import android.util.Base64
import android.webkit.CookieManager
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import tj.mtmu7.app.Services
import tj.mtmu7.shared.core.AppJson
import java.net.URI
import kotlin.coroutines.resume

/**
 * The site's pages inside the app, signed in without a second sign-in: the
 * portal makes a session of their own for them (/api/app/web-session — never
 * the app's own, whose refresh token two holders would wear out), and it is
 * written into the web view's cookies the way @supabase/ssr reads it:
 * `sb-<project>-auth-token`, "base64-" + base64url(session JSON), in chunks of
 * 3180 characters when it is long.
 */
object WebSession {
    @Volatile
    private var readyFor: String? = null

    suspend fun ensure(services: Services): Boolean {
        val me = services.auth.access.value?.userId ?: return false
        if (readyFor == me) return true
        val token = services.backend.supabase.auth.currentAccessTokenOrNull() ?: return false
        val answer = runCatching { services.backend.portal.post("/api/app/web-session", buildJsonObject { }) }.getOrNull()
        if (answer == null || answer.status !in 200..299) return false
        val session = runCatching { AppJson.parseToJsonElement(answer.body) as JsonObject }.getOrNull() ?: return false
        val ref = runCatching { URI(services.backend.config.supabaseUrl).host.substringBefore('.') }.getOrNull() ?: return false
        val name = "sb-$ref-auth-token"
        val value = "base64-" + Base64.encodeToString(session.toString().toByteArray(), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        val portal = services.backend.config.portalUrl
        withContext(Dispatchers.Main) {
            val cookies = CookieManager.getInstance()
            cookies.setAcceptCookie(true)
            // Clear any chunks of an earlier session, then write this one.
            for (i in 0..5) cookies.setCookie(portal, "$name.$i=; Path=/; Max-Age=0")
            cookies.setCookie(portal, "$name=; Path=/; Max-Age=0")
            val chunks = value.chunked(3180)
            if (chunks.size == 1) {
                cookies.setCookie(portal, "$name=$value; Path=/; Max-Age=34560000; Secure; SameSite=Lax")
            } else {
                chunks.forEachIndexed { i, chunk -> cookies.setCookie(portal, "$name.$i=$chunk; Path=/; Max-Age=34560000; Secure; SameSite=Lax") }
            }
            cookies.flush()
        }
        if (token.isNotEmpty()) readyFor = me
        return true
    }

    /** Signing out: the pages forget the session too. */
    suspend fun forget() {
        readyFor = null
        withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { done -> CookieManager.getInstance().removeAllCookies { done.resume(Unit) } }
            CookieManager.getInstance().flush()
        }
    }
}
