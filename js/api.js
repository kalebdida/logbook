/*
  The only module that reads or writes journal data.

  Field-name translation lives here and only here: the backend's day
  record is flat and snake_cased (morning_intention, reflection_wins,
  ...), the rest of the app expects the nested camelCase shape
  (morning.intention, nightReflection.wins, ...) that dayRecord.js has
  always used. Everything past this file keeps working with that
  familiar shape, unaware a network call is involved now.
*/

import { getConnection, serverBase, isDevice } from './connection.js';
import { deviceRequest } from './deviceStore.js';

/* Every request goes through here: to the backend over HTTP in server
   mode, or to the in-browser copy of the API in device mode
   (deviceStore.js). Nothing else in the app needs to know which. */
export async function request(path, options) {
  if (isDevice()) return deviceRequest(path, options);
  return serverRequest(serverBase(), getConnection().token, path, options);
}

export async function serverRequest(base, token, path, options) {
  options = Object.assign({}, options || {});
  options.headers = Object.assign({}, options.headers || {});
  if (token) options.headers.Authorization = "Bearer " + token;
  var res = await fetch((base || "") + path, options);
  if (!res.ok) {
    var detail = "";
    try {
      var body = await res.json();
      detail = body && body.detail ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : "";
    } catch (e) {}
    var err = new Error("API " + res.status + (detail ? ": " + detail : "") + " (" + path + ")");
    err.status = res.status;
    err.detail = detail;
    if (res.status === 401 && path.indexOf("/auth/") !== 0) {
      document.dispatchEvent(new CustomEvent("logbook:auth-required"));
    }
    throw err;
  }
  if (res.status === 204) return null;
  var text = await res.text();
  return text ? JSON.parse(text) : null;
}

// returns null on 404 instead of throwing, for reads where "nothing saved
// yet" is a normal, expected outcome rather than a failure
async function requestOr404Null(path) {
  try {
    return await request(path);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

function jsonBody(obj) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

// ---------- entries ----------

function entryFromApi(e) {
  return { id: e.id, date: e.occurred_at, mood: e.mood, text: e.text };
}

export async function apiListEntries() {
  var rows = await request("/entries/?limit=5000");
  return rows.map(entryFromApi);
}

export async function apiCreateEntry(mood, text) {
  var created = await request("/entries/", Object.assign({ method: "POST" }, jsonBody({ mood: mood, text: text })));
  return entryFromApi(created);
}

export async function apiUpdateEntry(id, values) {
  var patch = {};
  if (values.mood !== undefined) patch.mood = values.mood;
  if (values.text !== undefined) patch.text = values.text;
  var updated = await request("/entries/" + encodeURIComponent(id), Object.assign({ method: "PATCH" }, jsonBody(patch)));
  return entryFromApi(updated);
}

export async function apiDeleteEntry(id) {
  await request("/entries/" + encodeURIComponent(id), { method: "DELETE" });
}

// ---------- day records ----------

var EMPTY_DAY_FIELDS = {
  morning: { intention: "", mainFocus: "" },
  journal: "",
  nightReflection: { whatHappened: "", wins: "", lessons: "", tomorrowPlan: "", gratitude: "" },
  brainDump: ""
};

function dayFromApi(dateStr, d) {
  if (!d) return Object.assign({ date: dateStr }, JSON.parse(JSON.stringify(EMPTY_DAY_FIELDS)));
  return {
    date: dateStr,
    morning: { intention: d.morning_intention || "", mainFocus: d.morning_main_focus || "" },
    journal: d.journal || "",
    nightReflection: {
      whatHappened: d.reflection_what_happened || "",
      wins: d.reflection_wins || "",
      lessons: d.reflection_lessons || "",
      tomorrowPlan: d.reflection_tomorrow_plan || "",
      gratitude: d.reflection_gratitude || ""
    },
    brainDump: d.brain_dump || ""
  };
}

// only ever sends the keys actually present in patch, so the backend's
// partial-update logic leaves everything else on the record untouched
function dayPatchToApi(patch) {
  var out = {};
  if (patch.morning) {
    if (patch.morning.intention !== undefined) out.morning_intention = patch.morning.intention;
    if (patch.morning.mainFocus !== undefined) out.morning_main_focus = patch.morning.mainFocus;
  }
  if (patch.journal !== undefined) out.journal = patch.journal;
  if (patch.nightReflection) {
    var nr = patch.nightReflection;
    if (nr.whatHappened !== undefined) out.reflection_what_happened = nr.whatHappened;
    if (nr.wins !== undefined) out.reflection_wins = nr.wins;
    if (nr.lessons !== undefined) out.reflection_lessons = nr.lessons;
    if (nr.tomorrowPlan !== undefined) out.reflection_tomorrow_plan = nr.tomorrowPlan;
    if (nr.gratitude !== undefined) out.reflection_gratitude = nr.gratitude;
  }
  if (patch.brainDump !== undefined) out.brain_dump = patch.brainDump;
  return out;
}

export async function apiGetDay(dateStr) {
  var d = await requestOr404Null("/days/" + dateStr);
  return dayFromApi(dateStr, d);
}

export async function apiSaveDayPatch(dateStr, patch) {
  var d = await request("/days/" + dateStr, Object.assign({ method: "PUT" }, jsonBody(dayPatchToApi(patch))));
  return dayFromApi(dateStr, d);
}

// every saved day record, as a {date: nestedShape} dict, matching exactly
// what storage.js's old loadDays() used to return. analytics.js and
// densityMap.js both scan every stored day at once for their rollups, so
// this exists purely so their internal logic didn't need to change shape.
export async function apiListDaysAsMap() {
  var results = await Promise.all([apiListDays(), apiListTasks(), apiListActivities()]);
  var map = {};
  results[0].forEach(function (row) {
    map[row.date] = dayFromApi(row.date, row);
  });
  function dayFor(date) {
    if (!map[date]) map[date] = dayFromApi(date, null);
    if (!map[date].tasks) map[date].tasks = [];
    if (!map[date].activities) map[date].activities = [];
    return map[date];
  }
  Object.keys(map).forEach(dayFor);
  results[1].forEach(function (t) { dayFor(t.dayDate).tasks.push(t); });
  results[2].forEach(function (a) { dayFor(a.dayDate).activities.push(a); });
  return map;
}

async function apiListDays() {
  return request("/days/?limit=5000");
}

// ---------- tasks & activities ----------

function itemFromApi(t) {
  return {
    id: t.id,
    dayDate: t.day_date,
    title: t.title,
    completed: Boolean(t.completed),
    activityCategory: t.activity_category || null,
    durationMinutes: t.duration_minutes || null,
    createdAt: t.created_at
  };
}

function itemToApi(values) {
  var out = {};
  if (values.dayDate !== undefined) out.day_date = values.dayDate;
  if (values.title !== undefined) out.title = values.title;
  if (values.completed !== undefined) out.completed = values.completed;
  if (values.activityCategory !== undefined) out.activity_category = values.activityCategory || null;
  if (values.durationMinutes !== undefined) out.duration_minutes = values.durationMinutes || null;
  return out;
}

function query(params) {
  var parts = [];
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] !== undefined && params[k] !== null) parts.push(k + "=" + encodeURIComponent(params[k]));
  });
  return parts.length ? "?" + parts.join("&") : "";
}

