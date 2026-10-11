import { getPrefs } from './prefs.js';
import { onChange } from './bus.js';
import { dateKey } from './dayRecord.js';
import { getEntries } from './journal.js';
import { calcStreak, bestStreak } from './stats.js';
import { getTodayTasks } from './tasks.js';
import { habitSummary } from './habits.js';
import { getTodayFocus } from './pomodoro.js';

/* The cat. A small tabby who keeps you company: breathes, blinks, looks
   over when you type, curls up late at night and during focus, and says
   a short kind thing when something good happens.

   mountMascot(container, { size: "sm" | "md" | "lg", place: "dash" | "focus" | "corner" })
     -> { el, say(text), react(kind), sleep(bool | null), destroy() }
   mascotSay(text) / mascotReact(kind) reach every mounted cat.

   All motion is CSS (css/mascot.css). JS only flips classes, and keeps no
   timers while the tab is hidden. */

var IDLE_MS = 3 * 60 * 1000;      // nobody around for this long: nap
var LINE_GAP_MS = 20 * 1000;      // automatic lines: at most one per 20s
var WAKE_MS = 7000;               // a pet or a good moment wakes it this long
var TYPE_PAUSE_MS = 2200;         // attentive until typing pauses this long
var SEEN_KEY = "logbook-mascot-seen";
var GIFTS_KEY = "logbook-mascot-gifts";

/* Things the cat picks up as your best streak grows. They stay once
   earned: a missed day never takes them away. */
export var GIFTS = [
  { id: "scarf", days: 3, name: "a scarf", line: "Three days in a row. I got a scarf!" },
  { id: "bell", days: 7, name: "a little bell", line: "A whole week. Listen: a bell." },
  { id: "lantern", days: 14, name: "a lantern", line: "Two weeks. I brought a lantern to keep us company." },
  { id: "sprout", days: 30, name: "a sprout", line: "Thirty days. Something's growing here." },
  { id: "star", days: 60, name: "a star clip", line: "Sixty days. I'm wearing a star for you." },
  { id: "crown", days: 100, name: "a crown", line: "A hundred days. Honored. Truly." }
];

export function giftsFor(best) {
  return GIFTS.filter(function (g) { return best >= g.days; });
}

export function streakInfo() {
  var entries = [];
  try { entries = getEntries(); } catch (e) {}
  var best = bestStreak(entries);
  var now = calcStreak(entries);
  var next = GIFTS.filter(function (g) { return best < g.days; })[0] || null;
  return { best: best, current: now, gifts: giftsFor(best), next: next };
}

/* ---------- what it says ---------- */

var LINES = {
  morning: ["Morning. One small thing first.", "Fresh start. Take it slow.", "Good morning. Water first, then the day."],
  afternoon: ["Halfway through. You're doing fine.", "Maybe a glass of water?", "Steady is enough."],
  evening: ["Evening. You can slow down now.", "You made it through today.", "A line or two before bed?"],
  late: ["It's late. Rest counts too.", "Still up? Be gentle with yourself.", "Sleep will help more than one more thing."],
  firstMorning: ["Morning. Glad you're here.", "There you are. New day."],
  firstAfternoon: ["Hi. Good to see you.", "There you are. How's the day?"],
  firstEvening: ["Evening. Glad you stopped by.", "There you are. How did today go?"],
  firstLate: ["Hi. It's late, so let's keep it small.", "There you are. Quiet hours now."],
  entry: ["Saved. Thanks for writing it down.", "That's on the page now.", "Good to get it out of your head."],
  entryGood: ["A good day. Worth remembering.", "Saved. Glad today felt good."],
  entryRough: ["Thanks for being honest about today.", "Rough days count too. You wrote it down.", "That sounds heavy. I'm right here."],
  rough: ["Rough one? Take your time.", "No need to make it sound fine.", "It's okay. Write it however it comes."],
  task: ["One down.", "Nice. That's done.", "Checked off. Keep the pace easy."],
  tasksDone: ["Everything's done for today. Well done.", "All clear. You can rest now."],
  habit: ["Showing up again. Nice.", "Another day on the streak.", "Small and steady. That's it."],
  focusDone: ["Focus done. Stretch a little.", "Nice session. Take your break.", "Good work. Look away from the screen a bit."],
  breakDone: ["Ready when you are.", "Break's over. No rush."],
  goal: ["A whole goal, done. That took patience.", "Goal finished. Be proud of that one."],
  pet: ["Prrr.", "I'm glad you're here.", "You're doing better than you think.", "Deep breath. Then the next thing.", "A short break is allowed."],
  petGentle: ["It's okay to have a slow day.", "One thing at a time.", "I'm right here.", "Prrr. Go easy today."],
  petSleepy: ["Mm. Still here.", "Five more minutes.", "Prrr. Sleepy."],
  petFocus: ["Shh. You've got this.", "Keep going. I'll wait."],
  petLate: ["It's late. Sleep soon?", "Mm. Bedtime soon, okay?"],
  petMany: ["Okay, okay. I'm awake!", "That's a lot of pets. I approve.", "Prrrrr. Don't stop."],
  wake: ["Mm? Oh, hi.", "I was only resting my eyes."]
};

