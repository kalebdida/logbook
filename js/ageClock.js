import { getProfile, onProfile } from './profile.js';
import { icon } from './icons.js';
import { mascotSay, mascotReact } from './mascot.js';

/* Your clock: how old you are, to the second, and how long until the next
   birthday. Only shows once a birthday is set (Settings → You). */

var YEAR_MS = 365.2425 * 86400000;
var frame = 0;
var last = 0;
var cheered = "";

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

function parse(dateStr) {
  var p = dateStr.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

/* the next birthday (today counts until midnight) and the age it brings */
export function nextBirthday(birth, now) {
  now = now || new Date();
  var b = parse(birth);
  var year = now.getFullYear();
  var next = new Date(year, b.getMonth(), b.getDate());
  var todayStart = new Date(year, now.getMonth(), now.getDate());
  if (next < todayStart) next = new Date(year + 1, b.getMonth(), b.getDate());
  return { at: next, turns: next.getFullYear() - b.getFullYear(), today: next.getTime() === todayStart.getTime() };
}

function pad(n) { return n < 10 ? "0" + n : String(n); }

function parts(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var d = Math.floor(s / 86400); s -= d * 86400;
  var h = Math.floor(s / 3600); s -= h * 3600;
  var m = Math.floor(s / 60); s -= m * 60;
  return [d, h, m, s];
}

function draw() {
  var el = document.getElementById("ageSection");
  if (!el) return;
  var birth = getProfile().birthday;
  el.hidden = !birth;
  if (!birth) { stop(); return; }
  var nb = nextBirthday(birth);
  var b = parse(birth);
  var when = nb.at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: nb.at.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  el.innerHTML =
    '<div class="card age-card' + (nb.today ? " is-birthday" : "") + '">' +
      '<div class="habits-head"><h3 class="daily-section-title">' + icon("cake") + "<span>" + (nb.today ? "Happy birthday" : "Your clock") + "</span></h3></div>" +
      '<div class="age-now"><span class="age-years" data-age></span><span class="age-unit">years old</span></div>' +
      '<div class="age-sub"><span data-age-days></span></div>' +
      (nb.today
        ? '<p class="age-next">You turned ' + (nb.turns) + " today. Have a good one.</p>"
        : '<p class="age-next">Turning ' + nb.turns + " on " + when + "</p>" +
          '<div class="age-count" role="timer" aria-label="Time until your birthday">' +
            ["days", "hours", "min", "sec"].map(function (u, i) {
              return '<span class="age-seg"><b data-seg="' + i + '">0</b><small>' + u + "</small></span>";
            }).join("") +
          "</div>") +
    "</div>";
  el.dataset.birth = birth;
  update(true);
  start();
  if (nb.today && cheered !== nb.at.toDateString()) {
    cheered = nb.at.toDateString();
    setTimeout(function () { mascotReact("cheer"); mascotSay("Happy birthday! " + nb.turns + " looks good on you."); }, 1600);
  }
}

function update(force) {
  var el = document.getElementById("ageSection");
  if (!el || el.hidden || !el.dataset.birth) return;
  var now = new Date();
  var b = parse(el.dataset.birth);
  var years = (now - b) / YEAR_MS;
  var ageEl = el.querySelector("[data-age]");
  if (ageEl) ageEl.textContent = years.toFixed(reduceMotion() ? 6 : 8);
  var daysEl = el.querySelector("[data-age-days]");
  if (daysEl && (force || now.getSeconds() === 0)) {
    daysEl.textContent = Math.floor((now - b) / 86400000).toLocaleString("en-US") + " days lived";
  }
  var nb = nextBirthday(el.dataset.birth, now);
  var segs = parts(nb.at - now);
  el.querySelectorAll("[data-seg]").forEach(function (s) {
    var i = Number(s.getAttribute("data-seg"));
    var v = i === 0 ? String(segs[0]) : pad(segs[i]);
    if (s.textContent !== v) {
      s.textContent = v;
      if (!force && i === 3) { s.classList.remove("is-tick"); void s.offsetWidth; s.classList.add("is-tick"); }
    }
  });
}

function loop(t) {
  frame = 0;
  // smooth decimals, but never more than ~12 times a second
  if (t - last > 80) { last = t; update(false); }
  if (document.visibilityState === "visible") frame = requestAnimationFrame(loop);
}

function start() {
  if (frame) return;
  if (reduceMotion()) {
    if (!start.timer) start.timer = setInterval(function () { update(false); }, 1000);
    return;
  }
  frame = requestAnimationFrame(loop);
}

function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  clearInterval(start.timer);
  start.timer = null;
}

var wired = false;
export function renderAgeClock() {
  draw();
  if (wired) return;
  wired = true;
  onProfile(draw);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && getProfile().birthday) { update(true); start(); }
  });
}
