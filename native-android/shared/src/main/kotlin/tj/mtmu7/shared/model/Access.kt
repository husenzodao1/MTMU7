package tj.mtmu7.shared.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Who is signed in and what they may do: get_my_access() (00070), the same
 * answer the site builds every page from (src/lib/auth/access.ts). Kept on
 * the phone, so the app opens on the right screens before any network.
 */
@Serializable
data class Access(
    val user: AccessUser? = null,
    val school: AccessSchool? = null,
    val roles: List<AccessRole> = emptyList(),
    val permissions: List<String> = emptyList(),
    val modules: List<String> = emptyList(),
    @SerialName("mfa_required") val mfaRequired: Boolean = false,
) {
    val userId: String? get() = user?.id
    val schoolId: String? get() = school?.id ?: user?.schoolId
    val displayName: String get() = listOfNotNull(user?.firstName, user?.lastName).joinToString(" ").trim()
    fun can(permission: String): Boolean = permission in permissions
    fun hasModule(module: String): Boolean = module in modules
    fun hasRole(slug: String): Boolean = roles.any { it.slug == slug }
    val isActive: Boolean get() = user?.isActive == true && user.status != "blocked"
}

@Serializable
data class AccessUser(
    val id: String,
    @SerialName("school_id") val schoolId: String? = null,
    @SerialName("public_id") val publicId: String? = null,
    val email: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("middle_name") val middleName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val phone: String? = null,
    val status: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("email_verified") val emailVerified: Boolean = true,
) {
    /** A real address, not the placeholder an account without one is given (00092). */
    val visibleEmail: String? get() = email?.takeUnless { it.endsWith(".invalid") }
}

@Serializable
data class AccessSchool(
    val id: String,
    val slug: String? = null,
    @SerialName("short_name") val shortName: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    val timezone: String? = null,
    @SerialName("default_locale") val defaultLocale: String? = null,
)

@Serializable
data class AccessRole(
    val id: String? = null,
    val slug: String,
    @SerialName("name_tg") val nameTg: String? = null,
    @SerialName("name_ru") val nameRu: String? = null,
    @SerialName("name_en") val nameEn: String? = null,
    val level: Int? = null,
)
