import { getEntries } from './journal.js';
import { habitSummary } from './habits.js';
import { dateKey } from './dayRecord.js';
import { mascotSay, mascotReact } from './mascot.js';

/* The dashboard window comes alive with your own days:
   - your sky: a golden star for every day you wrote this past year. A run of
     7 days in a row draws a constellation, 30 makes it shine.
   - the weather of your week: a rough week brings soft rain to the glass, a
     good one clears the sky and sends more shooting stars.
   - the corner shop: each habit you finish lights one of its windows; all
     of them and the whole shop glows.
   Everything here is drawn over the scene (js/scene.js); nothing is stored. */

var SKY_SCENES = { night: 1, bluehour: 1, city: 1, torii: 1, mist: 1, rooftop: 1 };
var PANES = [[923, 31], [954.8, 30.2], [986.6, 29.4], [1017.6, 29.4]];   // the shop window's four panes
var lastLit = null;

function hash(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  var s = seed || 1;
  return function () { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}

function shift(key, days) {
  var p = key.split("-").map(Number);
  return dateKey(new Date(p[0], p[1] - 1, p[2] + days));
}

/* written days of the last year, grouped into runs of days in a row */
function runs() {
  var today = dateKey(new Date());
  var from = shift(today, -365);
  var moods = {};
  getEntries().forEach(function (e) {
    var k = dateKey(e.date);
    if (k < from || k > today) return;
    if (!moods[k] || e.mood === "good") moods[k] = e.mood;
  });
  var days = Object.keys(moods).sort();
  var out = [], cur = null;
  days.forEach(function (d) {
    if (cur && shift(cur.days[cur.days.length - 1], 1) === d) cur.days.push(d);
    else { cur = { days: [d] }; out.push(cur); }
  });
  return { runs: out, moods: moods, today: today };
}

/* the lowest a star may sit at x: open sky, clear of the mountain's peak */
function skyFloor(x) {
  var floor = 172;
  var peak = 92 + Math.abs(x - 772) * 0.42;
  return Math.max(14, Math.min(floor, peak));
}

function nice(k) {
  return new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function skySvg(view) {
  var info = runs();
  var stars = "", lines = "";
  info.runs.forEach(function (run) {
    var big = run.days.length >= 7;
    var r = rng(hash(run.days[0]));
    if (big) {
      // a constellation: a gentle walk across the sky from a spot of its own
      var x = 80 + r() * 1040, y = Math.min(30 + r() * 110, skyFloor(x) - 10), angle = r() * Math.PI * 2;
      var shine = run.days.length >= 30;
      var pts = [];
      run.days.forEach(function (d, i) {
        if (i) {
          angle += (r() - 0.5) * 1.6;
          var step = 15 + r() * 12;
          x = Math.min(1180, Math.max(20, x + Math.cos(angle) * step));
          y = Math.min(skyFloor(x), Math.max(16, y + Math.sin(angle) * step * 0.7));
        }
        pts.push([x, y, d]);
      });
      lines += '<polyline class="my-line' + (shine ? " is-shining" : "") + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>';
      pts.forEach(function (p) { stars += star(p[0], p[1], p[2], info, shine ? 2.2 : 1.8); });
    } else {
      run.days.forEach(function (d) {
        var rr = rng(hash(d + "*"));
        var sx = 20 + rr() * 1160;
        stars += star(sx, 14 + rr() * (skyFloor(sx) - 14), d, info, 1.5);
      });
    }
  });
  return '<svg class="my-sky" viewBox="' + view + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
    '<g class="my-lines">' + lines + "</g><g>" + stars + "</g></svg>";
}

function star(x, y, d, info, size) {
  var good = info.moods[d] === "good";
  var isToday = d === info.today;
  return '<circle class="my-star' + (good ? " is-good" : "") + (isToday ? " is-today" : "") + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
    '" r="' + (good ? size + 0.4 : size).toFixed(1) + '" style="--tw:' + (3 + (hash(d) % 40) / 10).toFixed(1) + 's"><title>' + nice(d) + "</title></circle>";
}

/* rough or good, over the last seven days (needs a few entries to say) */
function weekWeather() {
  var since = shift(dateKey(new Date()), -6);
  var score = { good: 2, okay: 1, rough: 0 };
  var list = getEntries().filter(function (e) { return dateKey(e.date) >= since; });
  if (list.length < 3) return "calm";
  var avg = list.reduce(function (a, e) { return a + score[e.mood]; }, 0) / list.length;
  return avg <= 0.8 ? "rain" : avg >= 1.5 ? "clear" : "calm";
}

function weekKey() {
  var d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

function remark(weather) {
  if (weather === "calm") return;
  var key = "logbook-weather-said";
  var said = null;
  try { said = localStorage.getItem(key); } catch (e) {}
  var stamp = weekKey() + ":" + weather;
  if (said === stamp) return;
  try { localStorage.setItem(key, stamp); } catch (e) {}
  setTimeout(function () {
    mascotSay(weather === "rain" ? "It's been a rainy week. Rain passes. I'm staying." : "Clear skies this week. You've been doing well.");
  }, 2600);
}

function shop(svg) {
  var shopEl = svg.querySelector(".scene-shop");
  if (!shopEl) return;
  var s = { doneToday: 0, total: 0 };
  try { s = habitSummary(); } catch (e) {}
  var lit = s.total ? Math.round(s.doneToday / s.total * PANES.length) : PANES.length;
  var g = shopEl.querySelector(".shop-panes");
  if (!g) {
    g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "shop-panes");
    g.innerHTML = PANES.map(function (p) { return '<rect class="shop-dark" x="' + p[0] + '" y="367" width="' + p[1] + '" height="22"/>'; }).join("");
    shopEl.appendChild(g);
  }
  g.querySelectorAll(".shop-dark").forEach(function (r, i) { r.classList.toggle("is-lit", i < lit); });
  var all = s.total > 0 && s.doneToday >= s.total;
  shopEl.classList.toggle("is-all-lit", all);
  if (all && lastLit !== null && lastLit < PANES.length) {
    shopEl.classList.remove("is-glowing");
    void shopEl.getBoundingClientRect();
    shopEl.classList.add("is-glowing");
    mascotReact("cheer");
    mascotSay("Every light in the shop is on. That's all your habits for today.");
  }
  lastLit = lit;
}

export function refreshScene() {
  var hero = document.querySelector("#todayConsole .hero-scene");
  if (!hero) return;
  var svg = hero.querySelector("svg.scene");
  if (!svg) return;
  var name = svg.getAttribute("data-scene");
  var old = hero.querySelector(".my-sky");
  if (SKY_SCENES[name]) {
    var html = skySvg(svg.getAttribute("viewBox") || "0 0 1200 400");
    if (old) old.outerHTML = html;
    else svg.insertAdjacentHTML("afterend", html);
  } else if (old) {
    old.remove();
  }
  var weather = weekWeather();
  if (hero.dataset.week !== weather) {
    hero.dataset.week = weather;
    remark(weather);
  }
  shop(svg);
}

var wired = false;
export function startLivingScene() {
  refreshScene();
  if (wired) return;
  wired = true;
  document.addEventListener("logbook:theme-changed", function () { setTimeout(refreshScene, 60); });
}
