import { getEntries } from './journal.js';
import { getTodayTasks } from './tasks.js';
import { getTodayFocus } from './pomodoro.js';
import { calcStreak } from './stats.js';
import { STATUS } from './entries.js';
import { dateKey } from './dayRecord.js';
import { getPrefs } from './prefs.js';
import { onChange } from './bus.js';

/* The dashboard's opening console: a live clock and one readout line that
   answers "how is today going" at a glance. */
var clockTimer = null;

export function greeting(date) {
  var h = (date || new Date()).getHours();
  if (h < 5) return "still up";
  if (h < 12) return "good morning";
  if (h < 17) return "good afternoon";
  if (h < 22) return "good evening";
  return "winding down";
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function readout() {
  var entries = getEntries();
  var today = dateKey(new Date());
  var todays = entries.filter(function (e) { return dateKey(e.date) === today; });
  var latest = todays.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); })[0];
  var tasks = getTodayTasks();
  var done = tasks.filter(function (t) { return t.completed; }).length;
  var focus = getTodayFocus();
  var streak = calcStreak(entries);
  var focusMin = Math.round(focus.focusMs / 60000);

  var cells = [
    { k: "streak", v: streak + "d", warn: streak > 0 && !todays.length, hint: streak > 0 && !todays.length ? "write today to keep it" : "" },
    { k: "entries", v: String(todays.length) },
    { k: "tasks", v: tasks.length ? done + "/" + tasks.length : "none" },
    { k: "focus", v: focusMin + "m" + (focus.running && focus.mode === "focus" ? " ▶" : "") }
  ];
  if (latest) cells.push({ k: "status", v: STATUS[latest.mood].code + " " + STATUS[latest.mood].label, color: STATUS[latest.mood].color });

  return cells.map(function (c) {
    return '<div class="readout-cell' + (c.warn ? " is-warn" : "") + '"' + (c.hint ? ' title="' + c.hint + '"' : "") + ">" +
      '<span class="readout-key">' + c.k + "</span>" +
      '<span class="readout-val"' + (c.color ? ' style="color:' + c.color + '"' : "") + ">" + c.v + "</span>" +
    "</div>";
  }).join("");
}

function tickClock() {
  var now = new Date();
  var hm = document.getElementById("consoleClock");
  var sec = document.getElementById("consoleSeconds");
  var greet = document.getElementById("consoleGreeting");
  if (!hm) return;
  hm.textContent = pad(now.getHours()) + ":" + pad(now.getMinutes());
  sec.textContent = pad(now.getSeconds());
  greet.textContent = greeting(now) + ", " + getPrefs().name;
}

export function renderTodayConsole() {
  var el = document.getElementById("todayConsole");
  if (!el) return;
  var now = new Date();
  el.innerHTML =
    '<div class="console-top">' +
      '<p class="console-greeting" id="consoleGreeting"></p>' +
      '<p class="console-date">' + now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase() + "</p>" +
    "</div>" +
    '<div class="console-clock" aria-hidden="true"><span id="consoleClock">--:--</span><span class="console-seconds" id="consoleSeconds">--</span></div>' +
    '<div class="console-readout" id="consoleReadout">' + readout() + "</div>" +
    '<div class="console-actions">' +
      '<button type="button" class="primary-btn" data-command="write">write entry</button>' +
      '<button type="button" class="tool-btn" data-command="focus-toggle">' + (getTodayFocus().running ? "focus running" : "start focus") + "</button>" +
      '<button type="button" class="tool-btn" data-command="add-task">add task</button>' +
      '<button type="button" class="tool-btn console-palette" data-command="palette"><kbd>ctrl</kbd><kbd>k</kbd> all commands</button>' +
    "</div>";
  tickClock();
  if (!clockTimer) clockTimer = setInterval(tickClock, 1000);
}

export function refreshReadout() {
  var r = document.getElementById("consoleReadout");
  if (r) r.innerHTML = readout();
  var btn = document.querySelector('#todayConsole [data-command="focus-toggle"]');
  if (btn) btn.textContent = getTodayFocus().running ? "focus running" : "start focus";
}

onChange(refreshReadout);
document.addEventListener("logbook:pomodoro", refreshReadout);
