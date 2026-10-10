import { apiListDaysAsMap, apiListEntries, apiListHabits, apiHabitLogs } from "./api.js";
import { dateKey } from "./dayRecord.js";
import { getGoals } from "./goals.js";
import { getPomodoroHistory } from "./pomodoro.js";
import { CATEGORIES } from "./categories.js";
import { openDayViewer } from "./dayViewer.js";
import { icon } from "./icons.js";

var DENSITY_UNIT_MINUTES = 25;
var MAX_VISIBLE_CATEGORIES = 6;


var categoryIds = CATEGORIES.map(function (category) { return category.id; });
var state = { view: "monthly" };

/*
  Density is evidence-based rather than inferred from prose. One density unit is
  a completed 25-minute focus block, a tagged activity, or a written reflection.
  Future modules can add activityCategory/category fields without changing this format.
*/
export async function getDensityData() {
  var days = {};
  var storedDays = await apiListDaysAsMap();
  var entries = await apiListEntries();

  Object.keys(storedDays).forEach(function (date) {
    var record = storedDays[date] || {};
    var day = ensureDay(days, date);

    if (hasText(record.journal)) addActivity(day, "reflection", 1, "dailyReflections");
    if (hasText(record.brainDump)) addActivity(day, "reflection", 1, "dailyReflections");
    if (hasReflection(record.nightReflection)) addActivity(day, "reflection", 1, "dailyReflections");

    addExplicitCollection(day, record.activities, "activities");
    addExplicitCollection(day, (record.tasks || []).filter(function (t) { return t && t.completed; }), "tasks");
    addTextTags(day, record.morning && record.morning.mainFocus, "taggedFocus");
  });

  entries.forEach(function (entry) {
    if (!entry || !entry.date) return;
    var day = ensureDay(days, dateKey(entry.date));
    addActivity(day, "reflection", 1, "journalEntries");
    addTextTags(day, entry.text, "taggedEntries");
  });

  await addHabitDays(days);
  addPomodoroDays(days, await getPomodoroHistory());
  await addGoalCompletions(days);

  var records = Object.keys(days)
    .sort()
    .map(function (date) { return finalizeDay(days[date]); })
    .filter(function (day) { return day.totalActivity > 0; });

  return {
    categories: CATEGORIES.map(copyCategory),
    days: records,
    unit: "activity signals",
    unitDescription: "One unit equals a logged activity, written reflection, or 25 minutes of completed Pomodoro focus.",
    generatedAt: new Date().toISOString()
  };
}

export async function calculateDensityStats(data, range) {
  var density = data || (await getDensityData());
  var dates = range || getViewDates(state.view);
  var dayByDate = mapDays(density.days);
  var totals = emptyCategories();
  var trackedDays = 0;
  var weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

  dates.forEach(function (date) {
    var day = dayByDate[date];
    if (!day) return;
    trackedDays++;
    Object.keys(day.categories).forEach(function (category) {
      totals[category] += day.categories[category];
    });
    weekdayCounts[new Date(date + "T12:00:00").getDay()]++;
  });

  var totalActivity = sumValues(totals);
  var rankedCategories = CATEGORIES
    .map(function (category) {
      return Object.assign({}, category, { value: totals[category.id] || 0 });
    })
    .filter(function (category) { return category.value > 0; })
    .sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); });

  return {
    dates: dates,
    totals: totals,
    totalActivity: totalActivity,
    trackedDays: trackedDays,
    rankedCategories: rankedCategories,
    strongestCategory: rankedCategories[0] || null,
    mostConsistentWeekday: strongestWeekday(weekdayCounts),
    inactiveCategories: inactiveCategories(density.days)
  };
}

export async function renderDensityMap() {
  var container = document.getElementById("densityMapSection");
  if (!container) return;

  var density = await getDensityData();
  var dates = getViewDates(state.view);
  var stats = await calculateDensityStats(density, dates);

  container.innerHTML = renderMap(density, stats);
  container.onclick = handleClick;
}

function renderMap(density, stats) {
  return `
    <section class="density-map-card" aria-label="Life density map">
      <div class="density-heading">
        <div>
          <h3 class="daily-section-title">${icon("layout-grid")}<span>life areas</span></h3>
          <p class="density-subtitle">where your time and energy went, from what you logged</p>
        </div>
        <div class="segmented density-view-switch" role="group" aria-label="period">
          ${viewButton("weekly", "week")}
          ${viewButton("monthly", "month")}
          ${viewButton("yearly", "year")}
        </div>
      </div>

      ${stats.totalActivity ? renderContent(density, stats) : renderEmptyState()}
    </section>
  `;
}

