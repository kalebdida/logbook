import { apiGetDay, apiSaveDayPatch } from './api.js';
import { dateKey } from './dayRecord.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';
import { renderTasks, addTodayTasks } from './tasks.js';
import { renderActivities, getTodayActivities } from './activities.js';
import { getPrefs, setPrefs } from './prefs.js';
import { icon } from './icons.js';

/* The dashboard's day, in the order a day goes:
     Today      one focus line + the task list
     Time log   what you actually did, by life area
     Tonight    wins, lessons, gratitude, and tomorrow's tasks
   plus a brain dump in the side column that can turn into tasks.
   Everything saves as you type. Older days may hold an "intention", a
   free-text "tomorrow's plan" or "notes"; those boxes only show when they
   have something in them, so nothing written before is lost. */
var FIELDS = {
  morningIntention: ["morning", "intention"],
  mainFocus: ["morning", "mainFocus"],
  dailyJournal: ["journal"],
  nightWins: ["nightReflection", "wins"],
  nightLessons: ["nightReflection", "lessons"],
  nightTomorrowPlan: ["nightReflection", "tomorrowPlan"],
  nightGratitude: ["nightReflection", "gratitude"],
  brainDump: ["brainDump"]
};
var FIELD_IDS = Object.keys(FIELDS);
var AUTOSAVE_DELAY = 800;
var DRAFT_KEY = "logbook-daily-draft";

var saveTimer = null;
var dirty = {};
var currentDay = null;

function readPath(record, path) {
  return path.length === 1 ? record[path[0]] : (record[path[0]] || {})[path[1]];
}

function has(v) {
  return String(v || "").trim() !== "";
}

function field(id, label, rows, placeholder, cls) {
  return (
    '<label class="daily-field' + (cls ? " " + cls : "") + '" for="' + id + '">' +
    '<span class="section-label">' + label + "</span>" +
    '<textarea id="' + id + '" rows="' + rows + '" placeholder="' + escapeHtml(placeholder || "") + '"></textarea>' +
    "</label>"
  );
}

function fold(id, iconName, title, meta, open, body) {
  return '<details class="day-card day-fold" id="' + id + '"' + (open ? " open" : "") + ">" +
    '<summary class="day-fold-head"><span class="card-title">' + icon(iconName) + "<span>" + title + "</span></span>" +
      '<span class="card-meta" data-fold-meta>' + (meta || "") + "</span>" +
      '<span class="day-fold-chevron" aria-hidden="true">' + icon("chevron-down") + "</span></summary>" +
    '<div class="day-fold-body">' + body + "</div></details>";
}

export async function renderDailyPage() {
  var container = document.getElementById("dailyPage");
  if (!container) return;

  var now = new Date();
  var today = dateKey(now);
  var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  var loaded = await Promise.all([apiGetDay(today), apiGetDay(dateKey(yesterday))]);
  var record = loaded[0];
  var plannedYesterday = (loaded[1].nightReflection.tomorrowPlan || "").trim();
  currentDay = today;
  dirty = {};

  var draft = loadDraft();
  var drafted = function (id) { return Boolean(draft && draft.date === today && draft.values && has(draft.values[id])); };
  var legacy = function (id) { return has(readPath(record, FIELDS[id])) || drafted(id); };
  var night = record.nightReflection || {};
  var nightHasText = has(night.wins) || has(night.lessons) || has(night.gratitude) || legacy("nightTomorrowPlan");
  var prefs = getPrefs();

  container.innerHTML =
    '<article class="day-card day-card--plan" aria-labelledby="planTitle">' +
      '<header class="day-card-head">' +
        '<h3 class="card-title" id="planTitle">' + icon("target") + "<span>Today</span></h3>" +
        '<span id="dailySaveStatus" class="daily-save-status" aria-live="polite"></span>' +
      "</header>" +
      (plannedYesterday && !record.morning.mainFocus
        ? '<div class="carry-hint">' + icon("moon") + '<span>Last night you planned: <q>' + escapeHtml(plannedYesterday) + "</q></span>" +
          ' <button type="button" class="link-btn" id="usePlanBtn">Make it today\'s focus</button></div>'
        : "") +
      '<label class="focus-line" for="mainFocus">' +
        '<span class="section-label">The one thing that would make today count</span>' +
        '<textarea id="mainFocus" rows="1" placeholder="Finish the essay draft, call grandma, rest properly…"></textarea>' +
      "</label>" +
      (legacy("morningIntention") ? field("morningIntention", "Intention", 1, "") : "") +
      '<div id="dailyTasks" class="day-tasks"></div>' +
    "</article>" +

    fold("logCard", "activity", "Time log", "", prefs.foldLog !== false,
      '<div id="dailyActivities"></div>') +

    fold("nightCard", "moon", "Tonight", "Close the day", nightHasText || now.getHours() >= 17,
      (legacy("dailyJournal") ? field("dailyJournal", "Notes", 3, "") : "") +
      '<div class="night-grid">' +
        field("nightWins", "A win", 2, "Something that went right") +
        field("nightLessons", "A lesson", 2, "What you'd do differently") +
        field("nightGratitude", "Grateful for", 2, "Someone or something") +
      "</div>" +
      (legacy("nightTomorrowPlan") ? field("nightTomorrowPlan", "Tomorrow's plan (from before)", 2, "") : "") +
      '<div class="tomorrow-block">' +
        '<h4 class="sub-title">' + icon("sunrise") + "<span>Plan tomorrow</span></h4>" +
        '<div id="tomorrowTasks"></div>' +
      "</div>");

  // the brain dump lives in the side column
  var dump = document.getElementById("brainDumpSection");
  if (dump) {
    dump.innerHTML =
      '<header class="card-head"><h3 class="card-title">' + icon("cloud") + "<span>Brain dump</span></h3></header>" +
      '<textarea id="brainDump" class="dump-text" rows="4" placeholder="Empty your head here. One thought per line."></textarea>' +
      '<div class="dump-foot"><span class="card-meta">Lines can become tasks</span>' +
      '<button type="button" class="tool-btn tool-btn--sm" id="dumpToTasks" hidden>' + icon("list-checks") + "<span>Make tasks</span></button></div>";
  }

  FIELD_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = readPath(record, FIELDS[id]) || "";
  });

  // unsaved typing from this session wins over the stored record
  if (draft && draft.date === today) {
    Object.keys(draft.values || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value !== draft.values[id]) {
        el.value = draft.values[id];
        dirty[id] = true;
      }
    });
    if (Object.keys(dirty).length) { setStatus("Unsaved changes restored"); scheduleSave(); }
  }

  var usePlan = document.getElementById("usePlanBtn");
  if (usePlan) {
    usePlan.addEventListener("click", function () {
      var el = document.getElementById("mainFocus");
      el.value = plannedYesterday;
      markDirty("mainFocus");
      usePlan.closest(".carry-hint").remove();
      grow(el);
      el.focus();
    });
  }

  FIELD_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    grow(el);
    el.addEventListener("input", function () { grow(el); markDirty(id); });
  });
  // the focus line is one line: enter moves on to the tasks
  document.getElementById("mainFocus").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      var next = document.querySelector('#dailyTasks [data-form="task"] input');
      if (next) next.focus();
    }
  });

  var log = document.getElementById("logCard");
  log.addEventListener("toggle", function () { setPrefs({ foldLog: log.open }); });

  wireDump();

  await Promise.all([
    renderTasks(document.getElementById("dailyTasks"), today, { key: "today", empty: "Nothing yet. What needs doing today?" }),
    renderTasks(document.getElementById("tomorrowTasks"), dateKey(tomorrow), {
      key: "tomorrow", carry: false, progress: false, placeholder: "Add something for tomorrow", label: "New task for tomorrow",
      empty: "Tomorrow's list is empty. Add one or two things so the morning starts easy."
    }),
    renderActivities(document.getElementById("dailyActivities"), today)
  ]);
  updateLogMeta();
}

