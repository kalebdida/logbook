import { storageWorks } from './storage.js';
import { resolveConnection, isDevice } from './connection.js';
import { initDeviceStore, deviceStorageIsPersistent } from './deviceStore.js';
import { apiAuthStatus, request } from './api.js';
import { showLock } from './lock.js';
import { getPrefs } from './prefs.js';
import { onChange } from './bus.js';
import { initNavigation, currentPage } from './navigation.js';
import { loadEntries, getEntries, renderJournal, wireJournal } from './journal.js';
import { renderWeekAgo } from './entries.js';
import { paintIcons } from './icons.js';
import { renderVerse } from './verse.js';
import { startBackground } from './background.js';
import { initThemes } from './themes.js';
import { startReminders } from './reminders.js';
import { startMusic } from './music.js';
import { renderHabits } from './habits.js';
import { startPWA } from './pwa.js';
import { showStorageWarning, startBoot } from './ui.js';
import { renderTodayConsole, refreshReadout } from './today.js';
import { renderDailyPage } from './dailyPage.js';
import { openDayViewer } from './dayViewer.js';
import { renderCalendar } from './calendar.js';
import { renderPomodoro } from './pomodoro.js';
import { renderGoals, invalidateGoals } from './goals.js';
import { renderDensityMap } from './densityMap.js';
import { renderAnalytics } from './analytics.js';
import { renderCompanion } from './companion.js';
import { renderSettings, refreshDbStatus, refreshServerCards } from './settings.js';
import { initPalette } from './palette.js';
import { checkBackend, startStatusWatch, onStatus } from './status.js';

function applyLook() {
  var p = getPrefs();
  document.body.classList.toggle("no-scanlines", !p.scanlines);
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
    renderGoals(),
    renderCalendar()
  ].map(function (p) { return Promise.resolve(p).catch(warn); }));
  safe("today console", refreshReadout);
  await Promise.all([renderDensityMap(), renderAnalytics()].map(function (p) { return p.catch(warn); }));
  safe("today console", refreshReadout); // focus totals from the backend are known now
}

/* One broken module should never stop the rest of the app from starting. */
function safe(label, fn) {
  try {
    return fn();
  } catch (e) {
    console.error("logbook: " + label + " failed to start", e);
  }
}

async function init() {
  safe("theme", initThemes);
  safe("icons", paintIcons);
  safe("offline + install", startPWA);
  safe("look", applyLook);
  if (!storageWorks()) showStorageWarning();
  safe("navigation", initNavigation);
  safe("command palette", initPalette);
  safe("background", startBackground);
  safe("verse", renderVerse);
  safe("focus timer", renderPomodoro);
  Promise.resolve(safe("music", startMusic)).catch(warn);
  safe("settings", renderSettings);
  safe("journal", wireJournal);

  // where does the data live? (server, or this device)
  await resolveConnection();
  document.body.dataset.mode = isDevice() ? "device" : "server";
  if (isDevice()) {
    await initDeviceStore();
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

  var online = await checkBackend();
  if (online) {
    try {
      await loadEntries();
    } catch (e) {
      warn(e);
    }
  }
  startBoot(getEntries().length);
  if (online) await renderEverything();
  startStatusWatch();
  safe("reminders", startReminders);

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
    if (e.detail.page === "settings") { refreshDbStatus(); refreshServerCards(); }
  });
  if (currentPage() === "companion") renderCompanion(true).catch(warn);

  document.addEventListener("logbook:prefs-changed", function (e) {
    applyLook();
    if ("name" in e.detail.patch) refreshReadout();
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
