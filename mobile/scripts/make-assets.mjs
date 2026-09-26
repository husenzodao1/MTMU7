/**
 * The app's icon and splash, drawn from the school's own photograph: the crest
 * the portal shows after sign-in — the photo in a thick ring of the school's
 * gold — on the night blue the app opens on.
 *
 *   node scripts/make-assets.mjs     → resources/*.png
 *   npx capacitor-assets generate    → every size both stores ask for
 *
 * Run by `npm run assets`, which does both.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "resources");
const photo = join(here, "..", "..", "public", "images", "school-photo.png");
const NIGHT = "#0b141a";
const GOLD = "#e3a130";
const GOLD_LIGHT = "#f4cc7a";

mkdirSync(out, { recursive: true });

/** The crest at a given diameter, on a transparent square of `canvas` pixels. */
async function crest(canvas, diameter) {
  const ring = Math.round(diameter * 0.07);
  const inner = diameter - ring * 2;
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${GOLD_LIGHT}"/>
          <stop offset="0.55" stop-color="${GOLD}"/>
          <stop offset="1" stop-color="#b87a17"/>
        </linearGradient>
      </defs>
      <circle cx="${canvas / 2}" cy="${canvas / 2}" r="${diameter / 2 - ring / 2}" fill="none" stroke="url(#g)" stroke-width="${ring}"/>
    </svg>`);
  // The source is already round, on a transparent square: trim that margin
  // so the photograph meets the ring.
  const picture = await sharp(photo).trim().resize(inner, inner, { fit: "cover" }).png().toBuffer();
  // Clip to a circle even if the source ever stops being one.
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}"/></svg>`);
  const round = await sharp(picture).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const offset = Math.round((canvas - inner) / 2);
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: round, left: offset, top: offset },
      { input: svg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function onNight(size, crestBuffer) {
  return sharp({ create: { width: size, height: size, channels: 4, background: NIGHT } })
    .composite([{ input: crestBuffer, gravity: "center" }])
    .png()
    .toBuffer();
}

// The plain icon (iOS, older Android): the crest filling most of the square.
await sharp(await onNight(1024, await crest(1024, 860))).toFile(join(out, "icon-only.png"));
// Android's adaptive icon: the launcher crops to a circle, squircle or
// teardrop, so the crest stays inside the middle two-thirds.
await sharp(await crest(1024, 620)).toFile(join(out, "icon-foreground.png"));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: NIGHT } }).png().toFile(join(out, "icon-background.png"));
// The splash: a smaller crest in the middle of the night.
const splash = await onNight(2732, await crest(2732, 720));
await sharp(splash).toFile(join(out, "splash.png"));
await sharp(splash).toFile(join(out, "splash-dark.png"));

console.log("resources/: icon-only, icon-foreground, icon-background, splash, splash-dark");