export async function apiListTasks(params) {
  var rows = await request("/tasks/" + query(params));
  return rows.map(itemFromApi);
}

export async function apiCreateTask(values) {
  return itemFromApi(await request("/tasks/", Object.assign({ method: "POST" }, jsonBody(itemToApi(values)))));
}

export async function apiUpdateTask(id, values) {
  return itemFromApi(await request("/tasks/" + id, Object.assign({ method: "PATCH" }, jsonBody(itemToApi(values)))));
}

export async function apiDeleteTask(id) {
  await request("/tasks/" + id, { method: "DELETE" });
}

export async function apiListActivities(params) {
  var rows = await request("/activities/" + query(params));
  return rows.map(itemFromApi);
}

export async function apiCreateActivity(values) {
  return itemFromApi(await request("/activities/", Object.assign({ method: "POST" }, jsonBody(itemToApi(values)))));
}

export async function apiDeleteActivity(id) {
  await request("/activities/" + id, { method: "DELETE" });
}

// ---------- goals ----------

function goalFromApi(g) {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    priority: g.priority,
    progress: g.progress,
    completed: g.completed,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    completedAt: g.completed_at,
    targetDate: g.target_date,
    activityCategory: g.activity_category || null
  };
}

export async function apiListGoals() {
  var rows = await request("/goals/?limit=5000");
  return rows.map(goalFromApi);
}

export async function apiCreateGoal(values) {
  var created = await request(
    "/goals/",
    Object.assign(
      { method: "POST" },
      jsonBody({
        title: values.title,
        description: values.description || "",
        category: values.category,
        priority: values.priority,
        progress: values.progress,
        target_date: values.targetDate || null,
        activity_category: values.activityCategory || null
      })
    )
  );
  return goalFromApi(created);
}

export async function apiUpdateGoal(id, values) {
  var patch = {};
  if (values.title !== undefined) patch.title = values.title;
  if (values.description !== undefined) patch.description = values.description;
  if (values.category !== undefined) patch.category = values.category;
  if (values.priority !== undefined) patch.priority = values.priority;
  if (values.progress !== undefined) patch.progress = values.progress;
  if (values.targetDate !== undefined) patch.target_date = values.targetDate || null;
  if (values.activityCategory !== undefined) patch.activity_category = values.activityCategory || null;
  var updated = await request("/goals/" + encodeURIComponent(id), Object.assign({ method: "PATCH" }, jsonBody(patch)));
  return goalFromApi(updated);
}

