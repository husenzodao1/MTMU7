# Art direction — "midnight and brass"

Date: 2026-10-11 · Branch: `claude/friendly-bell-smakfs`

The portal has one environment and one accent. Dark is the default: a deep
blue-black canvas, graphite surfaces, blue-grey hairlines and warm white text.
The only accent is a muted brass, kept for what is meant to be pressed or is
selected. Hierarchy comes from type, space and contrast, not from gradients or
glow. The light "day" theme uses the same roles on warm paper.

## Tokens

All tokens live in `src/styles/globals.css`. The `@theme` block holds the day
values; the night values are the `--dk-*` set. Nothing outside the tokens
picks a colour of its own, except the greeting card and the opening, which
are dark in every theme on purpose.

| Role | Night | Day |
|---|---|---|
| Canvas | `#0a0e17` | `#f4f2ec` |
| Surface / muted / sunken | `#111723` / `#161d2b` / `#0d121c` | `#ffffff` / `#f0ede6` / `#e8e4db` |
| Hairline / strong | `#222b3c` / `#313c52` | `#e1dcd1` / `#c9c2b4` |
| Ink / secondary / muted | `#eee9df` / `#babec9` / `#8a93a6` | `#141821` / `#434a57` / `#5d6472` |
| Brass (fill) | `#c8a46a`, text on it `#15110a` | same |
| Brass (text, focus) | `#d9be8c` | `#7a5e2e` |
| States | desaturated: success `#7dbb98`, warning `#d6a75e`, danger `#e08a7f`, info `#8faad0` | `#2f7a52`, `#8c6118`, `#b03a2e`, `#3b5b86` |

Every text token meets WCAG AA (4.5:1) on the surface in both themes.

- **Type:** Noto Sans for reading and Noto Serif (`font-display`) for titles
  and titles. Both carry every Tajik letter (ғ ҷ қ ӣ ӯ ҳ). Unbounded is
  used only for the "МТМУ №7" mark. The greetings — the dashboard's line, the
  welcome's "Салом" and the opening's "Хуш омадед" — are in Bad Script, a
  light slanted hand that also has every Tajik letter (`--font-greeting`).
- **Radii:** 6, 8, 10, 14, 18 and 22 px. Buttons and inputs use 8 px
  (`rounded-md`), cards 14–18 px. Pills are kept for badges, chips and
  counters only.
- **Shadows:** almost none. Surfaces are separated by hairlines, and only
  overlays (menus, dialogs) cast a shadow.

## Motion

There is one language (`--ease-*` and `--duration-*` tokens):

- **Durations:** fast 140 ms for colour and press, base 220 ms for things that
  appear, slow 360 ms only for page-level moments.
- **Easing:** things decelerate in and accelerate out. Nothing overshoots,
  bounces, pulses or loops for decoration.
- **`rise`:** an element arriving moves 6 px and fades in, nothing more.
- **Reduced motion:** `prefers-reduced-motion` turns movement off everywhere,
  through a global rule plus explicit overrides in the opening.

## Asked back by the school (12 October)

After the calm pass the school asked for these to return, and they are the
rule now where they differ from the lists below (`src/styles/motion.css`):

- **The opening and the welcome are a book** (`book-scene.tsx`, about 3 s):
  the school's orange book with its white mark rises, opens, three pages
  turn and a warm light comes out of it; "Хуш омадед", or "Салом, <name>!"
  after a sign-in, writes itself under it in the hand, and a thin ornament
  draws itself from both ends to a small diamond instead of a hairline.
  While a password is checked, the book floats shut.
- **The greeting card is a photograph of the sky** for the hour and the
  weather in Istaravshan (`weather-photo.tsx`, thirteen photographs from
  Pexels, free and uncredited), darkened behind the words and drifting very
  slowly closer; snow, fog and a storm's flashes move over theirs. The
  greeting line is in the hand, small and light.
- **The bottom bar** keeps its gliding, squashing light and each icon's own
  act (`bar-icons.tsx`).
- **The notice board drifts again**: announcements to the left, news to the
  right, events to the left, set half a card apart like courses of brick;
  urgent announcements lead their row. The faces stay a still rail at the foot.
- **The search glass** — two thin strokes gliding in half-circles — always
  makes its round of 1.6 s, however quick the answer.
- **A tap moves at once**: the next page's loading screen is drawn the moment
  a link is tapped (`instant-nav.ts`).
