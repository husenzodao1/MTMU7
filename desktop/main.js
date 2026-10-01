/*
 * МТМУ №7 for Windows: the portal in its own window.
 *
 * The window opens the portal itself, so the app is the site and every change
 * to the site is in the app. What the window adds:
 *
 *   - its own icon in the taskbar and the Start menu, one window only (a second
 *     launch brings the first to the front);
 *   - the night-blue launch colour instead of a white flash, and the portal's
 *     own opening animation, which the site shows to the app (MTMU7App in the
 *     User-Agent);
 *   - an offline page that returns by itself when the connection does;
 *   - links to anywhere else open in the normal browser, and Google sign-in —
 *     which Google refuses inside an embedded window — is finished in the
 *     browser and handed back through tj.mtmu7.app://, exactly as on phones;
 *   - the window's size and place are remembered.
 *
 * Nothing on the page can reach Windows: no Node in the page, context
 * isolation and the sandbox on, permissions limited to notifications.
 */
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SITE = "https://mtmuraqami7.vercel.app";
const HOME = `${SITE}/dashboard`;
const SCHEME = "tj.mtmu7.app";
const BACKGROUND = "#17306d";

let win = null;

// ---------------------------------------------------------------- one window

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith(`${SCHEME}://`));
    if (link) openAppLink(link);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(SCHEME);
}

// ----------------------------------------------------------- remembered size

const stateFile = () => path.join(app.getPath("userData"), "window.json");

function readBounds() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) return saved;
  } catch {
    /* first start */
  }
  return { width: 1280, height: 820 };
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* not worth failing over */
  }
}

// ------------------------------------------------------------------- links

function isSite(url) {
  try {
    return new URL(url).origin === SITE;
  } catch {
    return false;
  }
}

/** tj.mtmu7.app://auth/callback?code=… → the same callback on the site. */
function openAppLink(link) {
  try {
    const url = new URL(link);
    if (`/${url.host}${url.pathname}`.replace(/\/+$/, "") !== "/auth/callback") return;
    const forward = new URLSearchParams();
    for (const key of ["code", "via", "next", "error", "error_code", "error_description"]) {
      const value = url.searchParams.get(key);
      if (value !== null) forward.set(key, value);
    }
    if (win) win.loadURL(`${SITE}/auth/callback?${forward.toString()}`);
  } catch {
    /* not one of ours */
  }
}

function openOutside(url) {
  if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
}

// ------------------------------------------------------------------ window

function createWindow() {
  const bounds = readBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: BACKGROUND,
    autoHideMenuBar: true,
    title: "МТМУ №7",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (bounds.maximized) win.maximize();

  const agent = `${win.webContents.getUserAgent()} MTMU7App MTMU7Desktop`;
  win.webContents.setUserAgent(agent);

  win.once("ready-to-show", () => win.show());
  win.on("close", saveBounds);

  // New windows and links to other sites: the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSite(url)) win.loadURL(url);
    else openOutside(url);
    return { action: "deny" };
  });
  const stayOnSite = (event, url) => {
    if (url.startsWith("file:") || isSite(url)) return;
    event.preventDefault();
    openOutside(url);
  };
  win.webContents.on("will-navigate", stayOnSite);
  // /auth/google answers with a redirect to Google's page: out to the browser.
  win.webContents.on("will-redirect", stayOnSite);

  // No connection: the offline page, which comes back on its own.
  win.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isSite(url)) return; // -3: navigation cancelled
    win.loadFile(path.join(__dirname, "offline.html"));
  });

  win.loadURL(HOME, { userAgent: agent });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "notifications" || permission === "clipboard-sanitized-write" || permission === "fullscreen");
  });
  createWindow();
  const link = process.argv.find((arg) => arg.startsWith(`${SCHEME}://`));
  if (link) openAppLink(link);
});

app.on("window-all-closed", () => app.quit());
