import { loadEntries } from './storage.js';
import { STATUS } from './entries.js';
import { dateKey } from './dayRecord.js';
import { openDayViewer } from './dayViewer.js';
import { escapeHtml } from './utils.js';
import { calcStreak } from './stats.js';

var listenerAttached = false;
var viewMode = "month";
var viewYear = null;
var viewMonth = null;
var tooltipEl = null;

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function buildDayEntryMap(entries) {
  var map = {};
  var latestTime = {};
  entries.forEach(function (e) {
    var key = dateKey(e.date);
    var t = new Date(e.date).getTime();
    if (!(key in latestTime) || t > latestTime[key]) {
      latestTime[key] = t;
      map[key] = e;
    }
  });
  return map;
}

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
  if (dayEntry && STATUS[dayEntry.mood]) {
    var s = STATUS[dayEntry.mood];
    moodHtml =
      '<div class="cal-tooltip-mood">' +
      '<span class="dot" style="background:' + s.color + ";box-shadow:0 0 6px " + s.glow + '"></span>' +
      '<span style="color:' + s.color + '">' + s.code + " " + s.label + "</span>" +
      "</div>";
  }

  var bodyHtml;
  if (dayEntry && dayEntry.text) {
    var preview = dayEntry.text.length > 70 ? dayEntry.text.slice(0, 70) + "\u2026" : dayEntry.text;
    bodyHtml = '<div class="cal-tooltip-preview">' + escapeHtml(preview.replace(/\n+/g, " ")) + "</div>";
  } else {
    bodyHtml = '<div class="cal-tooltip-empty">no entry</div>';
  }

  tip.innerHTML = '<div class="cal-tooltip-date">' + fullDate + "</div>" + moodHtml + bodyHtml;

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
    '<div class="cal-mode-toggle">' +
    '<button class="cal-mode-btn' + (viewMode === "month" ? " active" : "") + '" data-mode="month">month</button>' +
    '<button class="cal-mode-btn' + (viewMode === "year" ? " active" : "") + '" data-mode="year">year</button>' +
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

  var weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  var headerCells = weekdayLabels
    .map(function (l) { return '<div class="cal-weekday">' + l + "</div>"; })
    .join("");

  var cells = "";
  for (var i = 0; i < firstWeekday; i++) {
    cells += '<div class="cal-cell cal-cell-empty"></div>';
  }
  for (var day = 1; day <= totalDays; day++) {
    var key = dateKey(new Date(year, month, day));
    var dayEntry = dayEntryMap[key];
    var s = dayEntry && STATUS[dayEntry.mood] ? STATUS[dayEntry.mood] : null;
    var isToday = key === todayKey;
    var classes = "cal-cell";
    if (isToday) classes += " cal-cell-today";
    var style = s ? ' style="background:' + s.color + "22;border-color:" + s.color + '"' : "";
    var numColor = s ? s.color : (isToday ? "#4dd0c4" : "");
    var numStyle = numColor ? ' style="color:' + numColor + '"' : "";
    cells +=
      '<div class="' + classes + '" data-date="' + key + '"' + style + ">" +
      '<span class="cal-daynum"' + numStyle + ">" + day + "</span>" +
      "</div>";
  }

  container.innerHTML =
    '<div class="cal-card">' +
    renderModeToggle() +
    '<div class="cal-nav">' +
    '<button class="cal-nav-btn" data-dir="prev" aria-label="previous month">\u2039</button>' +
    '<div class="daily-section-title cal-nav-title">// ' + monthLabel + "</div>" +
    '<button class="cal-nav-btn" data-dir="next" aria-label="next month">\u203A</button>' +
    "</div>" +
    '<div class="cal-grid cal-grid-header">' + headerCells + "</div>" +
    '<div class="cal-grid">' + cells + "</div>" +
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
      var style = s ? ' style="background:' + s.color + "55;border-color:" + s.color + '"' : "";
      var title = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      heatCells +=
        '<div class="' + classes + '" data-date="' + key + '" title="' + title + '"' + style + "></div>";
    });
  });

  var streak = calcStreak(entries);

  container.innerHTML =
    '<div class="cal-card">' +
    renderModeToggle() +
    '<div class="daily-section-title cal-nav-title">// ' + today.getFullYear() + '</div>' +
    '<div class="cal-heatmap">' + heatCells + "</div>" +
    '<div class="cal-year-summary">' +
    '<span>streak: ' + streak + (streak === 1 ? " day" : " days") + "</span>" +
    '<span>' + activeDays + " / 365 days active</span>" +
    "</div>" +
    "</div>";
}

export function renderCalendar() {
  var container = document.getElementById("calendarSection");
  if (!container) return;

  var now = new Date();
  var entries = loadEntries();
  var dayEntryMap = buildDayEntryMap(entries);

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
      var navBtn = e.target.closest(".cal-nav-btn");
      if (navBtn) {
        var dir = navBtn.getAttribute("data-dir");
        if (dir === "prev") goToPrevMonth();
        else if (dir === "next") goToNextMonth();
        return;
      }
      var cell = e.target.closest("[data-date]");
      if (!cell) return;
      openDayViewer(cell.getAttribute("data-date"));
    });

    container.addEventListener("mouseover", function (e) {
      var cell = e.target.closest("[data-date]");
      if (!cell) return;
      var key = cell.getAttribute("data-date");
      var freshMap = buildDayEntryMap(loadEntries());
      showTooltip(cell, freshMap[key]);
    });

    container.addEventListener("mouseout", function (e) {
      var cell = e.target.closest("[data-date]");
      if (!cell) return;
      hideTooltip();
    });

    listenerAttached = true;
  }
}