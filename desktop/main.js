// Logbook for Windows (and Mac/Linux): a window around the same Logbook
// that lives at https://kalebdida.github.io/logbook, so it's always the
// newest version and your data is the same as on your phone. The site's
// own offline copy (service worker) keeps it opening without internet.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const START = process.env.LOGBOOK_URL || "https://kalebdida.github.io/logbook/";
const HOME = new URL(START);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function create() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: "Logbook",
    backgroundColor: "#0a1430",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true }
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());

  // links to anywhere else (Telegram, BotFather, bible-api) open in the browser
  const outside = (url) => {
    try {
      const u = new URL(url);
      return u.origin !== HOME.origin || !u.pathname.startsWith(HOME.pathname);
    } catch (e) { return true; }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (outside(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (outside(url) && !url.startsWith("about:")) { e.preventDefault(); shell.openExternal(url); }
  });
  win.loadURL(START);
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.whenReady().then(create);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) create(); });
