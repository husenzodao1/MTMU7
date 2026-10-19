/**
 * The inline half of the opening (intro.tsx). Kept out of that client module
 * so the root layout, a server component, can write it into the HTML as a
 * plain string.
 */
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";

/**
 * Set, in the tab's own storage, once the opening has played: it plays once
 * per visit to the site and when the app is opened (the app's web view
 * starts with empty session storage on each start), and a page opened after
 * that within the same visit is simply there. The same key in the device's
 * storage holds when it last played, so that a phone which closed the app
 * behind the person's back a moment ago (Android does, to free memory) does
 * not play it again on the way back (INTRO_GAP_MS).
 */
export const INTRO_SEEN = "mtmu7-intro";

/** The opening plays at most once in this long, however often the app is opened. */
export const INTRO_GAP_MS = 30 * 60_000;

/** When the greeting has been said and the page is uncovered, from the moment the opening starts. */
export const INTRO_MS = 3200;
/** The same with reduced motion: nothing moves, the greeting already there, a short look and gone. */
export const INTRO_QUICK_MS = 1400;
/**
 * The greeting after a sign-in (book-scene.tsx): the book opens and "Салом"
 * writes itself with the name. The portal loads underneath meanwhile, so
 * this is time the page needed anyway, and a tap ends it.
 */
export const WELCOME_MS = 3000;

/**
 * The oldest web view the portal is built for (Chrome 111: the colours and
 * layout the styles use). An app running on an older one is shown, in plain
 * script that any web view runs, how to update Android System WebView.
 */
const OLD_WEBVIEW = 111;

/**
 * Runs as the HTML is parsed, once the stylesheets are in (a script waits for
 * the styles before it), long before the page's own JavaScript.
 *
 * It plays the opening once per visit (INTRO_SEEN), and not on the first page
 * after signing in, which has the welcome instead (the welcome cookie is
 * still there: welcome-transition.tsx clears it). In a browser it starts at
 * once; in the app it waits for the phone's own splash — the shut book on the
 * night, the opening's first frame — so Capacitor's bridge, which is on the
 * page before any of the page's scripts, is asked to take the splash away and
 * the book opens the moment it has. What happened is left on window for the
 * app's diagnostics.
 */
export const INTRO_SCRIPT = `(function(){
var ua=navigator.userAgent,cap=window.Capacitor,app=ua.indexOf('MTMU7App')>=0;
var el=document.getElementById('intro');
if(el){var seen=false,done=false;
try{seen=sessionStorage.getItem('INTRO_SEEN')==='1';sessionStorage.setItem('INTRO_SEEN','1');}catch(e){}
if(document.cookie.indexOf('WELCOME_COOKIE=1')>=0)seen=true;
try{var now=Date.now(),last=+localStorage.getItem('INTRO_SEEN')||0;if(!seen&&now-last<INTRO_GAP_MS)seen=true;if(!seen)localStorage.setItem('INTRO_SEEN',String(now));}catch(e){}
if(seen)el.setAttribute('data-skip','');
var play=function(how){if(done)return;done=true;el.setAttribute('data-play','');window.__appLaunch={at:Math.round(performance.now()),splash:how,skipped:seen};};
try{if(app&&cap&&typeof cap.nativePromise==='function'){cap.nativePromise('SplashScreen','hide',{fadeOutDuration:seen?120:0}).then(function(){play('hidden')},function(){play('refused')});setTimeout(function(){play('timeout')},700);}
else{play(app?(cap?'no-promise':'no-bridge'):'browser');}}catch(e){play('error');}}
if(!app)return;
try{var v=/Chrome\\/(\\d+)/.exec(ua);if(v&&+v[1]<OLD_WEBVIEW){
var lang=(document.documentElement.lang||'tg').slice(0,2);
var say={tg:['Барои кори дурусти барнома «Android System WebView»-ро дар Play Маркет навсозӣ кунед.','Навсозӣ'],ru:['Для правильной работы приложения обновите «Android System WebView» в Play Маркете.','Обновить'],en:['For the app to work properly, update “Android System WebView” in the Play Store.','Update']}[lang]||null;
if(say){var b=document.createElement('div');b.setAttribute('role','alert');
b.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 16px);z-index:200;background:#fff;color:#111;border-radius:16px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.4 sans-serif;display:flex;gap:10px;align-items:center';
var p=document.createElement('span');p.style.flex='1';p.textContent=say[0];var a=document.createElement('a');a.href='market://details?id=com.google.android.webview';a.textContent=say[1];
a.style.cssText='background:#c4861c;color:#fff;border-radius:999px;padding:6px 12px;font-weight:600;text-decoration:none;white-space:nowrap';
b.appendChild(p);b.appendChild(a);document.body.appendChild(b);}}}catch(e){}
})();`
  .replace("OLD_WEBVIEW", String(OLD_WEBVIEW))
  .replace("WELCOME_COOKIE", WELCOME_COOKIE)
  .replace("INTRO_GAP_MS", String(INTRO_GAP_MS))
  .replaceAll("INTRO_SEEN", INTRO_SEEN);

/**
 * Inline, right after the welcome (welcome-transition.tsx): a copy of the
 * first page after signing in that the device kept and opens again later no
 * longer has the welcome cookie, so its welcome is hidden before it is drawn.
 */
export const WELCOME_SCRIPT = `(function(){var s=document.currentScript,el=s&&s.previousElementSibling;
if(el&&document.cookie.indexOf('WELCOME_COOKIE=1')<0)el.setAttribute('data-skip','');})();`.replace("WELCOME_COOKIE", WELCOME_COOKIE);

/** Link previews, search engines and page-speed robots get the page itself, not a greeting. */
export function isRobot(userAgent: string | null): boolean {
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|vkshare|lighthouse|pagespeed/i.test(userAgent ?? "");
}
