/* Device mode: the whole Logbook API, running inside the browser.

   Same routes, same JSON, same rules as backend/app (partial day updates,
   goal completion from progress, additive restore...), stored in IndexedDB.
   This is what lets the app run with no server at all: on static hosting,
   offline, and inside the Android app. api.js sends requests here instead
   of over the network when the connection mode is "device".

   If you change a rule in the backend, change it here too.
   tests/e2e_browser.py runs the same checks against both. */

import { CATEGORIES } from './categories.js';

var DB_NAME = "logbook-device";
var DB_VERSION = 1;
var TABLES = {
  entries: "id",
  day_records: "date",
  tasks: "id",
  activities: "id",
  goals: "id",
  pomodoro_days: "date",
  habits: "id",
  habit_logs: "key",
  meta: "key"
};
var VERSION = "2.0.0";

var MOODS = ["good", "okay", "rough"];
var AREAS = CATEGORIES.map(function (c) { return c.id; });
var GOAL_CATEGORIES = ["daily", "weekly", "monthly", "long-term"];
var PRIORITIES = ["low", "medium", "high"];
var DAY_FIELDS = ["morning_intention", "morning_main_focus", "journal", "reflection_what_happened", "reflection_wins",
  "reflection_lessons", "reflection_tomorrow_plan", "reflection_gratitude", "brain_dump"];
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

var db = null;          // IDBDatabase, or null when IndexedDB isn't available
var mem = null;         // { table: Map }
var ready = null;
var persistent = true;

/* ---------- storage ---------- */

function openDb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      var d = req.result;
      Object.keys(TABLES).forEach(function (t) {
        if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: TABLES[t] });
      });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
    req.onblocked = function () { reject(new Error("database blocked by another tab")); };
  });
}

function readAll(table) {
  return new Promise(function (resolve, reject) {
    var req = db.transaction(table, "readonly").objectStore(table).getAll();
    req.onsuccess = function () { resolve(req.result || []); };
    req.onerror = function () { reject(req.error); };
  });
}

export function initDeviceStore() {
  if (ready) return ready;
  ready = (async function () {
    mem = {};
    Object.keys(TABLES).forEach(function (t) { mem[t] = new Map(); });
    try {
      if (!("indexedDB" in window)) throw new Error("no indexedDB");
      db = await openDb();
      for (var t of Object.keys(TABLES)) {
        (await readAll(t)).forEach(function (row) { mem[t].set(row[TABLES[t]], row); });
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (e) {
      db = null;
      persistent = false;
      console.warn("logbook: IndexedDB unavailable, device data will not survive a reload", e);
    }
  })();
  return ready;
}

export function deviceStorageIsPersistent() {
  return persistent;
}

/* Apply a batch of writes to memory and IndexedDB in one transaction. */
function commit(ops) {
  ops.forEach(function (op) {
    if (op.del) mem[op.table].delete(op.key);
    else mem[op.table].set(op.row[TABLES[op.table]], op.row);
  });
  if (!db) return Promise.resolve();
  var tables = Array.from(new Set(ops.map(function (o) { return o.table; })));
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(tables, "readwrite");
    ops.forEach(function (op) {
      var store = tx.objectStore(op.table);
      if (op.del) store.delete(op.key);
      else store.put(op.row);
    });
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error || new Error("write aborted")); };
  });
}

function put(table, row) { return { table: table, row: row }; }
function del(table, key) { return { table: table, key: key, del: true }; }

function nextId(table, ops) {
  var key = "seq:" + table;
  var meta = mem.meta.get(key);
  var max = 0;
  mem[table].forEach(function (r) { if (r.id > max) max = r.id; });
  var n = Math.max(meta ? meta.value : 0, max) + 1;
  ops.push(put("meta", { key: key, value: n }));
  mem.meta.set(key, { key: key, value: n });
  return n;
}

/* ---------- helpers ---------- */

function fail(status, detail) {
  var err = new Error("API " + status + ": " + detail);
  err.status = status;
  err.detail = detail;
  throw err;
}

