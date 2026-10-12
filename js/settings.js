import { getPrefs, setPrefs, DEFAULT_PREFS } from './prefs.js';
import { icon } from './icons.js';
import { apiHealth, apiExportBackup, apiRestoreBackup, apiWipeMyData } from './api.js';
import { cacheClear } from './cache.js';
import { readImportFile } from './storage.js';
import { toRestorePayload, readLegacyLocalStorage, markLegacyImported, summarizeRestore } from './backupFormats.js';
import { applyPomodoroDurations, POMODORO_STORAGE_KEY } from './pomodoro.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { dateKey } from './dayRecord.js';
import { escapeHtml } from './utils.js';
import { renderStorageCard, renderAICard, renderAppCard } from './settingsMore.js';
import { renderAccountCard } from './account.js';
import { renderThemeCard } from './themeSettings.js';
import { renderReminderRows, wireReminderRows } from './reminders.js';
import { isDevice } from './connection.js';
import { LINE_KINDS, linesFor, TRANSLATIONS } from './verse.js';
import { renderTelegramCard } from './telegramCard.js';
import { phoneNotifyAvailable, askPermission } from './phoneNotify.js';
import { hasPin, setPin, clearPin, pinPad } from './pinLock.js';
import { GIFTS, streakInfo } from './mascot.js';
import { getProfile, saveProfile, onProfile } from './profile.js';

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

function cardHead(iconName, title, hint) {
  return '<header class="settings-card-head"><h3 class="card-title">' + icon(iconName) + "<span>" + title + "</span></h3>" +
    (hint ? '<p class="setting-hint">' + hint + "</p>" : "") + "</header>";
}