/* the "happy" kinds hop and sparkle; the gentle ones just speak */
var REACTIONS = {
  entry: { pool: "entry", fx: "hearts" },
  "entry-good": { pool: "entryGood", fx: "hearts" },
  "entry-rough": { pool: "entryRough", gentle: true },
  rough: { pool: "rough", gentle: true, low: true },
  task: { pool: "task", fx: "sparkles" },
  "tasks-done": { pool: "tasksDone", fx: "both" },
  habit: { pool: "habit", fx: "sparkles" },
  "focus-done": { pool: "focusDone", fx: "sparkles" },
  "break-done": { pool: "breakDone" },
  goal: { pool: "goal", fx: "both" },
  happy: { fx: "both" }
};

function hourNow() { return new Date().getHours(); }
function lateNight() { var h = hourNow(); return h >= 23 || h < 5; }
function partOfDay() {
  var h = hourNow();
  if (h >= 23 || h < 5) return "late";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

var lastPick = {};
function pick(pool) {
  var list = LINES[pool] || [];
  if (!list.length) return "";
  var i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastPick[pool]) i = (i + 1) % list.length;
  lastPick[pool] = i;
  return list[i];
}

function catName() {
  var n = String(getPrefs().mascotName || "").trim();
  return n || "Mochi";
}

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

/* ---------- the drawing ---------- */

var TAIL = "M79 96 C 96 98.5, 105.5 88, 102.5 76 C 100.5 68, 93 66, 90.5 71.5";
var CURL_TAIL = "M101 91 C 104 101.5, 84 104, 62 103 C 52 102.6, 46 101.6, 42 99.6";
var HEART = "M0 3.6 C -3 1.6, -5 -0.4, -5 -2.4 C -5 -4.1, -3.7 -5.2, -2.4 -5.2 C -1.3 -5.2, -0.5 -4.6, 0 -3.7 C 0.5 -4.6, 1.3 -5.2, 2.4 -5.2 C 3.7 -5.2, 5 -4.1, 5 -2.4 C 5 -0.4, 3 1.6, 0 3.6 Z";
var SPARK = "M0 -5 Q 0.9 -0.9, 5 0 Q 0.9 0.9, 0 5 Q -0.9 0.9, -5 0 Q -0.9 -0.9, 0 -5 Z";

