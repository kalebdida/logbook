import { apiListEntries, apiListDaysAsMap } from "./api.js";
import { dateKey } from "./dayRecord.js";
import { calcStreak, bar } from "./stats.js";
import { getGoals, getGoalStats } from "./goals.js";
import { getDensityData, calculateDensityStats } from "./densityMap.js";
import { getPomodoroHistory } from "./pomodoro.js";
import { icon } from "./icons.js";

var WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var NOT_ENOUGH_DATA = "Not enough data yet. Keep logging.";

var state = { view: "week" };

/*
  Analytics stores nothing of its own. Every number here is derived, on each
  render, from what other modules already persist: entries, day records,
  goals, pomodoro history, and Density Map's own category rollup (reused,
  not recomputed, so Life Balance can never drift from what Density Map
  itself would show). A section says "not enough data" instead of guessing
  when its source is empty, and nothing here infers a mood, a habit, or a
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
  if (!button) return;
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

function collectAllTasks(days) {
  var all = [];
  Object.keys(days).forEach(function (date) {
    var tasks = days[date] && days[date].tasks;
    if (Array.isArray(tasks)) tasks.forEach(function (t) { all.push(t); });
  });
  return all;
}

function startOfWeek(date) {
  var d = new Date(date);
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
  Mirrors Density Map's own week/month/year semantics (week-to-date from
  Monday, month-to-date, last 365 days) so the same filter label means the
  same date range in both places.
*/
function getDateRange(view) {
  var today = new Date();
  var end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  var start;
  if (view === "year") {
    start = new Date(end);
    start.setDate(start.getDate() - 364);
  } else if (view === "month") {
    start = new Date(end.getFullYear(), end.getMonth(), 1, 12);
  } else {
    start = startOfWeek(end);
  }
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

function unionDates() {
  var out = {};
  Array.prototype.forEach.call(arguments, function (set) {
    Object.keys(set).forEach(function (date) { out[date] = true; });
  });
  return out;
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
  var cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if (!dateSet[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (dateSet[dateKey(cursor)]) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current: current, longest: longest };
}

function weekdayCounts(dateSet) {
  var counts = [0, 0, 0, 0, 0, 0, 0];
  Object.keys(dateSet).forEach(function (date) {
    counts[new Date(date + "T12:00:00").getDay()]++;
  });
  return counts;
}

function strongestWeekday(counts) {
  var max = Math.max.apply(null, counts);
  if (!max) return null;
  return WEEKDAY_NAMES[counts.indexOf(max)];
}

/* ---------- computed data ---------- */

async function computeAnalyticsData(view) {
  var entries = await apiListEntries();
  var days = await apiListDaysAsMap();
  var pomodoroDays = await getPomodoroHistory();
  var goals = await getGoals();
  var goalStats = await getGoalStats();

  var range = getDateRange(view);
  var sets = buildActivitySets(entries, days, pomodoroDays, goals);

  return {
    view: view,
    periodLabel: periodLabel(view),
    hasAnyData: entries.length > 0 || Object.keys(days).length > 0 || goals.length > 0 || Object.keys(pomodoroDays).length > 0,
    overview: buildOverview(days, pomodoroDays, goals, sets),
    trend: buildFocusTrend(range, pomodoroDays, view),
    consistency: buildConsistency(range, sets),
    reflection: buildReflectionHabit(range, sets),
    goalProgress: buildGoalProgress(goalStats),
    balance: await calculateDensityStats(await getDensityData(), range),
    streaks: buildStreaks(entries, sets, goalStats),
    insights: buildInsights(range, view, sets, goalStats, pomodoroDays)
  };
}

function periodLabel(view) {
  if (view === "year") return "in the last 365 days";
  if (view === "month") return "in " + new Date().toLocaleDateString(undefined, { month: "long" });
  return "this week";
}

function buildOverview(days, pomodoroDays, goals, sets) {
  var today = dateKey(new Date());
  var weekDates = getDateRange("week");

  var todayGoals = goals.filter(function (g) {
    return g.completed && g.completedAt && dateKey(g.completedAt) === today;
  }).length;

  var weekGoals = goals.filter(function (g) {
    return g.completed && g.completedAt && weekDates.indexOf(dateKey(g.completedAt)) !== -1;
  }).length;

  var weekFocusMs = weekDates.reduce(function (sum, d) { return sum + focusMsFor(pomodoroDays, d); }, 0);
  var weekActiveDays = weekDates.filter(function (d) { return isActiveDay(d, sets); }).length;
  var weekReflectionDays = weekDates.filter(function (d) { return sets.reflectionDates[d]; }).length;

  var allTasks = collectAllTasks(days);
  var todaysTasks = Array.isArray(days[today] && days[today].tasks) ? days[today].tasks : [];

  return {
    today: {
      focusMinutes: Math.round(focusMsFor(pomodoroDays, today) / 60000),
      goalsCompleted: todayGoals,
      reflectionLogged: dayHasReflection(days[today]),
      tasks: allTasks.length > 0
        ? { done: todaysTasks.filter(function (t) { return t && t.completed; }).length, total: todaysTasks.length }
        : null
    },
    week: {
      focusMinutes: Math.round(weekFocusMs / 60000),
      activeDays: weekActiveDays,
      daysElapsed: weekDates.length,
      goalsCompleted: weekGoals,
      reflectionDays: weekReflectionDays
    }
  };
}

function buildFocusTrend(range, pomodoroDays, view) {
  var daily = range.map(function (d) {
    return { date: d, minutes: Math.round(focusMsFor(pomodoroDays, d) / 60000) };
  });

  var points = view === "year" ? bucketByWeek(daily) : daily;
  var max = points.reduce(function (m, p) { return Math.max(m, p.minutes); }, 0);
  var total = daily.reduce(function (sum, p) { return sum + p.minutes; }, 0);

  return { points: points, max: max, total: total, bucket: view === "year" ? "week" : "day" };
}

function bucketByWeek(daily) {
  var buckets = {};
  var order = [];
  daily.forEach(function (point) {
    var weekStart = dateKey(startOfWeek(new Date(point.date + "T12:00:00")));
    if (!buckets[weekStart]) { buckets[weekStart] = 0; order.push(weekStart); }
    buckets[weekStart] += point.minutes;
  });
  return order.map(function (weekStart) { return { date: weekStart, minutes: buckets[weekStart] }; });
}

function buildConsistency(range, sets) {
  var active = range.filter(function (d) { return isActiveDay(d, sets); }).length;
  return { active: active, total: range.length, pct: range.length ? Math.round((active / range.length) * 100) : 0 };
}

function buildReflectionHabit(range, sets) {
  var active = range.filter(function (d) { return sets.reflectionDates[d]; }).length;
  return { active: active, total: range.length, pct: range.length ? Math.round((active / range.length) * 100) : 0 };
}

function buildGoalProgress(goalStats) {
  return {
    completed: goalStats.completed,
    active: goalStats.active,
    total: goalStats.total,
    overallProgress: goalStats.overallProgress
  };
}

function buildStreaks(entries, sets, goalStats) {
  var loggingCurrent = calcStreak(entries);
  var loggingLongest = Math.max(streakInfo(sets.entryDates).longest, loggingCurrent);
  var focus = streakInfo(sets.focusDates);
  var goalStreak = streakInfo(sets.goalDates);

  return {
    loggingCurrent: loggingCurrent,
    loggingLongest: loggingLongest,
    focusCurrent: focus.current,
    goalCurrent: goalStreak.current,
    goalLongest: goalStats.longestCompletionStreak
  };
}

function buildInsights(range, view, sets, goalStats, pomodoroDays) {
  var insights = [];
  var unioned = unionDates(sets.entryDates, sets.reflectionDates, sets.focusDates, sets.goalDates);
  var activeInRange = {};
  range.forEach(function (d) { if (unioned[d]) activeInRange[d] = true; });

  var weekday = strongestWeekday(weekdayCounts(activeInRange));
  if (weekday && Object.keys(activeInRange).length >= 2) {
    insights.push("Your most consistent day is " + weekday + ".");
  }

  var reflectionDaysInRange = range.filter(function (d) { return sets.reflectionDates[d]; }).length;
  if (reflectionDaysInRange > 0) {
    insights.push(
      "You have logged reflections " + reflectionDaysInRange +
      " day" + (reflectionDaysInRange === 1 ? "" : "s") + " " + periodLabel(view) + "."
    );
  }

  var currentStreak = streakInfo(sets.entryDates).current;
  if (currentStreak > 0) {
    insights.push("Your current logging streak is " + currentStreak + " day" + (currentStreak === 1 ? "" : "s") + ".");
  } else {
    var longestStreak = streakInfo(sets.entryDates).longest;
    if (longestStreak > 0) {
      insights.push("Your longest logging streak so far is " + longestStreak + " day" + (longestStreak === 1 ? "" : "s") + ".");
    }
  }

  var goalDaysInRange = range.filter(function (d) { return sets.goalDates[d]; }).length;
  if (goalDaysInRange > 0) {
    insights.push(
      "You completed a goal on " + goalDaysInRange +
      " day" + (goalDaysInRange === 1 ? "" : "s") + " " + periodLabel(view) + "."
    );
  } else if (goalStats.active > 0) {
    insights.push(goalStats.active + " goal" + (goalStats.active === 1 ? " is" : "s are") + " still active.");
  }

  var focusDaysInRange = range.filter(function (d) { return sets.focusDates[d]; }).length;
  if (focusDaysInRange > 0) {
    var focusMinutesInRange = range.reduce(function (sum, d) { return sum + Math.round(focusMsFor(pomodoroDays, d) / 60000); }, 0);
    insights.push(
      "You logged focus time on " + focusDaysInRange + " day" + (focusDaysInRange === 1 ? "" : "s") +
      " " + periodLabel(view) + ", totaling " + formatMinutes(focusMinutesInRange) + "."
    );
  }

  return insights;
}

/* ---------- render layer ---------- */

function renderDashboard(data) {
  if (!data.hasAnyData) {
    return (
      '<div class="analytics-card">' +
      renderHeading() +
      '<div class="analytics-empty">' +
      icon("sprout") +
      "<p>nothing to see yet. patterns show up here once a few days are logged: daily pages, focus sessions, goals.</p>" +
      "</div>" +
      "</div>"
    );
  }

  return (
    '<div class="analytics-card">' +
    renderHeading() +
    '<div class="analytics-body">' +
      renderOverview(data.overview) +
      renderTrends(data) +
      renderStreaks(data.streaks) +
    "</div>" +
    "</div>"
  );
}

function renderHeading() {
  return (
    '<div class="analytics-heading">' +
    '<div><h3 class="daily-section-title">' + icon("chart-column") + "<span>your patterns</span></h3>" +
    '<p class="density-subtitle">how consistent the days have been</p></div>' +
    '<div class="segmented analytics-view-switch" role="group" aria-label="period">' +
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
    '" aria-pressed="' + active + '">' + view + "</button>"
  );
}

function renderOverview(overview) {
  var weekCards = [
    statCard("focus this week", formatMinutes(overview.week.focusMinutes), "timer"),
    statCard("active days", overview.week.activeDays + " of " + overview.week.daysElapsed, "calendar-check"),
    statCard("goals done", String(overview.week.goalsCompleted), "flag"),
    statCard("reflections", String(overview.week.reflectionDays), "moon")
  ];

  return '<div class="analytics-overview"><div class="analytics-summary">' + weekCards.join("") + "</div></div>";
}

function statCard(label, value, iconName) {
  return '<div class="stat-card analytics-stat-card">' + (iconName ? '<span class="stat-icon">' + icon(iconName) + "</span>" : "") +
    '<div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div></div>";
}

function formatMinutes(minutes) {
  if (minutes < 60) return minutes + " min";
  var hours = Math.floor(minutes / 60);
  var rest = minutes % 60;
  return hours + "h" + (rest ? " " + rest + "m" : "");
}

function renderTrends(data) {
  return (
    '<div class="analytics-trends">' +
    '<div class="section-label">focus ' + data.periodLabel + "</div>" +
    renderFocusTrend(data.trend) +
    '<div class="bar-row">' +
    '<span class="bar-label">consistency</span>' +
    "<span>" + bar(data.consistency.pct) + "</span>" +
    '<span class="bar-pct">' + data.consistency.active + " / " + data.consistency.total + "</span>" +
    "</div>" +
    '<div class="bar-row">' +
    '<span class="bar-label">reflection</span>' +
    "<span>" + bar(data.reflection.pct) + "</span>" +
    '<span class="bar-pct">' + data.reflection.active + " / " + data.reflection.total + "</span>" +
    "</div>" +
    '<div class="bar-row">' +
    '<span class="bar-label">goals</span>' +
    "<span>" + bar(data.goalProgress.overallProgress) + "</span>" +
    '<span class="bar-pct">' + data.goalProgress.completed + " done, " + data.goalProgress.active + " active</span>" +
    "</div>" +
    "</div>"
  );
}

function renderFocusTrend(trend) {
  if (trend.total === 0) {
    return '<div class="analytics-trend"><div class="analytics-trend-empty">no focus sessions logged in this period yet.</div></div>';
  }

  var bars = trend.points.map(function (p) {
    var pct = trend.max > 0 ? p.minutes / trend.max : 0;
    var heightPx = Math.max(2, Math.round(pct * 64));
    var label = (trend.bucket === "week" ? "week of " + formatShortDate(p.date) : formatShortDate(p.date)) + ": " + p.minutes + " min";
    return '<div class="analytics-trend-bar" style="height:' + heightPx + 'px" title="' + label + '"></div>';
  }).join("");

  var rangeLabel = trend.points.length > 1
    ? formatShortDate(trend.points[0].date) + " to " + formatShortDate(trend.points[trend.points.length - 1].date)
    : formatShortDate(trend.points[0].date);

  return (
    '<div class="analytics-trend">' +
    '<div class="analytics-trend-chart">' + bars + "</div>" +
    '<div class="analytics-trend-range">' +
    "<span>" + rangeLabel + "</span>" +
    "<span>" + formatMinutes(trend.total) + " in all</span>" +
    "</div>" +
    "</div>"
  );
}

function formatShortDate(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderBalance(stats) {
  if (!stats.totalActivity) {
    return (
      '<div class="analytics-balance">' +
      '<div class="section-label">life balance</div>' +
      '<div class="analytics-balance-empty">' + NOT_ENOUGH_DATA + "</div>" +
      "</div>"
    );
  }

  var peak = stats.rankedCategories[0].value;
  var rows = stats.rankedCategories.map(function (category) {
    var pct = peak > 0 ? Math.round((category.value / peak) * 100) : 0;
    return (
      '<div class="bar-row">' +
      '<span class="bar-label">' + category.icon + " " + category.label + "</span>" +
      "<span>" + bar(pct) + "</span>" +
      '<span class="bar-pct">' + formatSignals(category.value) + "</span>" +
      "</div>"
    );
  }).join("");

  return '<div class="analytics-balance"><div class="section-label">life balance</div>' + rows + "</div>";
}

function formatSignals(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderStreaks(streaks) {
  var cards = [
    statCard("writing streak", days(streaks.loggingCurrent), "flame"),
    statCard("longest streak", days(streaks.loggingLongest), "trophy"),
    statCard("focus streak", days(streaks.focusCurrent), "timer"),
    statCard("goal streak", days(streaks.goalCurrent), "mountain-snow")
  ];

  return '<div class="analytics-streaks"><div class="section-label">streaks</div><div class="analytics-summary">' + cards.join("") + "</div></div>";
}

function days(n) {
  return n + (n === 1 ? " day" : " days");
}

function renderInsights(insights) {
  var body = insights.length > 0
    ? insights.slice(0, 5).map(function (line) { return "<p>" + line + "</p>"; }).join("")
    : "<p>" + NOT_ENOUGH_DATA + "</p>";

  return '<div class="analytics-insights"><div class="section-label">insights</div>' + body + "</div>";
}