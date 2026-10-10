import { getEntries } from './journal.js';
import { getTodayTasks } from './tasks.js';
import { getTodayFocus } from './pomodoro.js';
import { getGoals } from './goals.js';
import { getDensityData, calculateDensityStats } from './densityMap.js';
import { apiGetDay } from './api.js';
import { calcStreak } from './stats.js';
import { dateKey } from './dayRecord.js';
import { STATUS } from './entries.js';
import { getPrefs, displayName } from './prefs.js';
import { greeting } from './today.js';
import { escapeHtml } from './utils.js';
import { habitSummary } from './habits.js';
import { renderChatCard } from './companionChat.js';
import { icon } from './icons.js';

var MARKS = { hello: "sparkles", ok: "circle-check", warn: "bell", care: "heart", info: "info", memory: "history" };

/* Companion. The daily brief is local: plain rules over your own data
   (where today stands, what needs attention, a memory, a question), no AI,
   nothing sent anywhere. "ask your logbook" (companionChat.js) adds an AI
   chat when you connect one. */

var PROMPTS = [
  "What drained you today, and what gave energy back?",
  "Where did you see God at work today, even in something small?",
  "What would make tomorrow 1% better than today?",
  "What are you avoiding, and what's the smallest step toward it?",
  "Who helped you recently? have you thanked them?",
  "What did you learn today that you didn't know yesterday?",
  "What are you grateful for that you didn't earn?",
  "If this week had a title, what would it be?",
  "What would the version of you five years from now want you to do tonight?",
  "What's one thing you said yes to that you should have said no to?",
  "Where were you most patient today, and where least?",
  "What promise to yourself did you keep today?",
  "What are you worrying about that you can hand over?",
  "What does rest actually look like for you this week?"
];

function promptOfTheDay() {
  var d = new Date();
  var dayNumber = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return PROMPTS[dayNumber % PROMPTS.length];
}

function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many || one + "s");
}

async function buildBrief() {
  var lines = [];
  var entries = getEntries();
  var todayKey = dateKey(new Date());
  var todays = entries.filter(function (e) { return dateKey(e.date) === todayKey; });
  var streak = calcStreak(entries);
  var tasks = getTodayTasks();
  var focus = getTodayFocus();
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  var results = await Promise.all([
    getGoals().catch(function () { return []; }),
    getDensityData().then(function (d) { return calculateDensityStats(d); }).catch(function () { return null; }),
    apiGetDay(dateKey(yesterday)).catch(function () { return null; })
  ]);
  var goals = results[0], density = results[1], yesterdayRecord = results[2];

  lines.push({ kind: "hello", text: greeting() + ", " + displayName() + "." });

  // today
  if (todays.length) {
    var last = todays.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); })[0];
    lines.push({ kind: "ok", text: "You've written " + plural(todays.length, "entry", "entries") + " today. The latest one felt " + STATUS[last.mood].label.toLowerCase() + "." });
  } else if (streak > 0) {
    lines.push({ kind: "warn", text: "Nothing written yet today. Your " + streak + "-day streak ends at midnight unless you log something.", action: { label: "Write now", command: "write" } });
  } else {
    lines.push({ kind: "info", text: "Nothing written yet today. One honest line is enough to start.", action: { label: "Write now", command: "write" } });
  }

  if (tasks.length) {
    var open = tasks.filter(function (t) { return !t.completed; });
    lines.push(open.length
      ? { kind: "info", text: (tasks.length - open.length) + " of " + tasks.length + " tasks done. Next up: “" + open[0].title + "”." }
      : { kind: "ok", text: "All " + plural(tasks.length, "task") + " done today." });
  } else {
    lines.push({ kind: "info", text: "No tasks planned for today.", action: { label: "Add one", command: "add-task" } });
  }

  var hs = habitSummary();
  if (hs.total) {
    var hot = hs.habits.filter(function (h) { return !h.doneToday && h.streak >= 3; })[0];
    lines.push(hs.doneToday === hs.total
      ? { kind: "ok", text: "Every habit checked today (" + hs.total + "/" + hs.total + ")." }
      : hot
        ? { kind: "warn", text: "“" + hot.name + "” is on a " + hot.streak + "-day streak and isn't checked yet today." }
        : { kind: "info", text: hs.doneToday + " of " + hs.total + " habits checked today." });
  }

  var fm = Math.round(focus.focusMs / 60000);
  lines.push(fm
    ? { kind: "ok", text: fm + " minutes of focus across " + plural(focus.sessions, "session") + " today." }
    : { kind: "info", text: "No focus sessions yet today.", action: { label: "Start 25 min", command: "focus-start" } });

  // attention
  var todayStr = todayKey;
  var soon = new Date();
  soon.setDate(soon.getDate() + 3);
  var soonStr = dateKey(soon);
  goals.forEach(function (g) {
    if (g.completed || !g.targetDate) return;
    if (g.targetDate < todayStr) lines.push({ kind: "warn", text: "Goal “" + g.title + "” was due " + g.targetDate + " and sits at " + g.progress + "%." });
    else if (g.targetDate <= soonStr) lines.push({ kind: "info", text: "Goal “" + g.title + "” is due " + (g.targetDate === todayStr ? "today" : g.targetDate) + ", " + g.progress + "% done." });
  });
  var almost = goals.filter(function (g) { return !g.completed && g.progress >= 80; });
  if (almost.length) lines.push({ kind: "ok", text: "“" + almost[0].title + "” is " + almost[0].progress + "% done. Close it out?" });

  // patterns
  var recent = entries.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 7);
  var rough = recent.filter(function (e) { return e.mood === "rough"; }).length;
  if (recent.length >= 4 && rough >= 3) {
    lines.push({ kind: "care", text: rough + " of your last " + recent.length + " entries were rough days. Heavy stretch. Rest counts as progress, and talking to someone you trust helps." });
  } else if (recent.length >= 4 && rough === 0) {
    lines.push({ kind: "ok", text: "No rough days in your last " + recent.length + " entries." });
  }
  if (density && density.inactiveCategories && density.inactiveCategories[0]) {
    var gap = density.inactiveCategories[0];
    lines.push({ kind: "info", text: "You haven't logged " + gap.label.toLowerCase() + " in " + gap.daysSince + " days." });
  }
  if (density && density.strongestCategory) {
    lines.push({ kind: "info", text: "Most of your logged energy this month went to " + density.strongestCategory.label.toLowerCase() + "." });
  }

  // memory
  var planned = yesterdayRecord && yesterdayRecord.nightReflection.tomorrowPlan.trim();
  if (planned) lines.push({ kind: "memory", text: "Last night you planned: “" + planned + "”" });
  var yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  var memory = entries.find(function (e) { return dateKey(e.date) === dateKey(yearAgo); });
  if (memory) lines.push({ kind: "memory", text: "A year ago today you wrote: “" + memory.text.slice(0, 160) + (memory.text.length > 160 ? "…" : "") + "”", action: { label: "Open that day", day: dateKey(yearAgo) } });

  return lines;
}