export async function apiDeleteGoal(id) {
  await request("/goals/" + encodeURIComponent(id), { method: "DELETE" });
}

// ---------- pomodoro ----------

export async function apiRecordPomodoroSession(dateStr, focusMs) {
  return request(
    "/pomodoro/" + dateStr + "/sessions",
    Object.assign({ method: "POST" }, jsonBody({ focus_ms: focusMs }))
  );
}

export async function apiGetPomodoroDay(dateStr) {
  var d = await requestOr404Null("/pomodoro/" + dateStr);
  return d || { date: dateStr, sessions: 0, focus_ms: 0 };
}

export async function apiListPomodoroDays() {
  return request("/pomodoro/");
}

// ---------- backup & health ----------

export async function apiExportBackup() {
  return request("/backup");
}

// payload: { entries, day_records, tasks, activities, goals, pomodoro_days }
// in the backend's snake_case shape. Additive: never overwrites anything.
export async function apiRestoreBackup(payload) {
  return request("/backup/restore", Object.assign({ method: "POST" }, jsonBody(payload)));
}

export async function apiHealth() {
  return request("/health");
}

// ---------- habits ----------

function fromHabit(h) {
  return { id: h.id, name: h.name, icon: h.icon || "", category: h.activity_category || "", archived: Boolean(h.archived), sort: h.sort || 0 };
}

function toHabit(v) {
  var out = {};
  if (v.name !== undefined) out.name = v.name;
  if (v.icon !== undefined) out.icon = v.icon;
  if (v.category !== undefined) out.activity_category = v.category || null;
  if (v.archived !== undefined) out.archived = v.archived;
  if (v.sort !== undefined) out.sort = v.sort;
  return out;
}

export async function apiListHabits(includeArchived) {
  return (await request("/habits/" + (includeArchived ? "?include_archived=true" : ""))).map(fromHabit);
}

export async function apiCreateHabit(values) {
  return fromHabit(await request("/habits/", Object.assign({ method: "POST" }, jsonBody(toHabit(values)))));
}

export async function apiUpdateHabit(id, values) {
  return fromHabit(await request("/habits/" + id, Object.assign({ method: "PATCH" }, jsonBody(toHabit(values)))));
}

export async function apiDeleteHabit(id) {
  return request("/habits/" + id, { method: "DELETE" });
}

/* [{ habitId, date }] */
export async function apiHabitLogs(start, end) {
  return (await request("/habits/logs" + query({ start: start, end: end }))).map(function (l) { return { habitId: l.habit_id, date: l.date }; });
}

export async function apiSetHabitDay(id, date, done) {
  return request("/habits/" + id + "/days/" + date, { method: done ? "PUT" : "DELETE" });
}

// ---------- auth & AI ----------

export async function apiAuthStatus() {
  return request("/auth/status");
}

/* base: which server (the connect form logs in before it's saved). An empty
   username means the admin, which is also what older servers expect. */
export async function apiLogin(base, password, username) {
  return serverRequest(base, "", "/auth/login", Object.assign({ method: "POST" }, jsonBody({ username: username || "", password: password })));
}

export async function apiSignup(base, invite, username, password) {
  return serverRequest(base, "", "/auth/signup", Object.assign({ method: "POST" }, jsonBody({ invite: invite, username: username, password: password })));
}

export async function apiResetPassword(base, username, code, password) {
  return serverRequest(base, "", "/auth/reset", Object.assign({ method: "POST" }, jsonBody({ username: username, code: code, password: password })));
}

export async function apiMe() {
  return request("/auth/me");
}

export async function apiChangePassword(current, next) {
  return request("/auth/password", Object.assign({ method: "POST" }, jsonBody({ current: current, new: next })));
}

export async function apiLogoutEverywhere() {
  return request("/auth/logout-everywhere", { method: "POST" });
}

export async function apiDeleteAccount(password) {
  return request("/auth/delete-account", Object.assign({ method: "POST" }, jsonBody({ password: password })));
}

/* admin only */
export async function apiListInvites() {
  return request("/auth/invites");
}

export async function apiCreateInvite(note) {
  return request("/auth/invites", Object.assign({ method: "POST" }, jsonBody({ note: note || "" })));
}

export async function apiCancelInvite(id) {
  return request("/auth/invites/" + id, { method: "DELETE" });
}

export async function apiListUsers() {
  return request("/auth/users");
}

export async function apiResetCode(userId) {
  return request("/auth/users/" + userId + "/reset-code", { method: "POST" });
}

export async function apiRemoveUser(userId, password) {
  return request("/auth/users/" + userId, Object.assign({ method: "DELETE" }, jsonBody({ password: password })));
}

export async function apiAIStatus() {
  return request("/ai/status");
}

export async function apiAIChat(messages, system, maxTokens) {
  return request("/ai/chat", Object.assign({ method: "POST" }, jsonBody({ messages: messages, system: system, max_tokens: maxTokens || 900 })));
}
