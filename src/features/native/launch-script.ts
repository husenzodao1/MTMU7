/**
 * The inline half of the app's opening animation (app-launch.tsx). Kept out of
 * that client module so the root layout, a server component, can write it into
 * the HTML as a plain string.
 */

/**
 * The oldest web view the portal is built for (Chrome 111: the colours and
 * layout the styles use). An app running on an older one is shown, in plain
 * script that any web view runs, how to update Android System WebView.
 */
const OLD_WEBVIEW = 111;

/** How long the mark takes to draw itself, from the moment it starts. */
export const INTRO_MS = 900;

/**
 * Runs as the HTML is parsed, once the stylesheets are in (a script waits for
 * the styles before it), which inside the app is long before the page's own
 * JavaScript. Capacitor's bridge is already on the page by then (the app adds
 * it before any of the page's scripts), so it can ask the phone's splash to go
 * and start the animation the moment the splash is gone — or at once when
 * there is no splash to wait for. What happened is left on window for the
 * app's diagnostics.
 */
export const LAUNCH_SCRIPT = `(function(){
var el=document.querySelector('.app-launch');if(!el)return;var done=false;
function play(how){if(done)return;done=true;el.setAttribute('data-play','');window.__appLaunch={at:Math.round(performance.now()),splash:how};}
try{var cap=window.Capacitor;
if(cap&&typeof cap.nativePromise==='function'){cap.nativePromise('SplashScreen','hide',{fadeOutDuration:180}).then(function(){play('hidden')},function(){play('refused')});setTimeout(function(){play('timeout')},700);}
else{play(cap?'no-promise':'no-bridge');}}catch(e){play('error');}
try{var v=/Chrome\\/(\\d+)/.exec(navigator.userAgent);if(v&&+v[1]<OLD_WEBVIEW){
var lang=(document.documentElement.lang||'tg').slice(0,2);
var say={tg:['Барои кори дурусти барнома «Android System WebView»-ро дар Play Маркет навсозӣ кунед.','Навсозӣ'],ru:['Для правильной работы приложения обновите «Android System WebView» в Play Маркете.','Обновить'],en:['For the app to work properly, update “Android System WebView” in the Play Store.','Update']}[lang]||null;
if(say){var b=document.createElement('div');b.setAttribute('role','alert');
b.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 16px);z-index:200;background:#fff;color:#111;border-radius:16px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.4 sans-serif;display:flex;gap:10px;align-items:center';
var p=document.createElement('span');p.style.flex='1';p.textContent=say[0];var a=document.createElement('a');a.href='market://details?id=com.google.android.webview';a.textContent=say[1];
a.style.cssText='background:#c4861c;color:#fff;border-radius:999px;padding:6px 12px;font-weight:600;text-decoration:none;white-space:nowrap';
b.appendChild(p);b.appendChild(a);document.body.appendChild(b);}}}catch(e){}
})();`.replace("OLD_WEBVIEW", String(OLD_WEBVIEW));