function catSvg() {
  return '<svg class="mascot-svg" viewBox="0 0 120 110" aria-hidden="true" focusable="false">' +
    // sitting up: idle, attentive, happy, pet
    '<g class="m-sit">' +
      '<ellipse class="m-shadow" cx="60" cy="101" rx="31" ry="3.6"/>' +
      '<g class="m-cat">' +
        '<g class="m-tail"><path class="m-tail-fur" d="' + TAIL + '"/><path class="m-tail-stripe" d="' + TAIL + '"/></g>' +
        '<g class="m-body">' +
          '<path class="m-fur" d="M60 50 C 77 50, 87 67, 87 84 C 87 96, 78 100.5, 60 100.5 C 42 100.5, 33 96, 33 84 C 33 67, 43 50, 60 50 Z"/>' +
          '<path class="m-light" d="M60 63 C 68.5 63, 72.5 73.5, 72.5 84 C 72.5 94, 67 99.5, 60 99.5 C 53 99.5, 47.5 94, 47.5 84 C 47.5 73.5, 51.5 63, 60 63 Z"/>' +
          '<path class="m-stripe" d="M35.6 72 q5 1.6 9 -1.4 M34.2 80.5 q6 1.6 10 -1.4 M34.8 89 q5 1.2 8.6 -1.4 M84.4 72 q-5 1.6 -9 -1.4 M85.8 80.5 q-6 1.6 -10 -1.4 M85.2 89 q-5 1.2 -8.6 -1.4"/>' +
          '<ellipse class="m-paw" cx="50.5" cy="98.6" rx="7.4" ry="4.4"/>' +
          '<ellipse class="m-paw" cx="69.5" cy="98.6" rx="7.4" ry="4.4"/>' +
          '<path class="m-toes" d="M48.4 97.4 v2.6 M52.6 97.4 v2.6 M67.4 97.4 v2.6 M71.6 97.4 v2.6"/>' +
        '</g>' +
        '<g class="m-head-bob">' +
          // a scarf (and later a bell) under the chin
          '<g class="m-acc m-acc-scarf">' +
            '<path class="m-scarf" d="M39 58.5 Q 60 70 81 58.5 L 81.5 65 Q 60 77 38.5 65 Z"/>' +
            '<path class="m-scarf" d="M66 68.5 L 70.5 86 L 76.5 84.4 L 73 66.6 Z"/>' +
            '<path class="m-scarf-line" d="M45 63.6 l1.6 5 M52 66.4 l1 5 M68 66.2 l-1 5 M75 63.4 l-1.6 5 M68.6 74 l6.2 -1.6 M69.8 79 l6.2 -1.6"/>' +
          '</g>' +
          '<g class="m-acc m-acc-bell"><circle class="m-bell" cx="60" cy="72.6" r="3.4"/><path class="m-bell-line" d="M57.6 72.4 h4.8 M60 74.2 v1.2"/></g>' +
        '<g class="m-head">' +
          '<g class="m-ear m-ear-l"><path class="m-fur m-ear-shape" d="M37 38 L 36 15.5 Q 36.4 11.5 40 13.2 L 55 26 Z"/><path class="m-ear-in" d="M40.2 31 L 39.8 19.5 L 48.6 27 Z"/></g>' +
          '<g class="m-ear m-ear-r"><path class="m-fur m-ear-shape" d="M83 38 L 84 15.5 Q 83.6 11.5 80 13.2 L 65 26 Z"/><path class="m-ear-in" d="M79.8 31 L 80.2 19.5 L 71.4 27 Z"/></g>' +
          '<path class="m-fur" d="M60 22 C 77 22, 89 31, 89 45 C 89 57.5, 77 64, 60 64 C 43 64, 31 57.5, 31 45 C 31 31, 43 22, 60 22 Z"/>' +
          '<ellipse class="m-light" cx="60" cy="56" rx="10.5" ry="6.6"/>' +
          '<path class="m-stripe" d="M53.6 24.6 l1.2 6.4 M60 23 v8 M66.4 24.6 l-1.2 6.4 M31.6 44.6 h6 M32.6 50.4 l5.4 -1.2 M88.4 44.6 h-6 M87.4 50.4 l-5.4 -1.2"/>' +
          '<ellipse class="m-blush" cx="40.5" cy="53.5" rx="4.6" ry="2.6"/>' +
          '<ellipse class="m-blush" cx="79.5" cy="53.5" rx="4.6" ry="2.6"/>' +
          '<g class="m-eyes">' +
            '<g class="m-eye"><circle class="m-iris" cx="48" cy="45" r="5.6"/><ellipse class="m-pupil" cx="48" cy="45.3" rx="3.2" ry="4"/><circle class="m-glint" cx="49.5" cy="43.1" r="1.4"/><circle class="m-glint" cx="46.7" cy="47.2" r="0.6"/></g>' +
            '<g class="m-eye"><circle class="m-iris" cx="72" cy="45" r="5.6"/><ellipse class="m-pupil" cx="72" cy="45.3" rx="3.2" ry="4"/><circle class="m-glint" cx="73.5" cy="43.1" r="1.4"/><circle class="m-glint" cx="70.7" cy="47.2" r="0.6"/></g>' +
          '</g>' +
          '<path class="m-line m-eyes-happy" d="M42.6 46.4 q5.4 -5.2 10.8 0 M66.6 46.4 q5.4 -5.2 10.8 0"/>' +
          '<path class="m-nose" d="M57.2 52.4 h5.6 q0 2.6 -2.8 3.6 q-2.8 -1 -2.8 -3.6 z"/>' +
          '<path class="m-line m-mouth" d="M60 55.8 q-1.4 2.8 -4.2 1.8 M60 55.8 q1.4 2.8 4.2 1.8"/>' +
          '<path class="m-line m-mouth-sad" d="M56.4 59.4 q3.6 -2.4 7.2 0"/>' +
          '<ellipse class="m-yawn" cx="60" cy="59" rx="3" ry="3.4"/>' +
          '<path class="m-whisker" d="M33.5 53.2 l-10 -1.6 M34 56.6 l-9.4 2 M86.5 53.2 l10 -1.6 M86 56.6 l9.4 2"/>' +
          '<g class="m-acc m-acc-star" transform="translate(41 25) rotate(-14) scale(0.9)"><path class="m-star" d="' + SPARK + '"/></g>' +
          '<g class="m-acc m-acc-crown"><path class="m-crown" d="M50.5 24 L 52.4 14.6 L 56.6 19.6 L 60 11.8 L 63.4 19.6 L 67.6 14.6 L 69.5 24 Q 60 21.6 50.5 24 Z"/><circle class="m-crown-gem" cx="60" cy="20.4" r="1.3"/></g>' +
        '</g></g>' +
        // paws up over the eyes (the login screen, while you type a password)
        '<g class="m-cover">' +
          '<g class="m-cover-l"><path class="m-arm" d="M47 76 Q 41 62 46.5 50"/><ellipse class="m-paw" cx="47" cy="47.5" rx="8.4" ry="6.6"/><path class="m-toes" d="M43.4 42.4 v3 M47 41.4 v3 M50.6 42.4 v3"/></g>' +
          '<g class="m-cover-r"><path class="m-arm" d="M73 76 Q 79 62 73.5 50"/><ellipse class="m-paw" cx="73" cy="47.5" rx="8.4" ry="6.6"/><path class="m-toes" d="M69.4 42.4 v3 M73 41.4 v3 M76.6 42.4 v3"/></g>' +
        '</g>' +
      '</g>' +
    '</g>' +
    // curled up asleep, like the cat on the bed by the rainy window
    '<g class="m-curl">' +
      '<ellipse class="m-shadow" cx="62" cy="101.8" rx="42" ry="3.6"/>' +
      '<g class="m-curl-body">' +
        '<path class="m-fur" d="M30 88 C 28 70, 46 58, 68 58 C 92 58, 104 71, 104 85 C 104 96, 96 101.2, 74 101.2 L 44 101.2 C 35 101.2, 31 96, 30 88 Z"/>' +
        '<path class="m-stripe" d="M60 59.5 q4.5 8 1 16 M72.5 58.6 q4.5 8 1.4 15.6 M85 61 q4.5 7.5 1.6 14.4 M96 67 q3.4 6.4 1 12"/>' +
        '<path class="m-tail-fur" d="' + CURL_TAIL + '"/><path class="m-tail-stripe" d="' + CURL_TAIL + '"/>' +
      '</g>' +
      '<g class="m-curl-head">' +
        '<path class="m-fur m-ear-shape" d="M19.5 73 L 16 57.5 Q 16 54 19.5 55.5 L 31 64.5 Z"/>' +
        '<path class="m-ear-in" d="M21.8 69.5 L 19.6 59.8 L 27.4 65.6 Z"/>' +
        '<path class="m-fur m-ear-shape" d="M40 63.5 L 48 52.5 Q 50.5 50.5 51.6 54 L 53.2 70 Z"/>' +
        '<path class="m-ear-in" d="M43.6 64.5 L 48.8 57.4 L 49.6 67.4 Z"/>' +
        '<path class="m-fur" d="M36 62.5 C 49 62.5, 56 71, 56 80.5 C 56 91, 48 97.5, 36.5 97.5 C 25 97.5, 16.5 91, 16.5 80.5 C 16.5 70, 24 62.5, 36 62.5 Z"/>' +
        '<ellipse class="m-light" cx="36.5" cy="89.6" rx="9" ry="5.6"/>' +
        '<path class="m-stripe" d="M31 64.8 l0.8 5 M36.2 64.2 v5.6 M41.4 65 l-0.8 5 M17 80 h4.6 M55.6 80 h-4.6"/>' +
        '<ellipse class="m-blush" cx="23.6" cy="87" rx="3.8" ry="2.2"/>' +
        '<ellipse class="m-blush" cx="49.4" cy="87" rx="3.8" ry="2.2"/>' +
        '<path class="m-line" d="M24.6 81.4 q4.2 3.6 8.4 0 M40 81.4 q4.2 3.6 8.4 0"/>' +
        '<path class="m-nose" d="M34.3 86.2 h4.4 q0 2 -2.2 2.8 q-2.2 -0.8 -2.2 -2.8 z"/>' +
        '<ellipse class="m-paw" cx="28.6" cy="98.4" rx="6.6" ry="3.6"/>' +
        '<ellipse class="m-paw" cx="44.4" cy="98.4" rx="6.6" ry="3.6"/>' +
      '</g>' +
      '<g transform="translate(60 44)"><path class="m-z m-z1" d="M0 0 h6.4 l-6.4 7.4 h6.4"/></g>' +
      '<g transform="translate(70 34)"><path class="m-z m-z2" d="M0 0 h4.8 l-4.8 5.6 h4.8"/></g>' +
    '</g>' +
    // things beside the cat: a lantern on the left, a sprout on the right
    '<g class="m-acc m-acc-lantern">' +
      '<circle class="m-lantern-glow" cx="13" cy="88" r="14"/>' +
      '<path class="m-lantern-line" d="M13 72 v4"/>' +
      '<rect class="m-lantern-cap" x="9.4" y="75.6" width="7.2" height="2.4" rx="1"/>' +
      '<rect class="m-lantern" x="7.6" y="78" width="10.8" height="15" rx="4.6"/>' +
      '<path class="m-lantern-rib" d="M8.4 83 h9.2 M8.4 88 h9.2"/>' +
      '<rect class="m-lantern-cap" x="9.4" y="93" width="7.2" height="2.2" rx="1"/>' +
    '</g>' +
    '<g class="m-acc m-acc-sprout">' +
      '<path class="m-pot" d="M100.5 92 h13 l-1.8 9.4 h-9.4 Z"/>' +
      '<path class="m-stem" d="M107 92 C 107 87, 106 84, 104.5 81"/>' +
      '<path class="m-leaf" d="M104.6 81.4 C 99.6 79.6, 98 82.6, 99 85 C 101.6 85.6, 104 84.2, 104.6 81.4 Z"/>' +
      '<path class="m-leaf" d="M106.6 86.2 C 110.6 82.6, 113.6 84.2, 113.4 86.8 C 111 88.4, 108 88, 106.6 86.2 Z"/>' +
    '</g>' +
    // little hearts and sparkles for good moments
    '<g class="m-fx">' +
      '<g transform="translate(95 24)"><path class="m-fx-item m-heart m-fx1" d="' + HEART + '"/></g>' +
      '<g transform="translate(24 28) scale(0.72)"><path class="m-fx-item m-heart m-fx2" d="' + HEART + '"/></g>' +
      '<g transform="translate(104 44) scale(0.8)"><path class="m-fx-item m-spark m-fx3" d="' + SPARK + '"/></g>' +
      '<g transform="translate(15 12) scale(0.62)"><path class="m-fx-item m-spark m-fx4" d="' + SPARK + '"/></g>' +
    '</g>' +
  '</svg>';
}

