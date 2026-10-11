import { getEntries } from './journal.js';
import { getTodayTasks } from './tasks.js';
import { calcStreak } from './stats.js';
import { upcoming, daysUntil, displayTitle } from './deadlines.js';
import { dateKey } from './dayRecord.js';
import { onChange } from './bus.js';

/* Feeds the Android home screen widget (android-extras/): the streak,
   today's tasks and the next date that matters. Only inside the Android
   app; everywhere else this does nothing. */

function plugin() {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
  try {
    return (C.Plugins && C.Plugins.LogbookWidget) || (C.registerPlugin ? C.registerPlugin("LogbookWidget") : null);
  } catch (e) {
    return null;
  }
}

export function widgetData() {
  var tasks = [];
  try { tasks = getTodayTasks(); } catch (e) {}
  var done = tasks.filter(function (t) { return t.completed; }).length;
  var open = tasks.filter(function (t) { return !t.completed; });
  var next = null;
  try { next = upcoming().filter(function (d) { return daysUntil(d.nextDate) >= 0; })[0] || null; } catch (e) {}
  var entries = [];
  try { entries = getEntries(); } catch (e) {}
  return {
    day: dateKey(new Date()),
    streak: calcStreak(entries),
    tasksHead: tasks.length ? done + " of " + tasks.length + " tasks done" : "Today",
    tasks: tasks.length && !open.length ? "All done. Good work." : open.slice(0, 4).map(function (t) { return "• " + t.title; }).join("\n"),
    nextTitle: next ? displayTitle(next, next.nextDate) : "",
    nextDate: next ? next.nextDate : ""
  };
}

var timer = null;
export function updateWidget() {
  var p = plugin();
  if (!p || !p.update) return;
  clearTimeout(timer);
  timer = setTimeout(function () {
    Promise.resolve(p.update(widgetData())).catch(function () {});
  }, 600);
}

export function startWidget() {
  if (!plugin()) return;
  onChange(updateWidget);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") updateWidget();
  });
  updateWidget();
}
