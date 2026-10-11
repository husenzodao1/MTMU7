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
  and the greeting. Both carry every Tajik letter (ғ ҷ қ ӣ ӯ ҳ). Unbounded is
  used only for the "МТМУ №7" mark. Great Vibes and Bad Script are used only
  for the handwritten opening.
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

The **opening** (`src/features/intro/`) lasts about 1.8 s:

1. The "МТМУ №7" mark settles in.
2. "Ассалому алайкум" is written in brass: a pen traces each letter's real
   outline, then the ink fills it.
3. A hairline draws under it and the page is uncovered.

After a sign-in, "Хуш омадед" is written the same way and the person's name
follows (2.1 s). While the password is being checked, the veil shows the mark
and a thin brass progress line. A tap ends any of these at once.

## Removed as noise

- **Opening:** the book. The flying, page-turning, light-flash sequence (4.5 s)
  is gone.
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
   - **What ships instead:** the school's own photograph
     (`public/images/school-bg.webp`), graded down to the night canvas.
     There is no CSS-faked motion.
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
- **Not changed yet:** the native splash screens of the Android, iOS and
  Windows apps.
  - They are still the old blue `#17306d`. This colour is baked into the
    splash images, which are set in `mobile/capacitor.config.json` and
    `desktop/main.js`.
  - Change both to `#0a0e17` and regenerate the splash images with the next
    app build.