/* ---------- shared state, one set of listeners for every cat ---------- */

var instances = [];
var G = {
  wired: false,
  lastActivity: Date.now(),
  focusRunning: false,
  gentleDay: null,          // date key of a day that has been rough
  entryIds: null,
  taskDone: null,
  habitsDone: null,
  ticker: null,
  greeted: false,
  gazeFrame: 0,
  pointer: null
};

function hidden() { return document.visibilityState === "hidden"; }

function live() {
  instances = instances.filter(function (m) {
    if (m.el.isConnected) return true;
    m.teardown();
    return false;
  });
  return instances;
}

function each(fn) { live().forEach(fn); }

function gentleToday() { return G.gentleDay === dateKey(new Date()); }

function safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

function snapshotEntries() {
  return safe(function () { return getEntries().map(function (e) { return e.id; }); }, []);
}

function snapshotTasks() {
  var map = {};
  safe(function () { getTodayTasks().forEach(function (t) { map[t.id] = Boolean(t.completed); }); });
  return map;
}

function snapshotHabits() {
  return safe(function () { return habitSummary().doneToday; }, 0);
}

function takeSnapshots() {
  G.entryIds = snapshotEntries();
  G.taskDone = snapshotTasks();
  G.habitsDone = snapshotHabits();
  var entries = safe(getEntries, []);
  var today = dateKey(new Date());
  var latest = entries.filter(function (e) { return dateKey(e.date) === today; })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })[0];
  if (latest && latest.mood === "rough") G.gentleDay = today;
}

