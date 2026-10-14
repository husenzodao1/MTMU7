package tj.mtmu7.app.ui.web

import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * The site's pages the app has opened, kept while it runs: going to a chat
 * and back, or to another tab and back, finds the page where it was left —
 * nothing loads twice. The least recently seen go when there are too many.
 */
class WebViews {
    private val views = LinkedHashMap<String, WebView>(8, 0.75f, true)

    fun has(key: String): Boolean = key in views

    fun obtain(key: String, create: () -> WebView): WebView {
        val view = views[key] ?: create().also {
            views[key] = it
            trim(keep = key)
        }
        (view.parent as? ViewGroup)?.removeView(view)
        return view
    }

    private fun trim(keep: String) {
        while (views.size > MAX) {
            val eldest = views.entries.firstOrNull { it.key != keep && it.value.parent == null } ?: return
            views.remove(eldest.key)
            eldest.value.destroy()
        }
    }

    /** Signing out, or the screen going away: every page is let go of. */
    fun clear() {
        views.values.forEach {
            (it.parent as? ViewGroup)?.removeView(it)
            it.destroy()
        }
        views.clear()
    }

    private companion object {
        const val MAX = 6
    }
}

val LocalWebViews = staticCompositionLocalOf { WebViews() }
