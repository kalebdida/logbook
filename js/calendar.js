import { apiListEntries } from './api.js';
import { STATUS, moodTag } from './entries.js';
import { icon } from './icons.js';
import { dateKey } from './dayRecord.js';
import { openDayViewer } from './dayViewer.js';
import { escapeHtml } from './utils.js';
import { calcStreak } from './stats.js';

var listenerAttached = false;
var viewMode = "month";
var viewYear = null;
var viewMonth = null;
var tooltipEl = null;
// filled in on every renderCalendar() call, the mouseover handler reads
// from this instead of re-fetching on every pixel of mouse movement
var lastDayEntryMap = {};

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function buildDayEntryMap(entries) {
  var map = {};
  var latestTime = {};
  dayCounts = {};
  entries.forEach(function (e) {
    var key = dateKey(e.date);
    var t = new Date(e.date).getTime();
    dayCounts[key] = (dayCounts[key] || 0) + 1;
    if (!(key in latestTime) || t > latestTime[key]) {
      latestTime[key] = t;
      map[key] = e;
    }
  });
  return map;
}
var dayCounts = {};

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "cal-tooltip";
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltip(cell, dayEntry) {
  var tip = ensureTooltip();
  var key = cell.getAttribute("data-date");
  var parts = key.split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var fullDate = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  var moodHtml = "";
  if (dayEntry && STATUS[dayEntry.mood]) moodHtml = '<div class="cal-tooltip-mood">' + moodTag(dayEntry.mood) + "</div>";

  var bodyHtml;
  if (dayEntry && dayEntry.text) {
    var preview = dayEntry.text.length > 70 ? dayEntry.text.slice(0, 70) + "\u2026" : dayEntry.text;
    bodyHtml = '<div class="cal-tooltip-preview">' + escapeHtml(preview.replace(/\n+/g, " ")) + "</div>";
  } else {
    bodyHtml = '<div class="cal-tooltip-empty">no entry</div>';
  }

  tip.innerHTML = '<div class="cal-tooltip-date">' + fullDate.toLowerCase() + "</div>" + moodHtml + bodyHtml;

  var rect = cell.getBoundingClientRect();
  tip.style.left = (rect.left + rect.width / 2) + "px";
  tip.style.top = (rect.top - 8) + "px";
  tip.classList.add("visible");
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

function goToPrevMonth() {
  viewMonth--;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear--;
  }
  renderCalendar();
}

function goToNextMonth() {
  viewMonth++;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear++;
  }
  renderCalendar();
}

function renderModeToggle() {
  return (
    '<div class="segmented cal-mode-toggle" role="group" aria-label="view">' +
    '<button type="button" class="seg-btn cal-mode-btn' + (viewMode === "month" ? " active" : "") + '" data-mode="month" aria-pressed="' + (viewMode === "month") + '">month</button>' +
    '<button type="button" class="seg-btn cal-mode-btn' + (viewMode === "year" ? " active" : "") + '" data-mode="year" aria-pressed="' + (viewMode === "year") + '">year</button>' +
    "</div>"
  );
}

function renderMonthView(container, entries, dayEntryMap, now) {
  if (viewYear === null || viewMonth === null) {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }

  var year = viewYear;
  var month = viewMonth;
  var totalDays = daysInMonth(year, month);
  var firstWeekday = new Date(year, month, 1).getDay();
  var monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  var todayKey = dateKey(now);

  var weekdayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var headerCells = weekdayLabels
    .map(function (l) { return '<div class="cal-weekday">' + l + "</div>"; })
    .join("");

  var cells = "";
  for (var i = 0; i < firstWeekday; i++) {
    cells += '<div class="cal-cell cal-cell-empty" aria-hidden="true"></div>';
  }
  var logged = 0;
  for (var day = 1; day <= totalDays; day++) {
    var key = dateKey(new Date(year, month, day));
    var dayEntry = dayEntryMap[key];
    var s = dayEntry && STATUS[dayEntry.mood] ? STATUS[dayEntry.mood] : null;
    var isToday = key === todayKey;
    var isFuture = key > todayKey;
    if (dayEntry) logged++;
    var classes = "cal-cell" + (isToday ? " cal-cell-today" : "") + (isFuture ? " cal-cell-future" : "") + (s ? " cal-cell--" + dayEntry.mood : "");
    var snippet = dayEntry && dayEntry.text ? escapeHtml(dayEntry.text.replace(/\s+/g, " ").slice(0, 90)) : "";
    var more = dayCounts[key] > 1 ? '<span class="cal-more">+' + (dayCounts[key] - 1) + "</span>" : "";
    cells +=
      '<button type="button" class="' + classes + '" data-date="' + key + '" aria-label="' + key + (s ? ", " + s.label : "") + '">' +
        '<span class="cal-cell-top"><span class="cal-daynum">' + day + "</span>" + (s ? '<span class="cal-mood">' + icon(s.icon) + "</span>" : "") + "</span>" +
        (snippet ? '<span class="cal-snippet">' + snippet + "</span>" : "") +
        more +
      "</button>";
  }

  var isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  container.innerHTML =
    '<div class="cal-card">' +
      '<div class="cal-head">' +
        '<div class="cal-title-wrap">' +
          '<h2 class="cal-title">' + monthLabel.toLowerCase() + "</h2>" +
          '<span class="card-meta">' + (logged ? logged + (logged === 1 ? " day" : " days") + " written" : "nothing written yet") + "</span>" +
        "</div>" +
        '<div class="cal-controls">' +
          '<button type="button" class="icon-btn cal-nav-btn" data-dir="prev" aria-label="previous month">' + icon("chevron-left") + "</button>" +
          '<button type="button" class="tool-btn cal-today-btn" data-dir="today"' + (isCurrentMonth ? " disabled" : "") + ">today</button>" +
          '<button type="button" class="icon-btn cal-nav-btn" data-dir="next" aria-label="next month">' + icon("chevron-right") + "</button>" +
          renderModeToggle() +
        "</div>" +
      "</div>" +
      '<div class="cal-grid cal-grid-header">' + headerCells + "</div>" +
      '<div class="cal-grid cal-month">' + cells + "</div>" +
    "</div>";
}

