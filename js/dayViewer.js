import { loadDays, loadEntries } from './storage.js';
import { getDayRecord } from './dayRecord.js';
import { escapeHtml } from './utils.js';
import { STATUS } from './entries.js';

function formatDateKey(dateStr) {
  var parts = dateStr.split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function buildRow(label, value) {
  var text = (value || "").toString().trim();
  if (!text) return "";
  return (
    '<div class="viewer-row">' +
    '<div class="section-label">' + label + "</div>" +
    '<div class="viewer-text">' + escapeHtml(text) + "</div>" +
    "</div>"
  );
}

export function openDayViewer(dateStr) {
  var overlay = document.getElementById("dayViewer");
  if (!overlay || !dateStr) return;

  var entries = loadEntries();
  var days = loadDays();
  var record = getDayRecord(dateStr, entries, days);

  var moodHtml = "";
  if (record.mood && STATUS[record.mood]) {
    var s = STATUS[record.mood];
    moodHtml =
      '<div class="viewer-mood">' +
      '<span class="dot" style="background:' + s.color + ";box-shadow:0 0 6px " + s.glow + '"></span>' +
      '<span style="color:' + s.color + '">' + s.code + " " + s.label + "</span>" +
      "</div>";
  }

  var rows = [
    buildRow("main focus", record.morning.mainFocus),
    buildRow("journal", record.journal),
    buildRow("wins", record.nightReflection.wins),
    buildRow("lessons", record.nightReflection.lessons),
    buildRow("tomorrow's plan", record.nightReflection.tomorrowPlan),
    buildRow("gratitude", record.nightReflection.gratitude)
  ].filter(function (html) { return html !== ""; });

  var body = rows.length > 0
    ? rows.join("")
    : '<div class="viewer-empty">nothing recorded for this day.</div>';

  overlay.innerHTML =
    '<div class="viewer-backdrop"></div>' +
    '<div class="viewer-panel">' +
    '<div class="viewer-header">' +
    "<div>" +
    '<div class="daily-section-title" style="margin-bottom:4px;border-bottom:none;padding-bottom:0">// day record</div>' +
    '<div class="viewer-date">' + formatDateKey(dateStr) + "</div>" +
    "</div>" +
    '<button class="viewer-close" id="dayViewerClose" aria-label="close">\u2715</button>' +
    "</div>" +
    moodHtml +
    body +
    "</div>";

  overlay.style.display = "flex";

  var closeBtn = document.getElementById("dayViewerClose");
  if (closeBtn) closeBtn.addEventListener("click", closeDayViewer);

  var backdrop = overlay.querySelector(".viewer-backdrop");
  if (backdrop) backdrop.addEventListener("click", closeDayViewer);
}

export function closeDayViewer() {
  var overlay = document.getElementById("dayViewer");
  if (!overlay) return;
  overlay.style.display = "none";
  overlay.innerHTML = "";
}