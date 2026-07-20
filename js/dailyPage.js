import { loadDays, saveDays, loadEntries } from './storage.js';
import { getDayRecord, updateDayRecord } from './dayRecord.js';

var FIELD_IDS = [
  "mainFocus",
  "dailyJournal",
  "nightWins",
  "nightLessons",
  "nightTomorrowPlan",
  "nightGratitude"
];
var AUTOSAVE_DELAY = 600;
var saveTimer = null;

var autoSaveEnabled = false;
var draftKey = "logbook-daily-draft";

function getLocalDateKey(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function collectFieldValues() {
  var values = {};
  FIELD_IDS.forEach(function (id) {
    values[id] = document.getElementById(id).value;
  });
  return values;
}

function applyFieldValues(values) {
  FIELD_IDS.forEach(function (id) {
    if (values.hasOwnProperty(id)) {
      document.getElementById(id).value = values[id];
    }
  });
}

function setSaveStatus(text) {
  var statusEl = document.getElementById("dailySaveStatus");
  if (statusEl) statusEl.textContent = text;
}

export function renderDailyPage() {
  var container = document.getElementById("dailyPage");

  var today = getLocalDateKey();
  var entries = loadEntries();
  var days = loadDays();
  var record = getDayRecord(today, entries, days);

  container.innerHTML = `
    <div class="daily-page-card">

      <div class="daily-section">
        <div class="daily-section-title">morning</div>

        <div class="daily-field">
          <div class="section-label">main focus</div>
          <textarea id="mainFocus" rows="2"></textarea>
        </div>
      </div>

      <div class="daily-section">
        <div class="daily-section-title">reflection</div>

        <div class="daily-field">
          <div class="section-label">journal</div>
          <textarea id="dailyJournal" rows="5"></textarea>
        </div>

        <div class="daily-field">
          <div class="section-label">wins</div>
          <textarea id="nightWins" rows="2"></textarea>
        </div>

        <div class="daily-field">
          <div class="section-label">lessons</div>
          <textarea id="nightLessons" rows="2"></textarea>
        </div>

        <div class="daily-field">
          <div class="section-label">tomorrow's plan</div>
          <textarea id="nightTomorrowPlan" rows="2"></textarea>
        </div>

        <div class="daily-field">
        <div class="section-label">gratitude</div>
        <textarea id="nightGratitude" rows="2"></textarea>
      </div>

      <div class="daily-controls">
        <label>
          <input type="checkbox" id="autoSaveToggle">
          autosave
        </label>

        <button id="finishDayBtn">
          finish day ▸
        </button>
      </div>

      <div id="dailySaveStatus"></div>

    </div>
  `;

  document.getElementById("mainFocus").value = record.morning.mainFocus || "";
  document.getElementById("dailyJournal").value = record.journal || "";
  document.getElementById("nightWins").value = record.nightReflection.wins || "";
  document.getElementById("nightLessons").value = record.nightReflection.lessons || "";
  document.getElementById("nightTomorrowPlan").value = record.nightReflection.tomorrowPlan || "";
  document.getElementById("nightGratitude").value = record.nightReflection.gratitude || "";

  // If a draft exists for today, it takes priority over the saved record
  // (it represents unsaved typing from this session).
  var draft = loadDraft();
  if (draft && draft.date === today) {
    applyFieldValues(draft.values);
  }

  var autoSaveToggle = document.getElementById("autoSaveToggle");
  autoSaveToggle.checked = autoSaveEnabled;
  autoSaveToggle.addEventListener("change", handleAutoSaveToggle);

  document.getElementById("finishDayBtn").addEventListener("click", handleFinishDay);

  FIELD_IDS.forEach(function (id) {
    document.getElementById(id).addEventListener("input", handleInput);
  });
}

function handleInput() {
  saveDraft();

  if (autoSaveEnabled) {
    scheduleSave();
  }
}

function handleAutoSaveToggle(e) {
  autoSaveEnabled = e.target.checked;

  if (autoSaveEnabled) {
    // Turning autosave on should immediately persist whatever is currently
    // in the fields, then keep saving on subsequent input.
    persistToday();
  }
}

function handleFinishDay() {
  clearTimeout(saveTimer);
  persistToday();
  clearDraft();
  setSaveStatus("day saved ✓");
}

function saveDraft() {
  var today = getLocalDateKey();
  var draft = {
    date: today,
    values: collectFieldValues()
  };

  try {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  } catch (e) {
    console.warn("logbook: failed to save draft", e);
  }
}

function loadDraft() {
  try {
    var raw = sessionStorage.getItem(draftKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("logbook: failed to load draft", e);
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(draftKey);
  } catch (e) {
    console.warn("logbook: failed to clear draft", e);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistToday, AUTOSAVE_DELAY);
}

function persistToday() {
  var today = getLocalDateKey();
  var entries = loadEntries();
  var days = loadDays();
  var record = getDayRecord(today, entries, days);

  var patch = {
    morning: {
      intention: record.morning.intention || "",
      mainFocus: document.getElementById("mainFocus").value,
      goals: record.morning.goals || []
    },
    journal: document.getElementById("dailyJournal").value,
    nightReflection: {
      whatHappened: record.nightReflection.whatHappened || "",
      wins: document.getElementById("nightWins").value,
      lessons: document.getElementById("nightLessons").value,
      tomorrowPlan: document.getElementById("nightTomorrowPlan").value,
      gratitude: document.getElementById("nightGratitude").value
    }
  };

  var next = updateDayRecord(days, today, patch);
  var ok = saveDays(next);
  if (!ok) console.warn("logbook: failed to save daily page for " + today);
}