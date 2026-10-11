/* Gentle nudges that match the Today page: plan the day in the morning
   (the focus line and today's tasks), close it at night (Tonight: a win,
   a lesson, gratitude, tomorrow's tasks). Each one only fires if that part
   is still empty. Works while the app is open (or installed and running);
   a toast, plus a notification if allowed. */
import { getPrefs, setPrefs } from './prefs.js';
import { apiGetDay, apiListTasks } from './api.js';
import { dateKey } from './dayRecord.js';
import { navigateTo } from './navigation.js';
import { toast } from './toast.js';

var KEY = "logbook-reminded";

function has(v) { return String(v || "").trim() !== ""; }

/* a failed request throws, so check() skips the reminder rather than guess */
async function tasksOn(day) {
  return (await apiListTasks({ day_date: day })).length;
}

var KINDS = {
  morning: { label: "Plan the day", hint: "If today has no focus line or tasks yet", pref: "remindMorning", at: "remindMorningAt", def: "08:00",
    empty: async function (d, today) {
      if (has(d.morning.mainFocus) || has(d.morning.intention)) return false;
      return !(await tasksOn(today));
    },
    message: "Morning. What's the one thing that would make today count?", target: "#mainFocus" },
  evening: { label: "Close the day", hint: "If Tonight is still empty: no win, lesson, gratitude or tasks for tomorrow", pref: "remindEvening", at: "remindEveningAt", def: "21:30",
    empty: async function (d, today) {
      var n = d.nightReflection;
      if (has(n.wins) || has(n.lessons) || has(n.gratitude) || has(n.tomorrowPlan) || has(d.journal)) return false;
      var t = new Date(today + "T12:00:00");
      t.setDate(t.getDate() + 1);
      return !(await tasksOn(dateKey(t)));
    },
    message: "The day's almost done. Two minutes to close it?", target: "#nightWins", open: "#nightCard" }
};

/* 21:30, or 9:30 PM when the clock is set to 12 hours */
function clockText(hhmm) {
  if (getPrefs().clock24 !== false) return hhmm;
  var h = Number(hhmm.slice(0, 2)), m = hhmm.slice(3, 5);
  return ((h % 12) || 12) + ":" + m + (h < 12 ? " AM" : " PM");
}

function fired() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
}

function markFired(kind, day) {
  var f = fired();
  f[kind] = day;
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch (e) {}
}

export function renderReminderRows() {
  var p = getPrefs();
  return Object.keys(KINDS).map(function (k) {
    var r = KINDS[k];
    return '<div class="setting-row reminder-row">' +
      '<span class="setting-text"><span class="setting-label">' + r.label + '</span><span class="setting-hint">' + r.hint + "</span></span>" +
      '<span class="reminder-controls"><input type="time" class="text-input text-input--time" data-reminder-at="' + k + '" value="' + (p[r.at] || r.def) + '">' +
      '<input type="checkbox" class="switch" data-reminder="' + k + '"' + (p[r.pref] ? " checked" : "") + ' aria-label="' + r.label + ' reminder"></span>' +
    "</div>";
  }).join("");
}

export function wireReminderRows(el) {
  if (!el) return;
  el.addEventListener("change", function (e) {
    var k = e.target.getAttribute("data-reminder") || e.target.getAttribute("data-reminder-at");
    if (!k) return;
    var r = KINDS[k];
    var patch = {};
    if (e.target.hasAttribute("data-reminder")) patch[r.pref] = e.target.checked;
    else patch[r.at] = e.target.value || r.def;
    setPrefs(patch);
    var on = getPrefs()[r.pref];
    if (patch[r.pref] || (on && patch[r.at])) toast(r.label + ": every day at " + clockText(getPrefs()[r.at] || r.def));
  });
}

async function check() {
  var p = getPrefs();
  var now = new Date();
  var today = dateKey(now);
  var hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  for (var k of Object.keys(KINDS)) {
    var r = KINDS[k];
    if (!p[r.pref] || fired()[k] === today || hhmm < (p[r.at] || r.def)) continue;
    // the morning one gives up at noon; the evening one when the day turns over
    if (k === "morning" && hhmm >= "12:00") continue;
    var day, empty;
    try {
      day = await apiGetDay(today);
      empty = await r.empty(day, today);
    } catch (e) { continue; }
    markFired(k, today);
    if (empty) notify(r);
  }
}

function openTarget(r) {
  navigateTo("dashboard");
  setTimeout(function () {
    var fold = r.open && document.querySelector(r.open);
    if (fold && "open" in fold) fold.open = true;
    var el = document.querySelector(r.target);
    // the card may be switched off in settings: then the page itself is enough
    if (!el || !el.offsetParent) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }, 120);
}

function notify(r) {
  toast(r.message, "ok", {
    duration: 15000,
    action: { label: "Open", run: function () { openTarget(r); } }
  });
  if (getPrefs().notifications && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try { new Notification("Logbook", { body: r.message, tag: "logbook-reminder" }); } catch (e) {}
  }
}

export function startReminders() {
  setTimeout(check, 4000);
  setInterval(check, 60000);
}
