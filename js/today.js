import { getEntries } from './journal.js';
import { getTodayTasks } from './tasks.js';
import { getTodayFocus } from './pomodoro.js';
import { calcStreak, streakDetail } from './stats.js';
import { STATUS } from './entries.js';
import { dateKey } from './dayRecord.js';
import { displayName, getPrefs } from './prefs.js';
import { onChange } from './bus.js';
import { icon } from './icons.js';
import { sceneSvg } from './scene.js';
import { mountMascot } from './mascot.js';
import { upcoming, daysUntil, countdownLabel, KINDS, displayTitle } from './deadlines.js';

/* The top of the dashboard: a window onto the night, the time, and a few
   numbers that answer "how is today going" at a glance. */
var clockTimer = null;

export function greeting(date) {
  var h = (date || new Date()).getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Winding down";
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
  var detail = entries.length ? streakDetail(entries) : { streak: 0, saved: [], charmReady: true };
  var streak = detail.streak;
  lastCharm = detail;
  var focusMin = Math.round(focus.focusMs / 60000);
  var atRisk = streak > 0 && !todays.length;

  // each number is also the way in: tap it to go where it's made
  var cells = [
    { k: "Streak", i: "flame", v: streak ? streak + (streak === 1 ? " day" : " days") : "Start today", warn: atRisk, hint: atRisk ? "Write today to keep it" : "Days in a row with an entry", cmd: "write", charm: true },
    { k: "Tasks", i: "list-checks", v: tasks.length ? done + " of " + tasks.length : "None yet", hint: "Go to today's tasks", cmd: "tasks" },
    { k: "Focus", i: "timer", v: minutesLabel(focusMin), live: focus.running && focus.mode === "focus", hint: "Open the focus space", nav: "focus" }
  ];
  if (latest && STATUS[latest.mood]) cells.push({ k: "Today felt", i: STATUS[latest.mood].icon, v: cap(STATUS[latest.mood].label), mood: latest.mood, hint: "Open the journal", nav: "journal" });
  else cells.push({ k: "Entries", i: "feather", v: todays.length ? String(todays.length) : "None yet", hint: "Open the journal", nav: "journal" });
  // the nearest date that matters, if it's within a month
  var next = upcoming().filter(function (d) { return daysUntil(d.nextDate) >= 0; })[0];
  if (next && daysUntil(next.nextDate) <= 30) {
    var dl = daysUntil(next.nextDate);
    var nt = displayTitle(next, next.nextDate);
    cells.push({ k: escapeText(nt.length > 22 ? nt.slice(0, 21) + "…" : nt), i: (KINDS[next.kind] || KINDS.deadline).icon,
      v: countdownLabel(dl), warn: false, soon: dl <= 3, due: true, hint: "See it on the calendar", nav: "calendar" });
  }

  return cells.map(function (c) {
    var attrs = c.cmd ? ' data-command="' + c.cmd + '"' : ' data-nav-target="' + c.nav + '"';
    return '<button type="button" class="readout-cell' + (c.warn ? " is-warn" : "") + (c.soon ? " is-soon" : "") + (c.due ? " is-due" : "") + (c.live ? " is-live" : "") + (c.mood ? " readout-cell--" + c.mood : "") + '"' + attrs + ' title="' + c.hint + '">' +
      '<span class="readout-icon">' + icon(c.i) + "</span>" +
      '<span class="readout-text"><span class="readout-key">' + c.k + (c.warn ? " at risk" : "") + '</span><span class="readout-val">' + c.v + "</span></span>" +
      (c.charm ? charm(detail) : "") +
    "</button>";
  }).join("");
}

function cap(s) {
  return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
}

function minutesLabel(m) {
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
}

/* "friend" stands in when no name is set; it reads as a word, not a name */
function who() {
  var name = displayName();
  return name === "Friend" && !String(getPrefs().name || "").trim() ? "friend" : name;
}