var lastRender = 0;

export async function renderCompanion(force) {
  var el = document.getElementById("companionSection");
  if (!el) return;
  if (!force && Date.now() - lastRender < 1500) return;
  lastRender = Date.now();

  var lines;
  try {
    lines = await buildBrief();
  } catch (e) {
    el.innerHTML = '<div class="companion-card"><p class="empty-line">Couldn\'t read your data. Is the backend running?</p></div>';
    return;
  }

  var prompt = promptOfTheDay();
  el.innerHTML =
    '<div class="companion-col">' +
      '<div class="companion-card prompt-card">' +
        '<h3 class="daily-section-title">' + icon("feather") + "<span>A question for today</span></h3>" +
        '<p class="prompt-text">' + escapeHtml(prompt) + "</p>" +
        '<button type="button" class="primary-btn" data-command="write-prompt" data-prompt="' + escapeHtml(prompt) + '">' + icon("pen-line") + "<span>Answer in your journal</span></button>" +
      "</div>" +
      '<div class="companion-card">' +
        '<header class="companion-head">' +
          '<h3 class="daily-section-title">' + icon("sparkles") + "<span>Today's brief</span></h3>" +
          '<span class="companion-mode" title="Built from your own entries, tasks, goals, and focus time. Nothing is sent anywhere.">' + icon("shield-check") + "<span>Stays on your side</span></span>" +
          '<button type="button" class="icon-btn" id="companionRefresh" aria-label="Refresh the brief" title="Refresh">' + icon("refresh-cw") + "</button>" +
        "</header>" +
        '<ol class="brief">' + lines.map(function (l, i) {
          var action = l.action
            ? ' <button type="button" class="link-btn"' + (l.action.command ? ' data-command="' + l.action.command + '"' : ' data-open-day="' + l.action.day + '"') + ">" + l.action.label + "</button>"
            : "";
          return '<li class="brief-line brief-line--' + l.kind + '" style="--i:' + i + '"><span class="brief-mark" aria-hidden="true">' + icon(MARKS[l.kind] || "info") + "</span><span>" + escapeHtml(l.text) + action + "</span></li>";
        }).join("") + "</ol>" +
      "</div>" +
    "</div>" +
    '<div class="companion-card chat-card" id="companionChat"></div>';

  document.getElementById("companionRefresh").onclick = function () { renderCompanion(true); };
  renderChatCard(document.getElementById("companionChat")).catch(function (e) { console.warn(e); });
}

document.addEventListener("logbook:ai-changed", function () {
  var el = document.getElementById("companionChat");
  if (el) renderChatCard(el).catch(function () {});
});