function giftsRow() {
  var info = streakInfo();
  var name = escapeHtml(getPrefs().mascotName || "Mochi");
  return '<div class="gift-row">' +
    '<div class="gift-list">' + GIFTS.map(function (g) {
      var has = info.best >= g.days;
      return '<span class="gift' + (has ? " is-on" : "") + '" title="' + g.days + ' days in a row: ' + g.name + '">' + icon(has ? "check" : "lock") + "<span>" + g.days + "</span></span>";
    }).join("") + "</div>" +
    '<p class="setting-hint">' + (info.next
      ? "Write " + info.next.days + " days in a row and " + name + " gets " + info.next.name + ". Best so far: " + info.best + (info.best === 1 ? " day." : " days.")
      : name + " has everything. " + info.best + " days in a row, at best. Honored.") + " Earned things stay, even after a missed day.</p>" +
  "</div>";
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

/* One section at a time: the list on the left (a row of tabs on a phone)
   picks it, and #settings/<id> opens one directly. */
var GROUPS = [
  ["you", "user", "You"],
  ["look", "palette", "Look"],
  ["today", "house", "Today page"],
  ["focus", "timer", "Focus"],
  ["connect", "send", "Telegram & AI"],
  ["data", "archive", "Your data"]
];
var activeGroup = "you";
try { activeGroup = sessionStorage.getItem("logbook-settings-tab") || "you"; } catch (e) {}

var DASH_CARDS = [
  ["deadlines", "Coming up", "Deadlines and exams, counting down"],
  ["age", "Your clock", "Your age to the second and the birthday countdown, on the Calendar page"],
  ["sleep", "Sleep", "Going to bed, getting up, two weeks of nights"],
  ["photo", "Photo of the day", "One picture a day, kept like a polaroid"],
  ["gratitude", "Gratitude jar", "Every thank-you becomes a firefly"],
  ["habits", "Habits", "The daily check-ins"],
  ["prayers", "Prayers", "What you're praying for, and the answers"],
  ["brainDump", "Brain dump", "A scratchpad to empty your head"],
  ["log", "Time log", "What you did, by life area"],
  ["night", "Tonight", "Close the day: a win, a lesson, gratitude, tomorrow's one thing"],
  ["replay", "On this day", "An entry from a week or more ago"]
];

function group(id, title, hint, body) {
  return '<section class="settings-group" id="set-' + id + '" data-group="' + id + '" aria-labelledby="set-' + id + '-title"' + (id === activeGroup ? "" : " hidden") + ">" +
    '<header class="settings-group-head"><h2 class="settings-group-title" id="set-' + id + '-title">' + title + "</h2>" +
    (hint ? '<p class="settings-group-hint">' + hint + "</p>" : "") + "</header>" +
    '<div class="settings-grid">' + body + "</div></section>";
}

export function renderSettings() {
  var el = document.getElementById("settingsSection");
  if (!el) return;
  var p = getPrefs();
  var legacy = readLegacyLocalStorage();
  var dash = Object.assign({}, DEFAULT_PREFS.dash, p.dash || {});
  var kind = p.dailyLine || "verse";
  var fromHash = (location.hash.split("/")[1] || "");
  if (GROUPS.some(function (g) { return g[0] === fromHash; })) activeGroup = fromHash;
  if (!GROUPS.some(function (g) { return g[0] === activeGroup; })) activeGroup = "you";

  el.innerHTML =
    '<div class="settings-layout">' +
    '<nav class="settings-nav" aria-label="Settings sections">' +
      GROUPS.map(function (g) {
        var on = g[0] === activeGroup;
        return '<a class="settings-nav-item' + (on ? " is-active" : "") + '" href="#settings/' + g[0] + '" data-jump="' + g[0] + '"' + (on ? ' aria-current="page"' : "") + ">" + icon(g[1]) + "<span>" + g[2] + "</span></a>";
      }).join("") +
    "</nav>" +
    '<div class="settings-groups">' +

    group("you", "You", "Your name, your cat, your account.",
      '<section class="settings-card">' +
        cardHead("user", "About you") +
        '<label class="setting-row setting-row--stack" for="prefName">' +
          '<span class="setting-text"><span class="setting-label">Name</span><span class="setting-hint">Used in greetings</span></span>' +
          '<input class="text-input" id="prefName" maxlength="40" placeholder="Your name" value="' + escapeHtml(p.name) + '">' +
        "</label>" +
        '<label class="setting-row setting-row--stack" for="prefBirthday">' +
          '<span class="setting-text"><span class="setting-label">Birthday</span><span class="setting-hint">Your age clock and birthday countdown on Today</span></span>' +
          '<input class="text-input" type="date" id="prefBirthday" value="' + escapeHtml(getProfile().birthday || "") + '" max="' + dateKey(new Date()) + '">' +
        "</label>" +
      "</section>" +
      '<section class="settings-card">' +
        cardHead("heart", "Your cat") +
        toggle("prefMascot", "Show the cat", "", p.mascot !== false) +
        '<label class="setting-row setting-row--stack" for="prefMascotName">' +
          '<span class="setting-text"><span class="setting-label">Its name</span></span>' +
          '<input class="text-input" id="prefMascotName" maxlength="24" value="' + escapeHtml(p.mascotName || "Mochi") + '">' +
        "</label>" +
        giftsRow() +
      "</section>" +
      '<section class="settings-card settings-card--wide" id="settingsAccount" hidden></section>' +
      '<section class="settings-card">' +
        cardHead("lock", "Lock this device", "Asks for a PIN when Logbook opens on this phone or computer.") +
        toggle("prefPin", "Ask for a PIN", "", hasPin()) +
      "</section>") +

    group("look", "Look", "Your theme and how alive the app feels.",
      '<section class="settings-card settings-card--wide" id="settingsTheme"></section>' +
      '<section class="settings-card">' +
        cardHead("sparkle", "Effects") +
        toggle("prefRain", "Moving sky", "Stars, rain, snow, fog. Off saves battery.", p.rain) +
        toggle("prefScanlines", "CRT scanlines", "Only on the retro themes", p.scanlines) +
        toggle("prefBoot", "Boot sequence", "Only on the terminal theme", p.boot) +
        toggle("prefClock24", "24-hour clock", "", p.clock24 !== false) +
      "</section>") +

    group("today", "Today page", "Show only what you use. Hidden cards keep their data.",
      '<section class="settings-card settings-card--wide" id="settingsLine">' +
        cardHead("quote", "Daily line") +
        '<div class="line-picker" role="radiogroup" aria-label="Daily line">' +
          Object.keys(LINE_KINDS).map(function (k) {
            var info = LINE_KINDS[k];
            var sample = k === "off" ? "Hide the card" : k === "custom" ? "Write your own below" : (linesFor(k)[0] || {}).text || "";
            return '<label class="line-option' + (kind === k ? " is-on" : "") + '">' +
              '<input type="radio" name="dailyLine" value="' + k + '"' + (kind === k ? " checked" : "") + ">" +
              '<span class="line-option-icon">' + icon(info.icon || "eye") + "</span>" +
              '<span class="line-option-text"><b>' + info.label + "</b><small>" + escapeHtml(sample.length > 70 ? sample.slice(0, 68) + "…" : sample) + "</small></span>" +
            "</label>";
          }).join("") +
        "</div>" +
        '<label class="setting-row" for="prefVerseTranslation"' + (kind === "verse" ? "" : " hidden") + ">" +
          '<span class="setting-text"><span class="setting-label">Bible translation</span></span>' +
          '<select class="select-input" id="prefVerseTranslation">' + Object.keys(TRANSLATIONS).map(function (t) {
            return '<option value="' + t + '"' + ((p.verseTranslation || "kjv") === t ? " selected" : "") + ">" + TRANSLATIONS[t] + "</option>";
          }).join("") + "</select>" +
        "</label>" +
        '<label class="setting-row setting-row--stack" for="prefLineCustom"' + (kind === "custom" || kind === "mix" ? "" : " hidden") + ">" +
          '<span class="setting-text"><span class="setting-label">Your lines</span><span class="setting-hint">One per line. Add a source after a dash: <em>Keep going — Mom</em></span></span>' +
          '<textarea class="text-area" id="prefLineCustom" rows="4" placeholder="Discipline is remembering what you want.">' + escapeHtml(p.dailyLineCustom || "") + "</textarea>" +
        "</label>" +
      "</section>" +
      '<section class="settings-card settings-card--wide">' +
        cardHead("layout-grid", "Cards") +
        '<div class="toggle-grid">' +
          DASH_CARDS.map(function (c) { return toggle("dash-" + c[0], c[1], c[2], dash[c[0]] !== false); }).join("") +
        "</div>" +
      "</section>") +

    group("focus", "Focus", "The timer and gentle nudges.",
      '<section class="settings-card">' +
        cardHead("timer", "Timer") +
        number("prefFocus", "Focus", p.focusMinutes, 1, 180) +
        number("prefShort", "Short break", p.shortBreakMinutes, 1, 60) +
        number("prefLong", "Long break", p.longBreakMinutes, 1, 90) +
        toggle("prefAutoBreak", "Start breaks by themselves", "", p.autoBreak) +
        toggle("prefFocusScene", "Full-screen focus", "Just the timer on your scene", p.focusScene !== false) +
      "</section>" +
      '<section class="settings-card">' +
        cardHead("bell", "Sounds and notifications") +
        toggle("prefSound", "Chime when a block ends", "", p.sound) +
        toggle("prefNotify", "Desktop notification", "When the tab is in the background", p.notifications) +
        (phoneNotifyAvailable() ? toggle("prefPhoneNotify", "Phone notifications", "Deadlines and your evening streak, even with the app closed", p.phoneNotify) : "") +
      "</section>" +
      '<section class="settings-card settings-card--wide" id="settingsReminders">' + cardHead("alarm-clock", "Reminders") + renderReminderRows() + "</section>") +

    group("connect", "Telegram & AI", "Talk to Yuki from Telegram, and the AI behind the companion.",
      '<section class="settings-card settings-card--wide" id="settingsTelegram"></section>' +
      '<section class="settings-card settings-card--wide" id="settingsAI"></section>') +

    group("data", "Your data", "Backups, where it lives, and starting over.",
      '<section class="settings-card settings-card--wide">' +
        cardHead("archive", "Backups") +
        '<div class="db-status" id="dbStatus"><span class="status-dot"></span> Checking…</div>' +
        '<div class="settings-actions">' +
          '<button type="button" class="primary-btn" id="backupExport">' + icon("download") + "<span>Download a backup</span></button>" +
          '<button type="button" class="link-btn" id="backupImport">Import a backup</button>' +
          '<input type="file" id="backupFile" accept="application/json,.json" hidden>' +
        "</div>" +
        '<p class="setting-hint">Everything in one file. Importing never deletes or overwrites, so the same file twice is safe.</p>' +
        (legacy
          ? '<div class="legacy-box"><p><strong>Found data from the old version in this browser.</strong> Bring it in?</p><button type="button" class="primary-btn" id="legacyImport">Import old data</button></div>'
          : "") +
      "</section>" +
      '<section class="settings-card settings-card--wide" id="settingsStorage"></section>' +
      '<section class="settings-card" id="settingsApp"></section>' +
      '<section class="settings-card danger-card">' +
        cardHead("rotate-ccw", "Start over") +
        '<div class="setting-row"><span class="setting-text"><span class="setting-label">Reset settings</span><span class="setting-hint">Settings on this device go back to how they started. Your logs stay.</span></span>' +
          '<button type="button" class="tool-btn" id="prefReset">Reset</button></div>' +
        '<div class="setting-row"><span class="setting-text"><span class="setting-label">Start fresh</span><span class="setting-hint">Erase every log, task, habit and photo on this account. Your login and Telegram stay.</span></span>' +
          '<button type="button" class="tool-btn danger-btn" id="wipeOpen">Start fresh</button></div>' +
        '<form class="wipe-form" id="wipeForm" hidden autocomplete="off">' +
          '<p class="wipe-warn">' + icon("triangle-alert") + "<span>This can't be undone. Download a backup first if you might want any of it.</span></p>" +
          '<label class="setting-row setting-row--stack" for="wipeType"><span class="setting-text"><span class="setting-label">Type <b>start fresh</b> to confirm</span></span>' +
            '<input class="text-input" id="wipeType" spellcheck="false" autocapitalize="off"></label>' +
          toggle("wipeKeepProfile", "Keep birthday and pet name", "", true) +
          '<div class="settings-actions"><button type="submit" class="tool-btn danger-btn" id="wipeGo" disabled>' + icon("trash-2") + "<span>Erase everything</span></button>" +
          '<button type="button" class="link-btn" id="wipeCancel">Cancel</button></div>' +
        "</form>" +
      "</section>") +

    "</div></div>";

  wire(el);
  wireReminderRows(el.querySelector("#settingsReminders"));
  refreshDbStatus();
  renderThemeCard(el.querySelector("#settingsTheme"));
  refreshServerCards();
  renderAppCard(el.querySelector("#settingsApp"));
  wireNav(el);
}

export function showSettingsGroup(id) {
  var root = document.getElementById("settingsSection");
  if (!root || !GROUPS.some(function (g) { return g[0] === id; })) return;
  activeGroup = id;
  try { sessionStorage.setItem("logbook-settings-tab", id); } catch (e) {}
  root.querySelectorAll(".settings-group").forEach(function (g) {
    var on = g.getAttribute("data-group") === id;
    if (on && g.hidden) { g.hidden = false; g.classList.remove("is-entering"); void g.offsetWidth; g.classList.add("is-entering"); }
    else g.hidden = !on;
  });
  root.querySelectorAll("[data-jump]").forEach(function (a) {
    var on = a.getAttribute("data-jump") === id;
    a.classList.toggle("is-active", on);
    if (on) { a.setAttribute("aria-current", "page"); if (a.scrollIntoView && window.innerWidth < 900) a.scrollIntoView({ block: "nearest", inline: "center" }); }
    else a.removeAttribute("aria-current");
  });
}

/* one section at a time; the address remembers which */
function wireNav(el) {
  el.querySelectorAll("[data-jump]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var id = a.getAttribute("data-jump");
      showSettingsGroup(id);
      history.replaceState(null, "", "#settings/" + id);
    });
  });
}
window.addEventListener("hashchange", function () {
  var m = /^#settings\/(\w+)/.exec(location.hash);
  if (m) showSettingsGroup(m[1]);
});

