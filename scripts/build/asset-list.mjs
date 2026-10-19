/**
 * After `next build`: the list of every file this version of the site ships
 * under /_next/static — scripts, styles, fonts, pictures — written next to
 * them (.next/static/app-assets.json), so it is served with them.
 *
 * The service worker (public/sw.js) keeps every script, style and font on
 * the list on the device as soon as it meets a new version, so the app opens
 * and every page and dialog works with no line at all — including the parts
 * loaded only when needed (an emoji picker, the photo editor), which no page
 * names in its HTML. It also lets go of the files of versions two back.
 */
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = join(process.cwd(), ".next", "static");
const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else found.push(path);
  }
  return found;
}

const files = (await walk(root))
  .map((path) => `/_next/static/${relative(root, path).split(sep).join("/")}`)
  .filter((path) => path !== "/_next/static/app-assets.json")
  .sort();
await writeFile(join(root, "app-assets.json"), JSON.stringify({ build, files }));
console.log(`app-assets.json: ${files.length} files of ${build}`);
