import { getEntries } from './journal.js';
import { upcoming, dueAt, displayTitle } from './deadlines.js';
import { calcStreak } from './stats.js';
import { dateKey } from './dayRecord.js';
import { getPrefs } from './prefs.js';
import { getProfile } from './profile.js';
import { onChange } from './bus.js';

/* Notifications on the phone that arrive with the app closed (Android app
   only, Capacitor Local Notifications). Planned ahead whenever your data
   changes, and replaced each time:
   - a deadline: the day before and two hours before
   - the streak: at 21:00 if you haven't written that day (only for days
     still ahead; writing today takes tonight's off)
   Settings → Reminders turns them on ("phoneNotify"). */

var ID_BASE = 7000;          // our notifications use ids 7000..7999
var timer = null;

function plugin() {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
  return (C.Plugins && C.Plugins.LocalNotifications) || null;
}

export function phoneNotifyAvailable() { return Boolean(plugin()); }

export async function askPermission() {
  var p = plugin();
  if (!p) return false;
  try {
    var r = await p.requestPermissions();
    return r && r.display === "granted";
  } catch (e) {
    return false;
  }
}

function pet() { return getProfile().petName || getPrefs().mascotName || "Mochi"; }

function plan() {
  var now = Date.now();
  var out = [];
  var id = ID_BASE;
  // deadlines: a day before, and two hours before
  upcoming().slice(0, 40).forEach(function (d) {
    var at = dueAt(d, d.nextDate).getTime();
    var title = displayTitle(d, d.nextDate);
    var day = at - 86400000, soon = at - 2 * 3600000;
    if (day > now) out.push({ id: id++, title: title + " is tomorrow", body: d.dueTime ? "Due at " + d.dueTime + " tomorrow." : "Due tomorrow.", at: day });
    if (soon > now) out.push({ id: id++, title: title + ": 2 hours left", body: d.kind === "birthday" ? "Their day is almost here." : "You've got this.", at: soon });
  });
  // the streak, at 21:00 on each of the next 7 evenings you haven't written yet
  var entries = getEntries();
  var streak = calcStreak(entries);
  var today = dateKey(new Date());
  var wroteToday = entries.some(function (e) { return dateKey(e.date) === today; });
  for (var i = 0; i < 7; i++) {
    var evening = new Date();
    evening.setDate(evening.getDate() + i);
    evening.setHours(21, 0, 0, 0);
    if (evening.getTime() <= now || (i === 0 && wroteToday)) continue;
    out.push({
      id: id++,
      title: i === 0 && streak ? "Your " + streak + "-day streak is waiting" : "A line before bed?",
      body: pet() + ": one sentence about today is enough.",
      at: evening.getTime()
    });
  }
  return out.filter(function (n) { return n.at - now < 30 * 86400000; }).slice(0, 60);
}

async function sync() {
  var p = plugin();
  if (!p) return;
  try {
    var pending = await p.getPending();
    var ours = (pending && pending.notifications || []).filter(function (n) { return n.id >= ID_BASE && n.id < ID_BASE + 1000; });
    if (ours.length) await p.cancel({ notifications: ours.map(function (n) { return { id: n.id }; }) });
    if (!getPrefs().phoneNotify) return;
    var list = plan();
    if (!list.length) return;
    await p.schedule({
      notifications: list.map(function (n) {
        return { id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at) } };
      })
    });
  } catch (e) {
    console.warn("logbook: phone notifications", e);
  }
}

export function refreshPhoneNotify() {
  if (!plugin()) return;
  clearTimeout(timer);
  timer = setTimeout(sync, 1500);
}

export function startPhoneNotify() {
  if (!plugin()) return;
  onChange(refreshPhoneNotify);
  document.addEventListener("logbook:prefs-changed", function (e) {
    if ("phoneNotify" in ((e.detail && e.detail.patch) || {})) refreshPhoneNotify();
  });
  refreshPhoneNotify();
}
