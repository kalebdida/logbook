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

function getLocalDateKey(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
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
      </div>

    </div>
  `;

  document.getElementById("mainFocus").value = record.morning.mainFocus || "";
  document.getElementById("dailyJournal").value = record.journal || "";
  document.getElementById("nightWins").value = record.nightReflection.wins || "";
  document.getElementById("nightLessons").value = record.nightReflection.lessons || "";
  document.getElementById("nightTomorrowPlan").value = record.nightReflection.tomorrowPlan || "";
  document.getElementById("nightGratitude").value = record.nightReflection.gratitude || "";

  FIELD_IDS.forEach(function (id) {
    document.getElementById(id).addEventListener("input", scheduleSave);
  });
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