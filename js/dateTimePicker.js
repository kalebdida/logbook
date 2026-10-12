import { icon } from './icons.js';
import { getPrefs } from './prefs.js';

/* Date and time fields in the night theme instead of the phone's grey
   dialog: a small sky-dark calendar (tap the month for years, handy for a
   birthday) and an hour/minute wheel. The real <input> stays underneath,
   invisible, so forms, values and change events work exactly as before. */

var enhanced = new WeakMap();     // input -> { wrap, button, text, kind }
var current = null;               // the open popover's close()

function pad(n) { return (n < 10 ? "0" : "") + n; }
function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseKey(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

function niceDate(v) {
  var d = parseKey(v);
  if (!d) return "";
  var opts = { weekday: "short", month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

function niceTime(v) {
  var m = /^(\d{2}):(\d{2})/.exec(v || "");
  if (!m) return "";
  var h = Number(m[1]);
  if (getPrefs().clock24 !== false) return m[1] + ":" + m[2];
  return ((h % 12) || 12) + ":" + m[2] + (h < 12 ? " AM" : " PM");
}

function sync(input) {
  var e = enhanced.get(input);
  if (!e) return;
  var label = e.kind === "date" ? niceDate(input.value) : niceTime(input.value);
  e.text.textContent = label || (e.kind === "date" ? "Pick a date" : "Pick a time");
  e.button.classList.toggle("is-placeholder", !label);
  e.button.disabled = input.disabled;
}

(function watchValue() {
  var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!d || !d.set) return;
  Object.defineProperty(HTMLInputElement.prototype, "value", {
    configurable: true, enumerable: d.enumerable, get: d.get,
    set: function (v) { d.set.call(this, v); if (enhanced.has(this)) sync(this); }
  });
})();

export function enhanceDateTime(input) {
  if (enhanced.has(input) || input.hasAttribute("data-native")) return;
  var kind = input.type === "date" ? "date" : input.type === "time" ? "time" : "";
  if (!kind) return;
  var wrap = document.createElement("span");
  wrap.className = "picker picker--" + kind;
  input.classList.forEach(function (c) { if (/-input$|--time$/.test(c) && c !== "text-input") wrap.classList.add("picker--" + c); });
  var button = document.createElement("button");
  button.type = "button";
  button.className = "picker-btn";
  button.setAttribute("aria-haspopup", "dialog");
  var aria = input.getAttribute("aria-label") || (input.labels && input.labels[0] ? input.labels[0].textContent.trim() : "");
  if (aria) button.setAttribute("aria-label", aria);
  var lead = document.createElement("span");
  lead.className = "picker-lead";
  lead.setAttribute("aria-hidden", "true");
  lead.innerHTML = icon(kind === "date" ? "calendar-days" : "clock");
  var text = document.createElement("span");
  text.className = "picker-text";
  button.appendChild(lead);
  button.appendChild(text);
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  wrap.appendChild(button);
  input.classList.add("picker-native");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  enhanced.set(input, { wrap: wrap, button: button, text: text, kind: kind });
  sync(input);
  input.addEventListener("change", function () { sync(input); });
  input.addEventListener("input", function () { sync(input); });
  button.addEventListener("click", function () {
    if (current && current.input === input) return closeAll();
    (kind === "date" ? openDate : openTime)(input);
  });
  if (input.labels) Array.prototype.forEach.call(input.labels, function (l) {
    l.addEventListener("click", function (ev) { if (!wrap.contains(ev.target)) { ev.preventDefault(); button.focus(); } });
  });
}

function setValue(input, v) {
  if (input.value === v) return;
  input.value = v;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/* shared popover shell: glass under the field, or a sheet on a phone */
function shell(input, title) {
  closeAll();
  var e = enhanced.get(input);
  var phone = window.matchMedia("(max-width: 640px)").matches;
  var pop = document.createElement("div");
  pop.className = "picker-pop dt-pop" + (phone ? " is-sheet" : "");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", title);
  var backdrop = null;
  if (phone) {
    backdrop = document.createElement("div");
    backdrop.className = "picker-backdrop";
    document.body.appendChild(backdrop);
  }
  document.body.appendChild(pop);
  e.wrap.classList.add("is-open");
  function onDown(ev) { if (!pop.contains(ev.target) && !e.wrap.contains(ev.target)) closeAll(); }
  function onKey(ev) { if (ev.key === "Escape") { ev.preventDefault(); closeAll(true); } }
  function onScroll(ev) { if (!phone && !pop.contains(ev.target)) closeAll(); }
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  current = {
    input: input,
    close: function (refocus) {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      e.wrap.classList.remove("is-open");
      pop.classList.add("is-leaving");
      if (backdrop) backdrop.classList.add("is-leaving");
      setTimeout(function () { pop.remove(); if (backdrop) backdrop.remove(); }, 180);
      if (refocus) e.button.focus();
    }
  };
  return {
    pop: pop,
    place: function () {
      if (phone) return;
      var r = e.button.getBoundingClientRect();
      var w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
      if (window.innerHeight - r.bottom < h + 16 && r.top > h + 16) { pop.style.top = (r.top - h - 6) + "px"; pop.classList.add("is-up"); }
      else pop.style.top = (r.bottom + 6) + "px";
    }
  };
}

function closeAll(refocus) {
  if (!current) return;
  var c = current;
  current = null;
  c.close(refocus);
}

/* ---------- date ---------- */

function openDate(input) {
  var s = shell(input, input.getAttribute("aria-label") || "Pick a date");
  var pop = s.pop;
  var min = parseKey(input.min), max = parseKey(input.max);
  var picked = parseKey(input.value);
  var today = new Date(); today.setHours(12, 0, 0, 0);
  var view = new Date((picked || (max && max < today ? max : today)).getTime());
  view.setDate(1);
  // an empty field that can only go back in time (a birthday): start on the years
  var mode = !picked && max && !min ? "years" : "days";
  var weekdays = [];
  for (var i = 0; i < 7; i++) weekdays.push(new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" })); // Feb 1 2026 is a Sunday

  function allowed(d) {
    return !(min && keyOf(d) < keyOf(min)) && !(max && keyOf(d) > keyOf(max));
  }

  function draw() {
    var title = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    var html = '<div class="dt-head">' +
      '<button type="button" class="icon-btn dt-nav" data-dt="prev" aria-label="' + (mode === "days" ? "Previous month" : "Earlier years") + '">' + icon("chevron-left") + "</button>" +
      '<button type="button" class="dt-title" data-dt="mode" aria-label="Choose a year">' + (mode === "days" ? title : yearStart() + " – " + (yearStart() + 15)) + icon("chevron-down") + "</button>" +
      '<button type="button" class="icon-btn dt-nav" data-dt="next" aria-label="' + (mode === "days" ? "Next month" : "Later years") + '">' + icon("chevron-right") + "</button>" +
    "</div>";
    if (mode === "days") {
      html += '<div class="dt-week" aria-hidden="true">' + weekdays.map(function (w) { return "<span>" + w + "</span>"; }).join("") + "</div>";
      html += '<div class="dt-grid" role="grid">';
      var first = new Date(view.getFullYear(), view.getMonth(), 1, 12);
      var start = new Date(first); start.setDate(1 - first.getDay());
      for (var k = 0; k < 42; k++) {
        var d = new Date(start); d.setDate(start.getDate() + k);
        var out = d.getMonth() !== view.getMonth();
        var on = picked && keyOf(d) === keyOf(picked);
        var isToday = keyOf(d) === keyOf(today);
        var ok = allowed(d);
        html += '<button type="button" class="dt-day' + (out ? " is-out" : "") + (on ? " is-on" : "") + (isToday ? " is-today" : "") + '" data-day="' + keyOf(d) + '"' +
          (ok ? "" : " disabled") + ' aria-label="' + d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + '"' + (on ? ' aria-selected="true"' : "") + ">" + d.getDate() + "</button>";
      }
      html += "</div>";
    } else {
      html += '<div class="dt-years">';
      for (var y = yearStart(); y < yearStart() + 16; y++) {
        var yOk = !(min && y < min.getFullYear()) && !(max && y > max.getFullYear());
        html += '<button type="button" class="dt-year' + (y === view.getFullYear() ? " is-on" : "") + (y === today.getFullYear() ? " is-today" : "") + '" data-year="' + y + '"' + (yOk ? "" : " disabled") + ">" + y + "</button>";
      }
      html += "</div>";
    }
    var canToday = allowed(today);
    html += '<div class="dt-foot">' +
      (input.required ? "<span></span>" : '<button type="button" class="link-btn" data-dt="clear">Clear</button>') +
      (canToday ? '<button type="button" class="tool-btn tool-btn--sm" data-dt="today">Today</button>' : "") +
    "</div>";
    pop.innerHTML = html;
  }
  function yearStart() {
    var y = view.getFullYear() - 7;
    if (max && y + 15 > max.getFullYear()) y = max.getFullYear() - 15;
    return y;
  }

  pop.addEventListener("click", function (ev) {
    var day = ev.target.closest("[data-day]");
    if (day && !day.disabled) {
      setValue(input, day.getAttribute("data-day"));
      return closeAll(true);
    }
    var yr = ev.target.closest("[data-year]");
    if (yr && !yr.disabled) { view.setFullYear(Number(yr.getAttribute("data-year"))); mode = "days"; return draw(); }
    var a = ev.target.closest("[data-dt]");
    if (!a) return;
    var what = a.getAttribute("data-dt");
    if (what === "prev") { if (mode === "days") view.setMonth(view.getMonth() - 1); else view.setFullYear(yearStart() - 9); }
    if (what === "next") { if (mode === "days") view.setMonth(view.getMonth() + 1); else view.setFullYear(yearStart() + 23); }
    if (what === "mode") mode = mode === "days" ? "years" : "days";
    if (what === "today") { setValue(input, keyOf(today)); return closeAll(true); }
    if (what === "clear") { setValue(input, ""); return closeAll(true); }
    draw();
  });
  // swipe between months on a phone
  var sx = null;
  pop.addEventListener("touchstart", function (ev) { sx = ev.touches[0].clientX; }, { passive: true });
  pop.addEventListener("touchend", function (ev) {
    if (sx == null || mode !== "days") return;
    var dx = ev.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) { view.setMonth(view.getMonth() + (dx < 0 ? 1 : -1)); draw(); }
  });
  draw();
  s.place();
  var focus = pop.querySelector(".dt-day.is-on") || pop.querySelector(".dt-day.is-today") || pop.querySelector(".dt-day:not([disabled])");
  if (focus) focus.focus({ preventScroll: true });
}

/* ---------- time ---------- */

function openTime(input) {
  var s = shell(input, input.getAttribute("aria-label") || "Pick a time");
  var pop = s.pop;
  var m = /^(\d{2}):(\d{2})/.exec(input.value || "");
  var h = m ? Number(m[1]) : null, mi = m ? Number(m[2]) : null;
  var h24 = getPrefs().clock24 !== false;
  var mins = [];
  for (var k = 0; k < 60; k += 5) mins.push(k);
  if (mi != null && mins.indexOf(mi) < 0) { mins.push(mi); mins.sort(function (a, b) { return a - b; }); }

  function hourLabel(x) { return h24 ? pad(x) : ((x % 12) || 12) + (x < 12 ? " am" : " pm"); }
  pop.innerHTML =
    '<div class="tm-cols">' +
      '<div class="tm-col" data-col="h" role="listbox" aria-label="Hour">' +
        Array.from({ length: 24 }, function (_, x) { return '<button type="button" class="tm-opt' + (x === h ? " is-on" : "") + '" data-h="' + x + '">' + hourLabel(x) + "</button>"; }).join("") +
      "</div>" +
      '<span class="tm-colon" aria-hidden="true">:</span>' +
      '<div class="tm-col" data-col="m" role="listbox" aria-label="Minute">' +
        mins.map(function (x) { return '<button type="button" class="tm-opt' + (x === mi ? " is-on" : "") + '" data-m="' + x + '">' + pad(x) + "</button>"; }).join("") +
      "</div>" +
    "</div>" +
    '<div class="dt-foot">' +
      (input.required ? "<span></span>" : '<button type="button" class="link-btn" data-dt="clear">Clear</button>') +
      '<button type="button" class="primary-btn tool-btn--sm" data-dt="done">Done</button>' +
    "</div>";

  function apply() {
    if (h == null && mi == null) return;
    if (h == null) h = new Date().getHours();
    if (mi == null) mi = 0;
    setValue(input, pad(h) + ":" + pad(mi));
  }
  pop.addEventListener("click", function (ev) {
    var b = ev.target.closest(".tm-opt");
    if (b) {
      var col = b.parentNode;
      col.querySelectorAll(".tm-opt").forEach(function (o) { o.classList.toggle("is-on", o === b); });
      if (b.hasAttribute("data-h")) h = Number(b.getAttribute("data-h")); else mi = Number(b.getAttribute("data-m"));
      b.scrollIntoView({ block: "center", behavior: "smooth" });
      apply();
      return;
    }
    var a = ev.target.closest("[data-dt]");
    if (!a) return;
    if (a.getAttribute("data-dt") === "clear") setValue(input, "");
    else apply();
    closeAll(true);
  });
  s.place();
  pop.querySelectorAll(".tm-col").forEach(function (col) {
    var on = col.querySelector(".is-on") || col.querySelector('[data-h="' + new Date().getHours() + '"]') || col.firstChild;
    if (on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.offsetHeight / 2;
  });
}
