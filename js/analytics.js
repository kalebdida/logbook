import { apiListEntries, apiListDaysAsMap } from "./api.js";
import { dateKey } from "./dayRecord.js";
import { calcStreak, bar } from "./stats.js";
import { getGoals } from "./goals.js";
import { getPomodoroHistory } from "./pomodoro.js";
import { icon } from "./icons.js";

var state = { view: "week" };

/*
  Analytics stores nothing of its own. Every number here is derived, on each
  render, from what other modules already persist: entries, day records,
  goals and pomodoro history. Everything on the card follows the chosen
  period (week so far, month so far, the last 12 months) except the streaks,
  which never depend on it. Nothing here infers a mood, a habit, or a
  character trait that wasn't actually logged.
*/
export async function renderAnalytics() {
  var container = document.getElementById("analyticsSection");
  if (!container) return;

  var data = await computeAnalyticsData(state.view);
  container.innerHTML = renderDashboard(data);
  container.onclick = handleClick;
}

async function handleClick(event) {
  var button = event.target.closest("[data-analytics-view]");
  if (!button || button.classList.contains("active")) return;
  state.view = button.getAttribute("data-analytics-view");
  await renderAnalytics();
}

/* ---------- data layer ---------- */

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function dayHasReflection(record) {
  if (!record) return false;
  if (hasText(record.journal)) return true;
  if (hasText(record.brainDump)) return true;
  var nr = record.nightReflection;
  return Boolean(nr && Object.keys(nr).some(function (key) { return hasText(nr[key]); }));
}

function focusMsFor(pomodoroDays, date) {
  var day = pomodoroDays[date];
  return day ? Number(day.focusMs) || 0 : 0;
}

function noon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function startOfWeek(date) {
  var d = noon(date);
  var weekday = d.getDay() || 7;
  d.setDate(d.getDate() - weekday + 1);
  return d;
}

