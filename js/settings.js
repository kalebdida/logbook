import { getPrefs, setPrefs, DEFAULT_PREFS } from './prefs.js';
import { icon } from './icons.js';
import { apiHealth, apiExportBackup, apiRestoreBackup } from './api.js';
import { readImportFile } from './storage.js';
import { toRestorePayload, readLegacyLocalStorage, markLegacyImported, summarizeRestore } from './backupFormats.js';
import { applyPomodoroDurations } from './pomodoro.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';
import { renderStorageCard, renderAICard, renderAppCard } from './settingsMore.js';
import { renderAccountCard } from './account.js';
import { renderThemeCard } from './themeSettings.js';
import { renderReminderRows, wireReminderRows } from './reminders.js';
import { isDevice } from './connection.js';

/* Copy this into the browser console on the OLD copy of logbook (the
   page where your old data lives) to download everything it stored. */
var LEGACY_SNIPPET =
  'var d={};["logbook-entries","logbook-days","logbook-goals","logbook-pomodoro"].forEach(function(k){var v=localStorage.getItem(k);if(v)d[k]=v});' +
  'var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:"application/json"}));a.download="logbook-old-data.json";a.click();';

function toggle(id, label, hint, checked) {
  return (
    '<label class="setting-row" for="' + id + '">' +
      '<span class="setting-text"><span class="setting-label">' + label + "</span>" + (hint ? '<span class="setting-hint">' + hint + "</span>" : "") + "</span>" +
      '<input type="checkbox" class="switch" id="' + id + '"' + (checked ? " checked" : "") + ">" +
    "</label>"
  );
}

function number(id, label, value, min, max) {
  return (
    '<label class="setting-row" for="' + id + '">' +
      '<span class="setting-text"><span class="setting-label">' + label + "</span></span>" +
      '<span class="num-field"><input class="text-input text-input--num" type="number" id="' + id + '" min="' + min + '" max="' + max + '" value="' + value + '"><span>min</span></span>' +
    "</label>"
  );
}

function download(obj, filename) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