function now() { return new Date().toISOString(); }

function hex(bytes) {
  var a = new Uint8Array(bytes);
  crypto.getRandomValues(a); // works on plain http too, unlike randomUUID
  return Array.from(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function iso(value, field) {
  var d = new Date(value);
  if (value == null || isNaN(d)) fail(422, field + " must be a date and time");
  return d.toISOString();
}

function dateArg(value, field) {
  if (typeof value !== "string" || !DATE_RE.test(value) || isNaN(new Date(value + "T00:00:00Z"))) fail(422, field + " must be YYYY-MM-DD");
  return value;
}

function text(value, field, max, min) {
  if (typeof value !== "string") fail(422, field + " must be text");
  if (value.length < (min == null ? 1 : min)) fail(422, field + " can't be empty");
  if (max && value.length > max) fail(422, field + " is too long");
  return value;
}

function area(value) {
  if (value == null || value === "") return null;
  if (AREAS.indexOf(value) < 0) fail(422, "unknown life area: " + value);
  return value;
}

function minutes(value) {
  if (value == null || value === "") return null;
  var n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1440) fail(422, "duration_minutes must be 0 to 1440");
  return n;
}

function oneOf(value, list, field) {
  if (list.indexOf(value) < 0) fail(422, field + " must be one of " + list.join(", "));
  return value;
}

function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function rows(table) { return Array.from(mem[table].values()); }
function copy(o) { return Object.assign({}, o); }
function get(table, key, label) {
  var row = mem[table].get(key);
  if (!row) fail(404, label + " not found");
  return row;
}

async function ensureDay(date, ops) {
  if (!mem.day_records.has(date)) {
    var t = now();
    var row = { date: date, created_at: t, updated_at: t };
    DAY_FIELDS.forEach(function (f) { row[f] = ""; });
    ops.push(put("day_records", row));
    mem.day_records.set(date, row);
  }
}

function applyCompletion(goal, previouslyCompleted) {
  var done = goal.progress === 100;
  if (done && !previouslyCompleted) goal.completed_at = now();
  else if (!done) goal.completed_at = null;
  goal.completed = done;
}

function counts() {
  return {
    entries: mem.entries.size, day_records: mem.day_records.size, tasks: mem.tasks.size,
    activities: mem.activities.size, goals: mem.goals.size, pomodoro_days: mem.pomodoro_days.size, habits: mem.habits.size
  };
}

/* ---------- routes ---------- */

var routes = [];
function route(method, pattern, handler) {
  var keys = [];
  var re = new RegExp("^" + pattern.replace(/\{(\w+)\}/g, function (_, k) { keys.push(k); return "([^/]+)"; }) + "/?$");
  routes.push({ method: method, re: re, keys: keys, handler: handler });
}

/* health & auth */
route("GET", "/health", function () {
  return { app: "logbook", status: "online", version: VERSION, auth_required: false, ai: false, database: "this device", counts: counts() };
});
route("GET", "/auth/status", function () { return { required: false, authenticated: true }; });
route("POST", "/auth/login", function () { return { token: "", expires_at: null, required: false }; });

/* entries */
route("POST", "/entries", async function (p, q, body) {
  var mood = oneOf(body.mood, MOODS, "mood");
  var txt = text(body.text, "text", 0);
  var id = body.id != null ? text(String(body.id), "id", 64) : hex(16);
  if (mem.entries.has(id)) fail(409, "An entry with that id already exists");
  var row = { id: id, occurred_at: body.occurred_at ? iso(body.occurred_at, "occurred_at") : now(), mood: mood, text: txt };
  await commit([put("entries", row)]);
  return copy(row);
});
route("GET", "/entries", function (p, q) {
  var list = rows("entries").sort(function (a, b) { return b.occurred_at.localeCompare(a.occurred_at); });
  return list.slice(Number(q.get("skip") || 0), Number(q.get("skip") || 0) + Number(q.get("limit") || 5000)).map(copy);
});
route("GET", "/entries/{id}", function (p) { return copy(get("entries", p.id, "Entry")); });
route("PATCH", "/entries/{id}", async function (p, q, body) {
  var row = copy(get("entries", p.id, "Entry"));
  if (body.mood != null) row.mood = oneOf(body.mood, MOODS, "mood");
  if (body.text != null) row.text = text(body.text, "text", 0);
  await commit([put("entries", row)]);
  return copy(row);
});
route("DELETE", "/entries/{id}", async function (p) {
  get("entries", p.id, "Entry");
  await commit([del("entries", p.id)]);
  return null;
});

/* day records */
route("PUT", "/days/{date}", async function (p, q, body) {
  var date = dateArg(p.date, "date");
  var existing = mem.day_records.get(date);
  var t = now();
  var row = existing ? copy(existing) : { date: date, created_at: t };
  DAY_FIELDS.forEach(function (f) {
    if (has(body, f)) row[f] = text(String(body[f] == null ? "" : body[f]), f, 0, 0);
    else if (!existing) row[f] = "";
  });
  row.updated_at = t;
  await commit([put("day_records", row)]);
  return copy(row);
});
route("GET", "/days", function () {
  return rows("day_records").sort(function (a, b) { return b.date.localeCompare(a.date); }).map(copy);
});
route("GET", "/days/{date}", function (p) { return copy(get("day_records", p.date, "Day")); });
route("DELETE", "/days/{date}", async function (p) {
  get("day_records", p.date, "Day");
  await commit([del("day_records", p.date)]);
  return null;
});

/* tasks & activities share their shape */
function itemRoutes(table, label, withCompleted) {
  route("POST", "/" + (table === "tasks" ? "tasks" : "activities"), async function (p, q, body) {
    var ops = [];
    var day = dateArg(body.day_date, "day_date");
    var row = {
      day_date: day,
      title: text(body.title, "title", 300),
      activity_category: area(body.activity_category),
      duration_minutes: minutes(body.duration_minutes),
      created_at: now()
    };
    row.updated_at = row.created_at;
    if (withCompleted) row.completed = false;
    await ensureDay(day, ops);
    row.id = nextId(table, ops);
    ops.push(put(table, row));
    await commit(ops);
    return copy(row);
  });
  route("GET", "/" + table, function (p, q) {
    var list = rows(table);
    if (q.get("day_date")) list = list.filter(function (r) { return r.day_date === q.get("day_date"); });
    if (withCompleted && q.get("before")) list = list.filter(function (r) { return r.day_date < q.get("before"); });
    if (withCompleted && q.get("completed") != null) {
      var want = q.get("completed") === "true";
      list = list.filter(function (r) { return Boolean(r.completed) === want; });
    }
    list.sort(function (a, b) { return b.day_date.localeCompare(a.day_date) || a.created_at.localeCompare(b.created_at) || a.id - b.id; });
    return list.map(copy);
  });
  route("PATCH", "/" + table + "/{id}", async function (p, q, body) {
    var ops = [];
    var row = copy(get(table, Number(p.id), label));
    if (body.title != null) row.title = text(body.title, "title", 300);
    if (has(body, "activity_category")) row.activity_category = area(body.activity_category);
    if (has(body, "duration_minutes")) row.duration_minutes = minutes(body.duration_minutes);
    if (withCompleted && body.completed != null) row.completed = Boolean(body.completed);
    if (withCompleted && body.day_date != null) {
      row.day_date = dateArg(body.day_date, "day_date");
      await ensureDay(row.day_date, ops);
    }
    row.updated_at = now();
    ops.push(put(table, row));
    await commit(ops);
    return copy(row);
  });
  route("DELETE", "/" + table + "/{id}", async function (p) {
    get(table, Number(p.id), label);
    await commit([del(table, Number(p.id))]);
    return null;
  });
}
itemRoutes("tasks", "Task", true);
itemRoutes("activities", "Activity", false);

/* goals */
route("POST", "/goals", async function (p, q, body) {
  var progress = body.progress == null ? 0 : Number(body.progress);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) fail(422, "progress must be 0 to 100");
  var t = now();
  var row = {
    id: "goal-" + hex(16),
    title: text(body.title, "title", 300),
    description: body.description == null ? "" : String(body.description),
    category: oneOf(body.category || "daily", GOAL_CATEGORIES, "category"),
    priority: oneOf(body.priority || "medium", PRIORITIES, "priority"),
    progress: progress,
    completed: false,
    created_at: t,
    updated_at: t,
    completed_at: null,
    target_date: body.target_date ? dateArg(body.target_date, "target_date") : null,
    activity_category: area(body.activity_category)
  };
  applyCompletion(row, false);
  await commit([put("goals", row)]);
  return copy(row);
});
route("GET", "/goals", function (p, q) {
  var list = rows("goals");
  if (q.get("category")) list = list.filter(function (g) { return g.category === q.get("category"); });
  if (q.get("completed") != null) {
    var want = q.get("completed") === "true";
    list = list.filter(function (g) { return g.completed === want; });
  }
  return list.sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }).map(copy);
});
route("GET", "/goals/{id}", function (p) { return copy(get("goals", p.id, "Goal")); });
route("PATCH", "/goals/{id}", async function (p, q, body) {
  var row = copy(get("goals", p.id, "Goal"));
  var was = row.completed;
  if (body.title != null) row.title = text(body.title, "title", 300);
  if (body.description != null) row.description = String(body.description);
  if (body.category != null) row.category = oneOf(body.category, GOAL_CATEGORIES, "category");
  if (body.priority != null) row.priority = oneOf(body.priority, PRIORITIES, "priority");
  if (body.progress != null) {
    var n = Number(body.progress);
    if (!Number.isInteger(n) || n < 0 || n > 100) fail(422, "progress must be 0 to 100");
    row.progress = n;
  }
  if (has(body, "target_date")) row.target_date = body.target_date ? dateArg(body.target_date, "target_date") : null;
  if (has(body, "activity_category")) row.activity_category = area(body.activity_category);
  applyCompletion(row, was);
  row.updated_at = now();
  await commit([put("goals", row)]);
  return copy(row);
});
route("DELETE", "/goals/{id}", async function (p) {
  get("goals", p.id, "Goal");
  await commit([del("goals", p.id)]);
  return null;
});