function datesBetween(start, end) {
  var dates = [];
  var cursor = new Date(start);
  while (cursor <= end) {
    dates.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/*
  The same periods as the Life areas card: week so far (from Monday), month
  so far, and the last 12 calendar months (this one included).
*/
function getDateRange(view) {
  var end = noon(new Date());
  var start;
  if (view === "year") start = new Date(end.getFullYear(), end.getMonth() - 11, 1, 12);
  else if (view === "month") start = new Date(end.getFullYear(), end.getMonth(), 1, 12);
  else start = startOfWeek(end);
  return datesBetween(start, end);
}

function buildActivitySets(entries, days, pomodoroDays, goals) {
  var entryDates = {};
  entries.forEach(function (e) { entryDates[dateKey(e.date)] = true; });

  var reflectionDates = {};
  Object.keys(days).forEach(function (date) {
    if (dayHasReflection(days[date])) reflectionDates[date] = true;
  });

  var focusDates = {};
  Object.keys(pomodoroDays).forEach(function (date) {
    if (focusMsFor(pomodoroDays, date) > 0) focusDates[date] = true;
  });

  var goalDates = {};
  goals.forEach(function (g) {
    if (g.completed && g.completedAt) goalDates[dateKey(g.completedAt)] = true;
  });

  return { entryDates: entryDates, reflectionDates: reflectionDates, focusDates: focusDates, goalDates: goalDates };
}

function isActiveDay(date, sets) {
  return Boolean(sets.entryDates[date] || sets.reflectionDates[date] || sets.focusDates[date] || sets.goalDates[date]);
}

function isNextDay(prevKey, curKey) {
  var d = new Date(prevKey + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return dateKey(d) === curKey;
}

function streakInfo(dateSet) {
  var dates = Object.keys(dateSet).sort();
  if (dates.length === 0) return { current: 0, longest: 0 };

  var longest = 0;
  var run = 0;
  var prev = null;
  dates.forEach(function (d) {
    run = prev && isNextDay(prev, d) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  });

  var current = 0;
  var cursor = noon(new Date());
  if (!dateSet[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (dateSet[dateKey(cursor)]) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current: current, longest: longest };
}

/* ---------- computed data ---------- */

async function computeAnalyticsData(view) {
  var results = await Promise.all([apiListEntries(), apiListDaysAsMap(), getPomodoroHistory(), getGoals()]);
  var entries = results[0], days = results[1], pomodoroDays = results[2], goals = results[3];

  var range = getDateRange(view);
  var sets = buildActivitySets(entries, days, pomodoroDays, goals);

  return {
    view: view,
    hasAnyData: entries.length > 0 || Object.keys(days).length > 0 || goals.length > 0 || Object.keys(pomodoroDays).length > 0,
    period: buildPeriod(range, sets, pomodoroDays, goals),
    trend: buildFocusTrend(view, pomodoroDays),
    streaks: buildStreaks(entries, sets)
  };
}

function buildPeriod(range, sets, pomodoroDays, goals) {
  var inRange = {};
  range.forEach(function (d) { inRange[d] = true; });
  var focusMs = range.reduce(function (sum, d) { return sum + focusMsFor(pomodoroDays, d); }, 0);
  return {
    days: range.length,
    focusMinutes: Math.round(focusMs / 60000),
    activeDays: range.filter(function (d) { return isActiveDay(d, sets); }).length,
    reflectionDays: range.filter(function (d) { return sets.reflectionDates[d]; }).length,
    goalsDone: goals.filter(function (g) { return g.completed && g.completedAt && inRange[dateKey(g.completedAt)]; }).length
  };
}

/*
  One slot per day of the whole week or month (days still to come stay
  empty, so the chart keeps its shape), or one per month for the year.
*/
function buildFocusTrend(view, pomodoroDays) {
  var today = noon(new Date());
  var todayKey = dateKey(today);
  var slots = [];

  if (view === "year") {
    for (var m = 11; m >= 0; m--) {
      var first = new Date(today.getFullYear(), today.getMonth() - m, 1, 12);
      var last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
      var minutes = 0;
      datesBetween(first, last < today ? last : today).forEach(function (d) { minutes += focusMsFor(pomodoroDays, d); });
      slots.push({
        label: first.toLocaleDateString(undefined, { month: "short" }),
        title: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        minutes: Math.round(minutes / 60000),
        current: m === 0
      });
    }
  } else {
    var start = view === "month" ? new Date(today.getFullYear(), today.getMonth(), 1, 12) : startOfWeek(today);
    var end = view === "month" ? new Date(today.getFullYear(), today.getMonth() + 1, 0, 12) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12);
    datesBetween(start, end).forEach(function (d) {
      var date = new Date(d + "T12:00:00");
      var future = d > todayKey;
      slots.push({
        label: view === "month"
          ? ((date.getDate() - 1) % 7 === 0 ? String(date.getDate()) : "")
          : date.toLocaleDateString(undefined, { weekday: "narrow" }),
        title: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        minutes: future ? null : Math.round(focusMsFor(pomodoroDays, d) / 60000),
        current: d === todayKey
      });
    });
  }

  var max = slots.reduce(function (mx, s) { return Math.max(mx, s.minutes || 0); }, 0);
  var total = slots.reduce(function (sum, s) { return sum + (s.minutes || 0); }, 0);
  return { slots: slots, max: max, total: total, view: view };
}

function buildStreaks(entries, sets) {
  var loggingCurrent = calcStreak(entries);
  return {
    loggingCurrent: loggingCurrent,
    loggingLongest: Math.max(streakInfo(sets.entryDates).longest, loggingCurrent),
    focusCurrent: streakInfo(sets.focusDates).current,
    goalCurrent: streakInfo(sets.goalDates).current
  };
}

/* ---------- render layer ---------- */

var PERIOD_WORDS = { week: "this week", month: "this month", year: "in the last 12 months" };

function renderDashboard(data) {
  if (!data.hasAnyData) {
    return (
      '<div class="analytics-card">' +
      renderHeading() +
      '<div class="analytics-empty">' +
      icon("sprout") +
      "<p>Nothing to see yet. Patterns show up here once a few days are logged: daily pages, focus sessions, goals.</p>" +
      "</div>" +
      "</div>"
    );
  }

  return (
    '<div class="analytics-card">' +
    renderHeading() +
    '<div class="analytics-body">' +
      renderOverview(data.period) +
      renderTrend(data.trend) +
      renderStreaks(data.streaks) +
    "</div>" +
    "</div>"
  );
}

function renderHeading() {
  return (
    '<div class="analytics-heading">' +
    '<div><h3 class="daily-section-title">' + icon("chart-column") + "<span>Your patterns</span></h3>" +
    '<p class="density-subtitle">How consistent the days have been ' + PERIOD_WORDS[state.view] + "</p></div>" +
    '<div class="segmented analytics-view-switch" role="group" aria-label="Period">' +
    viewButton("week") +
    viewButton("month") +
    viewButton("year") +
    "</div>" +
    "</div>"
  );
}

function viewButton(view) {
  var active = state.view === view;
  return (
    '<button class="seg-btn' + (active ? " active" : "") + '" type="button" data-analytics-view="' + view +
    '" aria-pressed="' + active + '">' + view.charAt(0).toUpperCase() + view.slice(1) + "</button>"
  );
}

function renderOverview(period) {
  var cards = [
    statCard("Focus", formatMinutes(period.focusMinutes), "timer"),
    statCard("Active days", period.activeDays + " of " + period.days, "calendar-check", period.days ? (period.activeDays / period.days) * 100 : 0),
    statCard("Reflections", plural(period.reflectionDays, "day"), "moon", period.days ? (period.reflectionDays / period.days) * 100 : 0),
    statCard("Goals done", String(period.goalsDone), "flag")
  ];

  return '<div class="analytics-overview"><div class="analytics-summary">' + cards.join("") + "</div></div>";
}

function statCard(label, value, iconName, meterPct) {
  return '<div class="stat-card analytics-stat-card">' + (iconName ? '<span class="stat-icon">' + icon(iconName) + "</span>" : "") +
    '<div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div>" +
    (meterPct === undefined ? "" : bar(meterPct)) + "</div>";
}

function formatMinutes(minutes) {
  if (minutes < 60) return minutes + " min";
  var hours = Math.floor(minutes / 60);
  var rest = minutes % 60;
  return hours + "h" + (rest ? " " + rest + "m" : "");
}

function renderTrend(trend) {
  var label = trend.view === "year" ? "Focus by month" : "Focus by day";
  var body;
  if (trend.total === 0) {
    body = '<div class="analytics-trend-empty">No focus sessions logged ' + PERIOD_WORDS[trend.view] + " yet.</div>";
  } else {
    body =
      '<div class="analytics-trend-chart analytics-trend-chart--' + trend.view + '">' +
      trend.slots.map(function (s) {
        var pct = s.minutes && trend.max ? Math.max(3, Math.round((s.minutes / trend.max) * 100)) : 0;
        var tip = s.title + ": " + (s.minutes === null ? "still to come" : formatMinutes(s.minutes));
        return (
          '<div class="trend-slot' + (s.current ? " is-current" : "") + (s.minutes === null ? " is-future" : "") + '" title="' + tip + '">' +
            '<span class="trend-bar-wrap">' + (s.minutes === null ? "" : '<i class="analytics-trend-bar" style="height:' + pct + '%"></i>') + "</span>" +
            '<span class="trend-label" aria-hidden="true">' + s.label + "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>" +
      '<div class="analytics-trend-range"><span>' + formatMinutes(trend.total) + " in all</span>" +
      (trend.max ? "<span>Best " + (trend.view === "year" ? "month" : "day") + ": " + formatMinutes(trend.max) + "</span>" : "") +
      "</div>";
  }
  return '<div class="analytics-trends"><div class="section-label">' + label + "</div>" + body + "</div>";
}

function renderStreaks(streaks) {
  var cards = [
    statCard("Writing streak", plural(streaks.loggingCurrent, "day"), "flame"),
    statCard("Longest streak", plural(streaks.loggingLongest, "day"), "trophy"),
    statCard("Focus streak", plural(streaks.focusCurrent, "day"), "timer"),
    statCard("Goal streak", plural(streaks.goalCurrent, "day"), "mountain-snow")
  ];

  return '<div class="analytics-streaks"><div class="section-label">Streaks</div><div class="analytics-summary">' + cards.join("") + "</div></div>";
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}