function renderContent(density, stats) {
  var dayByDate = mapDays(density.days);
  var categories = stats.rankedCategories.slice(0, MAX_VISIBLE_CATEGORIES);

  return `
    <div class="density-summary" aria-label="Density summary">
      ${summaryItem("tracked days", stats.trackedDays)}
      ${summaryItem("strongest", icon(stats.strongestCategory.icon) + "<span>" + stats.strongestCategory.label.toLowerCase() + "</span>")}
      ${summaryItem("recorded activity", formatNumber(stats.totalActivity))}
    </div>

    <div class="density-period-label">${periodLabel(state.view)}</div>
    <div class="density-grid-scroll">
      <div class="density-grid" style="--density-days: ${stats.dates.length}">
        <div class="density-grid-header density-category-label">area</div>
        ${stats.dates.map(renderDayHeader).join("")}
        ${categories.map(function (category) {
          return renderCategoryRow(category, stats.dates, dayByDate);
        }).join("")}
      </div>
    </div>

    ${renderInsights(stats)}
    <div class="density-legend" aria-label="Activity intensity legend">
      <span>less</span>
      <i class="density-cell density-level-0"></i><i class="density-cell density-level-1"></i><i class="density-cell density-level-2"></i><i class="density-cell density-level-3"></i><i class="density-cell density-level-4"></i>
      <span>more</span>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="density-empty">
      ${icon("sprout")}
      <p>log an activity, finish a task with a life area, or run a focus session and it shows up here.</p>
      <p class="density-empty-note">tip: write #fitness or #faith in an entry to tag it.</p>
    </div>
  `;
}

function renderCategoryRow(category, dates, dayByDate) {
  var peak = Math.max.apply(null, dates.map(function (date) {
    var day = dayByDate[date];
    return day ? day.categories[category.id] : 0;
  }).concat([0]));

  return `
    <div class="density-category-label" title="${category.label}">${icon(category.icon)}<span>${category.label.toLowerCase()}</span></div>
    ${dates.map(function (date) {
      var day = dayByDate[date];
      var value = day ? day.categories[category.id] : 0;
      return renderDensityCell(date, category, value, peak);
    }).join("")}
  `;
}

function renderDayHeader(date) {
  var day = new Date(date + "T12:00:00");
  var shortDay = day.toLocaleDateString(undefined, { weekday: "narrow" });
  var dayNumber = day.getDate();
  return `<div class="density-day-header" title="${formatDateLabel(date)}"><span>${shortDay}</span>${dayNumber}</div>`;
}

function renderDensityCell(date, category, value, peak) {
  var level = densityLevel(value, peak);
  var label = category.label.toLowerCase() + ", " + formatDateLabel(date) + ": " + (value ? formatNumber(value) + " logged" : "nothing logged");
  return `<button type="button" class="density-cell density-level-${level}" data-date="${date}" title="${label}" aria-label="${label}"></button>`;
}

function renderInsights(stats) {
  var insights = [];
  var strongest = stats.strongestCategory;
  var share = strongest ? Math.round((strongest.value / stats.totalActivity) * 100) : 0;

  if (strongest) insights.push(strongest.label.toLowerCase() + " is " + share + "% of what you logged.");
  if (stats.mostConsistentWeekday) insights.push("you log most on " + stats.mostConsistentWeekday + "s.");
  if (stats.inactiveCategories[0]) {
    var inactive = stats.inactiveCategories[0];
    insights.push("no " + inactive.label.toLowerCase() + " for " + inactive.daysSince + " days.");
  }
  if (!insights.length) return "";
  return `<p class="density-insights">${icon("sparkle")}<span>${insights.slice(0, 3).join(" ")}</span></p>`;
}

function viewButton(view, label) {
  var active = state.view === view;
  return `<button class="seg-btn${active ? " active" : ""}" type="button" data-density-view="${view}" aria-pressed="${active}">${label}</button>`;
}

