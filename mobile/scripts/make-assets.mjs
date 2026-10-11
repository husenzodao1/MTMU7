/**
 * The app's icon and splash, drawn from the portal's own mark
 * (public/brand/*.svg): a white dot over an open book, on the school's flat
 * orange.
 *
 *   node scripts/make-assets.mjs     → resources/*.png, and the web's icons
 *   npx capacitor-assets generate    → every size both stores ask for
 *
 * Run by `npm run assets`, which does both.
 */
import { mkdirSync, writeFileSync } from "node:fs";
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

const render = (svg, size) =>
  sharp(svg, { density: Math.ceil((size / 512) * 72 * 1.5) })
    .resize(size, size)
    .ensureAlpha()
    .png();

/** The mark at `scale` of the square, centred on a transparent or given background. */
async function markOn(size, scale, base) {
  const inner = Math.round(size * scale);
  const drawn = await render(mark, inner).toBuffer();
  const canvas = base
    ? render(base, size)
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
  return sharp(await canvas.toBuffer()).composite([{ input: drawn, gravity: "center" }]).png();
}

/** The icon with its corners rounded, for where nothing rounds them: a tab, a window, a desktop. */
async function rounded(size) {
  const radius = Math.round(size * 0.225);
  const corners = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}"/></svg>`,
  );
  return sharp(await render(icon, size).toBuffer())
    .composite([{ input: corners, blend: "dest-in" }])
    .png();
}

/** A .ico of PNG images, which every browser and Windows read. */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

// Capacitor's sources.
await render(icon, 1024).toFile(join(out, "icon-only.png"));
// Android's adaptive icon crops the foreground to a circle or a squircle: the
// mark keeps well inside the circle every launcher leaves whole.
await (await markOn(1024, 0.9)).toFile(join(out, "icon-foreground.png"));
await render(background, 1024).toFile(join(out, "icon-background.png"));
const splash = await markOn(2732, 0.26, background);
await splash.clone().toFile(join(out, "splash.png"));
await splash.clone().toFile(join(out, "splash-dark.png"));

// The web: the installable app on a home screen, the tab, Apple's touch icon.
await (await rounded(192)).toFile(join(root, "public", "icons", "icon-192.png"));
await (await rounded(512)).toFile(join(root, "public", "icons", "icon-512.png"));
await (await markOn(512, 0.9, background)).toFile(join(root, "public", "icons", "icon-maskable-512.png"));
await (await rounded(512)).toFile(join(root, "src", "app", "icon.png"));
await render(icon, 180).toFile(join(root, "src", "app", "apple-icon.png"));
const tabs = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await (await rounded(size)).toBuffer() })));
writeFileSync(join(root, "src", "app", "favicon.ico"), ico(tabs));

// The Windows app's installer and window icon (electron-builder makes the .ico).
mkdirSync(join(root, "desktop", "build"), { recursive: true });
await (await rounded(1024)).toFile(join(root, "desktop", "build", "icon.png"));

console.log("resources/, public/icons/, src/app/icon.png, apple-icon.png, favicon.ico, desktop/build/icon.png");
