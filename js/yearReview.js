import { apiListTasks, apiListPomodoroDays, apiListPrayers, apiListGratitude, apiListPhotos, apiListSleep, apiListActivities } from './api.js';
import { getEntries } from './journal.js';
import { dateKey } from './dayRecord.js';
import { getProfile } from './profile.js';
import { displayName } from './prefs.js';
import { categoryById } from './categories.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

/* Your year: the whole year as one night sky, January on the left and
   December on the right, a star for every day you wrote and constellations
   for every week-long run. Then what the year added up to. On the Today
   page from Dec 26 to Jan 7; any time from the command palette. */

export function reviewYear(now) {
  now = now || new Date();
  return now.getMonth() === 0 && now.getDate() <= 7 ? now.getFullYear() - 1 : now.getFullYear();
}

function rng(seed) {
  var s = seed >>> 0 || 1;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function hm(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + " min"; }

async function gather(year) {
  var start = year + "-01-01", end = year + "-12-31";
  var inYear = function (k) { return k >= start && k <= end; };
  var moods = {};
  var entries = getEntries().filter(function (e) { return inYear(dateKey(e.date)); });
  entries.forEach(function (e) {
    var k = dateKey(e.date);
    if (!moods[k] || e.mood === "good") moods[k] = e.mood;
  });
  var days = Object.keys(moods).sort();
  var best = 0, run = 0, runs = [], cur = null;
  days.forEach(function (d, i) {
    var next = i && (new Date(d + "T12:00:00") - new Date(days[i - 1] + "T12:00:00")) / 86400000 === 1;
    run = next ? run + 1 : 1;
    best = Math.max(best, run);
    if (next) cur.push(d); else { cur = [d]; runs.push(cur); }
  });
  var byMonth = new Array(12).fill(0);
  days.forEach(function (d) { byMonth[Number(d.slice(5, 7)) - 1]++; });
  var bestMonth = byMonth.indexOf(Math.max.apply(null, byMonth));
  var safe = function (p) { return p.catch(function () { return []; }); };
  var r = await Promise.all([safe(apiListTasks()), safe(apiListPomodoroDays()), safe(apiListPrayers()), safe(apiListGratitude()),
    safe(apiListPhotos(start, end)), safe(apiListSleep(start, end)), safe(apiListActivities())]);
  var areas = {};
  r[6].forEach(function (a) { if (inYear(a.dayDate) && a.activityCategory) areas[a.activityCategory] = (areas[a.activityCategory] || 0) + (a.durationMinutes || 0); });
  var top = Object.keys(areas).sort(function (a, b) { return areas[b] - areas[a]; })[0];
  var nights = r[5].filter(function (n) { return n.minutes; });
  return {
    year: year, moods: moods, days: days, runs: runs, best: best,
    good: entries.filter(function (e) { return e.mood === "good"; }).length, entries: entries.length,
    bestMonth: byMonth[bestMonth] ? new Date(year, bestMonth, 1).toLocaleDateString("en-US", { month: "long" }) : "",
    bestMonthDays: byMonth[bestMonth],
    tasks: r[0].filter(function (t) { return inYear(t.dayDate) && t.completed; }).length,
    focus: Math.round(r[1].filter(function (d) { return inYear(d.date); }).reduce(function (a, d) { return a + (d.focus_ms || 0); }, 0) / 60000),
    answered: r[2].filter(function (p) { return p.answeredAt && inYear(dateKey(p.answeredAt)); }).length,
    grateful: r[3].filter(function (g) { return inYear(g.date); }).length,
    photos: r[4].length,
    sleep: nights.length ? Math.round(nights.reduce(function (a, n) { return a + n.minutes; }, 0) / nights.length) : 0,
    topArea: top ? (categoryById(top) || { label: top }).label : ""
  };
}

/* the year as a sky: x is the day of the year, y is chance */
function sky(s) {
  var startMs = new Date(s.year, 0, 1).getTime();
  var pos = {};
  s.days.forEach(function (d) {
    var r = rng(d.split("-").join("") * 7);
    var doy = Math.round((new Date(d + "T12:00:00").getTime() - startMs) / 86400000);
    // a slow wave across the year, so a run of days reads as one drifting line of stars
    var y = 155 + Math.sin(doy / 11) * 70 + Math.sin(doy / 3.7 + 1) * 22 + (r() - 0.5) * 26;
    pos[d] = { x: 40 + doy / 366 * 1120 + (r() - 0.5) * 6, y: Math.max(30, Math.min(285, y)), doy: doy };
  });
  var lines = s.runs.filter(function (run) { return run.length >= 7; }).map(function (run) {
    return '<polyline class="yr-line' + (run.length >= 30 ? " is-shining" : "") + '" style="--d:' + (pos[run[run.length - 1]].doy / 366 * 6 + 0.4).toFixed(2) + 's" points="' +
      run.map(function (d) { return pos[d].x.toFixed(1) + "," + pos[d].y.toFixed(1); }).join(" ") + '"/>';
  }).join("");
  var stars = s.days.map(function (d) {
    var p = pos[d];
    return '<circle class="yr-star' + (s.moods[d] === "good" ? " is-good" : "") + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (s.moods[d] === "good" ? 2.6 : 2) +
      '" style="--d:' + (p.doy / 366 * 6).toFixed(2) + 's"/>';
  }).join("");
  var months = "JFMAMJJASOND".split("").map(function (m, i) {
    return '<text class="yr-month" x="' + (40 + (i + 0.5) / 12 * 1120).toFixed(0) + '" y="318">' +
      new Date(s.year, i, 1).toLocaleDateString("en-US", { month: "short" }) + "</text>";
  }).join("");
  return '<svg class="yr-sky" viewBox="0 0 1200 330" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + lines + stars + months + "</svg>";
}

function stat(i, value, label) {
  return '<div class="yr-stat" style="--i:' + i + '"><b>' + value + "</b><span>" + label + "</span></div>";
}

export async function openYearReview(year) {
  if (document.querySelector(".yr-overlay")) return;
  year = year || reviewYear();
  var s = await gather(year);
  var pet = getProfile().petName || "Mochi";
  var el = document.createElement("div");
  el.className = "yr-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Your " + year);
  var stats = [];
  stats.push(stat(0, s.days.length, s.days.length === 1 ? "day written" : "days written"));
  if (s.best > 1) stats.push(stat(1, s.best, "days in a row, at best"));
  if (s.bestMonth) stats.push(stat(2, escapeHtml(s.bestMonth), "your best month, " + s.bestMonthDays + " days"));
  if (s.good) stats.push(stat(3, s.good, "good days"));
  if (s.tasks) stats.push(stat(4, s.tasks, "tasks done"));
  if (s.focus) stats.push(stat(5, hm(s.focus), "in focus"));
  if (s.answered) stats.push(stat(6, s.answered, s.answered === 1 ? "prayer answered" : "prayers answered"));
  if (s.grateful) stats.push(stat(7, s.grateful, "fireflies in the jar"));
  if (s.photos) stats.push(stat(8, s.photos, s.photos === 1 ? "photo kept" : "photos kept"));
  if (s.sleep) stats.push(stat(9, hm(s.sleep), "of sleep a night"));
  if (s.topArea) stats.push(stat(10, escapeHtml(s.topArea), "where your time went most"));
  var lit = s.runs.filter(function (r) { return r.length >= 7; }).length;
  el.innerHTML =
    '<button type="button" class="icon-btn yr-close" aria-label="Close">' + icon("x") + "</button>" +
    '<div class="yr-inner">' +
      '<p class="yr-kicker">' + escapeHtml(displayName()) + ", this was your</p>" +
      '<h2 class="yr-year">' + year + "</h2>" +
      sky(s) +
      '<p class="yr-caption">' + (s.days.length
        ? "Every star is a day you showed up." + (lit ? " The lines are your " + lit + " constellation" + (lit === 1 ? "" : "s") + ": a week or more in a row." : "")
        : "No stars yet this year. The sky is waiting for the first one.") + "</p>" +
      '<div class="yr-stats">' + stats.join("") + "</div>" +
      '<p class="yr-sign">' + (s.days.length > 200 ? "You kept showing up. That's the whole secret, and you know it now."
        : s.days.length > 60 ? "Not every day, and that's fine. Look how much sky you filled anyway."
        : "A small sky is still a sky. Next year, a few more stars?") + "<br>— " + escapeHtml(pet) + "</p>" +
    "</div>";
  document.body.appendChild(el);
  document.body.classList.add("has-overlay");
  function close() {
    el.classList.add("is-leaving");
    document.body.classList.remove("has-overlay");
    document.removeEventListener("keydown", onKey);
    setTimeout(function () { el.remove(); }, 400);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  el.querySelector(".yr-close").onclick = close;
  el.querySelector(".yr-close").focus();
}

/* the card on Today, from Dec 26 to Jan 7 */
export function renderYearCard() {
  var el = document.getElementById("yearSection");
  if (!el) return;
  var now = new Date();
  var show = (now.getMonth() === 11 && now.getDate() >= 26) || (now.getMonth() === 0 && now.getDate() <= 7);
  el.hidden = !show;
  if (!show) return;
  var year = reviewYear(now);
  el.innerHTML = '<button type="button" class="card yr-card"><span class="yr-card-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' +
    "<b>Your " + year + " in stars</b><span>Every day you wrote, as one night sky</span></button>";
  el.querySelector(".yr-card").onclick = function () { openYearReview(year); };
}
