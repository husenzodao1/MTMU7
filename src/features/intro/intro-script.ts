/**
 * The inline half of the opening (intro.tsx). Kept out of that client module
 * so the root layout, a server component, can write it into the HTML as a
 * plain string.
 */

/**
 * Set once the opening has played in a browser: a session cookie, so the site
 * greets a visitor once per visit rather than on every page. The app plays it
 * on every start instead (see below).
 */
export const INTRO_COOKIE = "mtmu7-intro";

/** When the greeting has been written and the page is uncovered, from the moment the opening starts. */
export const INTRO_MS = 4550;
/** The same with reduced motion: no book, the greeting already written, a short look and gone. */
export const INTRO_QUICK_MS = 1400;

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
 * In a browser it starts the opening at once and leaves the cookie that says
 * it has been seen. In the app it plays on each start of the app and not on a
 * reload within one (sessionStorage lives exactly as long as the app's web
 * view), and it waits for the phone's own splash: Capacitor's bridge is on the
 * page before any of the page's scripts, so the splash is asked to go and the
 * book starts moving the moment it has. What happened is left on window for
 * the app's diagnostics.
 */
export const INTRO_SCRIPT = `(function(){
var ua=navigator.userAgent,cap=window.Capacitor,app=ua.indexOf('MTMU7App')>=0;
var el=document.getElementById('intro');
if(el){var seen=false,done=false;
if(app){try{seen=sessionStorage.getItem('INTRO_COOKIE')==='1';sessionStorage.setItem('INTRO_COOKIE','1');}catch(e){}}
else{document.cookie='INTRO_COOKIE=1; path=/; SameSite=Lax';}
if(seen)el.setAttribute('data-skip','');
var play=function(how){if(done)return;done=true;el.setAttribute('data-play','');window.__appLaunch={at:Math.round(performance.now()),splash:how,skipped:seen};};
try{if(app&&cap&&typeof cap.nativePromise==='function'){cap.nativePromise('SplashScreen','hide',{fadeOutDuration:seen?120:220}).then(function(){play('hidden')},function(){play('refused')});setTimeout(function(){play('timeout')},700);}
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
  .replaceAll("INTRO_COOKIE", INTRO_COOKIE);

/** Link previews, search engines and page-speed robots get the page itself, not a greeting. */
export function isRobot(userAgent: string | null): boolean {
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|vkshare|lighthouse|pagespeed/i.test(userAgent ?? "");
}
