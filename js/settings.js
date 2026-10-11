import { getPrefs, setPrefs, DEFAULT_PREFS } from './prefs.js';
import { icon } from './icons.js';
import { apiHealth, apiExportBackup, apiRestoreBackup } from './api.js';
import { readImportFile } from './storage.js';
import { toRestorePayload, readLegacyLocalStorage, markLegacyImported, summarizeRestore } from './backupFormats.js';
import { applyPomodoroDurations } from './pomodoro.js';
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
import { GIFTS, streakInfo } from './mascot.js';
import { getProfile, saveProfile, onProfile } from './profile.js';

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

var GROUPS = [
  ["look", "palette", "Look"],
  ["you", "user", "You"],
  ["today", "house", "Today page"],
  ["focus", "timer", "Focus"],
  ["account", "users", "Account"],
  ["ai", "sparkles", "AI"],
  ["telegram", "send", "Telegram"],
  ["data", "archive", "Your data"]
];

var DASH_CARDS = [
  ["deadlines", "Coming up", "Deadlines and exams, counting down"],
  ["age", "Your clock", "Your age to the second, and the birthday countdown"],
  ["sleep", "Sleep", "Going to bed, getting up, two weeks of nights"],
  ["photo", "Photo of the day", "One picture a day, kept like a polaroid"],
  ["gratitude", "Gratitude jar", "Every thank-you becomes a firefly"],
  ["habits", "Habits", "The daily check-ins"],
  ["prayers", "Prayers", "What you're praying for, and the answers"],
  ["brainDump", "Brain dump", "A place to empty your head"],
  ["log", "Time log", "What you did, by life area"],
  ["night", "Tonight", "Win, lesson, gratitude, tomorrow's tasks"],
  ["replay", "On this day", "An entry from a week or more ago"]
];

