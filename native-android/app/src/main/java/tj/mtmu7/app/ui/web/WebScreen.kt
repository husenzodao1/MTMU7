package tj.mtmu7.app.ui.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import tj.mtmu7.app.Services

/**
 * A section of the site the app does not draw itself yet, inside the app:
 * signed in (WebSession), under the app's own bars (the site hides its own
 * for "MTMU7Native"), and kept (WebViews) — a page opened once is where it
 * was left every time after. A link to a conversation opens the app's
 * messenger; a link out of the school opens the phone's browser.
 *
 * `key` names the kept page: the same section on the bar and opened from the
 * menu are two pages, never one view in two places.
 */
@Composable
fun WebScreen(
    services: Services,
    path: String,
    onOpenChat: (String) -> Unit,
    modifier: Modifier = Modifier,
    visible: Boolean = true,
    key: String = path,
) {
    val views = LocalWebViews.current
    val portal = services.backend.config.portalUrl.trimEnd('/')
    var ready by remember(key) { mutableStateOf(views.has(key)) }
    var progress by remember(key) { mutableFloatStateOf(1f) }
    var canGoBack by remember(key) { mutableStateOf(false) }
    var view by remember(key) { mutableStateOf<WebView?>(null) }
    val openChat by rememberUpdatedState(onOpenChat)
    val background = MaterialTheme.colorScheme.background.toArgb()

    LaunchedEffect(key) {
        if (!ready) {
            WebSession.ensure(services)
            ready = true
        }
    }

    // Back closes what the page has open first (a menu, a dialog, the register
    // on the full screen) — the site's own rule for its app (native-app.tsx).
    BackHandler(enabled = visible && canGoBack) {
        val page = view ?: return@BackHandler
        page.evaluateJavascript(CLOSE_OPEN) { closed -> if (closed != "true") page.goBack() }
    }

    Box(modifier.fillMaxSize()) {
        if (ready) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    views.obtain(key) { create(context, background, portal + path) }.apply {
                        // A kept page answers to this screen now.
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) {
                                progress = newProgress / 100f
                            }
                        }
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                val url = request.url
                                if (url.toString().startsWith(portal)) {
                                    val chat = Regex("^/messages/([0-9a-f-]{36})").find(url.path.orEmpty())?.groupValues?.get(1)
                                    if (chat != null) {
                                        openChat(chat)
                                        return true
                                    }
                                    return false
                                }
                                runCatching { view.context.startActivity(Intent(Intent.ACTION_VIEW, url)) }
                                return true
                            }

                            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                                canGoBack = view.canGoBack()
                            }

                            override fun onPageFinished(view: WebView, url: String?) {
                                canGoBack = view.canGoBack()
                                progress = 1f
                            }

                            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                                canGoBack = view.canGoBack()
                            }
                        }
                        canGoBack = canGoBack()
                        progress = if (this.progress >= 100) 1f else this.progress / 100f
                        view = this
                    }
                },
                update = { v ->
                    // Kept behind another tab: out of sight and out of reach, page and place kept.
                    v.visibility = if (visible) View.VISIBLE else View.GONE
                },
            )
        }
        if (visible && progress < 1f) {
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter))
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun create(context: Context, background: Int, url: String): WebView = WebView(context).apply {
    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    setBackgroundColor(background)
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.cacheMode = WebSettings.LOAD_DEFAULT
    settings.mediaPlaybackRequiresUserGesture = false
    settings.userAgentString = settings.userAgentString + " MTMU7App MTMU7Native"
    setDownloadListener { link, _, _, _, _ -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link))) } }
    loadUrl(url)
}

/** True when something open on the page took the back press (it is told Escape, as the site's app shell does). */
private const val CLOSE_OPEN =
    "(function(){var o=document.querySelector('[role=\"dialog\"][data-state=\"open\"],[role=\"menu\"][data-state=\"open\"],[role=\"listbox\"][data-state=\"open\"]');" +
        "if(!o)return false;(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return true})()"