/* The cards that depend on who's logged in. Settings is first drawn while
   the app boots, before the lock screen, so these are drawn again each
   time settings opens. */
export function refreshGifts() {
  var row = document.querySelector("#settingsSection .gift-row");
  if (row) row.outerHTML = giftsRow();
}

export function refreshServerCards() {
  var warn = function (e) { console.warn(e); };
  renderStorageCard(document.getElementById("settingsStorage")).catch(warn);
  var acct = document.getElementById("settingsAccount");
  renderAccountCard(acct).catch(warn);
  renderAICard(document.getElementById("settingsAI")).catch(warn);
  renderTelegramCard(document.getElementById("settingsTelegram")).catch(warn);
}

async function refreshDbStatus() {
  var box = document.getElementById("dbStatus");
  if (!box) return;
  try {
    var h = await apiHealth();
    var c = h.counts || {};
    box.className = "db-status is-online";
    box.innerHTML =
      '<span class="status-dot"></span> ' + (isDevice() ? "Saved on this device" : "Server online · version " + escapeHtml(h.version) + " · " + escapeHtml(h.database || "")) +
      '<div class="db-counts">' +
        [["entries", c.entries], ["days", c.day_records], ["tasks", c.tasks], ["activities", c.activities], ["goals", c.goals], ["habits", c.habits], ["focus days", c.pomodoro_days]]
          .map(function (x) { return "<span><b>" + (x[1] || 0) + "</b> " + x[0] + "</span>"; }).join("") +
      "</div>";
  } catch (e) {
    box.className = "db-status is-offline";
    box.innerHTML = '<span class="status-dot"></span> Can\'t reach the server right now. Your last copy still shows; it syncs again when it\'s back.';
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

  var toggles = { prefSound: "sound", prefRain: "rain", prefScanlines: "scanlines", prefBoot: "boot", prefClock24: "clock24",
    prefMascot: "mascot", prefAutoBreak: "autoBreak", prefFocusScene: "focusScene" };
  Object.keys(toggles).forEach(function (id) {
    el.querySelector("#" + id).addEventListener("change", function (e) {
      var patch = {};
      patch[toggles[id]] = e.target.checked;
      setPrefs(patch);
    });
  });

  var catTimer = null;
  el.querySelector("#prefMascotName").addEventListener("input", function (e) {
    clearTimeout(catTimer);
    var v = e.target.value.trim();
    catTimer = setTimeout(function () {
      setPrefs({ mascotName: v || "Mochi" });
      saveProfile({ petName: v }).catch(function () {});   // the same name on every device
    }, 500);
  });

  el.querySelector("#prefBirthday").addEventListener("change", function (e) {
    saveProfile({ birthday: e.target.value || null }).then(function () {
      toast(e.target.value ? "Your clock is on the Today page" : "Birthday removed");
    }).catch(function () { toast("Couldn't save that", "error"); });
  });
  onProfile(function (prof) {
    var b = el.querySelector("#prefBirthday");
    if (b && document.activeElement !== b) b.value = prof.birthday || "";
    var n = el.querySelector("#prefMascotName");
    if (n && document.activeElement !== n && prof.petName) n.value = prof.petName;
  });

  el.querySelectorAll('input[name="dailyLine"]').forEach(function (r) {
    r.addEventListener("change", function () {
      setPrefs({ dailyLine: r.value });
      el.querySelectorAll(".line-option").forEach(function (o) { o.classList.toggle("is-on", o.contains(r)); });
      var custom = el.querySelector('[for="prefLineCustom"]');
      if (custom) custom.hidden = !(r.value === "custom" || r.value === "mix");
      var tr = el.querySelector('[for="prefVerseTranslation"]');
      if (tr) tr.hidden = r.value !== "verse";
    });
  });
  el.querySelector("#prefVerseTranslation").addEventListener("change", function (e) { setPrefs({ verseTranslation: e.target.value }); });
  var lineTimer = null;
  el.querySelector("#prefLineCustom").addEventListener("input", function (e) {
    clearTimeout(lineTimer);
    lineTimer = setTimeout(function () { setPrefs({ dailyLineCustom: e.target.value }); }, 400);
  });

  el.querySelectorAll('[id^="dash-"]').forEach(function (box) {
    box.addEventListener("change", function () {
      var dash = Object.assign({}, DEFAULT_PREFS.dash, getPrefs().dash || {});
      dash[box.id.slice(5)] = box.checked;
      setPrefs({ dash: dash });
    });
  });

  var pinBox = el.querySelector("#prefPin");
  pinBox.addEventListener("change", async function () {
    if (pinBox.checked) {
      var pin = await pinPad("set");
      if (pin) { await setPin(pin); toast("PIN set. Logbook asks for it when it opens."); }
      else pinBox.checked = false;
    } else {
      if (await pinPad("confirm")) { clearPin(); toast("PIN removed"); }
      else pinBox.checked = true;
    }
  });

  var phoneBox = el.querySelector("#prefPhoneNotify");
  if (phoneBox) phoneBox.addEventListener("change", async function () {
    if (!phoneBox.checked) return setPrefs({ phoneNotify: false });
    if (await askPermission()) { setPrefs({ phoneNotify: true }); toast("Notifications on"); }
    else { phoneBox.checked = false; toast("Allow notifications for Logbook in your phone's settings first", "warn"); }
  });

  el.querySelector("#prefNotify").addEventListener("change", async function (e) {
    var box = e.target;
    if (!box.checked) return setPrefs({ notifications: false });
    if (!("Notification" in window)) {
      box.checked = false;
      return toast("This browser doesn't support notifications", "warn");
    }
    var perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    box.checked = perm === "granted";
    setPrefs({ notifications: box.checked });
    if (!box.checked) toast("Notifications are blocked for this site in your browser settings", "warn");
  });

  var nums = { prefFocus: "focusMinutes", prefShort: "shortBreakMinutes", prefLong: "longBreakMinutes" };
  Object.keys(nums).forEach(function (id) {
    el.querySelector("#" + id).addEventListener("change", function (e) {
      var v = Math.round(Number(e.target.value));
      var min = Number(e.target.min), max = Number(e.target.max);
      if (!(v >= min && v <= max)) {
        e.target.value = getPrefs()[nums[id]];
        return toast("Pick between " + min + " and " + max + " minutes", "warn");
      }
      var patch = {};
      patch[nums[id]] = v;
      setPrefs(patch);
      applyPomodoroDurations();
      toast("Timer updated");
    });
  });

  el.querySelector("#prefReset").addEventListener("click", function () {
    var keepName = getPrefs().name;
    setPrefs(Object.assign({}, DEFAULT_PREFS, { name: keepName }));
    applyPomodoroDurations();
    renderSettings();
    toast("Settings reset");
  });

  el.querySelector("#backupExport").addEventListener("click", async function () {
    try {
      var data = await apiExportBackup();
      download(data, "logbook-backup-" + new Date().toISOString().slice(0, 10) + ".json");
      toast("Backup downloaded");
    } catch (e) {
      toast("Couldn't create the backup. Check your connection and try again.", "error");
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
      toast("Import failed: " + (err.message || "invalid file"), "error");
    }
  });

  var legacyBtn = el.querySelector("#legacyImport");
  if (legacyBtn) {
    legacyBtn.addEventListener("click", async function () {
      legacyBtn.disabled = true;
      try {
        await runImport(readLegacyLocalStorage(true));
        markLegacyImported();
        legacyBtn.closest(".legacy-box").innerHTML = "<p>Old data imported. It's still in this browser too, untouched.</p>";
      } catch (err) {
        legacyBtn.disabled = false;
        toast("Import failed: " + (err.message || "unknown error"), "error");
      }
    });
  }

  var wipeForm = el.querySelector("#wipeForm"), wipeType = el.querySelector("#wipeType"), wipeGo = el.querySelector("#wipeGo");
  el.querySelector("#wipeOpen").addEventListener("click", function () { wipeForm.hidden = false; wipeType.focus(); });
  el.querySelector("#wipeCancel").addEventListener("click", function () { wipeForm.hidden = true; wipeType.value = ""; wipeGo.disabled = true; });
  wipeType.addEventListener("input", function () { wipeGo.disabled = wipeType.value.trim().toLowerCase() !== "start fresh"; });
  wipeForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (wipeGo.disabled) return;
    wipeGo.disabled = true;
    try {
      await apiWipeMyData(el.querySelector("#wipeKeepProfile").checked);
      try { localStorage.removeItem(POMODORO_STORAGE_KEY); localStorage.removeItem("logbook-daily-draft"); } catch (err) {}
      await cacheClear();
      toast("Fresh start. Everything's cleared.");
      setTimeout(function () { location.hash = "#dashboard"; location.reload(); }, 900);
    } catch (err) {
      wipeGo.disabled = false;
      toast("Couldn't clear it: " + (err.detail || err.message), "error");
    }
  });

  document.dispatchEvent(new CustomEvent("logbook:settings-rendered"));
}

export { refreshDbStatus };