/* what changed, worked out from before/after snapshots (bus events carry only a kind) */
function onData(detail) {
  var kind = detail.kind;
  if (kind === "entries") {
    var before = G.entryIds || [];
    var entries = safe(getEntries, []);
    var fresh = entries.filter(function (e) {
      return before.indexOf(e.id) < 0 && Date.now() - new Date(e.date).getTime() < 10 * 60 * 1000;
    });
    G.entryIds = entries.map(function (e) { return e.id; });
    var newGift = checkGifts();
    if (newGift) {
      each(function (m) { m.dress(); m.react("cheer"); m.api.say(newGift.line); });
      return;
    }
    if (fresh.length) {
      var mood = fresh[0].mood;
      if (mood === "rough") G.gentleDay = dateKey(new Date());
      reactAll(mood === "rough" ? "entry-rough" : mood === "good" && !gentleToday() ? "entry-good" : "entry");
    }
  } else if (kind === "tasks") {
    var prev = G.taskDone || {};
    var tasks = safe(getTodayTasks, []);
    var newlyDone = tasks.filter(function (t) { return t.completed && prev[t.id] === false; }).length;
    G.taskDone = snapshotTasks();
    if (newlyDone) {
      var allDone = tasks.length > 0 && tasks.every(function (t) { return t.completed; });
      reactAll(allDone ? "tasks-done" : "task");
    }
  } else if (kind === "habits") {
    var was = G.habitsDone || 0;
    var now = snapshotHabits();
    G.habitsDone = now;
    if (now > was) reactAll("habit");
  } else if (kind === "import") {
    takeSnapshots();
    each(function (m) { m.dress(); });
  }
}

function onPomodoro(e) {
  var d = e.detail || {};
  var wasRunning = G.focusRunning;
  if (d.type === "focus-started") G.focusRunning = true;
  else if (d.type === "paused" || d.type === "session-reset" || d.type === "break-started") G.focusRunning = false;
  else if (d.type === "focus-completed" || d.type === "break-completed") G.focusRunning = false;
  if (wasRunning !== G.focusRunning) each(function (m) { m.update(); });
  if (d.type === "focus-completed") reactAll("focus-done");
  else if (d.type === "break-completed") reactAll("break-done");
}

function onGoals(e) {
  if (e.detail && e.detail.action === "completed") reactAll("goal");
}

function onPrefs(e) {
  var patch = (e.detail && e.detail.patch) || {};
  if ("mascot" in patch || "mascotName" in patch) each(function (m) { m.sync(); });
}

/* the rough mood button: gentler from now on, today */
function onClickCapture(e) {
  var btn = e.target && e.target.closest && e.target.closest('.mood-btn[data-mood="rough"], [data-edit-mood="rough"]');
  if (!btn || btn.getAttribute("aria-pressed") === "true") return;
  G.gentleDay = dateKey(new Date());
  reactAll("rough");
}

