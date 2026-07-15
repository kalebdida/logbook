import { loadDays, saveDays, loadEntries } from './storage.js';
import { getDayRecord, updateDayRecord } from './dayRecord.js';

var FIELD_IDS = [
  "morningIntention",
  "mainFocus",
  "timelineMorning",
  "timelineAfternoon",
  "timelineEvening",
  "timelineHighlight",
  "timelineUnexpected",
  "brainDump",
  "dailyJournal",
  "nightWhatHappened",
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

      <div class="daily-field">
        <div class="section-label">morning intention</div>
        <textarea id="morningIntention" rows="2"></textarea>
      </div>

      <div class="daily-field">
         <div class="section-label">main focus</div>
          <textarea id="mainFocus" rows="2"></textarea>
      </div>

      <div class="daily-field">
        <div class="section-label">morning timeline</div>
        <textarea id="timelineMorning" rows="2"></textarea>
      </div>

      <div class="daily-field">
        <div class="section-label">afternoon timeline</div>
        <textarea id="timelineAfternoon" rows="2"></textarea>
      </div>

      <div class="daily-field">
        <div class="section-label">evening timeline</div>
        <textarea id="timelineEvening" rows="2"></textarea>
      </div>

      <div class="daily-field">
        <div class="section-label">highlight of the day</div>
        <textarea id="timelineHighlight" rows="2"></textarea>
      </div>

      <div class="daily-field">
        <div class="section-label">unexpected moments</div>
        <textarea id="timelineUnexpected" rows="2"></textarea>
      </div>

      <div class="section-label">brain dump</div>
      <textarea id="brainDump" rows="3"></textarea>

      <div class="section-label">journal</div>
      <textarea id="dailyJournal" rows="5"></textarea>

      <div class="section-label">what happened today</div>
      <textarea id="nightWhatHappened" rows="2"></textarea>

      <div class="section-label">wins</div>
      <textarea id="nightWins" rows="2"></textarea>

      <div class="section-label">lessons</div>
      <textarea id="nightLessons" rows="2"></textarea>

      <div class="section-label">tomorrow's plan</div>
      <textarea id="nightTomorrowPlan" rows="2"></textarea>

      <div class="section-label">gratitude</div>
      <textarea id="nightGratitude" rows="2"></textarea>

    </div>
  `;

  document.getElementById("morningIntention").value = record.morning.intention || "";
  document.getElementById("mainFocus").value = record.morning.mainFocus || "";
  document.getElementById("timelineMorning").value = record.timeline.morning || "";
  document.getElementById("timelineAfternoon").value = record.timeline.afternoon || "";
  document.getElementById("timelineEvening").value = record.timeline.evening || "";
  document.getElementById("timelineHighlight").value = record.timeline.highlight || "";
  document.getElementById("timelineUnexpected").value = record.timeline.unexpected || "";
  document.getElementById("brainDump").value = record.brainDump || "";
  document.getElementById("dailyJournal").value = record.journal || "";
  document.getElementById("nightWhatHappened").value = record.nightReflection.whatHappened || "";
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
      intention: document.getElementById("morningIntention").value,
      mainFocus: document.getElementById("mainFocus").value,
      goals: record.morning.goals || []
    },
    timeline: {
      morning: document.getElementById("timelineMorning").value,
      afternoon: document.getElementById("timelineAfternoon").value,
      evening: document.getElementById("timelineEvening").value,
      highlight: document.getElementById("timelineHighlight").value,
      unexpected: document.getElementById("timelineUnexpected").value
    },
    journal: document.getElementById("dailyJournal").value,
    brainDump: document.getElementById("brainDump").value,
    nightReflection: {
      whatHappened: document.getElementById("nightWhatHappened").value,
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