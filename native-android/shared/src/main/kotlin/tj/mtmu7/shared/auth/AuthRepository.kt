package tj.mtmu7.shared.auth

import io.github.jan.supabase.auth.SignOutScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.auth.mfa.AuthenticatorAssuranceLevel
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import tj.mtmu7.shared.core.AppJson
import tj.mtmu7.shared.core.Backend
import tj.mtmu7.shared.model.Access

/** How a sign-in ended. `error` is a key the app turns into words (errors.*). */
sealed interface SignIn {
    data class Done(val access: Access) : SignIn
    /** The password was right; the account asks for the six-digit code (00070). */
    data object NeedsCode : SignIn
    data class Failed(val error: String) : SignIn
}

/**
 * Signing in and out, the way the site does it (src/features/auth/actions.ts):
 * an address signs in directly; a login (MT10001) or a nickname goes through
 * the portal, which alone may look up the address behind it. Then the second
 * step if the account has one, then who the person is (get_my_access) — kept
 * on the phone, so the app opens on the right screens with no line at all.
 */
class AuthRepository(private val backend: Backend) {
    private val supabase get() = backend.supabase
    private val _access = MutableStateFlow(backend.store.getJson(ACCESS, Access.serializer()))
    val access: StateFlow<Access?> = _access.asStateFlow()

    /** Signed in on this phone, as far as the phone knows (it may not be online). */
    val isSignedIn: Boolean get() = backend.store.get("session") != null && _access.value?.userId != null

    suspend fun signIn(login: String, password: String): SignIn {
        val name = login.trim()
        if (name.isEmpty() || password.isEmpty()) return SignIn.Failed("errors.invalid_credentials")
        try {
            if ('@' in name) {
                supabase.auth.signInWith(Email) {
                    email = name.lowercase()
                    this.password = password
                }
            } else {
                val answer = backend.portal.post(
                    "/api/app/sign-in",
                    buildJsonObject {
                        put("login", name)
                        put("password", password)
                    },
                    signed = false,
                )
                if (!backend.portal.isOk(answer.status)) {
                    val error = runCatching {
                        AppJson.parseToJsonElement(answer.body).jsonObject["error"]?.jsonPrimitive?.contentOrNull
                    }.getOrNull()
                    return SignIn.Failed(error ?: if (answer.status == 429) "errors.rate_limited" else "errors.invalid_credentials")
                }
                val session = AppJson.decodeFromString(UserSession.serializer(), answer.body)
                supabase.auth.importSession(session)
            }
        } catch (e: AuthRestException) {
            return SignIn.Failed(authError(e))
        } catch (e: Exception) {
            return SignIn.Failed("errors.network")
        }
        return afterPassword()
    }

    /** The six-digit code of an account with a second step. */
    suspend fun verifyCode(code: String): SignIn {
        if (!Regex("^\\d{6}$").matches(code.trim())) return SignIn.Failed("errors.invalid_code")
        return try {
            val factor = supabase.auth.mfa.retrieveFactorsForCurrentUser().firstOrNull { it.isVerified }
                ?: return SignIn.Failed("errors.unexpected")
            supabase.auth.mfa.createChallengeAndVerify(factor.id, code.trim())
            finish()
        } catch (e: AuthRestException) {
            SignIn.Failed(if (e.statusCode == 422 || e.statusCode == 400) "errors.invalid_code" else authError(e))
        } catch (e: Exception) {
            SignIn.Failed("errors.network")
        }
    }

    private suspend fun afterPassword(): SignIn {
        val level = runCatching { supabase.auth.mfa.getAuthenticatorAssuranceLevel() }.getOrNull()
        if (level != null && level.current == AuthenticatorAssuranceLevel.AAL1 && level.next == AuthenticatorAssuranceLevel.AAL2) {
            return SignIn.NeedsCode
        }
        return finish()
    }

    private suspend fun finish(): SignIn {
        val access = try {
            loadAccess()
        } catch (e: Exception) {
            return SignIn.Failed("errors.network")
        }
        if (access.mfaRequired) return SignIn.NeedsCode
        if (access.user == null || !access.isActive) {
            runCatching { supabase.auth.signOut(SignOutScope.LOCAL) }
            backend.store.wipe()
            _access.value = null
            return SignIn.Failed("errors.account_inactive")
        }
        return SignIn.Done(access)
    }

    /** Who the person is now, from the server; kept for the next launch. */
    suspend fun loadAccess(): Access {
        val json = supabase.postgrest.rpc("get_my_access").decodeAs<JsonObject>()
        val access = AppJson.decodeFromJsonElement(Access.serializer(), json)
        if (!access.mfaRequired && access.user != null) {
            backend.store.putJson(ACCESS, Access.serializer(), access)
            _access.value = access
        }
        return access
    }

    /** On launch, with a line: anything changed (a role, the school's modules) is picked up. */
    suspend fun refreshAccess(): Access? = runCatching { loadAccess() }.getOrNull()

    /**
     * Signing out: `beforeLeaving` runs while the session still works (the
     * phone's push token is let go of there), then the session and everything
     * this person had on the phone go.
     */
    suspend fun signOut(beforeLeaving: suspend () -> Unit = {}) {
        runCatching { beforeLeaving() }
        runCatching { supabase.auth.signOut(SignOutScope.LOCAL) }
        backend.store.wipe()
        _access.value = null
    }

    private fun authError(e: AuthRestException): String {
        val code = e.error
        return when {
            code == "email_not_confirmed" -> "errors.email_not_confirmed"
            code.startsWith("over_") || e.statusCode == 429 -> "errors.rate_limited"
            else -> "errors.invalid_credentials"
        }
    }

    companion object {
        const val ACCESS = "access"
    }
}
