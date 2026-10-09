/* Turns any file Logbook has ever exported into one restore payload for
   POST /backup/restore. Three shapes are recognised:
     1. a full backup from settings ({ app: "logbook", entries, day_records, ... })
     2. an old journal export (an array of { id, date, mood, text })
     3. a dump of the old localStorage version
        ({ "logbook-entries": ..., "logbook-days": ..., "logbook-goals": ..., "logbook-pomodoro": ... })
   Anything malformed is dropped rather than failing the whole import. */
import { categoryById } from './categories.js';

var MOODS = { good: 1, okay: 1, rough: 1 };
var GOAL_CATEGORIES = { daily: 1, weekly: 1, monthly: 1, "long-term": 1 };
var PRIORITIES = { low: 1, medium: 1, high: 1 };
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function str(v) { return typeof v === "string" ? v : ""; }
function area(v) { return categoryById(v) ? v : null; }
function mins(v) {
  var n = Math.round(Number(v));
  return n > 0 && n <= 1440 ? n : null;
}
function iso(v) {
  var d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

function legacyEntry(e) {
  if (!e || !MOODS[e.mood] || !str(e.text).trim() || !iso(e.date)) return null;
  return { id: e.id ? String(e.id).slice(0, 64) : null, occurred_at: iso(e.date), mood: e.mood, text: e.text };
}

function legacyItems(date, items, withCompleted) {
  if (!Array.isArray(items)) return [];
  return items.map(function (it) {
    if (!it) return null;
    var title = str(it.title || it.text || it.name).trim();
    if (!title) return null;
    var out = {
      day_date: date,
      title: title.slice(0, 300),
      activity_category: area(it.activityCategory || it.category || it.type),
      duration_minutes: mins(it.durationMinutes || it.minutes || it.duration)
    };
    if (withCompleted) out.completed = Boolean(it.completed || it.done);
    return out;
  }).filter(Boolean);
}

function legacyGoal(g) {
  if (!g || !str(g.title).trim()) return null;
  var progress = Math.max(0, Math.min(100, Math.round(Number(g.progress) || 0)));
  if (g.completed) progress = 100;
  return {
    id: g.id ? String(g.id).slice(0, 64) : null,
    title: g.title.slice(0, 300),
    description: str(g.description),
    category: GOAL_CATEGORIES[g.category] ? g.category : "daily",
    priority: PRIORITIES[g.priority] ? g.priority : "medium",
    progress: progress,
    created_at: iso(g.createdAt),
    updated_at: iso(g.updatedAt),
    completed_at: iso(g.completedAt),
    target_date: DATE_RE.test(g.targetDate || "") ? g.targetDate : null,
    activity_category: area(g.activityCategory)
  };
}

function fromLegacyStorage(dump) {
  var payload = emptyPayload();
  var entries = parseMaybeJson(dump["logbook-entries"]) || [];
  var days = parseMaybeJson(dump["logbook-days"]) || {};
  var goals = parseMaybeJson(dump["logbook-goals"]) || [];
  var pomodoro = parseMaybeJson(dump["logbook-pomodoro"]) || {};

  if (Array.isArray(entries)) payload.entries = entries.map(legacyEntry).filter(Boolean);
  Object.keys(days || {}).forEach(function (date) {
    if (!DATE_RE.test(date)) return;
    var d = days[date] || {};
    var m = d.morning || {};
    var n = d.nightReflection || {};
    payload.day_records.push({
      date: date,
      morning_intention: str(m.intention),
      morning_main_focus: str(m.mainFocus),
      journal: str(d.journal),
      reflection_what_happened: str(n.whatHappened),
      reflection_wins: str(n.wins),
      reflection_lessons: str(n.lessons),
      reflection_tomorrow_plan: str(n.tomorrowPlan),
      reflection_gratitude: str(n.gratitude),
      brain_dump: str(d.brainDump)
    });
    payload.tasks = payload.tasks.concat(legacyItems(date, d.tasks, true));
    payload.activities = payload.activities.concat(legacyItems(date, d.activities, false));
  });
  if (Array.isArray(goals)) payload.goals = goals.map(legacyGoal).filter(Boolean);
  Object.keys((pomodoro && pomodoro.days) || {}).forEach(function (date) {
    var p = pomodoro.days[date] || {};
    if (!DATE_RE.test(date)) return;
    payload.pomodoro_days.push({ date: date, sessions: Math.max(0, p.sessions | 0), focus_ms: Math.max(0, Math.round(Number(p.focusMs) || 0)) });
  });
  return payload;
}

function emptyPayload() {
  return { entries: [], day_records: [], tasks: [], activities: [], goals: [], pomodoro_days: [], habits: [], habit_logs: [] };
}

export function toRestorePayload(parsed) {
  if (Array.isArray(parsed)) {
    var p = emptyPayload();
    p.entries = parsed.map(legacyEntry).filter(Boolean);
    return { payload: p, format: "journal export" };
  }
  if (parsed && parsed.app === "logbook") {
    var full = emptyPayload();
    Object.keys(full).forEach(function (k) { if (Array.isArray(parsed[k])) full[k] = parsed[k]; });
    return { payload: full, format: "full backup" };
  }
  if (parsed && ("logbook-entries" in parsed || "logbook-days" in parsed || "logbook-goals" in parsed)) {
    return { payload: fromLegacyStorage(parsed), format: "old local data" };
  }
  throw new Error("this file isn't a logbook export");
}

/* Reads whatever the old localStorage version left in this browser.
   "logbook-pomodoro" alone doesn't count: the current version keeps its
   live timer under that same key. */
var LEGACY_DONE_KEY = "logbook-legacy-imported";

export function readLegacyLocalStorage(includeImported) {
  var dump = {};
  try {
    if (!includeImported && localStorage.getItem(LEGACY_DONE_KEY)) return null;
    ["logbook-entries", "logbook-days", "logbook-goals"].forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v && v !== "[]" && v !== "{}") dump[k] = v;
    });
    if (!Object.keys(dump).length) return null;
    var pomo = localStorage.getItem("logbook-pomodoro");
    if (pomo) dump["logbook-pomodoro"] = pomo;
  } catch (e) {
    return null;
  }
  return dump;
}

export function markLegacyImported() {
  try { localStorage.setItem(LEGACY_DONE_KEY, new Date().toISOString()); } catch (e) {}
}

export function summarizeRestore(result) {
  var labels = { entries: "entries", day_records: "days", tasks: "tasks", activities: "activities", goals: "goals", pomodoro_days: "focus days", habits: "habits", habit_logs: "habit check-ins" };
  var parts = [];
  Object.keys(labels).forEach(function (k) {
    var r = result[k];
    if (!r) return;
    var n = r.added + r.merged;
    if (n) parts.push(n + " " + labels[k]);
  });
  return parts.length ? "imported " + parts.join(", ") : "nothing new to import. you already have all of it.";
}
