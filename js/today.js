import { getEntries } from './journal.js';
import { getTodayTasks } from './tasks.js';
import { getTodayFocus } from './pomodoro.js';
import { calcStreak } from './stats.js';
import { STATUS } from './entries.js';
import { dateKey } from './dayRecord.js';
import { getPrefs } from './prefs.js';
import { onChange } from './bus.js';
import { icon } from './icons.js';
import { sceneSvg } from './scene.js';

/* The top of the dashboard: a window onto the night, the time, and a few
   numbers that answer "how is today going" at a glance. */
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
  var atRisk = streak > 0 && !todays.length;

  var cells = [
    { k: "streak", i: "flame", v: streak + (streak === 1 ? " day" : " days"), warn: atRisk, hint: atRisk ? "write today to keep it" : "" },
    { k: "tasks", i: "list-checks", v: tasks.length ? done + " of " + tasks.length : "none yet" },
    { k: "focus", i: "timer", v: focusMin + " min", live: focus.running && focus.mode === "focus" }
  ];
  if (latest && STATUS[latest.mood]) cells.push({ k: "today felt", i: STATUS[latest.mood].icon, v: STATUS[latest.mood].label, mood: latest.mood });
  else cells.push({ k: "entries", i: "feather", v: todays.length ? String(todays.length) : "none yet" });

  return cells.map(function (c) {
    return '<div class="readout-cell' + (c.warn ? " is-warn" : "") + (c.live ? " is-live" : "") + (c.mood ? " readout-cell--" + c.mood : "") + '"' + (c.hint ? ' title="' + c.hint + '"' : "") + ">" +
      '<span class="readout-icon">' + icon(c.i) + "</span>" +
      '<span class="readout-text"><span class="readout-key">' + c.k + (c.warn ? " at risk" : "") + '</span><span class="readout-val">' + c.v + "</span></span>" +
    "</div>";
  }).join("");
}

function focusLabel() {
  return getTodayFocus().running ? icon("pause") + "<span>focus running</span>" : icon("timer") + "<span>start focus</span>";
}

function tickClock() {
  var now = new Date();
  var hm = document.getElementById("consoleClock");
  var greet = document.getElementById("consoleGreeting");
  if (!hm) return;
  var text = pad(now.getHours()) + ":" + pad(now.getMinutes());
  if (hm.textContent !== text) hm.textContent = text;
  var g = greeting(now) + ", " + getPrefs().name;
  if (greet.textContent !== g) greet.textContent = g;
}

export function renderTodayConsole() {
  var el = document.getElementById("todayConsole");
  if (!el) return;
  var now = new Date();
  el.innerHTML =
    '<div class="hero-scene">' + sceneSvg(window.innerWidth < 700 ? { crop: "peak" } : null) + '<div class="hero-rain" aria-hidden="true"></div></div>' +
    '<div class="hero-body">' +
      '<div class="hero-top">' +
        '<p class="console-date">' + now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase() + "</p>" +
        '<h2 class="console-greeting" id="consoleGreeting"></h2>' +
        '<div class="console-clock" aria-hidden="true"><span id="consoleClock">--:--</span></div>' +
      "</div>" +
      '<div class="console-readout" id="consoleReadout">' + readout() + "</div>" +
      '<div class="console-actions">' +
        '<button type="button" class="primary-btn" data-command="write">' + icon("feather") + "<span>write entry</span></button>" +
        '<button type="button" class="tool-btn tool-btn--glass" data-command="focus-toggle" id="heroFocusBtn">' + focusLabel() + "</button>" +
        '<button type="button" class="tool-btn tool-btn--glass" data-command="add-task">' + icon("plus") + "<span>add task</span></button>" +
      "</div>" +
    "</div>";
  tickClock();
  if (!clockTimer) clockTimer = setInterval(tickClock, 1000);
}

export function refreshReadout() {
  var r = document.getElementById("consoleReadout");
  if (r) r.innerHTML = readout();
  var btn = document.getElementById("heroFocusBtn");
  if (btn) btn.innerHTML = focusLabel();
}

onChange(refreshReadout);
document.addEventListener("logbook:pomodoro", refreshReadout);
