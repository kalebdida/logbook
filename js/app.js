import { storageWorks } from './storage.js';
import { resolveConnection, isDevice, getConnection, isDemo } from './connection.js';
import { startDemo } from './demo.js';
import { initDeviceStore, deviceStorageIsPersistent } from './deviceStore.js';
import { apiAuthStatus, request, serverGet } from './api.js';
import { setCacheUser, cacheLoad, setCacheBoot, cacheRevalidate } from './cache.js';
import { showLock } from './lock.js';
import { getPrefs } from './prefs.js';
import { onChange } from './bus.js';
import { initNavigation, currentPage } from './navigation.js';
import { loadEntries, getEntries, renderJournal, wireJournal } from './journal.js';
import { renderWeekAgo } from './entries.js';
import { paintIcons } from './icons.js';
import { renderVerse, wireDailyLine } from './verse.js';
import { startBackground } from './background.js';
import { initThemes } from './themes.js';
import { startReminders } from './reminders.js';
import { startMusic } from './music.js';
import { renderHabits } from './habits.js';
import { startPWA } from './pwa.js';
import { showStorageWarning, startBoot, initSplash } from './ui.js';
import { startAlive } from './alive.js';
import { renderDeadlines } from './deadlines.js';
import { renderPrayers } from './prayers.js';
import { loadProfile } from './profile.js';
import { renderAgeClock } from './ageClock.js';
import { startWidget, updateWidget } from './widget.js';
import { renderTodayConsole, refreshReadout, tickNow } from './today.js';
import { renderDailyPage } from './dailyPage.js';
import { openDayViewer } from './dayViewer.js';
import { renderCalendar } from './calendar.js';
import { renderPomodoro } from './pomodoro.js';
import { renderGoals, invalidateGoals } from './goals.js';
import { renderDensityMap } from './densityMap.js';
import { renderAnalytics } from './analytics.js';
import { renderCompanion } from './companion.js';
import { renderSettings, refreshDbStatus, refreshServerCards, refreshGifts } from './settings.js';
import { initPalette } from './palette.js';
import { checkBackend, startStatusWatch, onStatus } from './status.js';

function applyLook() {
  var p = getPrefs();
  document.body.classList.toggle("no-scanlines", !p.scanlines);
  // Today page cards switched off in settings
  var dash = p.dash || {};
  document.body.dataset.hide = Object.keys(dash).filter(function (k) { return dash[k] === false; }).join(" ");
}

function renderEntryViews() {
  renderWeekAgo(getEntries(), openDayViewer);
}

/* Heavy views (they re-read everything from the backend) refresh at most
   once per burst of changes. */
var heavyTimer = null;
function refreshHeavy() {
  clearTimeout(heavyTimer);
  heavyTimer = setTimeout(function () {
    renderDensityMap().catch(warn);
    renderAnalytics().catch(warn);
    renderCalendar().catch(warn);
    if (currentPage() === "companion") renderCompanion(true).catch(warn);
  }, 400);
}

function warn(e) {
  console.warn("logbook:", e);
}

async function renderEverything() {
  safe("journal", renderJournal);
  safe("overview", renderEntryViews);
  safe("today console", renderTodayConsole);
  await Promise.all([
    renderDailyPage(),
    renderHabits(),
    renderDeadlines(),
    loadProfile().then(renderAgeClock),
    renderPrayers(),
    renderGoals(),
    renderCalendar()
  ].map(function (p) { return Promise.resolve(p).catch(warn); }));
  safe("today console", refreshReadout);
  await Promise.all([renderDensityMap(), renderAnalytics()].map(function (p) { return p.catch(warn); }));
  safe("today console", refreshReadout); // focus totals from the backend are known now
  safe("home screen widget", updateWidget);
}

/* One broken module should never stop the rest of the app from starting. */
function safe(label, fn) {
  try {
    return fn();
  } catch (e) {
    console.error("logbook: " + label + " failed to start", e);
  }
}

async function openFromCache() {
  var c = getConnection();
  if (c.mode !== "server" || !c.token || !c.username) return false;
  setCacheUser(c.username);
  if (!(await cacheLoad())) return false;
  document.body.dataset.mode = "server";
  setCacheBoot(true);
  try {
    await loadEntries();
    startBoot(getEntries().length);
    await renderEverything();
  } finally {
    setCacheBoot(false);
  }
  return true;
}

