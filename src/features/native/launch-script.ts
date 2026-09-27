/**
 * The inline half of the app's opening animation (app-launch.tsx). Kept out of
 * that client module so the root layout, a server component, can write it into
 * the HTML as a plain string.
 */

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
})();`;
