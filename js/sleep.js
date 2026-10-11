import { apiListSleep, apiSaveSleep, apiDeleteSleep } from './api.js';
import { getEntries } from './journal.js';
import { dateKey } from './dayRecord.js';
import { icon } from './icons.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { mascotReact, mascotSay } from './mascot.js';

/* Sleep: a night is filed under the morning you woke up. The card shows
   last night, a strip of the last two weeks drawn as small night skies (the
   taller the sky, the longer you slept), and once there's enough of it, what
   your sleep seems to do to your days. */

var NIGHTS = 14;
var nights = [];
var editing = false;

function shift(key, days) {
  var p = key.split("-").map(Number);
  return dateKey(new Date(p[0], p[1] - 1, p[2] + days));
}

export function hm(m) {
  if (m == null) return "";
  var h = Math.floor(m / 60), r = m % 60;
  return h ? h + "h " + (r < 10 ? "0" : "") + r + "m" : r + " min";
}

function byDate() {
  var map = {};
  nights.forEach(function (n) { map[n.date] = n; });
  return map;
}

/* Where the next tap goes: to bed (evening, nothing open), up (in bed), or
   a form to fill in last night. */
function state() {
  var today = dateKey(new Date());
  var map = byDate();
  var hour = new Date().getHours();
  var tonight = hour >= 12 ? shift(today, 1) : today;
  var open = map[tonight] && map[tonight].bedAt && !map[tonight].wakeAt ? map[tonight] : null;
  if (!open && hour < 12 && map[today] && map[today].bedAt && !map[today].wakeAt) open = map[today];
  if (open) return { kind: "wake", night: open };
  if (hour >= 19 || hour < 4) return { kind: "bed", date: tonight };
  return { kind: "log", date: today };
}

/* good days after good nights: needs a few of each to say anything */
function insight() {
  var score = { good: 2, okay: 1, rough: 0 };
  var moodByDay = {};
  getEntries().forEach(function (e) {
    var k = dateKey(e.date);
    (moodByDay[k] = moodByDay[k] || []).push(score[e.mood]);
  });
  var rested = [], short = [];
  nights.forEach(function (n) {
    if (n.minutes == null || !moodByDay[n.date]) return;
    var avg = moodByDay[n.date].reduce(function (a, b) { return a + b; }, 0) / moodByDay[n.date].length;
    (n.minutes >= 420 ? rested : short).push(avg);
  });
  if (rested.length < 3 || short.length < 3) return "";
  var mean = function (l) { return l.reduce(function (a, b) { return a + b; }, 0) / l.length; };
  var diff = mean(rested) - mean(short);
  if (diff > 0.35) return "Your days go better after 7 hours or more.";
  if (diff < -0.35) return "Oddly, your shorter nights come before your better days.";
  return "";
}

