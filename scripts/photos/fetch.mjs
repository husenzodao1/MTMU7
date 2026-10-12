/**
 * Temporary: run by .github/workflows/weather-photos.yml, where the internet
 * is open. Without chosen.json it downloads every candidate and draws one
 * contact sheet per weather for choosing; with it, it downloads the chosen
 * ones and writes them as the greeting card's photos (2560 px wide, WebP).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const here = new URL(".", import.meta.url);
const candidates = JSON.parse(readFileSync(new URL("candidates.json", here), "utf8"));
const chosenFile = new URL("chosen.json", here);
const ua = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

async function download(slug) {
  const response = await fetch(`https://unsplash.com/photos/${slug}/download?force=true`, { headers: ua, redirect: "follow" });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) throw new Error(`${response.status} ${type} ${response.url}`);
  return Buffer.from(await response.arrayBuffer());
}

if (existsSync(chosenFile)) {
  const chosen = JSON.parse(readFileSync(chosenFile, "utf8"));
  const out = new URL("../../public/weather/", here);
  mkdirSync(out, { recursive: true });
  for (const [name, slug] of Object.entries(chosen)) {
    const original = await download(slug);
    const meta = await sharp(original).metadata();
    await sharp(original).rotate().resize({ width: 2560, withoutEnlargement: true }).webp({ quality: 74, effort: 6 }).toFile(new URL(`${name}.webp`, out).pathname);
    console.log(name, slug, `${meta.width}x${meta.height}`);
  }
} else {
  const out = new URL("sheets/", here);
  mkdirSync(out, { recursive: true });
  const report = {};
  for (const [kind, slugs] of Object.entries(candidates)) {
    const tiles = [];
    for (const [index, slug] of slugs.entries()) {
      try {
        const original = await download(slug);
        const meta = await sharp(original).metadata();
        report[slug] = `${meta.width}x${meta.height} ${Math.round(original.length / 1024)}KB`;
        const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect x="0" y="0" width="64" height="40" fill="#000" opacity="0.7"/><text x="14" y="30" font-size="28" font-family="sans-serif" fill="#fff">${index + 1}</text></svg>`);
        tiles.push(await sharp(original).rotate().resize(480, 300, { fit: "cover" }).composite([{ input: label }]).jpeg({ quality: 78 }).toBuffer());
      } catch (error) {
        report[slug] = `FAILED ${error.message}`;
        tiles.push(await sharp({ create: { width: 480, height: 300, channels: 3, background: "#400" } }).jpeg().toBuffer());
      }
    }
    const columns = 2;
    const rows = Math.ceil(tiles.length / columns);
    await sharp({ create: { width: columns * 488, height: rows * 308, channels: 3, background: "#111" } })
      .composite(tiles.map((input, i) => ({ input, left: (i % columns) * 488, top: Math.floor(i / columns) * 308 })))
      .jpeg({ quality: 80 })
      .toFile(new URL(`${kind}.jpg`, out).pathname);
    console.log(kind, "done");
  }
  writeFileSync(new URL("report.json", out), JSON.stringify(report, null, 2));
}
