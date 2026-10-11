import { apiListGratitude, apiGetDay, apiSaveDayPatch } from './api.js';
import { getEntries } from './journal.js';
import { dateKey } from './dayRecord.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { mascotSay } from './mascot.js';

/* The gratitude jar: every line you're grateful for (here, or in Tonight's
   "Grateful for") is a firefly in the jar. Tap the jar and one flies out
   with its memory. On a rough day the jar offers one on its own. */

var lines = [];
var shown = -1;
var offered = "";
var MAX_FLIES = 36;

function seeded(i) {
  var x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
}

/* inside the jar's glass: x 30..110, y 52..168, a little rounder at the bottom */
function flyAt(i) {
  // the jar fills from the bottom up, five to a row
  var row = Math.floor(i / 5), col = i % 5;
  var x = 40 + col * 15 + (seeded(i) - 0.5) * 9 + (row % 2 ? 6 : 0), y = 160 - row * 10.5 + (seeded(i + 99) - 0.5) * 7;
  return { x: x.toFixed(1), y: y.toFixed(1), d: (5 + seeded(i + 7) * 5).toFixed(2), delay: (-seeded(i + 3) * 8).toFixed(2), s: (0.8 + seeded(i + 5) * 0.7).toFixed(2) };
}

function jarSvg(count) {
  var flies = "";
  for (var i = 0; i < Math.min(count, MAX_FLIES); i++) {
    var f = flyAt(i);
    flies += '<g class="fly" style="--d:' + f.d + "s;--delay:" + f.delay + "s;--s:" + f.s + '"><circle class="fly-glow" cx="' + f.x + '" cy="' + f.y + '" r="6"/><circle class="fly-core" cx="' + f.x + '" cy="' + f.y + '" r="1.8"/></g>';
  }
  return '<svg class="jar-svg" viewBox="0 0 140 190" aria-hidden="true">' +
    '<ellipse class="jar-shadow" cx="70" cy="181" rx="46" ry="5"/>' +
    '<path class="jar-glass" d="M38 34 L 38 46 C 26 54, 24 66, 24 80 L 24 158 C 24 172, 34 178, 48 178 L 92 178 C 106 178, 116 172, 116 158 L 116 80 C 116 66, 114 54, 102 46 L 102 34 Z"/>' +
    '<g class="jar-flies">' + flies + "</g>" +
    '<path class="jar-shine" d="M34 84 C 33 110, 33 136, 36 156"/>' +
    '<rect class="jar-lid" x="34" y="20" width="72" height="16" rx="4"/>' +
    '<path class="jar-twine" d="M36 40 C 60 46, 80 46, 104 40"/>' +
    '<path class="jar-tag-string" d="M96 42 L 112 60"/>' +
    '<rect class="jar-tag" x="104" y="58" width="22" height="14" rx="2" transform="rotate(14 115 65)"/>' +
  "</svg>";
}

function niceDate(key) {
  var d = new Date(key + "T12:00:00");
  var days = Math.round((new Date(dateKey(new Date()) + "T12:00:00") - d) / 86400000);
  var when = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : days < 60 ? when + ", " + days + " days ago" : when;
}

function note() {
  if (shown < 0 || !lines[shown]) return '<p class="jar-hint">' + (lines.length ? "Tap the jar to let one out." : "Write down one good thing. It becomes a firefly.") + "</p>";
  var g = lines[shown];
  return '<figure class="jar-note"><blockquote>' + escapeHtml(g.line) + "</blockquote><figcaption>" + niceDate(g.date) + "</figcaption></figure>";
}

function draw() {
  var el = document.getElementById("gratitudeSection");
  if (!el) return;
  el.innerHTML =
    '<div class="card jar-card">' +
      '<div class="habits-head"><h3 class="daily-section-title">' + icon("sparkles") + "<span>Gratitude jar</span></h3>" +
        (lines.length ? '<span class="habits-count">' + lines.length + (lines.length === 1 ? " firefly" : " fireflies") + "</span>" : "") + "</div>" +
      '<div class="jar-row">' +
        '<button type="button" class="jar-btn" data-jar="open" aria-label="Let a firefly out">' + jarSvg(lines.length) + "</button>" +
        '<div class="jar-side">' + note() + "</div>" +
      "</div>" +
      '<form class="jar-add" autocomplete="off">' +
        '<input class="text-input" name="line" maxlength="300" placeholder="Something you\'re grateful for" aria-label="Something you\'re grateful for" required>' +
        '<button type="submit" class="tool-btn tool-btn--add">' + icon("plus") + "<span>Add</span></button>" +
      "</form>" +
    "</div>";
}

function release(el) {
  if (!lines.length) return;
  var next = shown;
  if (lines.length > 1) while (next === shown) next = Math.floor(Math.random() * lines.length);
  else next = 0;
  shown = next;
  // one firefly drifts out of the jar's mouth, then the memory appears
  var btn = el.querySelector(".jar-btn");
  var spark = document.createElement("span");
  spark.className = "jar-escape";
  spark.style.setProperty("--dx", (Math.random() * 60 + 30).toFixed(0) + "px");
  btn.appendChild(spark);
  setTimeout(function () { spark.remove(); }, 1400);
  var side = el.querySelector(".jar-side");
  setTimeout(function () { if (side) side.innerHTML = note(); }, 420);
}

async function add(form) {
  var text = form.elements.line.value.trim().replace(/\s+/g, " ");
  if (!text) return;
  var today = dateKey(new Date());
  try {
    var day = await apiGetDay(today);
    var before = String(day.nightReflection.gratitude || "").trim();
    var after = before ? before + "\n" + text : text;
    await apiSaveDayPatch(today, { nightReflection: { gratitude: after } });
    // keep Tonight's "Grateful for" box in step, so its autosave can't undo this
    var box = document.getElementById("nightGratitude");
    if (box && document.activeElement !== box) box.value = after;
    lines.unshift({ date: today, line: text });
    shown = 0;
    draw();
    var flies = document.querySelectorAll("#gratitudeSection .fly");
    var newest = flies[Math.min(lines.length, MAX_FLIES) - 1];
    if (newest) newest.classList.add("is-new");
    emitChange("days");
    var again = document.querySelector("#gratitudeSection .jar-add input");
    if (again) again.focus();
  } catch (e) {
    toast("Couldn't save that", "error");
  }
}

/* a rough day: the jar offers a memory once */
function maybeOffer() {
  var today = dateKey(new Date());
  if (offered === today || lines.length < 3) return;
  var todays = getEntries().filter(function (e) { return dateKey(e.date) === today; })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  if (!todays.length || todays[0].mood !== "rough") return;
  offered = today;
  var el = document.getElementById("gratitudeSection");
  if (!el) return;
  setTimeout(function () {
    release(el);
    mascotSay("Rough day. Here's something you were grateful for once.");
  }, 1200);
}

var wired = false;
export async function renderGratitude() {
  var el = document.getElementById("gratitudeSection");
  if (!el) return;
  try {
    lines = await apiListGratitude();
  } catch (e) {
    if (e.status === 404) { el.hidden = true; return; }
    throw e;
  }
  if (shown >= lines.length) shown = -1;
  el.hidden = false;
  draw();
  maybeOffer();
  if (wired) return;
  wired = true;
  el.addEventListener("click", function (e) {
    if (e.target.closest('[data-jar="open"]')) release(el);
  });
  el.addEventListener("submit", function (e) {
    var form = e.target.closest(".jar-add");
    if (!form) return;
    e.preventDefault();
    add(form);
  });
}

export { maybeOffer as offerGratitude };