function isTextField(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  if (el.tagName !== "INPUT") return false;
  return /^(text|search|email|url|tel|number|password|)$/.test(el.type || "");
}

function onInput(e) {
  if (!isTextField(e.target)) return;
  if (e.target.closest && e.target.closest(".mascot")) return;
  activity();
  each(function (m) { m.attend(e.target); });
}

var lastActivityMark = 0;
function activity() {
  var now = Date.now();
  var wasIdle = now - G.lastActivity > IDLE_MS;
  G.lastActivity = now;
  if (wasIdle || now - lastActivityMark > 5000) {
    lastActivityMark = now;
    if (wasIdle) each(function (m) { m.update(); });
  }
}

function onVisibility() {
  if (hidden()) {
    stopTicker();
    each(function (m) { m.pause(); });
  } else {
    each(function (m) { m.resume(); });
    startTicker();
  }
}

/* the eyes follow the pointer around the page (mouse and pen; a tap is a
   short glance). One listener for every cat, at most once a frame. */
function onPointer(e) {
  if (e.pointerType === "touch" && e.type === "pointermove") return;
  G.pointer = { x: e.clientX, y: e.clientY, at: Date.now() };
  if (G.gazeFrame) return;
  G.gazeFrame = requestAnimationFrame(function () {
    G.gazeFrame = 0;
    each(function (m) { m.gaze(G.pointer); });
  });
}

function onPointerOut(e) {
  if (e.relatedTarget) return;
  G.pointer = null;
  each(function (m) { m.gaze(null); });
}

function startTicker() {
  if (G.ticker || hidden() || !instances.length) return;
  G.ticker = setInterval(function () {
    if (!live().length) return stopTicker();
    each(function (m) { m.update(); });
  }, 30000);
}

function stopTicker() {
  clearInterval(G.ticker);
  G.ticker = null;
}

function wire() {
  if (G.wired) return;
  G.wired = true;
  G.focusRunning = safe(function () { var f = getTodayFocus(); return f.running && f.mode === "focus"; }, false);
  takeSnapshots();
  onChange(onData);
  document.addEventListener("logbook:pomodoro", onPomodoro);
  document.addEventListener("logbook:goals-changed", onGoals);
  document.addEventListener("logbook:prefs-changed", onPrefs);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("visibilitychange", onVisibility);
  if (!reduceMotion()) {
    document.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (t) {
    document.addEventListener(t, activity, { passive: true, capture: true });
  });
}

function seenGifts() {
  try { return JSON.parse(localStorage.getItem(GIFTS_KEY) || "null"); } catch (e) { return null; }
}

/* The newest gift not celebrated yet in this browser (the first time a
   browser sees the cat, everything already earned counts as seen). */
function checkGifts() {
  var info = streakInfo();
  var seen = seenGifts();
  var ids = info.gifts.map(function (g) { return g.id; });
  try { localStorage.setItem(GIFTS_KEY, JSON.stringify(ids)); } catch (e) {}
  if (!seen) return null;
  var fresh = info.gifts.filter(function (g) { return seen.indexOf(g.id) < 0; });
  return fresh.length ? fresh[fresh.length - 1] : null;
}

function reactAll(kind) {
  each(function (m) { m.react(kind); });
}

function firstVisitToday() {
  var today = dateKey(new Date());
  var seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch (e) {}
  if (seen === today) return false;
  try { localStorage.setItem(SEEN_KEY, today); } catch (e) {}
  return true;
}

/* ---------- one cat ---------- */

