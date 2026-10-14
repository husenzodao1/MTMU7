/**
 * Opens the pages anyone can reach, at a phone's, a tablet's and a computer's
 * width, against a running build (BASE_URL, default http://127.0.0.1:3000),
 * and fails if any of them:
 *   - answers with an error, or throws in the browser;
 *   - is wider than the screen (the page slid sideways, or a phone would
 *     zoom it out — the "empty strip on the right" of October 2026);
 *   - is zoomed on arrival, or lacks the viewport's minimum-scale of 1;
 *   - has lost its footer, or shows "Sign in" in the footer of a sign-in page.
 * Pages behind a sign-in must send the visitor to /login, not fail.
 *
 *   npm run build && npm start &   then   npm run test:smoke
 */
import { chromium, type Page } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

const PUBLIC = ["/", "/schools", "/app", "/login", "/terms", "/support", "/reset-password"];
const SIGN_IN_PAGES = new Set(["/login", "/terms", "/support", "/reset-password"]);
const PROTECTED = ["/dashboard", "/grades", "/schedule", "/updates", "/admin", "/admin/academic-years", "/admin/accounts"];
const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 740, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1280, height: 800, mobile: false },
];

const failures: string[] = [];
const fail = (where: string, what: string) => failures.push(`${where}: ${what}`);

async function check(page: Page, path: string, where: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(400);
  if (!response || response.status() >= 400) fail(where, `HTTP ${response?.status() ?? "no response"}`);

  if (PROTECTED.includes(path)) {
    if (!new URL(page.url()).pathname.startsWith("/login")) fail(where, `not sent to /login (ended at ${page.url()})`);
    return;
  }

  const state = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    scale: window.visualViewport?.scale ?? 1,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
    footer: Boolean(document.querySelector("footer.site-footer")),
    footerSignIn: Boolean(document.querySelector('footer.site-footer a[href="/login"]')),
  }));
  if (state.overflow > 0) fail(where, `${state.overflow}px wider than the screen`);
  if (state.scale !== 1) fail(where, `opened zoomed (scale ${state.scale})`);
  if (!/minimum-scale=1/.test(state.viewport)) fail(where, "viewport without minimum-scale=1");
  if (!state.footer) fail(where, "no footer");
  if (SIGN_IN_PAGES.has(path) && state.footerSignIn) fail(where, "sign-in link in the footer of a sign-in page");
  for (const message of errors) fail(where, `browser error: ${message.slice(0, 160)}`);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
    });
    // The opening animation is the first visit's; the pages are what is checked here.
    await context.addCookies([{ name: "mtmu7-intro", value: "1", url: BASE }]);
    // All of a width's pages at once: a build pointed at a placeholder
    // database spends most of each request waiting for it, and those waits overlap.
    await Promise.all(
      [...PUBLIC, ...PROTECTED].map(async (path) => {
        const page = await context.newPage();
        try {
          await check(page, path, `${viewport.name} ${path}`);
        } catch (error) {
          fail(`${viewport.name} ${path}`, (error as Error).message.slice(0, 200));
        } finally {
          await page.close();
        }
      })
    );
    await context.close();
  }
} finally {
  await browser.close();
}

const total = VIEWPORTS.length * (PUBLIC.length + PROTECTED.length);
if (failures.length > 0) {
  console.error(`Smoke check failed (${failures.length} of ${total} page views):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`Smoke check passed: ${total} page views at ${VIEWPORTS.length} widths.`);