export function renderSettings() {
  var el = document.getElementById("settingsSection");
  if (!el) return;
  var p = getPrefs();
  var legacy = readLegacyLocalStorage();

  el.innerHTML =
    '<div class="settings-grid">' +
    '<section class="settings-card settings-card--wide" id="settingsTheme"></section>' +
    '<section class="settings-card settings-card--wide" id="settingsAccount" hidden></section>' +
    '<section class="settings-card">' +
      '<h3 class="daily-section-title">' + icon("user") + "<span>you</span></h3>" +
      '<label class="setting-row" for="prefName">' +
        '<span class="setting-text"><span class="setting-label">name</span><span class="setting-hint">used in greetings</span></span>' +
        '<input class="text-input" id="prefName" maxlength="40" value="' + escapeHtml(p.name) + '">' +
      "</label>" +
      toggle("prefAutosave", "autosave the daily page", "saves a moment after you stop typing", p.autosave) +
    "</section>" +

    '<section class="settings-card">' +
      '<h3 class="daily-section-title">' + icon("timer") + "<span>focus timer</span></h3>" +
      number("prefFocus", "focus", p.focusMinutes, 1, 180) +
      number("prefShort", "short break", p.shortBreakMinutes, 1, 60) +
      number("prefLong", "long break", p.longBreakMinutes, 1, 90) +
      toggle("prefSound", "chime when a block ends", "", p.sound) +
      toggle("prefNotify", "desktop notification", "only when the tab is in the background", p.notifications) +
    "</section>" +

    '<section class="settings-card" id="settingsReminders"><h3 class="daily-section-title">' + icon("bell") + "<span>reminders</span></h3>" + renderReminderRows() + '</section>' +
    '<section class="settings-card">' +
      '<h3 class="daily-section-title">' + icon("sparkle") + "<span>effects</span></h3>" +
      toggle("prefRain", "moving sky", "twinkling stars, rain, snow: whatever your theme uses. off saves battery", p.rain) +
      toggle("prefScanlines", "crt scanlines", "only on the retro themes that have them", p.scanlines) +
      toggle("prefBoot", "boot sequence", "the terminal theme types its way in when the app opens", p.boot) +
      '<button type="button" class="link-btn" id="prefReset">reset these settings</button>' +
    "</section>" +

    '<section class="settings-card" id="settingsAI"></section>' +
    '<section class="settings-card" id="settingsApp"></section>' +
    '<section class="settings-card settings-card--wide" id="settingsStorage"></section>' +
    '<section class="settings-card settings-card--wide">' +
      '<h3 class="daily-section-title">' + icon("archive") + "<span>your data</span></h3>" +
      '<div class="db-status" id="dbStatus"><span class="status-dot"></span> checking the backend…</div>' +
      '<div class="settings-actions">' +
        '<button type="button" class="primary-btn" id="backupExport">' + icon("download") + "<span>download full backup</span></button>" +
        '<button type="button" class="tool-btn" id="backupImport">' + icon("upload") + "<span>import a file</span></button>" +
        '<input type="file" id="backupFile" accept="application/json,.json" hidden>' +
      "</div>" +
      '<p class="setting-hint">a backup holds everything: entries, daily pages, tasks, activities, goals, focus history. importing never deletes or overwrites anything, so it\'s safe to import the same file twice. it accepts full backups, old journal exports, and old-version data files.</p>' +
      (legacy
        ? '<div class="legacy-box"><p><strong>found data from the old version in this browser.</strong> bring it into the backend?</p><button type="button" class="primary-btn" id="legacyImport">import old data</button></div>'
        : "") +
      '<details class="legacy-help"><summary>moving data from an old copy at a different address</summary>' +
        "<p>old versions saved everything inside the browser, at whatever address you opened them from. to move it here: open the old copy, open devtools (F12), go to console, paste this, press enter. it downloads <code>logbook-old-data.json</code>. then use “import a file” above.</p>" +
        '<div class="snippet"><code id="legacySnippet">' + escapeHtml(LEGACY_SNIPPET) + '</code><button type="button" class="tool-btn" id="copySnippet">copy</button></div>' +
      "</details>" +
    "</section>" +

    "</div>";

  wire(el);
  wireReminderRows(el.querySelector("#settingsReminders"));
  refreshDbStatus();
  renderThemeCard(el.querySelector("#settingsTheme"));
  refreshServerCards();
  renderAppCard(el.querySelector("#settingsApp"));
}

/* The cards that depend on who's logged in. Settings is first drawn while
   the app boots, before the lock screen, so these are drawn again each
   time settings opens. */
export function refreshServerCards() {
  var warn = function (e) { console.warn(e); };
  renderStorageCard(document.getElementById("settingsStorage")).catch(warn);
  renderAccountCard(document.getElementById("settingsAccount")).catch(warn);
  renderAICard(document.getElementById("settingsAI")).catch(warn);
}

async function refreshDbStatus() {
  var box = document.getElementById("dbStatus");
  if (!box) return;
  try {
    var h = await apiHealth();
    var c = h.counts || {};
    box.className = "db-status is-online";
    box.innerHTML =
      '<span class="status-dot"></span> ' + (isDevice() ? "saved on this device" : "backend online, v" + escapeHtml(h.version) + ", " + escapeHtml(h.database || "")) +
      '<div class="db-counts">' +
        [["entries", c.entries], ["days", c.day_records], ["tasks", c.tasks], ["activities", c.activities], ["goals", c.goals], ["focus days", c.pomodoro_days]]
          .map(function (x) { return "<span><b>" + x[1] + "</b> " + x[0] + "</span>"; }).join("") +
      "</div>";
  } catch (e) {
    box.className = "db-status is-offline";
    box.innerHTML = '<span class="status-dot"></span> backend offline. start it with <code>uvicorn app.main:app --reload</code> in the backend folder.';
  }
}

