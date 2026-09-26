/**
 * The app's icon and splash, drawn from the portal's own mark
 * (public/brand/*.svg): an open book in two strokes and a warm dot above it,
 * on indigo turning to teal.
 *
 *   node scripts/make-assets.mjs     → resources/*.png, and the web's icons
 *   npx capacitor-assets generate    → every size both stores ask for
 *
 * Run by `npm run assets`, which does both.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const brand = join(root, "public", "brand");
const out = join(here, "..", "resources");
mkdirSync(out, { recursive: true });

const icon = join(brand, "app-icon.svg");
const mark = join(brand, "mark.svg");
const background = join(brand, "app-background.svg");

const render = (svg, size) => sharp(svg, { density: Math.ceil((size / 512) * 72 * 1.5) }).resize(size, size).png();

/** The mark at `scale` of the square, centred on a transparent or given background. */
async function markOn(size, scale, base) {
  const inner = Math.round(size * scale);
  const drawn = await render(mark, inner).toBuffer();
  const canvas = base
    ? render(base, size)
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
  return sharp(await canvas.toBuffer()).composite([{ input: drawn, gravity: "center" }]).png();
}

// Capacitor's sources.
await render(icon, 1024).toFile(join(out, "icon-only.png"));
// Android's adaptive icon crops to a circle or squircle: the mark keeps to the
// middle two-thirds of the foreground layer.
await (await markOn(1024, 0.62)).toFile(join(out, "icon-foreground.png"));
await render(background, 1024).toFile(join(out, "icon-background.png"));
const splash = await markOn(2732, 0.22, background);
await splash.clone().toFile(join(out, "splash.png"));
await splash.clone().toFile(join(out, "splash-dark.png"));

// The web: the installable app on a home screen, the tab, Apple's touch icon.
await render(icon, 192).toFile(join(root, "public", "icons", "icon-192.png"));
await render(icon, 512).toFile(join(root, "public", "icons", "icon-512.png"));
await (await markOn(512, 0.62, background)).toFile(join(root, "public", "icons", "icon-maskable-512.png"));
await render(icon, 512).toFile(join(root, "src", "app", "icon.png"));
await render(icon, 180).toFile(join(root, "src", "app", "apple-icon.png"));

// The Windows app's installer and window icon (electron-builder makes the .ico).
mkdirSync(join(root, "desktop", "build"), { recursive: true });
await render(icon, 1024).toFile(join(root, "desktop", "build", "icon.png"));

console.log("resources/, public/icons/, src/app/icon.png, apple-icon.png, desktop/build/icon.png");
