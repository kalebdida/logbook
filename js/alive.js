/* Small signs of life: a soft light that follows the pointer across cards,
   the dashboard scene drifting a little with the pointer, cards settling in
   one after another when a page opens, and numbers counting up to their
   value. All of it stays still under reduced motion, and none of it runs on
   touch-only screens except the settle-in and the counting. */

var CARDS = ".card, .daily-section, .habits-card, .goals-card, .analytics-card, .settings-card, .cal-card, .density-map-card, .pomodoro-card, .music-card, .companion-card, .verse-box, .replay-card, .day-card";

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

function finePointer() {
  try { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) { return false; }
}

/* ---------- the light under the pointer ---------- */

var frame = 0, last = null, lit = null, hero = null;

function onMove(e) {
  last = e;
  if (frame) return;
  frame = requestAnimationFrame(paint);
}

function paint() {
  frame = 0;
  var e = last;
  if (!e || !e.target || !e.target.closest) return;
  var card = e.target.closest(CARDS);
  if (lit && lit !== card) lit.classList.remove("is-lit");
  lit = card;
  if (card) {
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", Math.round(e.clientX - r.left) + "px");
    card.style.setProperty("--my", Math.round(e.clientY - r.top) + "px");
    card.classList.add("is-lit");
  }
  var h = e.target.closest(".today-hero");
  if (hero && hero !== h) { hero.style.setProperty("--px", "0"); hero.style.setProperty("--py", "0"); }
  hero = h;
  if (h) {
    var b = h.getBoundingClientRect();
    h.style.setProperty("--px", ((e.clientX - b.left) / b.width - 0.5).toFixed(3));
    h.style.setProperty("--py", ((e.clientY - b.top) / b.height - 0.5).toFixed(3));
  }
}

function onLeave(e) {
  if (e.relatedTarget) return;
  if (lit) lit.classList.remove("is-lit");
  lit = null;
  if (hero) { hero.style.setProperty("--px", "0"); hero.style.setProperty("--py", "0"); }
  hero = null;
}

/* ---------- settle in, count up ---------- */

function stagger(page) {
  var cards = page.querySelectorAll(CARDS);
  var n = 0;
  Array.prototype.forEach.call(cards, function (c) {
    if (c.offsetParent === null || c.closest(".is-settled-skip")) return;
    // nested cards follow their parent
    if (c.parentElement && c.parentElement.closest(CARDS) && page.contains(c.parentElement.closest(CARDS))) return;
    c.style.setProperty("--i", String(Math.min(n++, 9)));
  });
}

export function countUp(root) {
  if (!root || reduceMotion()) return;
  var els = root.querySelectorAll(".readout-val, .stat-value, [data-count-up]");
  Array.prototype.forEach.call(els, function (el) {
    if (el.children.length) return;
    var text = el.textContent;
    var m = /^(\D{0,3})(\d{1,5})(\D[\s\S]*)?$/.exec(text);
    if (!m) return;
    var to = Number(m[2]);
    if (to < 2) return;
    var start = performance.now(), dur = Math.min(900, 380 + to * 18);
    el.classList.add("is-counting");
    function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      if (!el.isConnected) return;
      el.textContent = m[1] + Math.round(to * eased) + (m[3] || "");
      if (t < 1) requestAnimationFrame(step);
      else { el.textContent = text; el.classList.remove("is-counting"); }
    }
    requestAnimationFrame(step);
  });
}

function onAnimationStart(e) {
  if (e.animationName !== "pageEnter" || !e.target.classList || !e.target.classList.contains("nav-page")) return;
  stagger(e.target);
  countUp(e.target);
}

export function startAlive() {
  if (reduceMotion()) return;
  document.addEventListener("animationstart", onAnimationStart);
  if (finePointer()) {
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
  }
  // the first page shown after loading counts up too
  var seen = false;
  new MutationObserver(function (list, obs) {
    if (seen || !document.body.classList.contains("is-booted")) return;
    seen = true;
    obs.disconnect();
    var page = document.querySelector(".nav-page:not([hidden])");
    if (page) { stagger(page); setTimeout(function () { countUp(page); }, 250); }
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