function group(id, title, hint, body) {
  return '<section class="settings-group" id="set-' + id + '" data-group="' + id + '" aria-labelledby="set-' + id + '-title">' +
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

  el.innerHTML =
    '<div class="settings-layout">' +
    '<nav class="settings-nav" aria-label="Settings sections">' +
      GROUPS.map(function (g) {
        return '<a class="settings-nav-item" href="#set-' + g[0] + '" data-jump="' + g[0] + '">' + icon(g[1]) + "<span>" + g[2] + "</span></a>";
      }).join("") +
    "</nav>" +
    '<div class="settings-groups">' +

    group("look", "Look", "Themes, the moving sky, and how the app feels.",
      '<section class="settings-card settings-card--wide" id="settingsTheme"></section>' +
      '<section class="settings-card">' +
        cardHead("sparkle", "Effects") +
        toggle("prefRain", "Moving sky", "Stars, rain, snow, fog: whatever your theme has. Off saves battery.", p.rain) +
        toggle("prefScanlines", "CRT scanlines", "Only on the retro themes that have them", p.scanlines) +
        toggle("prefBoot", "Boot sequence", "The terminal theme types its way in when the app opens", p.boot) +
      "</section>" +
      '<section class="settings-card">' +
        cardHead("clock", "Clock") +
        toggle("prefClock24", "24-hour clock", "Off shows 2:30 PM instead of 14:30", p.clock24 !== false) +
      "</section>") +

    group("you", "You", "What the app calls you, and who keeps you company.",
      '<section class="settings-card">' +
        cardHead("user", "Your name") +
        '<label class="setting-row setting-row--stack" for="prefName">' +
          '<span class="setting-text"><span class="setting-label">Name</span><span class="setting-hint">Used in greetings. Empty uses your username.</span></span>' +
          '<input class="text-input" id="prefName" maxlength="40" placeholder="Your name" value="' + escapeHtml(p.name) + '">' +
        "</label>" +
        '<label class="setting-row setting-row--stack" for="prefBirthday">' +
          '<span class="setting-text"><span class="setting-label">Birthday</span><span class="setting-hint">For your clock on the Today page: your age to the second and the countdown to the next one. The same on every device.</span></span>' +
          '<input class="text-input" type="date" id="prefBirthday" value="' + escapeHtml(getProfile().birthday || "") + '" max="' + dateKey(new Date()) + '">' +
        "</label>" +
      "</section>" +
      '<section class="settings-card">' +
        cardHead("heart", "Companion cat", "A small cat that naps, cheers when you finish things, and keeps you company in focus.") +
        toggle("prefMascot", "Show the cat", "", p.mascot !== false) +
        '<label class="setting-row setting-row--stack" for="prefMascotName">' +
          '<span class="setting-text"><span class="setting-label">Its name</span></span>' +
          '<input class="text-input" id="prefMascotName" maxlength="24" value="' + escapeHtml(p.mascotName || "Mochi") + '">' +
        "</label>" +
        giftsRow() +
      "</section>" +
      '<section class="settings-card settings-card--wide" id="settingsLine">' +
        cardHead("quote", "The line on your dashboard", "Pick what greets you each day. The refresh button on the card shows another one.") +
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
          '<span class="setting-text"><span class="setting-label">Bible translation</span><span class="setting-hint">A new verse every day, from bible-api.com.</span></span>' +
          '<select class="select-input" id="prefVerseTranslation">' + Object.keys(TRANSLATIONS).map(function (t) {
            return '<option value="' + t + '"' + ((p.verseTranslation || "kjv") === t ? " selected" : "") + ">" + TRANSLATIONS[t] + "</option>";
          }).join("") + "</select>" +
        "</label>" +
        '<label class="setting-row setting-row--stack" for="prefLineCustom"' + (kind === "custom" || kind === "mix" ? "" : " hidden") + ">" +
          '<span class="setting-text"><span class="setting-label">Your lines</span><span class="setting-hint">One per line. Add a source after a dash: <em>Keep going — Mom</em></span></span>' +
          '<textarea class="text-area" id="prefLineCustom" rows="4" placeholder="Discipline is remembering what you want.">' + escapeHtml(p.dailyLineCustom || "") + "</textarea>" +
        "</label>" +
      "</section>") +

    group("today", "Today page", "Show only what you use. Hidden cards keep their data.",
      '<section class="settings-card settings-card--wide">' +
        cardHead("layout-grid", "Cards on the Today page") +
        '<div class="toggle-grid">' +
          DASH_CARDS.map(function (c) { return toggle("dash-" + c[0], c[1], c[2], dash[c[0]] !== false); }).join("") +
        "</div>" +
      "</section>") +

    group("focus", "Focus", "The timer, the focus space, and gentle nudges.",
      '<section class="settings-card">' +
        cardHead("timer", "Focus timer") +
        number("prefFocus", "Focus", p.focusMinutes, 1, 180) +
        number("prefShort", "Short break", p.shortBreakMinutes, 1, 60) +
        number("prefLong", "Long break", p.longBreakMinutes, 1, 90) +
        toggle("prefAutoBreak", "Start breaks by themselves", "When a focus block ends, the break starts right away", p.autoBreak) +
      "</section>" +
      '<section class="settings-card">' +
        cardHead("moon-star", "Focus space") +
        toggle("prefFocusScene", "Fill the screen while focusing", "The timer sits on your theme's scene with nothing else around. Esc or the button leaves.", p.focusScene !== false) +
        toggle("prefSound", "Chime when a block ends", "", p.sound) +
        toggle("prefNotify", "Desktop notification", "Only when the tab is in the background", p.notifications) +
      "</section>" +
      '<section class="settings-card" id="settingsReminders">' + cardHead("bell", "Reminders") + renderReminderRows() + "</section>") +

    group("account", "Account", "",
      '<section class="settings-card settings-card--wide" id="settingsAccount" hidden></section>') +

    group("ai", "AI companion", "Optional. The companion works without it, using simple local rules.",
      '<section class="settings-card settings-card--wide" id="settingsAI"></section>') +

    group("telegram", "Telegram", "Log time, tasks and prayers from a chat, ask your companion, and get a morning message.",
      '<section class="settings-card settings-card--wide" id="settingsTelegram"></section>') +

    group("data", "Your data", "Where it lives, backups, and the app itself.",
      '<section class="settings-card settings-card--wide" id="settingsStorage"></section>' +
      '<section class="settings-card settings-card--wide">' +
        cardHead("archive", "Backups") +
        '<div class="db-status" id="dbStatus"><span class="status-dot"></span> Checking…</div>' +
        '<div class="settings-actions">' +
          '<button type="button" class="primary-btn" id="backupExport">' + icon("download") + "<span>Download full backup</span></button>" +
          '<button type="button" class="tool-btn" id="backupImport">' + icon("upload") + "<span>Import a file</span></button>" +
          '<input type="file" id="backupFile" accept="application/json,.json" hidden>' +
        "</div>" +
        '<p class="setting-hint">A backup holds everything: entries, daily pages, tasks, activities, goals, habits, focus history. Importing never deletes or overwrites anything, so it\'s safe to import the same file twice. It accepts full backups, journal exports, and data from older versions.</p>' +
        (legacy
          ? '<div class="legacy-box"><p><strong>Found data from the old version in this browser.</strong> Bring it in?</p><button type="button" class="primary-btn" id="legacyImport">Import old data</button></div>'
          : "") +
        '<details class="legacy-help"><summary>Moving data from an old copy at a different address</summary>' +
          "<p>Old versions saved everything inside the browser, at whatever address you opened them from. To move it here: open the old copy, open devtools (F12), go to Console, paste this, press Enter. It downloads <code>logbook-old-data.json</code>. Then use “Import a file” above.</p>" +
          '<div class="snippet"><code id="legacySnippet">' + escapeHtml(LEGACY_SNIPPET) + '</code><button type="button" class="tool-btn" id="copySnippet">Copy</button></div>' +
        "</details>" +
      "</section>" +
      '<section class="settings-card" id="settingsApp"></section>' +
      '<section class="settings-card">' +
        cardHead("rotate-ccw", "Start over") +
        '<p class="setting-hint">Puts this page\'s settings back to how they started. Your journal and themes stay.</p>' +
        '<div class="settings-actions"><button type="button" class="tool-btn" id="prefReset">' + icon("rotate-ccw") + "<span>Reset settings</span></button></div>" +
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

/* the section list follows you down the page */
function wireNav(el) {
  var links = el.querySelectorAll("[data-jump]");
  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var target = document.getElementById("set-" + a.getAttribute("data-jump"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  if (!("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (items) {
    items.forEach(function (it) {
      if (!it.isIntersecting) return;
      var id = it.target.getAttribute("data-group");
      links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("data-jump") === id); });
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  el.querySelectorAll(".settings-group").forEach(function (g) { io.observe(g); });
}

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
  renderAccountCard(acct).then(function () {
    // no accounts on this server: the whole Account section goes away
    var off = !acct || acct.hidden;
    var grp = document.getElementById("set-account");
    var nav = document.querySelector('[data-jump="account"]');
    if (grp) grp.hidden = off;
    if (nav) nav.hidden = off;
  }).catch(warn);
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
    box.innerHTML = '<span class="status-dot"></span> Server offline. If it runs on this computer, start it with <code>uvicorn app.main:app --reload</code> in the backend folder.';
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

  el.querySelector("#copySnippet").addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(LEGACY_SNIPPET);
      toast("Copied");
    } catch (e) {
      var range = document.createRange();
      range.selectNodeContents(el.querySelector("#legacySnippet"));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast("Selected. Press Ctrl+C to copy", "warn");
    }
  });

  document.dispatchEvent(new CustomEvent("logbook:settings-rendered"));
}

export { refreshDbStatus };
