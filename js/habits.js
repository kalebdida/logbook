/* Habits: small things you want to do every day. One tap to check today,
   the last seven days as dots (tap a dot to fix a missed check-in), and a
   streak. A habit with a life area also counts in the density map. */
import { apiListHabits, apiCreateHabit, apiUpdateHabit, apiDeleteHabit, apiHabitLogs, apiSetHabitDay } from './api.js';
import { dateKey } from './dayRecord.js';
import { categoryOptions, categoryById } from './categories.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

var SUGGESTIONS = [
  { name: "pray / devotion", icon: "🙏", category: "faith" },
  { name: "read 10 pages", icon: "📖", category: "learning" },
  { name: "workout", icon: "🏋", category: "fitness" },
  { name: "drink 2L water", icon: "💧", category: "rest" },
  { name: "code 1 hour", icon: "💻", category: "coding" },
  { name: "no phone after 11", icon: "🌙", category: "rest" }
];

var DAYS_SHOWN = 7;

var habits = [];
var done = {};            // "id|date" -> true
var managing = false;

function daysBack(n) {
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

function has(id, day) {
  return Boolean(done[id + "|" + day]);
}

/* consecutive days ending today (or yesterday, if today isn't checked yet) */
export function streakFor(id) {
  var d = new Date();
  d.setHours(12, 0, 0, 0);
  if (!has(id, dateKey(d))) d.setDate(d.getDate() - 1);
  var n = 0;
  while (has(id, dateKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function habitSummary() {
  var today = dateKey(new Date());
  var active = habits.filter(function (h) { return !h.archived; });
  return {
    total: active.length,
    doneToday: active.filter(function (h) { return has(h.id, today); }).length,
    habits: active.map(function (h) { return { name: h.name, doneToday: has(h.id, today), streak: streakFor(h.id) }; })
  };
}

async function load() {
  var results = await Promise.all([apiListHabits(false), apiHabitLogs()]);
  habits = results[0].sort(function (a, b) { return a.sort - b.sort || a.id - b.id; });
  done = {};
  results[1].forEach(function (l) { done[l.habitId + "|" + l.date] = true; });
}

function dayLabel(key) {
  var d = new Date(key + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toLowerCase();
}

function rowHtml(h, days, today) {
  var streak = streakFor(h.id);
  var cat = categoryById(h.category);
  var checked = has(h.id, today);
  return (
    '<li class="habit' + (checked ? " is-done" : "") + '" data-habit="' + h.id + '">' +
      '<button type="button" class="habit-check" data-habit-toggle="today" aria-pressed="' + checked + '" aria-label="' + escapeHtml(h.name) + ' today">' +
        '<span aria-hidden="true">' + (checked ? "✓" : "") + "</span></button>" +
      '<span class="habit-main">' +
        '<span class="habit-name">' + (h.icon ? '<span class="habit-icon">' + escapeHtml(h.icon) + "</span>" : "") + escapeHtml(h.name) + "</span>" +
        '<span class="habit-week" role="group" aria-label="last ' + DAYS_SHOWN + ' days">' +
          days.map(function (d) {
            var on = has(h.id, d);
            return '<button type="button" class="habit-dot' + (on ? " is-on" : "") + (d === today ? " is-today" : "") + '" data-habit-toggle="' + d + '" aria-pressed="' + on + '" title="' + dayLabel(d) + '" aria-label="' + escapeHtml(h.name) + ", " + dayLabel(d) + '"></button>';
          }).join("") +
        "</span>" +
      "</span>" +
      '<span class="habit-streak' + (streak >= 7 ? " is-hot" : "") + '" title="' + streak + ' day streak' + (cat ? ", counts toward " + cat.label.toLowerCase() : "") + '">' + (streak ? streak + "d" : "") + "</span>" +
      (managing
        ? '<span class="habit-manage"><button type="button" class="link-btn" data-habit-rename>rename</button><button type="button" class="link-btn" data-habit-archive>archive</button><button type="button" class="link-btn habit-del" data-habit-delete>delete</button></span>'
        : "") +
    "</li>"
  );
}

function render() {
  var el = document.getElementById("habitsSection");
  if (!el) return;
  var days = daysBack(DAYS_SHOWN);
  var today = days[days.length - 1];
  var s = habitSummary();
  el.innerHTML =
    '<div class="habits-card">' +
      '<div class="habits-head">' +
        '<h3 class="daily-section-title">habits</h3>' +
        (habits.length ? '<span class="habits-count">' + s.doneToday + "/" + s.total + " today</span>" : "") +
        (habits.length ? '<button type="button" class="link-btn" data-habits-manage>' + (managing ? "done" : "edit") + "</button>" : "") +
      "</div>" +
      (habits.length
        ? '<ul class="habit-list">' + habits.map(function (h) { return rowHtml(h, days, today); }).join("") + "</ul>"
        : '<p class="habits-empty">small things you want to do every day. one tap to check them off.</p>' +
          '<div class="habit-suggestions">' + SUGGESTIONS.map(function (x, i) { return '<button type="button" class="chip" data-habit-suggest="' + i + '">' + x.icon + " " + escapeHtml(x.name) + "</button>"; }).join("") + "</div>") +
      '<form class="habit-add" autocomplete="off">' +
        '<input class="text-input habit-add-icon" name="icon" maxlength="4" placeholder="✦" aria-label="icon (optional)">' +
        '<input class="text-input" name="name" maxlength="80" placeholder="new habit" aria-label="new habit" required>' +
        '<select class="select-input" name="category" aria-label="life area">' + categoryOptions("", "area") + "</select>" +
        '<button type="submit" class="tool-btn">add</button>' +
      "</form>" +
    "</div>";
}

/* One request at a time per check-box, so fast double taps reach the
   server in order and it always ends up matching the screen. */
var queue = {};
function toggle(id, day) {
  if (day === "today") day = dateKey(new Date()); // decided at tap time, not render time
  var key = id + "|" + day;
  var next = !done[key];
  if (next) done[key] = true; else delete done[key];
  render();
  var run = function () { return save(id, day, next); };
  queue[key] = (queue[key] || Promise.resolve()).then(run, run);
  return queue[key];
}

async function save(id, day, next) {
  var key = id + "|" + day;
  if (Boolean(done[key]) !== next) return; // a later tap already flipped it back; that request is queued
  try {
    await apiSetHabitDay(id, day, next);
    emitChange("habits");
    if (next && day === dateKey(new Date())) {
      var st = streakFor(id);
      if (st > 1 && (st % 7 === 0 || st === 3 || st === 30 || st === 100)) toast(st + "-day streak. keep going");
    }
  } catch (e) {
    if (next) delete done[key]; else done[key] = true;
    render();
    toast("couldn't save that check-in: " + (e.detail || e.message), "error");
  }
}

async function create(values) {
  try {
    var h = await apiCreateHabit(values);
    habits.push(h);
    render();
    emitChange("habits");
    var input = document.querySelector('#habitsSection .habit-add [name="name"]');
    if (input) input.focus();
  } catch (e) {
    toast("couldn't add the habit: " + (e.detail || e.message), "error");
  }
}

function wire(el) {
  el.addEventListener("click", async function (e) {
    var t = e.target;
    var row = t.closest("[data-habit]");
    var id = row ? Number(row.getAttribute("data-habit")) : null;
    var tog = t.closest("[data-habit-toggle]");
    if (tog && id) return toggle(id, tog.getAttribute("data-habit-toggle"));

    var sug = t.closest("[data-habit-suggest]");
    if (sug) return create(SUGGESTIONS[Number(sug.getAttribute("data-habit-suggest"))]);

    if (t.closest("[data-habits-manage]")) { managing = !managing; return render(); }

    var h = habits.find(function (x) { return x.id === id; });
    if (!h) return;
    try {
      if (t.closest("[data-habit-rename]")) {
        var name = prompt("rename habit", h.name);
        if (!name || !name.trim() || name.trim() === h.name) return;
        Object.assign(h, await apiUpdateHabit(id, { name: name.trim().slice(0, 80) }));
        render();
      }
      if (t.closest("[data-habit-archive]")) {
        await apiUpdateHabit(id, { archived: true });
        habits = habits.filter(function (x) { return x.id !== id; });
        render();
        emitChange("habits");
        toast("archived “" + h.name + "”. its history stays in your backups and density map.");
      }
      if (t.closest("[data-habit-delete]")) {
        if (!confirm("delete “" + h.name + "” and all its check-ins?")) return;
        await apiDeleteHabit(id);
        habits = habits.filter(function (x) { return x.id !== id; });
        render();
        emitChange("habits");
      }
    } catch (err) {
      toast("couldn't change the habit: " + (err.detail || err.message), "error");
    }
  });
  el.addEventListener("submit", function (e) {
    if (!e.target.classList.contains("habit-add")) return;
    e.preventDefault();
    var f = e.target.elements;
    var name = f.name.value.trim();
    if (!name) return;
    create({ name: name, icon: f.icon.value.trim(), category: f.category.value || null });
  });
}

var wired = false;
export async function renderHabits() {
  var el = document.getElementById("habitsSection");
  if (!el) return;
  try {
    await load();
  } catch (e) {
    if (e.status === 404) { el.hidden = true; return; } // an older server without habits
    throw e;
  }
  el.hidden = false;
  render();
  if (!wired) { wired = true; wire(el); }
}

