import { apiListEntries, apiGetDay, apiListTasks, apiListActivities, apiGetPomodoroDay, apiListHabits, apiHabitLogs } from './api.js';
import { dateKey, deriveTimelineFromEntries, deriveMoodFromEntries } from './dayRecord.js';
import { categoryById, habitIcon } from './categories.js';
import { escapeHtml } from './utils.js';
import { STATUS, moodTag } from './entries.js';
import { icon } from './icons.js';

/* Everything recorded for one day, in one panel. Opened from the
   calendar, the density map, journal entries, and "on this day". */
var openDate = null;
var lastFocus = null;

function parseKey(dateStr) {
  var p = dateStr.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function shiftKey(dateStr, days) {
  var d = parseKey(dateStr);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function block(label, html) {
  if (!html) return "";
  return '<section class="viewer-row"><h4 class="section-label">' + label + "</h4>" + html + "</section>";
}

function text(value) {
  var t = (value || "").toString().trim();
  return t ? '<p class="viewer-text">' + escapeHtml(t) + "</p>" : "";
}

function minutes(ms) {
  var m = Math.round(ms / 60000);
  return m < 60 ? m + " min" : Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
}

export async function openDayViewer(dateStr) {
  var overlay = document.getElementById("dayViewer");
  if (!overlay || !dateStr) return;
  if (!openDate) lastFocus = document.activeElement;
  openDate = dateStr;

  overlay.innerHTML = '<div class="viewer-backdrop"></div><div class="viewer-panel" role="dialog" aria-modal="true" aria-label="day record"><p class="viewer-empty">loading…</p></div>';
  overlay.hidden = false;
  overlay.classList.add("is-open");
  document.body.classList.add("has-overlay");

  var data;
  try {
    data = await Promise.all([
      apiListEntries(),
      apiGetDay(dateStr),
      apiListTasks({ day_date: dateStr }),
      apiListActivities({ day_date: dateStr }),
      apiGetPomodoroDay(dateStr),
      Promise.all([apiListHabits(true), apiHabitLogs(dateStr, dateStr)]).catch(function () { return [[], []]; })
    ]);
  } catch (e) {
    overlay.querySelector(".viewer-panel").innerHTML = '<p class="viewer-empty">couldn\'t load this day. is the backend running?</p>';
    return;
  }
  if (openDate !== dateStr) return; // user already moved to another day

  var entries = data[0], day = data[1], tasks = data[2], activities = data[3], focus = data[4];
  var habitNames = {};
  data[5][0].forEach(function (h) { habitNames[h.id] = habitIcon(h) + "<span>" + escapeHtml(h.name) + "</span>"; });
  var habitsDone = data[5][1].map(function (l) { return habitNames[l.habitId]; }).filter(Boolean);
  var timeline = deriveTimelineFromEntries(entries, dateStr);
  var mood = deriveMoodFromEntries(entries, dateStr);

  var moodHtml = "";
  if (mood && STATUS[mood]) {
    var s = STATUS[mood];
    moodHtml = '<div class="viewer-mood">' + moodTag(mood) + '<span class="viewer-mood-note">how the day ended</span></div>';
  }

  var stats = [];
  if (timeline.length) stats.push(timeline.length + (timeline.length === 1 ? " entry" : " entries"));
  if (tasks.length) stats.push(tasks.filter(function (t) { return t.completed; }).length + "/" + tasks.length + " tasks");
  if (focus.focus_ms) stats.push(minutes(focus.focus_ms) + " focus");
  var actMins = activities.reduce(function (n, a) { return n + (a.durationMinutes || 0); }, 0);
  if (actMins) stats.push(minutes(actMins * 60000) + " logged");
  if (habitsDone.length) stats.push(habitsDone.length + (habitsDone.length === 1 ? " habit" : " habits"));

  var timelineHtml = timeline.length
    ? '<ol class="viewer-timeline">' + timeline.map(function (t) {
        var st = STATUS[t.mood];
        var time = new Date(t.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
        return '<li><span class="viewer-time">' + time + '</span><span class="viewer-mood-icon mood-tag--' + t.mood + '" title="' + st.label + '">' + icon(st.icon) + '</span><span class="viewer-text">' + escapeHtml(t.text) + "</span></li>";
      }).join("") + "</ol>"
    : "";

  var tasksHtml = tasks.length
    ? '<ul class="viewer-list">' + tasks.map(function (t) {
        return '<li class="' + (t.completed ? "is-done" : "") + '">' + icon(t.completed ? "circle-check" : "clock") + "<span>" + escapeHtml(t.title) + "</span></li>";
      }).join("") + "</ul>"
    : "";

  var activitiesHtml = activities.length
    ? '<ul class="viewer-list">' + activities.map(function (a) {
        var cat = categoryById(a.activityCategory);
        return "<li>" + (cat ? icon(cat.icon) : icon("activity")) + "<span>" + escapeHtml(a.title) + "</span>" + (a.durationMinutes ? ' <span class="viewer-dim">' + a.durationMinutes + " min</span>" : "") + "</li>";
      }).join("") + "</ul>"
    : "";

  var n = day.nightReflection;
  var body =
    block("intention", text(day.morning.intention)) +
    block("main focus", text(day.morning.mainFocus)) +
    block("entries", timelineHtml) +
    block("tasks", tasksHtml) +
    block("activity", activitiesHtml) +
    block("habits", habitsDone.length ? '<ul class="viewer-list viewer-list--habits">' + habitsDone.map(function (h) { return "<li>" + h + "</li>"; }).join("") + "</ul>" : "") +
    block("notes", text(day.journal)) +
    block("wins", text(n.wins)) +
    block("lessons", text(n.lessons)) +
    block("gratitude", text(n.gratitude)) +
    block("tomorrow's plan", text(n.tomorrowPlan)) +
    block("brain dump", text(day.brainDump));

  var isFuture = dateStr > dateKey(new Date());
  var panel = overlay.querySelector(".viewer-panel");
  panel.innerHTML =
    '<header class="viewer-header">' +
      '<button type="button" class="viewer-nav icon-btn" data-viewer-shift="-1" aria-label="previous day">' + icon("chevron-left") + "</button>" +
      '<div class="viewer-heading">' +
        '<div class="viewer-date">' + parseKey(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toLowerCase() + "</div>" +
        (stats.length ? '<div class="viewer-stats">' + stats.map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div>" : "") +
      "</div>" +
      '<button type="button" class="viewer-nav icon-btn" data-viewer-shift="1" aria-label="next day"' + (isFuture ? " disabled" : "") + ">" + icon("chevron-right") + "</button>" +
      '<button type="button" class="viewer-close icon-btn" id="dayViewerClose" aria-label="close">' + icon("x") + "</button>" +
    "</header>" +
    moodHtml +
    (body || '<p class="viewer-empty">nothing recorded on this day.</p>');

  overlay.querySelector(".viewer-backdrop").onclick = closeDayViewer;
  panel.onclick = function (e) {
    var shift = e.target.closest("[data-viewer-shift]");
    if (shift) openDayViewer(shiftKey(openDate, Number(shift.getAttribute("data-viewer-shift"))));
    if (e.target.closest("#dayViewerClose")) closeDayViewer();
  };
  document.getElementById("dayViewerClose").focus();
}

export function isDayViewerOpen() {
  return Boolean(openDate);
}

export function shiftDayViewer(days) {
  if (openDate) openDayViewer(shiftKey(openDate, days));
}

export function closeDayViewer() {
  var overlay = document.getElementById("dayViewer");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  overlay.innerHTML = "";
  openDate = null;
  document.body.classList.remove("has-overlay");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