function summaryItem(label, value) {
  return `<div class="stat-card density-stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

function handleClick(event) {
  var cell = event.target.closest(".density-cell[data-date]");
  if (cell) {
    openDayViewer(cell.getAttribute("data-date"));
    return;
  }
  var button = event.target.closest("[data-density-view]");
  if (!button) return;
  state.view = button.getAttribute("data-density-view");
  renderDensityMap();
}

function addPomodoroDays(days, history) {

  Object.keys(history).forEach(function (date) {
    var focusMs = Number(history[date] && history[date].focusMs) || 0;
    if (focusMs <= 0) return;
    var day = ensureDay(days, date);
    day.sources.pomodoroMinutes += focusMs / 60000;
    addActivity(day, "work", focusMs / (DENSITY_UNIT_MINUTES * 60000), "pomodoro");
  });
}

async function addGoalCompletions(days) {
  (await getGoals()).forEach(function (goal) {
    if (!goal.completed || !goal.completedAt || !isCategory(goal.activityCategory)) return;
    var day = ensureDay(days, dateKey(goal.completedAt));
    addActivity(day, goal.activityCategory, 1, "completedGoals");
  });
}

function addExplicitCollection(day, items, source) {
  if (!Array.isArray(items)) return;
  items.forEach(function (item) {
    if (!item) return;
    var category = explicitCategory(item.activityCategory || item.category || item.type);
    if (!category) {
      addTextTags(day, item.title || item.text || item.name, source);
      return;
    }
    var minutes = Number(item.durationMinutes || item.minutes || item.duration) || 0;
    var units = minutes > 0 ? minutes / DENSITY_UNIT_MINUTES : 1;
    addActivity(day, category, units, source);
  });
}

function addTextTags(day, value, source) {
  if (typeof value !== "string") return;
  categoryIds.forEach(function (category) {
    var tag = new RegExp("(^|\\s)(#|\\[)" + category + "(?:\\]|\\b)", "i");
    if (tag.test(value)) addActivity(day, category, 1, source);
  });
}

function ensureDay(days, date) {
  if (!days[date]) {
    days[date] = {
      date: date,
      categories: emptyCategories(),
      sources: {
        pomodoroMinutes: 0,
        pomodoro: 0,
        dailyReflections: 0,
        journalEntries: 0,
        taggedEntries: 0,
        taggedFocus: 0,
        activities: 0,
        tasks: 0,
        habits: 0,
        completedGoals: 0
      }
    };
  }
  return days[date];
}

/* a checked habit with a life area counts once for that day */
async function addHabitDays(days) {
  try {
    var habits = await apiListHabits(true);
    var area = {};
    habits.forEach(function (h) { if (h.category) area[h.id] = h.category; });
    if (!Object.keys(area).length) return;
    (await apiHabitLogs()).forEach(function (l) {
      if (area[l.habitId]) addActivity(ensureDay(days, l.date), area[l.habitId], 1, "habits");
    });
  } catch (e) {
    // an older server without habits: skip them
  }
}

function addActivity(day, category, units, source) {
  if (!isCategory(category) || !units) return;
  day.categories[category] += units;
  day.sources[source] = (day.sources[source] || 0) + units;
}

function finalizeDay(day) {
  return {
    date: day.date,
    categories: Object.assign({}, day.categories),
    totalActivity: sumValues(day.categories),
    sources: Object.assign({}, day.sources)
  };
}

function getViewDates(view) {
  var today = new Date();
  today.setHours(12, 0, 0, 0);
  var start;

  if (view === "weekly") {
    start = new Date(today);
    var weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
    return datesBetween(start, today);
  }
  if (view === "yearly") {
    start = new Date(today);
    start.setDate(start.getDate() - 364);
    return datesBetween(start, today);
  }
  start = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  return datesBetween(start, today);
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

function inactiveCategories(days) {
  var latest = {};
  var today = new Date();
  today.setHours(12, 0, 0, 0);

  days.forEach(function (day) {
    Object.keys(day.categories).forEach(function (category) {
      if (day.categories[category] > 0) latest[category] = day.date;
    });
  });

  return CATEGORIES.map(function (category) {
    var lastDate = latest[category.id];
    if (!lastDate) return null;
    var last = new Date(lastDate + "T12:00:00");
    var daysSince = Math.floor((today - last) / 86400000);
    return daysSince >= 7 ? { label: category.label, daysSince: daysSince } : null;
  }).filter(Boolean).sort(function (a, b) { return b.daysSince - a.daysSince; });
}

function strongestWeekday(counts) {
  var maximum = Math.max.apply(null, counts);
  if (!maximum) return null;
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][counts.indexOf(maximum)];
}

function densityLevel(value, peak) {
  if (!value) return 0;
  if (!peak) return 1;
  var ratio = value / peak;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function periodLabel(view) {
  if (view === "weekly") return "current week";
  if (view === "yearly") return "last 365 days";
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDateLabel(date) {
  return new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function hasReflection(reflection) {
  return Boolean(reflection && Object.keys(reflection).some(function (key) { return hasText(reflection[key]); }));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function explicitCategory(value) {
  return typeof value === "string" && isCategory(value.toLowerCase()) ? value.toLowerCase() : null;
}

function isCategory(value) {
  return categoryIds.indexOf(value) >= 0;
}

function emptyCategories() {
  return categoryIds.reduce(function (result, category) {
    result[category] = 0;
    return result;
  }, {});
}

function mapDays(days) {
  return days.reduce(function (result, day) {
    result[day.date] = day;
    return result;
  }, {});
}

function sumValues(values) {
  return Object.keys(values).reduce(function (total, key) { return total + values[key]; }, 0);
}

function copyCategory(category) {
  return Object.assign({}, category);
}