async function init() {
  safe("theme", initThemes);
  safe("icons", paintIcons);
  safe("loading screen", initSplash);
  safe("offline + install", startPWA);
  safe("look", applyLook);
  if (!storageWorks()) showStorageWarning();
  safe("navigation", initNavigation);
  safe("command palette", initPalette);
  safe("background", startBackground);
  safe("signs of life", startAlive);
  safe("daily line", wireDailyLine);
  safe("daily line", renderVerse);
  safe("focus timer", renderPomodoro);
  Promise.resolve(safe("music", startMusic)).catch(warn);
  safe("settings", renderSettings);
  safe("journal", wireJournal);

  // open at once from the last copy of this account's data, if there is one,
  // then check with the server in the background
  var fromCache = false;
  try { fromCache = await openFromCache(); } catch (e) { warn(e); setCacheBoot(false); }

  // where does the data live? (server, or this device)
  await resolveConnection();
  document.body.dataset.mode = isDevice() ? "device" : "server";
  if (isDevice()) {
    await initDeviceStore();
    if (isDemo()) await startDemo().catch(warn);
    // the Android app keeps its storage until the app is uninstalled; browsers may clear it
    if (!deviceStorageIsPersistent() && !window.Capacitor) showStorageWarning("device");
  } else {
    try {
      var auth = await apiAuthStatus();
      if (auth.required && !auth.authenticated) {
        await showLock();
        refreshServerCards();
      }
    } catch (e) {
      // server unreachable: checkBackend below shows the warning
    }
  }
  // handy for debugging in the browser console, and used by the tests
  window.__logbook = { request: request, mode: isDevice() ? "device" : "server" };

  // remember what the server says for next time (accounts only)
  if (!isDevice() && getConnection().token) setCacheUser(getConnection().username || "");
  var online = await checkBackend();
  if (fromCache) {
    // the server answered: draw again only if something changed meanwhile
    if (online) {
      var changed = await cacheRevalidate(serverGet).catch(function (e) { warn(e); return true; });
      if (changed) {
        await loadEntries().catch(warn);
        invalidateGoals();
        await renderEverything();
      }
    }
  } else {
    if (online) {
      try {
        await loadEntries();
      } catch (e) {
        warn(e);
      }
    }
    startBoot(getEntries().length);
    if (online) await renderEverything();
  }
  startStatusWatch();
  safe("reminders", startReminders);
  safe("home screen widget", startWidget);

  // when the backend comes back after being down, load everything fresh
  onStatus(async function (ok, wasOffline) {
    if (ok && wasOffline) {
      await loadEntries().catch(warn);
      invalidateGoals();
      await renderEverything();
    }
  });

  onChange(async function (change) {
    if (change.kind === "import") {
      await loadEntries().catch(warn);
      invalidateGoals();
      renderJournal();
      renderEntryViews();
      await renderGoals().catch(warn);
      await renderDailyPage().catch(warn);
      await renderHabits().catch(warn);
      refreshReadout();
      refreshDbStatus();
    }
    if (change.kind === "entries") renderEntryViews();
    if (change.kind === "deadlines") safe("today console", refreshReadout);
    refreshHeavy();
  });

  document.addEventListener("logbook:auth-required", async function () {
    await showLock("expired");
    refreshServerCards();
    await loadEntries().catch(warn);
    invalidateGoals();
    await renderEverything();
  });

  document.addEventListener("logbook:navigated", function (e) {
    if (e.detail.page === "companion") renderCompanion().catch(warn);
    if (e.detail.page === "settings") { refreshDbStatus(); refreshServerCards(); safe("cat gifts", refreshGifts); }
  });
  if (currentPage() === "companion") renderCompanion(true).catch(warn);

  document.addEventListener("logbook:prefs-changed", function (e) {
    applyLook();
    if ("name" in e.detail.patch || "clock24" in e.detail.patch) { refreshReadout(); tickNow(); }
  });

  // a new day started while the tab was open: reload today's views
  var day = new Date().toDateString();
  setInterval(function () {
    if (new Date().toDateString() !== day) {
      day = new Date().toDateString();
      renderVerse();
      renderEverything();
    }
  }, 60000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