/* pomodoro */
route("POST", "/pomodoro/{date}/sessions", async function (p, q, body) {
  var date = dateArg(p.date, "date");
  var ms = Number(body.focus_ms);
  if (!Number.isFinite(ms) || ms < 0) fail(422, "focus_ms must be 0 or more");
  var row = copy(mem.pomodoro_days.get(date) || { date: date, sessions: 0, focus_ms: 0 });
  row.sessions += 1;
  row.focus_ms += Math.round(ms);
  await commit([put("pomodoro_days", row)]);
  return copy(row);
});
route("GET", "/pomodoro", function () {
  return rows("pomodoro_days").sort(function (a, b) { return b.date.localeCompare(a.date); }).map(copy);
});
route("GET", "/pomodoro/{date}", function (p) { return copy(get("pomodoro_days", p.date, "Focus day")); });

/* habits */
route("GET", "/habits", function (p, q) {
  var list = rows("habits");
  if (q.get("include_archived") !== "true") list = list.filter(function (h) { return !h.archived; });
  return list.sort(function (a, b) { return a.sort - b.sort || a.id - b.id; }).map(copy);
});
route("POST", "/habits", async function (p, q, body) {
  var ops = [];
  var t = now();
  var row = {
    name: text(body.name, "name", 80),
    icon: body.icon == null ? "" : text(String(body.icon), "icon", 16, 0),
    activity_category: area(body.activity_category),
    archived: false,
    sort: mem.habits.size,
    created_at: t,
    updated_at: t
  };
  row.id = nextId("habits", ops);
  ops.push(put("habits", row));
  await commit(ops);
  return copy(row);
});
route("GET", "/habits/logs", function (p, q) {
  var start = q.get("start"), end = q.get("end");
  return rows("habit_logs")
    .filter(function (l) { return (!start || l.date >= start) && (!end || l.date <= end); })
    .sort(function (a, b) { return a.date.localeCompare(b.date) || a.habit_id - b.habit_id; })
    .map(function (l) { return { habit_id: l.habit_id, date: l.date }; });
});
route("PATCH", "/habits/{id}", async function (p, q, body) {
  var row = copy(get("habits", Number(p.id), "Habit"));
  if (body.name != null) row.name = text(body.name, "name", 80);
  if (body.icon != null) row.icon = text(String(body.icon), "icon", 16, 0);
  if (has(body, "activity_category")) row.activity_category = area(body.activity_category);
  if (body.archived != null) row.archived = Boolean(body.archived);
  if (body.sort != null) row.sort = Number(body.sort) || 0;
  row.updated_at = now();
  await commit([put("habits", row)]);
  return copy(row);
});
route("DELETE", "/habits/{id}", async function (p) {
  var id = Number(p.id);
  get("habits", id, "Habit");
  var ops = [del("habits", id)];
  rows("habit_logs").forEach(function (l) { if (l.habit_id === id) ops.push(del("habit_logs", l.key)); });
  await commit(ops);
  return null;
});
route("PUT", "/habits/{id}/days/{date}", async function (p) {
  var id = Number(p.id);
  get("habits", id, "Habit");
  var date = dateArg(p.date, "date");
  var key = id + "|" + date;
  if (!mem.habit_logs.has(key)) await commit([put("habit_logs", { key: key, habit_id: id, date: date })]);
  return { habit_id: id, date: date };
});
route("DELETE", "/habits/{id}/days/{date}", async function (p) {
  var key = Number(p.id) + "|" + p.date;
  if (mem.habit_logs.has(key)) await commit([del("habit_logs", key)]);
  return null;
});

