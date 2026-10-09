/* Gentle nudges: plan in the morning, reflect at night. Only fires if
   that part of the daily page is still empty. Works while the app is open
   (or installed and running); a toast, plus a notification if allowed. */
import { getPrefs, setPrefs } from './prefs.js';
import { apiGetDay } from './api.js';
import { dateKey } from './dayRecord.js';
import { navigateTo } from './navigation.js';
import { toast } from './toast.js';

var KEY = "logbook-reminded";

var KINDS = {
  morning: { label: "morning plan", hint: "if today's intention and focus are empty", pref: "remindMorning", at: "remindMorningAt", def: "08:00",
    empty: function (d) { return !d.morning.intention.trim() && !d.morning.mainFocus.trim(); },
    message: "morning. what's the one thing that makes today count?", target: "#mainFocus" },
  evening: { label: "night reflection", hint: "if tonight's journal is still empty", pref: "remindEvening", at: "remindEveningAt", def: "21:30",
    empty: function (d) { return !d.journal.trim() && !d.nightReflection.wins.trim(); },
    message: "day's almost done. two minutes to reflect?", target: "#dailyJournal" }
};

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
    if (patch[r.pref]) toast(r.label + " reminder on at " + (getPrefs()[r.at] || r.def));
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
    // evening reminders stop at 3am; morning ones by noon
    if ((k === "morning" && hhmm >= "12:00")) continue;
    var day;
    try { day = await apiGetDay(today); } catch (e) { continue; }
    markFired(k, today);
    if (!r.empty(day)) continue;
    notify(r);
  }
}

function notify(r) {
  toast(r.message, "ok", {
    duration: 15000,
    action: { label: "open", run: function () { navigateTo("dashboard"); setTimeout(function () { var el = document.querySelector(r.target); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } }, 80); } }
  });
  if (getPrefs().notifications && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try { new Notification("logbook", { body: r.message, tag: "logbook-reminder" }); } catch (e) {}
  }
}

export function startReminders() {
  setTimeout(check, 4000);
  setInterval(check, 60000);
}