function tickClock() {
  var now = new Date();
  var hm = document.getElementById("consoleClock");
  var greet = document.getElementById("consoleGreeting");
  if (!hm) return;
  var h24 = getPrefs().clock24 !== false;
  var text = h24 ? pad(now.getHours()) + ":" + pad(now.getMinutes()) : ((now.getHours() % 12) || 12) + ":" + pad(now.getMinutes());
  var ampm = document.getElementById("consoleAmPm");
  if (ampm) ampm.textContent = h24 ? "" : (now.getHours() < 12 ? "AM" : "PM");
  if (hm.textContent !== text) hm.textContent = text;
  var g = greeting(now) + ", " + who();
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
        '<p class="console-date">' + now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + "</p>" +
        '<h2 class="console-greeting" id="consoleGreeting"></h2>' +
        '<div class="console-clock" aria-hidden="true"><span id="consoleClock">--:--</span><span class="console-ampm" id="consoleAmPm"></span></div>' +
      "</div>" +
      '<div class="console-readout" id="consoleReadout">' + readout() + "</div>" +
      '<div class="console-actions">' +
        '<button type="button" class="primary-btn primary-btn--lg" data-command="write">' + icon("feather") + "<span>Write today's entry</span></button>" +
      "</div>" +
    "</div>";
  tickClock();
  try { mountMascot(el, { size: "md", place: "dash" }); } catch (e) { console.warn("logbook: mascot", e); }
  if (!clockTimer) clockTimer = setInterval(tickClock, 1000);
}

export function tickNow() {
  tickClock();
}

export function refreshReadout() {
  var r = document.getElementById("consoleReadout");
  if (r) r.innerHTML = readout();
  celebrateCharm(r);
}

/* The streak charm: an omamori that forgives one missed day a week. Ready,
   it glows faintly; once it has saved the streak, it shows its crack until
   Monday brings a new one. */
var lastCharm = null;
var CHARM_SEEN = "logbook-charm-seen";

function charm(d) {
  var used = !d.charmReady;
  return '<span class="charm' + (used ? " is-used" : "") + '" title="' + (used ? "Your streak charm saved a missed day this week. A new one comes on Monday." : "Streak charm: forgives one missed day this week") + '" aria-label="' + (used ? "Streak charm used this week" : "Streak charm ready") + '">' +
    '<svg class="charm-svg" viewBox="0 0 20 30" aria-hidden="true">' +
      '<path class="charm-cord" d="M10 1.2 C 6.4 1.2, 6.6 5.6, 10 6.6 C 13.4 5.6, 13.6 1.2, 10 1.2"/>' +
      '<path class="charm-pouch" d="M4 9.4 L 7 6.6 L 13 6.6 L 16 9.4 L 16 26 Q 16 28.2 13.8 28.2 L 6.2 28.2 Q 4 28.2 4 26 Z"/>' +
      '<path class="charm-band" d="M4 12.6 H 16"/>' +
      '<path class="charm-mark" d="M10 16 l 2.4 2.8 l -2.4 2.8 l -2.4 -2.8 z"/>' +
      '<circle class="charm-knot" cx="10" cy="6.8" r="1.5"/>' +
      '<path class="charm-crack" d="M7 13.4 L 10.2 17.2 L 8.6 20.4 L 12.4 25.6"/>' +
    "</svg></span>";
}

function celebrateCharm(root) {
  var d = lastCharm;
  if (!root || !d || !d.saved.length) return;
  var key = d.saved[0].toDateString();
  var seen = null;
  try { seen = localStorage.getItem(CHARM_SEEN); } catch (e) {}
  if (seen === key || Date.now() - d.saved[0].getTime() > 3 * 86400000) return;
  try { localStorage.setItem(CHARM_SEEN, key); } catch (e) {}
  var el = root.querySelector(".charm");
  if (!el) return;
  el.classList.add("is-saving");
  setTimeout(function () {
    import('./mascot.js').then(function (m) { m.mascotReact("cheer"); m.mascotSay("You missed a day, so I used your charm. I've got you this time."); });
  }, 900);
}

onChange(refreshReadout);
document.addEventListener("logbook:pomodoro", refreshReadout);

function escapeText(t) {
  return String(t).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; });
}