/* backup */
route("GET", "/backup", function () {
  function sorted(table, cmp) { return rows(table).sort(cmp).map(copy); }
  return {
    app: "logbook",
    version: 1,
    exported_at: now(),
    entries: sorted("entries", function (a, b) { return a.occurred_at.localeCompare(b.occurred_at); }),
    day_records: sorted("day_records", function (a, b) { return a.date.localeCompare(b.date); }),
    tasks: sorted("tasks", function (a, b) { return a.day_date.localeCompare(b.day_date) || a.id - b.id; }),
    activities: sorted("activities", function (a, b) { return a.day_date.localeCompare(b.day_date) || a.id - b.id; }),
    goals: sorted("goals", function (a, b) { return a.created_at.localeCompare(b.created_at); }),
    pomodoro_days: sorted("pomodoro_days", function (a, b) { return a.date.localeCompare(b.date); }),
    habits: sorted("habits", function (a, b) { return a.sort - b.sort || a.id - b.id; }),
    habit_logs: rows("habit_logs").sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (l) { return { habit_id: l.habit_id, date: l.date }; })
  };
});

route("POST", "/backup/restore", async function (p, q, body) {
  var result = {};
  ["entries", "day_records", "tasks", "activities", "goals", "pomodoro_days", "habits", "habit_logs"].forEach(function (k) {
    result[k] = { added: 0, merged: 0, skipped: 0 };
  });
  var ops = [];
  var list = function (k) { return Array.isArray(body[k]) ? body[k] : []; };

  list("day_records").forEach(function (item) {
    var date = dateArg(item.date, "date");
    var existing = mem.day_records.get(date);
    if (!existing) {
      var t = now();
      var row = { date: date, created_at: t, updated_at: t };
      DAY_FIELDS.forEach(function (f) { row[f] = typeof item[f] === "string" ? item[f] : ""; });
      ops.push(put("day_records", row));
      mem.day_records.set(date, row);
      result.day_records.added++;
      return;
    }
    var merged = copy(existing), filled = false;
    DAY_FIELDS.forEach(function (f) {
      if (typeof item[f] === "string" && item[f] && !String(merged[f] || "").trim()) { merged[f] = item[f]; filled = true; }
    });
    if (filled) { merged.updated_at = now(); ops.push(put("day_records", merged)); mem.day_records.set(date, merged); result.day_records.merged++; }
    else result.day_records.skipped++;
  });

  list("entries").forEach(function (item) {
    if (item.id && mem.entries.has(String(item.id))) { result.entries.skipped++; return; }
    var row = { id: item.id ? text(String(item.id), "id", 64) : hex(16), occurred_at: iso(item.occurred_at, "occurred_at"),
      mood: oneOf(item.mood, MOODS, "mood"), text: text(item.text, "text", 0) };
    ops.push(put("entries", row));
    mem.entries.set(row.id, row);
    result.entries.added++;
  });

  var taskKeys = new Set(rows("tasks").map(function (t) { return t.day_date + "|" + t.title; }));
  for (var item of list("tasks")) {
    var key = item.day_date + "|" + item.title;
    if (taskKeys.has(key)) { result.tasks.skipped++; continue; }
    var day = dateArg(item.day_date, "day_date");
    await ensureDay(day, ops);
    var t1 = now();
    var row = { day_date: day, title: text(item.title, "title", 300), completed: Boolean(item.completed),
      activity_category: area(item.activity_category), duration_minutes: minutes(item.duration_minutes), created_at: t1, updated_at: t1 };
    row.id = nextId("tasks", ops);
    ops.push(put("tasks", row));
    mem.tasks.set(row.id, row);
    taskKeys.add(key);
    result.tasks.added++;
  }

  var actKeys = new Set(rows("activities").map(function (a) { return a.day_date + "|" + a.title + "|" + a.duration_minutes; }));
  for (var a of list("activities")) {
    var akey = a.day_date + "|" + a.title + "|" + (a.duration_minutes == null ? null : a.duration_minutes);
    if (actKeys.has(akey)) { result.activities.skipped++; continue; }
    var aday = dateArg(a.day_date, "day_date");
    await ensureDay(aday, ops);
    var t2 = now();
    var arow = { day_date: aday, title: text(a.title, "title", 300), activity_category: area(a.activity_category),
      duration_minutes: minutes(a.duration_minutes), created_at: t2, updated_at: t2 };
    arow.id = nextId("activities", ops);
    ops.push(put("activities", arow));
    mem.activities.set(arow.id, arow);
    actKeys.add(akey);
    result.activities.added++;
  }

  list("goals").forEach(function (g) {
    if (g.id && mem.goals.has(String(g.id))) { result.goals.skipped++; return; }
    var progress = Math.max(0, Math.min(100, Math.round(Number(g.progress) || 0)));
    var t3 = now();
    var done = progress === 100;
    var row = {
      id: g.id ? String(g.id).slice(0, 64) : "goal-" + hex(16),
      title: text(g.title, "title", 300),
      description: g.description ? String(g.description) : "",
      category: GOAL_CATEGORIES.indexOf(g.category) >= 0 ? g.category : "daily",
      priority: PRIORITIES.indexOf(g.priority) >= 0 ? g.priority : "medium",
      progress: progress,
      completed: done,
      created_at: g.created_at ? iso(g.created_at, "created_at") : t3,
      updated_at: g.updated_at ? iso(g.updated_at, "updated_at") : (g.created_at ? iso(g.created_at, "created_at") : t3),
      completed_at: done ? (g.completed_at ? iso(g.completed_at, "completed_at") : (g.updated_at ? iso(g.updated_at, "updated_at") : t3)) : null,
      target_date: g.target_date && DATE_RE.test(g.target_date) ? g.target_date : null,
      activity_category: area(g.activity_category)
    };
    ops.push(put("goals", row));
    mem.goals.set(row.id, row);
    result.goals.added++;
  });

  list("pomodoro_days").forEach(function (pd) {
    var date = dateArg(pd.date, "date");
    var sessions = Math.max(0, Number(pd.sessions) || 0), ms = Math.max(0, Number(pd.focus_ms) || 0);
    var existing = mem.pomodoro_days.get(date);
    if (!existing) {
      var row = { date: date, sessions: sessions, focus_ms: ms };
      ops.push(put("pomodoro_days", row)); mem.pomodoro_days.set(date, row); result.pomodoro_days.added++;
    } else if (sessions > existing.sessions || ms > existing.focus_ms) {
      var m = { date: date, sessions: Math.max(existing.sessions, sessions), focus_ms: Math.max(existing.focus_ms, ms) };
      ops.push(put("pomodoro_days", m)); mem.pomodoro_days.set(date, m); result.pomodoro_days.merged++;
    } else result.pomodoro_days.skipped++;
  });

  var byName = new Map(rows("habits").map(function (h) { return [h.name.trim().toLowerCase(), h]; }));
  var idMap = new Map();
  list("habits").forEach(function (h) {
    var name = text(String(h.name || ""), "name", 80).trim();
    var habit = byName.get(name.toLowerCase());
    if (!habit) {
      var t4 = now();
      habit = { name: name, icon: h.icon ? String(h.icon).slice(0, 16) : "", activity_category: area(h.activity_category),
        archived: Boolean(h.archived), sort: byName.size, created_at: t4, updated_at: t4 };
      habit.id = nextId("habits", ops);
      ops.push(put("habits", habit));
      mem.habits.set(habit.id, habit);
      byName.set(name.toLowerCase(), habit);
      result.habits.added++;
    } else result.habits.skipped++;
    if (h.id != null) idMap.set(Number(h.id), habit.id);
  });
  list("habit_logs").forEach(function (l) {
    var hid = idMap.get(Number(l.habit_id));
    var key = hid + "|" + l.date;
    if (hid == null || !DATE_RE.test(l.date) || mem.habit_logs.has(key)) { result.habit_logs.skipped++; return; }
    var row = { key: key, habit_id: hid, date: l.date };
    ops.push(put("habit_logs", row)); mem.habit_logs.set(key, row); result.habit_logs.added++;
  });

  await commit(ops);
  return result;
});

