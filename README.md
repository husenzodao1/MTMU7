# Testru

Source for https://testru.vercel.app and its Android app.

- `web/index.html` — the site (single page; data in Supabase).
- `web/tests.html` — original question bank (imported into the database).
- `android/` — Android app (WebView with screenshot blocking and screen pinning).
- `.github/workflows/android.yml` — builds the APK and publishes it as the `testru-app` release.