function buildYearGrid(today) {
  var end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  var endDow = end.getDay();
  var gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - endDow));

  var gridStart = new Date(gridEnd);
  gridStart.setDate(gridStart.getDate() - (53 * 7 - 1));

  var weeks = [];
  var cursor = new Date(gridStart);

  for (var w = 0; w < 53; w++) {
    var week = [];

    for (var d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  return weeks;
}

function renderYearView(container, entries, dayEntryMap, now) {
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var weeks = buildYearGrid(today);
  var todayKey = dateKey(now);

  var heatCells = "";
  var activeDays = 0;
  weeks.forEach(function (week) {
    week.forEach(function (d) {
      if (d > today) {
        heatCells += '<div class="heat-cell heat-cell-empty"></div>';
        return;
      }
      var key = dateKey(d);
      var dayEntry = dayEntryMap[key];
      var s = dayEntry && STATUS[dayEntry.mood] ? STATUS[dayEntry.mood] : null;
      if (dayEntry) activeDays++;
      var isToday = key === todayKey;
      var classes = "heat-cell";
      if (isToday) classes += " heat-cell-today";
      if (s) classes += " heat-cell--" + dayEntry.mood;
      var title = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      heatCells +=
        '<div class="' + classes + '" data-date="' + key + '" title="' + title + '"></div>';
    });
  });

  var streak = calcStreak(entries);
  var monthLabels = "";
  weeks.forEach(function (week, w) {
    var first = week.find(function (d) { return d.getDate() === 1; });
    monthLabels += '<span class="cal-month-label" style="grid-column:' + (w + 1) + '">' + (first ? first.toLocaleDateString("en-US", { month: "short" }).toLowerCase() : "") + "</span>";
  });

  container.innerHTML =
    '<div class="cal-card">' +
      '<div class="cal-head">' +
        '<div class="cal-title-wrap">' +
          '<h2 class="cal-title">the last year</h2>' +
          '<span class="card-meta">' + activeDays + " of 365 days written, " + streak + (streak === 1 ? " day" : " days") + " in a row now</span>" +
        "</div>" +
        '<div class="cal-controls">' + renderModeToggle() + "</div>" +
      "</div>" +
      '<div class="cal-year-scroll">' +
        '<div class="cal-month-labels">' + monthLabels + "</div>" +
        '<div class="cal-heatmap">' + heatCells + "</div>" +
      "</div>" +
      '<div class="cal-legend">' + Object.keys(STATUS).map(function (k) { return moodTag(k); }).join("") + "</div>" +
    "</div>";
}

export async function renderCalendar() {
  var container = document.getElementById("calendarSection");
  if (!container) return;

  var now = new Date();
  var entries = await apiListEntries();
  var dayEntryMap = buildDayEntryMap(entries);
  lastDayEntryMap = dayEntryMap;

  if (viewMode === "year") {
    renderYearView(container, entries, dayEntryMap, now);
  } else {
    renderMonthView(container, entries, dayEntryMap, now);
  }

  if (!listenerAttached) {
    container.addEventListener("click", function (e) {
      var modeBtn = e.target.closest(".cal-mode-btn");
      if (modeBtn) {
        viewMode = modeBtn.getAttribute("data-mode");
        renderCalendar();
        return;
      }
      var navBtn = e.target.closest("[data-dir]");
      if (navBtn) {
        var dir = navBtn.getAttribute("data-dir");
        if (dir === "prev") goToPrevMonth();
        else if (dir === "next") goToNextMonth();
        else if (dir === "today") { viewYear = null; viewMonth = null; renderCalendar(); }
        return;
      }
      var cell = e.target.closest("[data-date]");
      if (!cell) return;
      openDayViewer(cell.getAttribute("data-date"));
    });

    container.addEventListener("mouseover", function (e) {
      var cell = e.target.closest(".heat-cell[data-date]");
      if (!cell) return;
      var key = cell.getAttribute("data-date");
      showTooltip(cell, lastDayEntryMap[key]);
    });

    container.addEventListener("mouseout", function (e) {
      var cell = e.target.closest(".heat-cell[data-date]");
      if (!cell) return;
      hideTooltip();
    });

    listenerAttached = true;
  }
}
