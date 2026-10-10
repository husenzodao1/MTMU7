# The phone app (Android and iPhone)

`mobile/` is a [Capacitor](https://capacitorjs.com) app. It opens the portal
itself — `https://mtmuraqami7.vercel.app/dashboard` — in the phone's web view,
so every page, every theme and every change to the site is in the app the
moment it is deployed. Nothing is copied and nothing has to be kept in step.

What the app adds to the site:

| | Browser | App |
|---|---|---|
| Notifications with the portal closed | Web Push (VAPID) | Firebase Cloud Messaging |
| Photo in a chat | file picker | camera or gallery, asked by the phone |
| "Send location" | browser prompt | the phone's own location prompt |
| Sign in with Google | same tab | the phone's browser, then back into the app (`tj.mtmu7.app://`) |
| No connection | browser error | `mobile/www/offline.html`, which retries by itself |

The site knows it is inside the app by `MTMU7App` in the User-Agent
(`src/lib/native/app.ts`). Only two things change there: Google sign-in returns
through `/auth/app-return`, and notifications are registered with Firebase
(`src/features/native/bridge.ts`) instead of Web Push.

## Downloads

The strip at the top of every page carries a small **App** button (not shown
inside the apps themselves) with the three downloads, and `/app` explains each:

| | Link on the site | Where the file is |
|---|---|---|
| Android | `/download/android` | `MTMU7-android.apk` on the `app-latest` release |
| Windows | `/download/windows` | `MTMU7-windows-setup.exe` on the `app-latest` release |
| iPhone | `/download/ios` | the App Store when `IOS_APP_URL` is set; until then `/app#ios` (Add to Home Screen) |

The workflows replace the release files on every build of the production
branch, so the links never change. `ANDROID_APP_URL`, `WINDOWS_APP_URL` and
`IOS_APP_URL` (Vercel environment) point a button somewhere else — a Play
Store listing, say — with no code change.

The Windows app is `desktop/` (Electron): the portal in its own window, with
the same launch animation, offline page and Google sign-in hand-back as the
phones. Built by `.github/workflows/desktop-windows.yml`. It is not
code-signed, so SmartScreen asks once; an EV/OV code-signing certificate
(given to electron-builder as `CSC_LINK`/`CSC_KEY_PASSWORD`) removes that.

Until a release keystore is given (below), the Android APK is signed with a
debug key kept in the workflow's cache, so a phone can take the next build as
an update. Give the keystore before handing the APK out widely.

## Identity

- App id / bundle id: `tj.mtmu7.app` (cannot change once published)
- Name on the home screen: `МТМУ №7`
- Icon: `public/brand/app-icon.svg` — the sun rising behind an open book,
  with seven rays for the school's number, on indigo turning to teal.
  `mobile/scripts/make-assets.mjs` renders every size from it for Android,
  iPhone, Windows and the web (`npm run assets` in `mobile/`).
- Opening: the phone's splash is the mark standing still; the moment it goes,
  the site's opening plays (`src/features/intro/`, about 4.5 s, a tap ends it):
  a book flies in, its pages turn, it rushes into a flash of light and
  "Ассалому алайкум — Хуш омадед" writes itself by hand. Once per start of the
  app; the site shows it once per visit. After signing in the same book ends
  with "Хуш омадед" and the person's name.

## Building

Every push that touches `mobile/` builds the app on GitHub Actions:

- **Android** (`.github/workflows/mobile-android.yml`): a debug APK, always —
  download it from the run's *Artifacts* and install it on any phone. With the
  signing secrets, also a signed APK and the `.aab` Google Play takes.
- **iPhone** (`.github/workflows/mobile-ios.yml`): a simulator build, always.
  With the App Store Connect secrets, a signed build uploaded to TestFlight.

Locally: `cd mobile && npm ci && npx cap sync`, then `npx cap open android`
(Android Studio) or `npx cap open ios` (Xcode, on a Mac).

## Notifications: Firebase, once

On Windows, steps 2 and 5 are one command in PowerShell. It waits for the two
files in Downloads, checks they belong to `tj.mtmu7.app` and to one project,
sets the GitHub secret through the GitHub CLI (installing it if needed), puts
the service account on the clipboard with the Vercel page open, removes the
key file, and starts an Android build:

```powershell
irm https://raw.githubusercontent.com/husenzodao1/MTMU7/main/scripts/setup/firebase.ps1 | iex
```

By hand:

1. <https://console.firebase.google.com> → *Add project*.
2. *Add app* → Android, package `tj.mtmu7.app` → download
   `google-services.json` → repository secret `GOOGLE_SERVICES_JSON`.
3. *Add app* → iOS, bundle `tj.mtmu7.app` → download
   `GoogleService-Info.plist` → repository secret `GOOGLE_SERVICE_INFO_PLIST`.
4. iPhone only: Apple Developer → *Keys* → a key with *Apple Push
   Notifications service* → upload it in Firebase → *Project settings* → *Cloud
   Messaging* → *Apple app configuration*.
5. Firebase → *Project settings* → *Service accounts* → *Generate new private
   key* → the whole JSON as the Vercel environment variable
   `FIREBASE_SERVICE_ACCOUNT` (Production), then redeploy.

The database side is migration `00069_device_tokens.sql`: phones are kept in
`device_tokens`, and `claim_message_push` hands them out with the browsers.

## Google sign-in inside the app

Google refuses to sign anybody in inside an app's web view, and sending them
out to Chrome and back loses them on the way. In the app the Google button
first asks Android itself: `GoogleAccountPlugin` shows the phone's own account
sheet (Credential Manager) and hands back a Google ID token, which the portal
turns into a session at `/auth/google/native` — the same checks as the
browser's way (`finishGoogleSignIn`). There is no browser fallback inside the
app: Google's page would open in Chrome, and nobody ever came back from there
signed in. If the build has no Google client, or Supabase does not accept its
tokens yet, the button stops and says so, with the reason's code in brackets
(`not_configured`, `not_accepted`, `no_account`, …).

It needs three settings, which `scripts/setup/android.ps1` walks through on
Windows (it also makes the release key, below):

1. Firebase → Authentication → Sign-in method → **Google** enabled. This
   creates the web client whose id the app's token is issued for.
2. Firebase → Project settings → the Android app → **SHA-1** of the key that
   signs the published APK (printed on every Android build's summary page),
   then a fresh `google-services.json` in `GOOGLE_SERVICES_JSON`.
3. Supabase → Authentication → Providers → Google → **Client IDs**: the web
   client id from that file added after the existing one, comma-separated.

Every plugin reaches the page through `plugin()` in
`src/features/native/bridge.ts`, which wraps it so it has no `then`. A
Capacitor plugin answers every property with a native method, so an `await`
that hands one over calls `plugin.then()` and the phone answers "not
implemented": until this was found, no plugin ever reached the page — the
Google button spun for good, the page never hid the splash, and no phone was
registered for notifications.

The Google button is a plain link, never `next/link`: a client-side
navigation that ends on another site leaves Next's router waiting for a page
that never comes, and inside the app, where that page opens in Chrome
instead, it froze every form after it.

## When the app misbehaves

The app's pages note a few plain facts in `app_diagnostics` (migration
00075, `src/features/native/diagnostics.ts`): whether Capacitor's bridge
arrived and which plugins it brought, how long the page took to wake, how the
opening animation started, what the Google sheet answered, sign-ins still
waiting after ten seconds, and uncaught errors. Never a password, an address
or a message; the path is kept without its query, under a random id per
installation, for fourteen days. Only the service role reads it:

```sql
select created_at, device, event, path, detail
from public.app_diagnostics
where created_at > now() - interval '1 day'
order by created_at desc;
```

The keyboard is the phone's own: `android.captureInput` stays `false`. With
it on, Capacitor swaps the web view's input connection for a bare one that
holds a word back until the keyboard commits it — the send button then
appeared seconds after typing, and a login typed on Gboard could arrive after
the form had gone.

## Stores

**The release key.** On Windows, `scripts/setup/android.ps1` makes it (PKCS#12,
RSA 2048, thirty years), stores it in GitHub and keeps the only copy in
Documents\MTMU7 Android key:

```powershell
irm https://raw.githubusercontent.com/husenzodao1/MTMU7/main/scripts/setup/android.ps1 | iex
```

From then on the downloadable APK is a release build — not debuggable, one
signature for good — which is what Play Protect judges an unknown app by.
Outside Google Play it may still ask to scan the app once; only a store
listing removes that question entirely.

**Google Play** (one-time $25): make an upload keystore once and keep it safe —
losing it means a new app listing.

```bash
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.jks   # → ANDROID_KEYSTORE_BASE64
```

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`. Upload the `.aab` from
the workflow's artifacts in the Play Console.

**App Store** ($99 a year): create the app in App Store Connect with bundle id
`tj.mtmu7.app`, then an API key (*Users and Access → Integrations*, role *App
Manager*). Secrets: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`,
`ASC_KEY_P8_BASE64` (`base64 -i AuthKey_XXXX.p8`). Each build then appears in
TestFlight by itself.

Apple reviews apps that only show a website strictly (guideline 4.2). The
review notes should mention what is native here: push notifications, the
camera and photo library for chat, location sharing, and sign-in that returns
into the app — and give the reviewer a test login.