async function runImport(parsed) {
  var converted = toRestorePayload(parsed);
  var result = await apiRestoreBackup(converted.payload);
  emitChange("import");
  toast(summarizeRestore(result), "ok", { duration: 5000 });
  refreshDbStatus();
  return result;
}

function wire(el) {
  var nameTimer = null;
  el.querySelector("#prefName").addEventListener("input", function (e) {
    clearTimeout(nameTimer);
    var v = e.target.value.trim();
    nameTimer = setTimeout(function () { setPrefs({ name: v || DEFAULT_PREFS.name }); }, 300);
  });

  var toggles = { prefAutosave: "autosave", prefSound: "sound", prefRain: "rain", prefScanlines: "scanlines", prefBoot: "boot" };
  Object.keys(toggles).forEach(function (id) {
    el.querySelector("#" + id).addEventListener("change", function (e) {
      var patch = {};
      patch[toggles[id]] = e.target.checked;
      setPrefs(patch);
    });
  });

  el.querySelector("#prefNotify").addEventListener("change", async function (e) {
    var box = e.target;
    if (!box.checked) return setPrefs({ notifications: false });
    if (!("Notification" in window)) {
      box.checked = false;
      return toast("this browser doesn't support notifications", "warn");
    }
    var perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    box.checked = perm === "granted";
    setPrefs({ notifications: box.checked });
    if (!box.checked) toast("notifications are blocked for this site in your browser settings", "warn");
  });

  var nums = { prefFocus: "focusMinutes", prefShort: "shortBreakMinutes", prefLong: "longBreakMinutes" };
  Object.keys(nums).forEach(function (id) {
    el.querySelector("#" + id).addEventListener("change", function (e) {
      var v = Math.round(Number(e.target.value));
      var min = Number(e.target.min), max = Number(e.target.max);
      if (!(v >= min && v <= max)) {
        e.target.value = getPrefs()[nums[id]];
        return toast("pick between " + min + " and " + max + " minutes", "warn");
      }
      var patch = {};
      patch[nums[id]] = v;
      setPrefs(patch);
      applyPomodoroDurations();
      toast("timer updated");
    });
  });

  el.querySelector("#prefReset").addEventListener("click", function () {
    var keepName = getPrefs().name;
    setPrefs(Object.assign({}, DEFAULT_PREFS, { name: keepName }));
    applyPomodoroDurations();
    renderSettings();
    toast("settings reset");
  });

  el.querySelector("#backupExport").addEventListener("click", async function () {
    try {
      var data = await apiExportBackup();
      download(data, "logbook-backup-" + new Date().toISOString().slice(0, 10) + ".json");
      toast("backup downloaded");
    } catch (e) {
      toast("couldn't create the backup. is the backend running?", "error");
    }
  });

  el.querySelector("#backupImport").addEventListener("click", function () {
    el.querySelector("#backupFile").click();
  });
  el.querySelector("#backupFile").addEventListener("change", async function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      await runImport(await readImportFile(file));
    } catch (err) {
      toast("import failed: " + (err.message || "invalid file"), "error");
    }
  });

  var legacyBtn = el.querySelector("#legacyImport");
  if (legacyBtn) {
    legacyBtn.addEventListener("click", async function () {
      legacyBtn.disabled = true;
      try {
        await runImport(readLegacyLocalStorage(true));
        markLegacyImported();
        legacyBtn.closest(".legacy-box").innerHTML = "<p>old data imported. it's still in this browser too, untouched.</p>";
      } catch (err) {
        legacyBtn.disabled = false;
        toast("import failed: " + (err.message || "unknown error"), "error");
      }
    });
  }

  el.querySelector("#copySnippet").addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(LEGACY_SNIPPET);
      toast("copied");
    } catch (e) {
      var range = document.createRange();
      range.selectNodeContents(el.querySelector("#legacySnippet"));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast("selected. press ctrl+c to copy", "warn");
    }
  });

  document.dispatchEvent(new CustomEvent("logbook:settings-rendered"));
}

export { refreshDbStatus };