- **The offline cover** comes only for an outage that lasts (four seconds, or
  the phone saying it has no network); a slow page gets a small note instead.

## Removed as noise

- **Opening:** the book. The flying, page-turning, light-flash sequence (4.5 s)
  is gone, as is the later pupil mascot with the opening book (3 s).
- **Dashboard:** the drifting notice board and the drifting faces ribbons.
  - The notice board is now a still rail you scroll sideways, ordered urgent →
    announcements → events → news.
  - The faces moved to the foot of the page.
- **Greeting:** the saturated hour-of-day sky gradients, the drawn stars, the
  glow on the greeting text and the brush-script (Pacifico) face.
- **Support button:** the pulsing ripple.
- **Other gradients and blur:** the conic gradients on avatar rings, the
  crest and the member card; the glass blur on the footer; the moving washes
  on the front page; the coloured platform tints on the app page.
- **Work merged from a parallel session** (the same day):
  - The dashboard's living sky (hills, tulips, birds, twinkling and falling
    stars, weather effects) and the drifting "school wall" behind it are
    gone. The weather stays as one still line on the greeting: an icon, the
    temperature and the town.
  - The bottom bar's gliding, squashing light and the per-icon acts are gone.
    It keeps a plain pill that slides under the chosen icon.
  - Artificial delays are gone: the search's magnifying glass that stayed for
    at least 2.2 s, and the library book that riffled for 0.46 s before its
    page opened. A search now shows a thin line only while it is actually
    pending, and a book opens at once.
  - The amber, coral, plum and olive homework cards with wandering light and
    drifting drawings are now plain work cards.
  - The rows that rose in one after another, in lists and in the menu, are
    gone.
  - The offline cover, where a graduation cap fell on the Wi-Fi sign and broke
    it, is now a still sign with plain words, in the portal and in the app's
    own `offline.html`.
  - Kept as they were: the menu that follows the finger, the loading
    skeletons, the app-like tap behaviour, and the support entry in every
    menu.

## Dashboard order

1. Identity and navigation (the shell).
2. The greeting, with each person's one primary action:
   - teacher → today's lessons;
   - pupil → timetable;
   - parent → children;
   - office → control center (a quiet secondary for teachers who also run the
     office).
3. Notices: announcements first.
4. The person's own work: lessons, homework, grades, children, office summary.
5. Social: the faces of pupils and graduates.

## Missing assets

These are not shipped. Nothing stands in for them pretending to be them.

1. **Environmental footage for the greeting.** The brief asks for real,
   licensed footage. This build environment's network policy blocks the stock
   and Commons hosts it would come from: `commons.wikimedia.org`,
   `upload.wikimedia.org`, `pexels.com`, `pixabay.com`, `mixkit.co` and
   `coverr.co` all refuse the connection.
   - **What ships instead:** photographs of the sky for each hour and weather
     (`src/features/dashboard/weather-photos/`), fetched from Pexels by a
     one-off GitHub Actions run, since the build network cannot reach it.
   - **To add footage:**
     1. Record or license a short, quiet loop of the school (8–15 s, no
        people's faces, 1280 px wide, H.264/WebM, under 3 MB).
     2. Put it in `public/video/`.
     3. Render it in `greeting-card.tsx` as a muted, `playsInline`, `loop`
        `<video>` with the photograph as its poster, and without the video
        under `prefers-reduced-motion`.
2. **A 3D character or mascot.** Making a professional 3D character needs a
   modelling and rigging pipeline and licensed source assets, and neither is
   available here. No flat or pseudo-3D placeholder was made in its place.

## Verified, and not verified

- **Verified on a local production build** (Playwright, Chromium):
  - Pages: the front page, sign-in, the app page and a component preview of
    the dashboard.
  - Widths: 390, 820 and 1366 px, in night and day. No page is wider than the
    screen at any of these widths.
  - The opening, sampled frame by frame.
  - `npm run test:smoke`: 56 page views at 4 widths.
- **Not verified:**
  - The signed-in dashboard against real data. The local build has no
    database, so the dashboard was checked through a mock with the same
    components.
  - The welcome after a real sign-in.
  - The Android app's web view.
- **Takes effect with the next app build:** the background behind the page
  in the Android and iOS apps (`mobile/capacitor.config.json`) and the Windows
  window (`desktop/main.js`) are now the night canvas `#0a0e17`. The splash
  keeps the orange of the new app icon (`#ff5a1f`). Installed apps show the
  old blue until they are rebuilt.
