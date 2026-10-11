import { isDemo } from './connection.js';
import { deviceRequest } from './deviceStore.js';
import { dateKey } from './dayRecord.js';
import { icon } from './icons.js';

/* Look around first: for a friend who wants to see Logbook before getting an
   invite. Everything happens in this tab, on sample data, in its own
   database in the browser. Nothing reaches the server, and leaving the demo
   throws it all away. */

var KEY = "logbook-demo";

export function enterDemo() {
  try { sessionStorage.setItem(KEY, "1"); } catch (e) { return false; }
  location.reload();
  return true;
}

export function exitDemo() {
  try { sessionStorage.removeItem(KEY); } catch (e) {}
  try { indexedDB.deleteDatabase("logbook-demo"); } catch (e) {}
  location.reload();
}

function day(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

function at(n, hour, minute) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute || 0, 0, 0);
  if (d > new Date()) d = new Date(Date.now() - 30 * 60000);
  return d.toISOString();
}

function sampleData() {
  var words = {
    good: ["Finished the hard chapter and actually understood it.", "Long walk after church with my sisters. Good talk.",
      "Fixed the bug that ate my whole Tuesday. Felt amazing.", "Morning run, quiet reading, early night. Simple and good."],
    okay: ["Normal day. Studied a bit, scrolled a bit too much.", "Rain all afternoon, so I cleaned up my notes.",
      "Got through the list but felt flat."],
    rough: ["Couldn't focus at all. Phone in the other room tomorrow.", "Tired and a bit lonely today. Writing it down helps."]
  };
  var moods = ["good", "good", "okay", "good", "rough", "okay", "good"];
  var entries = [];
  for (var n = 0; n < 24; n++) {
    if (n === 6 || n === 13) continue;      // a couple of quiet days, like real life
    var mood = moods[n % moods.length];
    var list = words[mood];
    entries.push({ id: "demo-" + n, occurred_at: at(n, n % 2 ? 21 : 8, 15), mood: mood, text: list[n % list.length] });
  }
  var areas = ["coding", "learning", "fitness", "faith", "social", "rest"];
  var activities = [];
  for (n = 0; n < 14; n++) {
    activities.push({ day_date: day(n), title: ["Side project", "Reading", "Run", "Bible study", "Coffee with a friend", "Nap"][n % 6],
      activity_category: areas[n % 6], duration_minutes: [45, 30, 40, 20, 60, 25][n % 6] });
  }
  var habits = [
    { id: 1, name: "Pray", icon: "cross", activity_category: "faith" },
    { id: 2, name: "Read 10 pages", icon: "book-open", activity_category: "learning" },
    { id: 3, name: "Move", icon: "dumbbell", activity_category: "fitness" }
  ];
  var logs = [];
  habits.forEach(function (h) {
    for (var i = 1; i < 18; i++) if ((i + h.id) % 4) logs.push({ habit_id: h.id, date: day(i) });
  });
  logs.push({ habit_id: 1, date: day(0) });
  var soon = function (n) { return day(-n); };
  return {
    entries: entries,
    day_records: [{ date: day(0), morning_main_focus: "Finish the essay draft before lunch", brain_dump: "call the bank\nbuy a notebook" }],
    tasks: [
      { day_date: day(0), title: "Essay draft", completed: true, activity_category: "learning" },
      { day_date: day(0), title: "Call grandma", completed: false, activity_category: "social" },
      { day_date: day(0), title: "30 minute run", completed: false, activity_category: "fitness" }
    ],
    activities: activities,
    goals: [
      { id: "demo-g1", title: "Read 12 books this year", category: "long-term", priority: "medium", progress: 58, activity_category: "learning" },
      { id: "demo-g2", title: "Run 5 km without stopping", category: "monthly", priority: "high", progress: 35, activity_category: "fitness" }
    ],
    pomodoro_days: [{ date: day(0), sessions: 2, focus_ms: 50 * 60000 }, { date: day(1), sessions: 4, focus_ms: 100 * 60000 }],
    habits: habits,
    habit_logs: logs,
    deadlines: [
      { title: "Scholarship application", due_date: soon(3), due_time: "23:59", kind: "deadline" },
      { title: "Final exam", due_date: soon(18), kind: "exam" },
      { title: "Sam", due_date: (new Date().getFullYear() - 18) + soon(9).slice(4), kind: "birthday" }
    ],
    prayers: [
      { text: "Peace for the exams" },
      { text: "Wisdom about next year", answered_at: at(4, 9), answer: "Felt clear after talking with my dad." }
    ],
    profile: { birthday: (new Date().getFullYear() - 18) + "-05-20", pet_name: "Mochi" }
  };
}

/* Fills the demo database the first time; shows the banner. */
export async function startDemo() {
  if (!isDemo()) return false;
  var health = await deviceRequest("/health");
  if (!health.counts || !health.counts.entries) await deviceRequest("/backup/restore", { method: "POST", body: JSON.stringify(sampleData()) });
  var bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.setAttribute("role", "status");
  bar.innerHTML = icon("eye") + "<span><b>Just looking.</b> This is sample data. Nothing you do here is saved anywhere.</span>" +
    '<button type="button" class="tool-btn demo-exit">Leave</button>';
  bar.querySelector(".demo-exit").addEventListener("click", exitDemo);
  document.body.appendChild(bar);
  document.body.classList.add("is-demo");
  return true;
}
