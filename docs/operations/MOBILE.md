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
- Icon: `public/brand/app-icon.svg` — two strokes of an open book and a warm
  dot above it (a head over the page, the sun over the school) on indigo
  turning to teal. `mobile/scripts/make-assets.mjs` renders every size from it
  for Android, iPhone, Windows and the web (`npm run assets` in `mobile/`).
- Opening: the phone's splash is the mark standing still; the site then shows
  the same mark animating (`src/features/native/app-launch.tsx`) until the page
  is ready, so native and web hand over without a flash.

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

## Stores

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