function updateLogMeta() {
  var meta = document.querySelector("#logCard [data-fold-meta]");
  if (!meta) return;
  var mins = getTodayActivities().reduce(function (s, a) { return s + (a.durationMinutes || 0); }, 0);
  meta.textContent = mins ? (mins >= 60 ? Math.floor(mins / 60) + "h " + (mins % 60 ? (mins % 60) + "m " : "") : mins + " min ") + "logged" : "What you actually did";
}
document.addEventListener("logbook:data-changed", function (e) {
  if (e.detail && e.detail.kind === "activities") updateLogMeta();
});

/* ---------- brain dump ---------- */
function wireDump() {
  var text = document.getElementById("brainDump");
  var btn = document.getElementById("dumpToTasks");
  if (!text || !btn) return;
  function sync() { btn.hidden = !has(text.value); }
  text.addEventListener("input", sync);
  sync();
  btn.addEventListener("click", async function () {
    var lines = text.value.split(/\n+/).map(function (l) { return l.replace(/^\s*[-*•]\s*/, "").trim(); }).filter(Boolean);
    if (!lines.length) return;
    btn.disabled = true;
    try {
      var n = await addTodayTasks(lines.slice(0, 30));
      text.value = "";
      markDirty("brainDump");
      sync();
      toast(n === 1 ? "Added 1 task to today" : "Added " + n + " tasks to today", "ok", {
        action: { label: "Show", run: function () { document.getElementById("dailyTasks").scrollIntoView({ behavior: "smooth", block: "center" }); } }
      });
    } catch (e) {
      toast("Couldn't make those into tasks", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* textareas grow with what's in them */
function grow(el) {
  if (!el || el.tagName !== "TEXTAREA") return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight + 2, 420) + "px";
}

function markDirty(id) {
  dirty[id] = true;
  saveDraft();
  setStatus("Editing…");
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, AUTOSAVE_DELAY);
}

function buildPatch(ids) {
  var patch = {};
  ids.forEach(function (id) {
    var path = FIELDS[id];
    var el = document.getElementById(id);
    if (!el) return;
    var value = el.value;
    if (path.length === 1) patch[path[0]] = value;
    else {
      patch[path[0]] = patch[path[0]] || {};
      patch[path[0]][path[1]] = value;
    }
  });
  return patch;
}

async function save() {
  var ids = Object.keys(dirty);
  if (!ids.length) return;
  dirty = {};
  setStatus("Saving…");
  try {
    await apiSaveDayPatch(currentDay, buildPatch(ids));
    clearDraft();
    var t = new Date();
    setStatus("Saved " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0"), true);
    emitChange("day", { date: currentDay });
  } catch (e) {
    ids.forEach(function (id) { dirty[id] = true; });
    setStatus("Not saved yet");
    toast("Couldn't save today's page. It's kept here and will retry.", "error");
    console.warn("logbook: failed to save daily page", e);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 15000);
  }
}

// save anything pending before the tab closes or the user navigates away
window.addEventListener("pagehide", function () {
  if (Object.keys(dirty).length) saveDraft();
});
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden" && Object.keys(dirty).length) save();
});

function setStatus(text, ok) {
  var el = document.getElementById("dailySaveStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-saved", Boolean(ok));
}

function saveDraft() {
  var values = {};
  FIELD_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) values[id] = el.value;
  });
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ date: currentDay, values: values }));
  } catch (e) {}
}

function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
}