/* ---------- entry point ---------- */

export async function deviceRequest(path, options) {
  await initDeviceStore();
  options = options || {};
  var method = (options.method || "GET").toUpperCase();
  var url = new URL(path, "http://device");
  var clean = url.pathname.replace(/\/+$/, "") || "/";
  var body = {};
  if (options.body) {
    try { body = JSON.parse(options.body) || {}; } catch (e) { fail(422, "invalid JSON"); }
  }
  for (var r of routes) {
    if (r.method !== method) continue;
    var m = clean.match(r.re);
    if (!m) continue;
    var params = {};
    r.keys.forEach(function (k, i) { params[k] = decodeURIComponent(m[i + 1]); });
    if (method === "GET") return r.handler(params, url.searchParams, body);
    return write(r.handler, params, url.searchParams, body);
  }
  fail(404, "Not Found");
}

/* Writes run one at a time. If one fails part-way (a bad item in a restore,
   a full disk), memory goes back to how it was, so the screen never shows
   something that wasn't saved. */
var writeQueue = Promise.resolve();
function write(handler, params, query, body) {
  var run = async function () {
    var snapshot = {};
    Object.keys(mem).forEach(function (t) { snapshot[t] = new Map(mem[t]); });
    try {
      return await handler(params, query, body);
    } catch (e) {
      mem = snapshot;
      throw e;
    }
  };
  var result = writeQueue.then(run, run);
  writeQueue = result.catch(function () {});
  return result;
}

/* Has the browser promised not to clear this site's storage on its own? */
export async function deviceStoragePersisted() {
  try {
    return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  } catch (e) {
    return false;
  }
}

/* Wipe this device's journal data (used when a test or the user asks). */
export async function clearDeviceStore() {
  await initDeviceStore();
  var ops = [];
  Object.keys(TABLES).forEach(function (t) { mem[t].forEach(function (row) { ops.push(del(t, row[TABLES[t]])); }); });
  if (ops.length) await commit(ops);
}
