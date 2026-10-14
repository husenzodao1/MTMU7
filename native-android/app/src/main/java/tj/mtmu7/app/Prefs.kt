package tj.mtmu7.app

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/** The app's language (Tajik unless chosen otherwise) and look, kept on the phone. */
object Prefs {
    val LANGUAGES = listOf("tg" to "Тоҷикӣ", "ru" to "Русский", "en" to "English")

    fun language(context: Context): String =
        context.getSharedPreferences("app", Context.MODE_PRIVATE).getString("language", "tg") ?: "tg"

    fun setLanguage(context: Context, language: String) {
        context.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putString("language", language).apply()
    }

    /** "light", "dark" or "system". The school's site opens light the first time; so does the app. */
    fun theme(context: Context): String =
        context.getSharedPreferences("app", Context.MODE_PRIVATE).getString("theme", "light") ?: "light"

    fun setTheme(context: Context, theme: String) {
        context.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putString("theme", theme).apply()
    }

    /** A context speaking the chosen language. */
    fun localized(base: Context): Context {
        val locale = Locale.forLanguageTag(language(base))
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }
}
