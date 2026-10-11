import { apiListLetters, apiOpenLetter, apiListGratitude, apiListSleep, apiListTasks, apiListPomodoroDays, apiListPrayers } from './api.js';
import { getEntries } from './journal.js';
import { isDevice } from './connection.js';
import { dateKey } from './dayRecord.js';
import { getProfile } from './profile.js';
import { displayName } from './prefs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

/* The monthly letter. In the first week of a month, a sealed envelope from
   the cat waits on the Today page; it opens into a letter about last month.
   The server writes it once (with the AI when your account may use it); on
   this device the app writes it from your numbers. */

var OPENED = "logbook-letters-opened";
var letters = [];

function lastMonth() {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function monthName(m) {
  var p = m.split("-").map(Number);
  return new Date(p[0], p[1] - 1, 1).toLocaleDateString("en-US", { month: "long" });
}

function opened() {
  try { return JSON.parse(localStorage.getItem(OPENED) || "[]"); } catch (e) { return []; }
}

function markOpened(m) {
  var list = opened();
  if (list.indexOf(m) < 0) list.push(m);
  try { localStorage.setItem(OPENED, JSON.stringify(list.slice(-24))); } catch (e) {}
}

function petName() { return getProfile().petName || "Mochi"; }

function hm(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + " min"; }

/* this device has no server to write it: build it from the month's numbers */
async function writeHere(month) {
  var start = month + "-01";
  var p = month.split("-").map(Number);
  var end = dateKey(new Date(p[0], p[1], 0));
  var inMonth = function (k) { return k >= start && k <= end; };
  var entries = getEntries().filter(function (e) { return inMonth(dateKey(e.date)); });
  var days = Array.from(new Set(entries.map(function (e) { return dateKey(e.date); }))).sort();
  var best = 0, run = 0;
  days.forEach(function (d, i) {
    run = i && (new Date(d) - new Date(days[i - 1])) / 86400000 === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  var good = entries.filter(function (e) { return e.mood === "good"; });
  var rough = entries.filter(function (e) { return e.mood === "rough"; }).length;
  var extra = await Promise.all([
    apiListTasks().catch(function () { return []; }), apiListPomodoroDays().catch(function () { return []; }),
    apiListGratitude().catch(function () { return []; }), apiListSleep(start, end).catch(function () { return []; }),
    apiListPrayers().catch(function () { return []; })
  ]);
  var tasksDone = extra[0].filter(function (t) { return inMonth(t.dayDate) && t.completed; }).length;
  var focus = Math.round(extra[1].filter(function (d) { return inMonth(d.date); }).reduce(function (a, d) { return a + (d.focus_ms || 0); }, 0) / 60000);
  var grateful = extra[2].filter(function (g) { return inMonth(g.date); });
  var nights = extra[3].filter(function (n) { return n.minutes; });
  var answered = extra[4].filter(function (pr) { return pr.answeredAt && inMonth(dateKey(pr.answeredAt)); });

  var name = displayName();
  var lines = ["Dear " + name + ",", ""];
  if (!entries.length) {
    lines.push(monthName(month) + " was a quiet one here. That's okay. The page is still yours whenever you want it.");
  } else {
    lines.push(monthName(month) + " is done. You wrote on " + days.length + " days" +
      (rough && rough >= good.length ? ". Some of it was heavy, and you still kept writing. That counts." : good.length ? ", and " + good.length + " of your entries felt good." : "."));
    var bits = [];
    if (best > 1) bits.push("your longest run was " + best + " days in a row");
    if (tasksDone) bits.push("you finished " + tasksDone + " task" + (tasksDone === 1 ? "" : "s"));
    if (focus) bits.push("you spent " + hm(focus) + " in focus");
    if (bits.length) lines.push("", bits[0].charAt(0).toUpperCase() + bits[0].slice(1) + (bits.length > 1 ? ", " + bits.slice(1, -1).concat("").join(", ").replace(/, $/, "") + (bits.length > 2 ? ", and " : " and ") + bits[bits.length - 1] : "") + ".");
    if (nights.length) lines.push("You slept " + hm(Math.round(nights.reduce(function (a, n) { return a + n.minutes; }, 0) / nights.length)) + " a night on average.");
    if (grateful.length) lines.push("", "You were grateful for " + grateful.slice(0, 2).map(function (g) { return g.line.replace(/\.$/, ""); }).join(" and ") + ".");
    if (answered.length) lines.push(answered.length + (answered.length === 1 ? " prayer was" : " prayers were") + " answered.");
    if (good.length) lines.push("", "A moment worth keeping: “" + good[good.length - 1].text.slice(0, 200) + "”");
  }
  var next = new Date(p[0], p[1], 1).toLocaleDateString("en-US", { month: "long" });
  lines.push("", "See you in " + next + ".", "— " + petName());
  return lines.join("\n");
}

function envelope(m) {
  return '<button type="button" class="envelope" data-letter="' + m + '" aria-label="Open the letter about ' + monthName(m) + '">' +
    '<svg class="envelope-svg" viewBox="0 0 200 130" aria-hidden="true">' +
      '<rect class="env-back" x="4" y="14" width="192" height="112" rx="8"/>' +
      '<path class="env-paper" d="M18 22 h164 v92 h-164 z"/>' +
      '<path class="env-front" d="M4 46 L 100 96 L 196 46 L 196 118 Q 196 126 188 126 L 12 126 Q 4 126 4 118 Z"/>' +
      '<path class="env-flap" d="M4 22 Q 4 14 12 14 L 188 14 Q 196 14 196 22 L 100 78 Z"/>' +
      '<g class="env-seal"><circle cx="100" cy="74" r="13"/><path d="M100 66 l2.6 5.4 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"/></g>' +
    "</svg>" +
    '<span class="envelope-text"><b>A letter from ' + escapeHtml(petName()) + "</b><span>About your " + monthName(m) + "</span></span>" +
  "</button>";
}

export async function renderLetter() {
  var el = document.getElementById("letterSection");
  if (!el) return;
  var m = lastMonth();
  try { letters = await apiListLetters(); } catch (e) { el.hidden = true; return; }
  var today = new Date().getDate();
  var hadMonth = getEntries().some(function (e) { return dateKey(e.date).slice(0, 7) === m; });
  var show = hadMonth && today <= 7 && opened().indexOf(m) < 0;
  el.hidden = !show;
  if (!show) return;
  el.innerHTML = '<div class="card letter-card">' + envelope(m) + "</div>";
  el.querySelector(".envelope").onclick = function (e) { openLetter(m, e.currentTarget); };
}

export async function openLetter(month, from) {
  month = month || lastMonth();
  if (from) from.classList.add("is-opening");
  var letter;
  try {
    var have = letters.filter(function (l) { return l.month === month; })[0];
    letter = have || await apiOpenLetter(month, isDevice() ? await writeHere(month) : "");
  } catch (e) {
    if (from) from.classList.remove("is-opening");
    return;
  }
  if (!letters.some(function (l) { return l.month === month; })) letters.unshift(letter);
  markOpened(month);
  var wrap = document.createElement("div");
  wrap.className = "letter-overlay";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Letter about " + monthName(month));
  wrap.innerHTML = '<div class="letter-paper"><button type="button" class="icon-btn letter-close" aria-label="Close">' + icon("x") + "</button>" +
    '<p class="letter-month">' + monthName(month) + " " + month.slice(0, 4) + "</p>" +
    '<div class="letter-text">' + escapeHtml(letter.text).split(/\n{2,}/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; }).join("") + "</div></div>";
  setTimeout(function () {
    document.body.appendChild(wrap);
    document.body.classList.add("has-overlay");
    var close = function () {
      wrap.classList.add("is-leaving");
      document.body.classList.remove("has-overlay");
      setTimeout(function () { wrap.remove(); }, 300);
      var sec = document.getElementById("letterSection");
      if (sec) sec.hidden = true;
      document.removeEventListener("keydown", onKey);
    };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    wrap.querySelector(".letter-close").onclick = close;
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey);
    wrap.querySelector(".letter-close").focus();
  }, from ? 700 : 0);
}
