import { loadDays, saveDays, loadEntries } from './storage.js';
import { getDayRecord, updateDayRecord } from './dayRecord.js';

var FIELD_IDS = [
  "timelineMorning",
  "timelineAfternoon",
  "timelineEvening",
  "timelineHighlight",
  "timelineUnexpected"
];

var saveTimer = null;
var initialized = false;

function getLocalDateKey(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function renderTimeline() { if (initialized) return;
initialized = true;

  var container = document.getElementById("timelineSection");

  var today = getLocalDateKey();
  var entries = loadEntries();
  var days = loadDays();
  var record = getDayRecord(today, entries, days);

  container.innerHTML = `
    <div class="form-box">
      <div class="section-label">// daily replay</div>

      <div class="section-label">morning</div>
      <textarea id="timelineMorning" rows="2"></textarea>

      <div class="section-label">afternoon</div>
      <textarea id="timelineAfternoon" rows="2"></textarea>

      <div class="section-label">evening</div>
      <textarea id="timelineEvening" rows="2"></textarea>

      <div class="section-label">highlight of the day</div>
      <textarea id="timelineHighlight" rows="2"></textarea>

      <div class="section-label">unexpected events</div>
      <textarea id="timelineUnexpected" rows="2"></textarea>
    </div>
  `;

  document.getElementById("timelineMorning").value = record.timeline.morning || "";
  document.getElementById("timelineAfternoon").value = record.timeline.afternoon || "";
  document.getElementById("timelineEvening").value = record.timeline.evening || "";
  document.getElementById("timelineHighlight").value = record.timeline.highlight || "";
  document.getElementById("timelineUnexpected").value = record.timeline.unexpected || "";

  FIELD_IDS.forEach(function(id) {
    document.getElementById(id).addEventListener("input", scheduleSave);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveTimeline, 600);
}

function saveTimeline() {
  var today = getLocalDateKey();
  var days = loadDays();
  var entries = loadEntries();
  var record = getDayRecord(today, entries, days);

  var patch = {
    timeline: {
      morning: document.getElementById("timelineMorning").value,
      afternoon: document.getElementById("timelineAfternoon").value,
      evening: document.getElementById("timelineEvening").value,
      highlight: document.getElementById("timelineHighlight").value,
      unexpected: document.getElementById("timelineUnexpected").value
    }
  };
  console.log("saving timeline", patch);
  saveDays(updateDayRecord(days, today, patch));
}