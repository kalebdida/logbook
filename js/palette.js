import { navigateTo, PAGES, pageLabel } from './navigation.js';
import { icon } from './icons.js';
import { focusComposer, getEntries, revealEntry } from './journal.js';
import { toggleFocusFromAnywhere, startFocusFromAnywhere } from './pomodoro.js';
import { openDayViewer, closeDayViewer, isDayViewerOpen, shiftDayViewer } from './dayViewer.js';
import { apiExportBackup } from './api.js';
import { getPrefs, setPrefs } from './prefs.js';
import { dateKey } from './dayRecord.js';
import { STATUS } from './entries.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';
import { BUILT_IN, applyTheme, currentTheme, findTheme } from './themes.js';
import { musicCommand } from './music.js';

/* Ctrl+K command prompt and single-key shortcuts. Any element with
   data-command="..." anywhere in the app runs the same commands. */

function afterNav(fn) {
  setTimeout(fn, 60);
}

function scrollFocus(selector) {
  afterNav(function () {
    var el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  });
}

var COMMANDS = [
  { id: "write", title: "write an entry", keys: "journal new log", key: "n", run: function () { navigateTo("journal"); afterNav(function () { focusComposer(); }); } },
  { id: "write-good", title: "write a good-day entry", keys: "good mood sun", run: function () { navigateTo("journal"); afterNav(function () { focusComposer("good"); }); } },
  { id: "write-okay", title: "write an okay-day entry", keys: "okay mood cloud", run: function () { navigateTo("journal"); afterNav(function () { focusComposer("okay"); }); } },
  { id: "write-rough", title: "write a rough-day entry", keys: "rough bad mood rain", run: function () { navigateTo("journal"); afterNav(function () { focusComposer("rough"); }); } },
  { id: "add-task", title: "add a task for today", keys: "todo checklist", key: "t", run: function () { navigateTo("dashboard"); scrollFocus('#dailyTasks input[name="title"]'); } },
  { id: "log-activity", title: "log an activity", keys: "minutes area density", run: function () { navigateTo("dashboard"); scrollFocus("#dailyActivities .area-chip"); } },
  { id: "focus-toggle", title: "start or pause focus timer", keys: "pomodoro timer lock-in", key: "f", run: function () {
      var r = toggleFocusFromAnywhere();
      toast(r === "paused" ? "focus paused" : "focus started");
    } },
  { id: "focus-start", title: "start a focus block", keys: "pomodoro timer", run: function () { startFocusFromAnywhere(); navigateTo("focus"); } },
  { id: "new-goal", title: "create a goal", keys: "goals target", key: "g", run: function () {
      navigateTo("goals");
      afterNav(function () { var b = document.querySelector('#goalsSection [data-goal-action="add"]'); if (b) b.click(); });
    } },
  { id: "search", title: "search entries", keys: "grep find journal", key: "/", run: function () { navigateTo("journal"); scrollFocus("#searchInput"); } },
  { id: "day-today", title: "open today's record", keys: "day viewer", key: "d", run: function () { openDayViewer(dateKey(new Date())); } },
  { id: "day-yesterday", title: "open yesterday's record", keys: "day viewer", run: function () { var d = new Date(); d.setDate(d.getDate() - 1); openDayViewer(dateKey(d)); } },
  { id: "backup", title: "download a full backup", keys: "export save data", run: async function () {
      try {
        var data = await apiExportBackup();
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = "logbook-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        toast("backup downloaded");
      } catch (e) {
        toast("couldn't create the backup", "error");
      }
    } },
  { id: "music-toggle", title: "play or pause music", keys: "music sound soundtrack audio spotify ambient", key: "m", run: function () { musicCommand("toggle"); } },
  { id: "music-ambient", title: "toggle ambient sound", keys: "music rain noise waves fire sound", run: function () { musicCommand("ambient"); } },
  { id: "music-open", title: "open the soundtrack", keys: "music add songs files spotify", run: function () { navigateTo("focus"); scrollFocus("#musicCard .music-tab"); } },
  { id: "theme-make", title: "make a theme from a vibe", keys: "theme look colors customize design vibe ui", run: function () { navigateTo("settings"); scrollFocus("#vibeText"); } },
  { id: "theme-next", title: "next theme", keys: "theme look cycle", run: function () {
      var i = BUILT_IN.findIndex(function (t) { return t.id === currentTheme().id; });
      var t = applyTheme(BUILT_IN[(i + 1) % BUILT_IN.length]);
      toast("theme: " + t.name);
    } },
  { id: "toggle-rain", title: "toggle animated background", keys: "effects background rain matrix stars snow", run: function () { setPrefs({ rain: !getPrefs().rain }); } },
  { id: "toggle-scanlines", title: "toggle crt scanlines", keys: "effects", run: function () { setPrefs({ scanlines: !getPrefs().scanlines }); } },
  { id: "write-prompt", title: "answer today's reflection question", keys: "companion prompt", run: function (el) {
      var prompt = el && el.getAttribute("data-prompt");
      if (!prompt) {
        navigateTo("companion");
        return;
      }
      navigateTo("journal");
      afterNav(function () {
        var ta = document.getElementById("entryText");
        ta.value = prompt + "\n\n";
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        focusComposer();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    } },
  { id: "shortcuts", title: "show keyboard shortcuts", keys: "help keys", key: "?", run: function () { openHelp(); } },
  { id: "palette", title: "open search and commands", keys: "", hidden: true, run: function () { openPalette(); } }
].concat(BUILT_IN.map(function (t) {
  return { id: "theme-" + t.id, title: "theme: " + t.name, keys: "theme look " + t.note, run: function () { applyTheme(findTheme(t.id)); toast("theme: " + t.name); } };
})).concat(PAGES.map(function (page, i) {
  return { id: "go-" + page, title: "go to " + pageLabel(page), keys: "page open navigate " + page, key: String(i + 1), run: function () { navigateTo(page); } };
}));

var ICONS = {
  write: "feather", "write-good": "sun", "write-okay": "cloud-sun", "write-rough": "cloud-rain", "add-task": "list-checks",
  "log-activity": "activity", "focus-toggle": "timer", "focus-start": "timer", "new-goal": "mountain-snow", search: "search",
  "day-today": "calendar-days", "day-yesterday": "calendar-days", backup: "download", "music-toggle": "music", "music-ambient": "cloud-rain",
  "music-open": "headphones", "theme-make": "wand-sparkles", "theme-next": "palette", "toggle-rain": "sparkle", "toggle-scanlines": "sparkle",
  "write-prompt": "pen-line", shortcuts: "keyboard", "go-dashboard": "house", "go-journal": "notebook-pen", "go-calendar": "calendar-days",
  "go-focus": "timer", "go-goals": "mountain-snow", "go-companion": "sparkles", "go-settings": "settings"
};
function cmdIcon(c) {
  return icon(ICONS[c.id] || (c.id.indexOf("theme-") === 0 ? "palette" : "arrow-right"));
}

var BY_ID = {};
COMMANDS.forEach(function (c) { BY_ID[c.id] = c; });

export function runCommand(id, el) {
  var cmd = BY_ID[id];
  if (cmd) cmd.run(el);
}

/* ---------- palette ---------- */

var pal = { open: false, items: [], index: 0, lastFocus: null };

function score(query, text) {
  if (!query) return 1;
  text = text.toLowerCase();
  if (text.indexOf(query) >= 0) return 100 - text.indexOf(query);
  var qi = 0, s = 0;
  for (var i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) { qi++; s += 1; }
  }
  return qi === query.length ? s : 0;
}

function buildItems(query) {
  query = query.trim().toLowerCase();
  var cmds = COMMANDS.filter(function (c) { return !c.hidden; })
    .map(function (c) { return { type: "cmd", cmd: c, s: Math.max(score(query, c.title) * 2, score(query, c.keys)) }; })
    .filter(function (x) { return x.s > 0; })
    .sort(function (a, b) { return b.s - a.s; });
  if (!query) return cmds.slice(0, 12);

  var entries = query.length < 2 ? [] : getEntries()
    .filter(function (e) { return e.text.toLowerCase().indexOf(query) >= 0; })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
    .slice(0, 6)
    .map(function (e) { return { type: "entry", entry: e }; });
  return cmds.slice(0, 8).concat(entries);
}

function snippet(text, query) {
  var i = text.toLowerCase().indexOf(query);
  var start = Math.max(0, i - 24);
  var s = (start > 0 ? "…" : "") + text.slice(start, start + 80).replace(/\n+/g, " ");
  return escapeHtml(s).replace(new RegExp(escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), function (m) { return "<mark>" + m + "</mark>"; });
}

function drawList() {
  var list = document.getElementById("paletteList");
  var query = document.getElementById("paletteInput").value.trim().toLowerCase();
  if (!pal.items.length) {
    list.innerHTML = '<li class="palette-empty">no command or entry matches “' + escapeHtml(query) + "”</li>";
    return;
  }
  var lastType = null;
  list.innerHTML = pal.items.map(function (it, i) {
    var head = "";
    if (it.type !== lastType) {
      head = '<li class="palette-group" role="presentation">' + (it.type === "cmd" ? "commands" : "entries") + "</li>";
      lastType = it.type;
    }
    var active = i === pal.index ? " is-active" : "";
    if (it.type === "cmd") {
      return head + '<li class="palette-item' + active + '" role="option" id="pal-' + i + '" data-index="' + i + '" aria-selected="' + (i === pal.index) + '">' +
        '<span class="palette-icon">' + cmdIcon(it.cmd) + '</span><span class="palette-title">' + escapeHtml(it.cmd.title) + "</span>" + (it.cmd.key ? "<kbd>" + escapeHtml(it.cmd.key) + "</kbd>" : "") + "</li>";
    }
    var st = STATUS[it.entry.mood];
    return head + '<li class="palette-item palette-entry' + active + '" role="option" id="pal-' + i + '" data-index="' + i + '" aria-selected="' + (i === pal.index) + '">' +
      '<span class="palette-icon mood-tag--' + it.entry.mood + '">' + icon(st.icon) + '</span><span class="palette-entry-text">' + snippet(it.entry.text, query) + "</span>" +
      '<span class="palette-entry-date">' + new Date(it.entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase() + "</span></li>";
  }).join("");
  document.getElementById("paletteInput").setAttribute("aria-activedescendant", "pal-" + pal.index);
  var activeEl = list.querySelector(".is-active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

function refresh() {
  pal.items = buildItems(document.getElementById("paletteInput").value);
  pal.index = 0;
  drawList();
}

function choose(i) {
  var it = pal.items[i];
  if (!it) return;
  closePalette(true);
  if (it.type === "cmd") it.cmd.run();
  else {
    navigateTo("journal");
    afterNav(function () { revealEntry(it.entry.id); });
  }
}

export function openPalette() {
  var el = document.getElementById("palette");
  if (!el || pal.open) return;
  closeHelp();
  pal.lastFocus = document.activeElement;
  pal.open = true;
  el.hidden = false;
  var input = document.getElementById("paletteInput");
  input.value = "";
  input.setAttribute("aria-expanded", "true");
  refresh();
  input.focus();
}

export function closePalette(skipRefocus) {
  var el = document.getElementById("palette");
  if (!el || !pal.open) return;
  pal.open = false;
  el.hidden = true;
  document.getElementById("paletteInput").setAttribute("aria-expanded", "false");
  if (!skipRefocus && pal.lastFocus && pal.lastFocus.focus) pal.lastFocus.focus();
}

/* ---------- help ---------- */

function shortcutRows() {
  var rows = [["ctrl k", "search and commands"], ["ctrl enter", "save the entry you're writing"]];
  COMMANDS.forEach(function (c) { if (c.key) rows.push([c.key, c.title]); });
  rows.push(["← →", "previous / next day in the day view"], ["esc", "close whatever is open"]);
  return '<dl class="shortcut-list">' + rows.map(function (r) {
    return "<div><dt>" + r[0].split(" ").map(function (k) { return "<kbd>" + escapeHtml(k) + "</kbd>"; }).join("") + "</dt><dd>" + escapeHtml(r[1]) + "</dd></div>";
  }).join("") + "</dl>";
}

function openHelp() {
  var el = document.getElementById("shortcutHelp");
  if (!el) return;
  closePalette(true);
  el.querySelector(".help-body").innerHTML = shortcutRows();
  el.hidden = false;
  el.querySelector(".viewer-close").focus();
}

function closeHelp() {
  var el = document.getElementById("shortcutHelp");
  if (el) el.hidden = true;
}

/* ---------- wiring ---------- */

function isTyping(target) {
  if (!target) return false;
  var tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function initPalette() {
  var input = document.getElementById("paletteInput");
  input.addEventListener("input", refresh);
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); pal.index = Math.min(pal.items.length - 1, pal.index + 1); drawList(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); pal.index = Math.max(0, pal.index - 1); drawList(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(pal.index); }
    else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
  });
  document.getElementById("paletteList").addEventListener("click", function (e) {
    var li = e.target.closest("[data-index]");
    if (li) choose(Number(li.getAttribute("data-index")));
  });
  document.querySelector("#palette .palette-backdrop").addEventListener("click", function () { closePalette(); });
  document.querySelector("#shortcutHelp .viewer-close").addEventListener("click", closeHelp);
  document.querySelector("#shortcutHelp .viewer-backdrop").addEventListener("click", closeHelp);

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-command]");
    if (!el) return;
    e.preventDefault();
    runCommand(el.getAttribute("data-command"), el);
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (pal.open) closePalette(); else openPalette();
      return;
    }
    if (e.key === "Escape") {
      if (pal.open) return closePalette();
      var help = document.getElementById("shortcutHelp");
      if (help && !help.hidden) return closeHelp();
      if (isDayViewerOpen()) return closeDayViewer();
      if (isTyping(e.target)) e.target.blur();
      return;
    }
    if (pal.open || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;

    if (isDayViewerOpen()) {
      if (e.key === "ArrowLeft") { e.preventDefault(); shiftDayViewer(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); shiftDayViewer(1); }
      return;
    }
    var help2 = document.getElementById("shortcutHelp");
    if (help2 && !help2.hidden) return;

    var cmd = COMMANDS.find(function (c) { return c.key && c.key === e.key; });
    if (cmd) {
      e.preventDefault();
      cmd.run();
    }
  });

  document.addEventListener("logbook:settings-rendered", function () {
    var list = document.getElementById("shortcutList");
    if (list) list.innerHTML = shortcutRows();
  });
  var list = document.getElementById("shortcutList");
  if (list) list.innerHTML = shortcutRows();
}