function sky(n, key, idx) {
  var mins = n && n.minutes != null ? n.minutes : null;
  var h = mins == null ? 0 : Math.max(0.08, Math.min(1, mins / 600));
  var stars = mins == null ? 0 : Math.max(1, Math.min(5, Math.round(mins / 90)));
  var label = new Date(key + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  var out = '<span class="night' + (mins == null ? " is-empty" : mins >= 420 ? " is-rested" : "") + '" style="--i:' + idx + '" title="' + label + (mins == null ? ": nothing logged" : ": " + hm(mins)) + '">';
  if (mins != null) {
    out += '<span class="night-sky" style="--h:' + h.toFixed(3) + '">';
    for (var i = 0; i < stars; i++) out += '<i style="--x:' + ((i * 37 + key.charCodeAt(9) * 7) % 80 + 10) + "%;--y:" + ((i * 53 + key.charCodeAt(8) * 11) % 70 + 8) + '%"></i>';
    out += "</span>";
  }
  return out + "</span>";
}

function draw() {
  var el = document.getElementById("sleepSection");
  if (!el) return;
  var today = dateKey(new Date());
  var map = byDate();
  var last = map[today] && map[today].minutes != null ? map[today] : null;
  var week = nights.filter(function (n) { return n.minutes != null && n.date > shift(today, -7); });
  var avg = week.length ? Math.round(week.reduce(function (a, n) { return a + n.minutes; }, 0) / week.length) : null;
  var st = state();
  var strip = "";
  for (var i = NIGHTS - 1; i >= 0; i--) { var k = shift(today, -i); strip += sky(map[k], k, NIGHTS - 1 - i); }
  var line = insight();
  var action = st.kind === "bed"
    ? '<button type="button" class="tool-btn sleep-btn" data-sleep="bed">' + icon("moon") + "<span>Going to bed</span></button>"
    : st.kind === "wake"
      ? '<button type="button" class="tool-btn sleep-btn" data-sleep="wake">' + icon("sun") + "<span>I'm up</span></button>"
      : '<button type="button" class="link-btn" data-sleep="edit">' + (editing ? "Cancel" : last ? "Change last night" : "Log last night") + "</button>";
  var bed = st.kind === "wake" ? new Date(st.night.bedAt) : null;
  el.innerHTML =
    '<div class="card sleep-card">' +
      '<div class="habits-head"><h3 class="daily-section-title">' + icon("moon-star") + "<span>Sleep</span></h3>" + action + "</div>" +
      (st.kind === "wake"
        ? '<p class="sleep-now"><b>In bed since ' + bed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</b><span>Tap when you're up · " +
            '<button type="button" class="link-btn" data-sleep="undo">Not going to bed yet</button></span></p>'
        : '<p class="sleep-now">' + (last ? "<b>" + hm(last.minutes) + "</b><span>last night</span>" : "<b>No night yet</b><span>" + (st.kind === "bed" ? "Tap when you go to bed" : "Log how you slept") + "</span>") + "</p>") +
      '<div class="night-strip" aria-label="The last two weeks of sleep">' + strip + "</div>" +
      '<div class="night-axis"><span>2 weeks ago</span><span>' + (avg != null ? "Average " + hm(avg) + " this week" : "") + "</span></div>" +
      (line ? '<p class="sleep-insight">' + icon("sparkles") + "<span>" + line + "</span></p>" : "") +
      (editing
        ? '<form class="sleep-form" autocomplete="off">' +
            '<label><span>Went to bed</span><input class="text-input" type="time" name="bed" value="' + (last && last.bedAt ? timeOf(last.bedAt) : "23:00") + '" required></label>' +
            '<label><span>Woke up</span><input class="text-input" type="time" name="wake" value="' + (last && last.wakeAt ? timeOf(last.wakeAt) : "07:00") + '" required></label>' +
            '<button type="submit" class="tool-btn">' + icon("check") + "<span>Save</span></button>" +
            (last ? '<button type="button" class="link-btn sleep-clear" data-sleep="clear">Remove last night</button>' : "") +
          "</form>"
        : "") +
    "</div>";
}

function timeOf(iso) {
  var d = new Date(iso);
  return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
}

function keep(n) {
  nights = nights.filter(function (x) { return x.date !== n.date; }).concat([n]).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

async function onClick(e) {
  var b = e.target.closest("[data-sleep]");
  if (!b) return;
  var what = b.getAttribute("data-sleep");
  if (what === "edit") { editing = !editing; return draw(); }
  if (what === "undo" || what === "clear") {
    var day = what === "undo" ? state().night.date : dateKey(new Date());
    try {
      await apiDeleteSleep(day);
      nights = nights.filter(function (x) { return x.date !== day; });
      editing = false;
      emitChange("sleep");
      draw();
      toast(what === "undo" ? "Okay, not in bed yet." : "Removed last night.");
    } catch (err) { toast(err.detail || "Couldn't change that", "error"); }
    return;
  }
  b.disabled = true;
  try {
    if (what === "bed") {
      keep(await apiSaveSleep(state().date, { bedAt: new Date().toISOString(), wakeAt: null }));
      document.body.classList.remove("is-dimming");
      void document.body.offsetWidth;
      document.body.classList.add("is-dimming");
      setTimeout(function () { document.body.classList.remove("is-dimming"); }, 2600);
      mascotReact("nap");
      mascotSay("Goodnight. Phone down soon?");
      var bedDay = state().night ? state().night.date : null;
      toast("Goodnight. Logged you going to bed.", "ok", { duration: 8000, action: { label: "Undo", run: function () {
        if (!bedDay) return;
        apiDeleteSleep(bedDay).then(function () { nights = nights.filter(function (x) { return x.date !== bedDay; }); emitChange("sleep"); draw(); });
      } } });
    } else if (what === "wake") {
      var n = state().night;
      var saved = await apiSaveSleep(n.date, { wakeAt: new Date().toISOString() });
      keep(saved);
      mascotReact("wake");
      mascotSay(saved.minutes >= 420 ? "Good morning. " + hm(saved.minutes) + ", nice." : "Morning. " + hm(saved.minutes) + ". Go easy today.");
    }
    emitChange("sleep");
    draw();
  } catch (err) {
    b.disabled = false;
    toast(err.detail || "Couldn't save that", "error");
  }
}

async function onSubmit(e) {
  var form = e.target.closest(".sleep-form");
  if (!form) return;
  e.preventDefault();
  var today = dateKey(new Date());
  var bt = form.elements.bed.value.split(":").map(Number), wt = form.elements.wake.value.split(":").map(Number);
  var wake = new Date(); wake.setHours(wt[0], wt[1], 0, 0);
  var bed = new Date(wake); bed.setHours(bt[0], bt[1], 0, 0);
  if (bed >= wake) bed.setDate(bed.getDate() - 1);    // went to bed the evening before
  try {
    keep(await apiSaveSleep(today, { bedAt: bed.toISOString(), wakeAt: wake.toISOString() }));
    editing = false;
    emitChange("sleep");
    draw();
    toast("Saved: " + hm(Math.round((wake - bed) / 60000)));
  } catch (err) {
    toast(err.detail || "Couldn't save that", "error");
  }
}

var wired = false;
export async function renderSleep() {
  var el = document.getElementById("sleepSection");
  if (!el) return;
  var today = dateKey(new Date());
  try {
    nights = await apiListSleep(shift(today, -60), shift(today, 1));
  } catch (e) {
    if (e.status === 404) { el.hidden = true; return; }
    throw e;
  }
  el.hidden = false;
  draw();
  if (!wired) {
    wired = true;
    el.addEventListener("click", onClick);
    el.addEventListener("submit", onSubmit);
  }
}
