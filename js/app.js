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
import { renderSleep } from './sleep.js';
import { renderPhoto } from './photo.js';
import { renderLetter } from './letters.js';
import { startLivingScene, refreshScene } from './livingScene.js';
import { renderGratitude, offerGratitude } from './gratitude.js';
import { startWidget, updateWidget } from './widget.js';
import { startPhoneNotify } from './phoneNotify.js';
import { startPinLock } from './pinLock.js';
import { renderYearCard } from './yearReview.js';
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
import { startPickers } from './picker.js';
import { startSettingsSync } from './settingsSync.js';
import { checkBackend, startStatusWatch, onStatus } from './status.js';

window.__logbookBooted = true;   // every module loaded: the boot watchdog in index.html stands down

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
    renderSleep(),
    renderGratitude(),
    renderPhoto(),
    renderPrayers(),
    renderGoals(),
    renderCalendar()
  ].map(function (p) { return Promise.resolve(p).catch(warn); }));
  safe("today console", refreshReadout);
  await Promise.all([renderDensityMap(), renderAnalytics()].map(function (p) { return p.catch(warn); }));
  safe("today console", refreshReadout); // focus totals from the backend are known now
  safe("home screen widget", updateWidget);
  safe("living scene", startLivingScene);
  renderLetter().catch(warn);
  safe("year in review", renderYearCard);
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
  safe("device PIN", startPinLock);
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
  safe("pickers", startPickers);
  safe("typing", watchTyping);
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
  if (online) safe("settings sync", startSettingsSync);     // theme, cards, timer lengths... follow the account
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
  safe("phone notifications", startPhoneNotify);

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
    if (change.kind === "entries") safe("gratitude jar", offerGratitude);
    if (change.kind === "entries" || change.kind === "habits" || change.kind === "import") safe("living scene", refreshScene);
    refreshHeavy();
  });

  // the server knew something newer than the copy we showed: draw again,
  // but never under someone's fingers
  var pendingFresh = false;
  async function redrawFresh() {
    var a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT" || a.isContentEditable)) {
      if (!pendingFresh) { pendingFresh = true; a.addEventListener("blur", function () { pendingFresh = false; redrawFresh(); }, { once: true }); }
      return;
    }
    await loadEntries().catch(warn);
    invalidateGoals();
    await renderEverything();
  }
  document.addEventListener("logbook:fresh-data", function () { redrawFresh().catch(warn); });

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

/* Phones: while a text field has focus the keyboard is up, so hide the tab bar
   (data-typing on <html>, see layout.css) and keep the field in view. */
function watchTyping() {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  var off = null;
  function isText(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && /^(text|search|email|url|tel|password|number)$/.test(el.type || "text");
  }
  document.addEventListener("focusin", function (e) {
    if (!isText(e.target)) return;
    clearTimeout(off);
    document.documentElement.setAttribute("data-typing", "");
    var el = e.target;
    setTimeout(function () { el.scrollIntoView({ block: "center", behavior: "smooth" }); }, 300);
  });
  document.addEventListener("focusout", function () {
    clearTimeout(off);
    off = setTimeout(function () {
      if (!isText(document.activeElement)) document.documentElement.removeAttribute("data-typing");
    }, 120);
  });
}
