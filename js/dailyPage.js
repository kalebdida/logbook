import { apiGetDay, apiSaveDayPatch } from './api.js';
import { dateKey } from './dayRecord.js';
import { getPrefs } from './prefs.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';
import { renderTasks } from './tasks.js';
import { renderActivities } from './activities.js';

/* field id -> where it lives in the day record */
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

function field(id, label, rows, placeholder) {
  return (
    '<label class="daily-field" for="' + id + '">' +
    '<span class="section-label">' + label + "</span>" +
    '<textarea id="' + id + '" rows="' + rows + '" placeholder="' + escapeHtml(placeholder || "") + '"></textarea>' +
    "</label>"
  );
}

export async function renderDailyPage() {
  var container = document.getElementById("dailyPage");
  if (!container) return;

  var today = dateKey(new Date());
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var loaded = await Promise.all([apiGetDay(today), apiGetDay(dateKey(yesterday))]);
  var record = loaded[0];
  var plannedYesterday = (loaded[1].nightReflection.tomorrowPlan || "").trim();
  currentDay = today;
  dirty = {};

  container.innerHTML =
    '<article class="daily-page-card">' +
      '<section class="daily-section daily-section--morning" aria-labelledby="morningTitle">' +
        '<h3 class="daily-section-title" id="morningTitle">morning</h3>' +
        (plannedYesterday && !record.morning.intention
          ? '<div class="carry-hint"><span>last night you planned:</span> <q>' + escapeHtml(plannedYesterday) + '</q>' +
            ' <button type="button" class="link-btn" id="usePlanBtn">use as intention</button></div>'
          : "") +
        field("morningIntention", "intention", 2, "how do you want to show up today?") +
        field("mainFocus", "main focus", 2, "the one thing that makes today count") +
      "</section>" +

      '<section class="daily-section" aria-labelledby="tasksTitle">' +
        '<h3 class="daily-section-title" id="tasksTitle">tasks</h3>' +
        '<div id="dailyTasks"></div>' +
      "</section>" +

      '<section class="daily-section" aria-labelledby="activityTitle">' +
        '<h3 class="daily-section-title" id="activityTitle">activity log</h3>' +
        '<div id="dailyActivities"></div>' +
      "</section>" +

      '<section class="daily-section daily-section--night" aria-labelledby="nightTitle">' +
        '<h3 class="daily-section-title" id="nightTitle">night reflection</h3>' +
        field("dailyJournal", "journal", 5, "what actually happened today") +
        '<div class="daily-field-pair">' +
          field("nightWins", "wins", 2, "") +
          field("nightLessons", "lessons", 2, "") +
        "</div>" +
        '<div class="daily-field-pair">' +
          field("nightGratitude", "gratitude", 2, "") +
          field("nightTomorrowPlan", "tomorrow's plan", 2, "") +
        "</div>" +
      "</section>" +

      '<section class="daily-section" aria-labelledby="dumpTitle">' +
        '<h3 class="daily-section-title" id="dumpTitle">brain dump</h3>' +
        field("brainDump", "anything still on your mind", 3, "get it out of your head") +
      "</section>" +

      '<footer class="daily-controls">' +
        '<label class="toggle"><input type="checkbox" id="autoSaveToggle"><span>autosave</span></label>' +
        '<span id="dailySaveStatus" class="daily-save-status" aria-live="polite"></span>' +
        '<button type="button" class="primary-btn" id="finishDayBtn">save day</button>' +
      "</footer>" +
    "</article>";

  FIELD_IDS.forEach(function (id) {
    document.getElementById(id).value = readPath(record, FIELDS[id]) || "";
  });

  // unsaved typing from this session wins over the stored record
  var draft = loadDraft();
  if (draft && draft.date === today) {
    Object.keys(draft.values || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value !== draft.values[id]) {
        el.value = draft.values[id];
        dirty[id] = true;
      }
    });
    if (Object.keys(dirty).length) setStatus("unsaved changes restored");
  }

  var usePlan = document.getElementById("usePlanBtn");
  if (usePlan) {
    usePlan.addEventListener("click", function () {
      var el = document.getElementById("morningIntention");
      el.value = plannedYesterday;
      markDirty("morningIntention");
      usePlan.closest(".carry-hint").remove();
      el.focus();
    });
  }

  var toggle = document.getElementById("autoSaveToggle");
  toggle.checked = getPrefs().autosave;
  toggle.addEventListener("change", function () {
    if (toggle.checked) save();
  });
  document.getElementById("finishDayBtn").addEventListener("click", function () {
    clearTimeout(saveTimer);
    save(true);
  });
  FIELD_IDS.forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () { markDirty(id); });
  });

  await Promise.all([renderTasks(document.getElementById("dailyTasks"), today), renderActivities(document.getElementById("dailyActivities"), today)]);
}

function markDirty(id) {
  dirty[id] = true;
  saveDraft();
  setStatus("unsaved");
  if (document.getElementById("autoSaveToggle").checked) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, AUTOSAVE_DELAY);
  }
}

function buildPatch(ids) {
  var patch = {};
  ids.forEach(function (id) {
    var path = FIELDS[id];
    var value = document.getElementById(id).value;
    if (path.length === 1) patch[path[0]] = value;
    else {
      patch[path[0]] = patch[path[0]] || {};
      patch[path[0]][path[1]] = value;
    }
  });
  return patch;
}

async function save(explicit) {
  var ids = Object.keys(dirty);
  if (!ids.length) {
    if (explicit) toast("day saved");
    return;
  }
  dirty = {};
  setStatus("saving…");
  try {
    await apiSaveDayPatch(currentDay, buildPatch(ids));
    clearDraft();
    var t = new Date();
    setStatus("saved " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0"));
    emitChange("day", { date: currentDay });
    if (explicit) toast("day saved");
  } catch (e) {
    ids.forEach(function (id) { dirty[id] = true; });
    setStatus("save failed");
    toast("couldn't save the daily page. check that the backend is running.", "error");
    console.warn("logbook: failed to save daily page", e);
  }
}

// save anything pending before the tab closes or the user navigates away
window.addEventListener("pagehide", function () {
  if (Object.keys(dirty).length) saveDraft();
});
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden" && Object.keys(dirty).length && document.getElementById("autoSaveToggle")?.checked) save();
});

function setStatus(text) {
  var el = document.getElementById("dailySaveStatus");
  if (el) el.textContent = text;
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