export function mountMascot(container, opts) {
  opts = opts || {};
  var size = { sm: 1, md: 1, lg: 1 }[opts.size] ? opts.size : "md";
  var place = { dash: 1, focus: 1, corner: 1, lock: 1, splash: 1 }[opts.place] ? opts.place : "corner";
  wire();

  // one cat per container: remounting replaces the old one
  live().forEach(function (m) { if (m.container === container) m.api.destroy(); });

  var el = document.createElement("div");
  el.className = "mascot mascot--" + size + " mascot--" + place;
  el.hidden = true;
  if (container) container.appendChild(el);

  var parts = null;          // { btn, svg, bubble, text, liveRegion }
  var timers = { bubble: null, leave: null, attend: null, wake: null, mood: null, greet: null, act: null, glance: null };
  var forced = opts.awake ? false : null;   // sleep(true/false) from the outside; null = automatic
  var pets = [];             // recent pets, for "that's a lot of pets"
  var wakeUntil = 0;
  var lastLineAt = 0;
  var lastLineLow = false;   // a passing remark (picking a mood) that a real moment may replace
  var asleep = false;

  function clear(name) {
    clearTimeout(timers[name]);
    timers[name] = null;
  }

  function clearAll() {
    Object.keys(timers).forEach(clear);
  }

  function build() {
    el.innerHTML =
      '<div class="mascot-bubble" aria-hidden="true" hidden><span class="mascot-bubble-text"></span></div>' +
      '<button type="button" class="mascot-btn">' + catSvg() + "</button>" +
      '<span class="mascot-live" aria-live="polite"></span>';
    parts = {
      btn: el.querySelector(".mascot-btn"),
      bubble: el.querySelector(".mascot-bubble"),
      text: el.querySelector(".mascot-bubble-text"),
      liveRegion: el.querySelector(".mascot-live")
    };
    parts.btn.addEventListener("click", pet);
    label();
    update();
    scheduleAct();
  }

  /* now and then, while awake and nothing else is going on: a look around,
     a yawn, an ear flick, a swish of the tail */
  var ACTS = { look: 2200, yawn: 1900, ears: 900, tail: 1400, stretch: 1600 };
  function scheduleAct() {
    clear("act");
    if (reduceMotion() || hidden()) return;
    timers.act = setTimeout(function () {
      if (parts && !asleep && !el.matches(".is-shy, .is-sad, .is-happy, .is-pet, .is-attentive")) {
        var names = Object.keys(ACTS);
        if (lateNight()) names.push("yawn", "yawn");
        var name = names[Math.floor(Math.random() * names.length)];
        flash("act-" + name, ACTS[name]);
      }
      scheduleAct();
    }, 14000 + Math.random() * 22000);
  }

  function gaze(p) {
    if (!parts || asleep || el.classList.contains("is-attentive")) return;
    if (!p) {
      el.style.setProperty("--gaze-x", "0");
      el.style.setProperty("--gaze-y", "0");
      return;
    }
    var b = parts.btn.getBoundingClientRect();
    if (!b.width) return;
    var dx = p.x - (b.left + b.width / 2), dy = p.y - (b.top + b.height * 0.42);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var reach = Math.min(1, dist / 260);          // close by: eyes move less far
    el.style.setProperty("--gaze-x", (dx / dist * reach).toFixed(2));
    el.style.setProperty("--gaze-y", (dy / dist * reach).toFixed(2));
    el.classList.toggle("is-near", dist < b.width * 0.9);
  }

  function label() {
    if (!parts) return;
    var name = catName();
    parts.btn.setAttribute("aria-label", "Pet " + name);
    parts.btn.title = name;
  }

  function dress() {
    var info = streakInfo();
    // the first time this browser sees real data, what's already earned isn't news
    if (info.best > 0 && !seenGifts()) checkGifts();
    el.setAttribute("data-gifts", info.gifts.map(function (g) { return g.id; }).join(" "));
    return info;
  }

  function sync() {
    var on = getPrefs().mascot !== false;
    if (!on) {
      clearAll();
      el.hidden = true;
      el.innerHTML = "";
      parts = null;
      return;
    }
    if (!parts) build();
    el.hidden = false;
    label();
    dress();
  }

  function wantsSleep() {
    if (forced !== null) return forced;
    var now = Date.now();
    if (now < wakeUntil) return false;
    if (G.focusRunning) return true;
    if (now - G.lastActivity > IDLE_MS) return true;
    return lateNight();
  }

  function update() {
    if (!parts) return;
    var next = wantsSleep();
    if (next !== asleep) {
      asleep = next;
      el.classList.toggle("is-sleeping", asleep);
      if (asleep) el.classList.remove("is-attentive");
    }
    clear("wake");
    var left = wakeUntil - Date.now();
    if (left > 0 && !hidden()) timers.wake = setTimeout(update, left + 50);
  }

  function wakeBriefly() {
    wakeUntil = Date.now() + WAKE_MS;
    update();
  }

  /* replay a one-shot class even if it is already on */
  function flash(cls, ms) {
    if (!parts) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clear(cls);
    timers[cls] = setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  function fx(kind) {
    el.setAttribute("data-fx", kind === "sparkles" ? "sparkles" : kind === "hearts" ? "hearts" : "both");
    flash("is-fx", reduceMotion() ? 1800 : 1500);
  }

  function say(text, force, low) {
    if (!parts || !text || hidden()) return false;
    var now = Date.now();
    var since = now - lastLineAt;
    if (!force && since < LINE_GAP_MS && !(lastLineLow && !low && since > 2500)) return false;
    lastLineAt = now;
    lastLineLow = Boolean(low);
    clear("bubble");
    clear("leave");
    parts.text.textContent = text;
    parts.liveRegion.textContent = catName() + ": " + text;
    parts.bubble.classList.remove("is-leaving");
    parts.bubble.hidden = false;
    // re-run the pop-in when one line replaces another
    parts.bubble.style.animation = "none";
    void parts.bubble.offsetWidth;
    parts.bubble.style.animation = "";
    var ms = Math.min(6500, 3000 + text.length * 50);
    timers.bubble = setTimeout(hideBubble, ms);
    return true;
  }

  function hideBubble() {
    if (!parts || parts.bubble.hidden) return;
    parts.bubble.classList.add("is-leaving");
    clear("leave");
    timers.leave = setTimeout(function () {
      if (!parts) return;
      parts.bubble.hidden = true;
      parts.bubble.classList.remove("is-leaving");
    }, reduceMotion() ? 0 : 220);
  }

  function pet() {
    activity();
    var now = Date.now();
    pets = pets.filter(function (t) { return now - t < 3000; });
    pets.push(now);
    if (pets.length === 5 || pets.length === 10) {
      wakeBriefly();
      flash("is-happy", 800);
      fx("both");
      say(pick("petMany"), true);
      return;
    }
    var wasAsleep = asleep;
    var pool = gentleToday() ? "petGentle" : "pet";
    if (wasAsleep) pool = G.focusRunning ? "petFocus" : lateNight() ? "petLate" : Math.random() < 0.5 ? "wake" : "petSleepy";
    else if (lateNight() && Math.random() < 0.4) pool = "petLate";
    else if (!gentleToday() && Math.random() < 0.25) pool = partOfDay();
    wakeBriefly();
    flash("is-pet", 1100);
    fx("hearts");
    say(pick(pool), true);
  }

  function react(kind) {
    if (!parts) return;
    var r = REACTIONS[kind];
    if (kind === "pet") return pet();
    if (kind === "attentive") return attend(null);
    if (kind === "sleep") { forced = null; wakeUntil = 0; return update(); }
    if (kind === "wake") return wakeBriefly();
    if (kind === "shy" || kind === "unshy") { el.classList.toggle("is-shy", kind === "shy"); if (kind === "unshy") el.classList.remove("is-peek"); return; }
    if (kind === "peek" || kind === "unpeek") { el.classList.toggle("is-peek", kind === "peek"); return; }
    if (kind === "sad") { el.classList.remove("is-happy"); flash("is-sad", 2600); return; }
    if (kind === "cheer") { el.classList.remove("is-shy", "is-peek", "is-sad"); wakeBriefly(); flash("is-happy", 800); fx("both"); return; }
    if (!r) return;
    if (r.gentle) {
      // no hop: just turn toward you
      if (!asleep) flash("is-soft", 1600);
      say(pick(r.pool), false, r.low);
      return;
    }
    wakeBriefly();
    flash("is-happy", 800);
    if (r.fx) fx(r.fx);
    if (r.pool) say(pick(r.pool));
  }

  function attend(target) {
    if (!parts || asleep) return;
    if (target && target.getBoundingClientRect) {
      var a = target.getBoundingClientRect();
      var b = parts.btn.getBoundingClientRect();
      if (b.width) {
        var dx = (a.left + a.width / 2) - (b.left + b.width / 2);
        var dy = (a.top + Math.min(a.height, 60) / 2) - (b.top + b.height / 2);
        var clamp = function (v) { return Math.max(-1, Math.min(1, v)); };
        var lx = clamp(dx / 320);
        if (Math.abs(lx) < 0.5) lx = dx < 0 ? -0.5 : 0.5;   // always a little head tilt
        el.style.setProperty("--look-x", lx.toFixed(2));
        el.style.setProperty("--look-y", clamp(dy / 320).toFixed(2));
      }
    }
    el.classList.add("is-attentive");
    clear("attend");
    timers.attend = setTimeout(function () { el.classList.remove("is-attentive"); }, TYPE_PAUSE_MS);
  }

  function pause() {
    clearAll();
    el.classList.add("is-paused");
    el.classList.remove("is-attentive", "is-happy", "is-pet", "is-fx", "is-soft", "is-sad");
    if (parts) { parts.bubble.hidden = true; parts.bubble.classList.remove("is-leaving"); }
  }

  function resume() {
    el.classList.remove("is-paused");
    update();
    scheduleAct();
  }

  function teardown() {
    clearAll();
    parts = null;
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  var api = {
    el: el,
    say: function (text) { return say(String(text || ""), true); },
    react: react,
    sleep: function (on) {
      forced = on === null || on === undefined ? null : Boolean(on);
      if (forced === false) wakeUntil = 0;
      update();
    },
    destroy: function () {
      instances = instances.filter(function (m) { return m.api !== api; });
      teardown();
      if (!instances.length) stopTicker();
    }
  };

  instances.push({
    el: el, container: container, api: api,
    update: update, sync: sync, react: react, attend: attend, gaze: gaze, dress: dress,
    pause: pause, resume: resume, teardown: teardown
  });

  sync();
  if (hidden()) pause();
  startTicker();

  // the first time the cat sees you today, it says hello
  if (parts && !opts.quiet && !G.greeted && !hidden()) {
    G.greeted = true;
    if (firstVisitToday()) {
      var pod = partOfDay();
      var pool = "first" + pod.charAt(0).toUpperCase() + pod.slice(1);
      timers.greet = setTimeout(function () {
        if (gentleToday()) say(pick("petGentle"));
        else say(pick(pool));
      }, 1400);
    }
  }

  return api;
}

export function mascotSay(text) {
  each(function (m) { m.api.say(text); });
}

export function mascotReact(kind) {
  reactAll(kind);
}
