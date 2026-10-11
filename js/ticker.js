/* One clock for everything that counts down on screen. Elements with
   data-tick-to="<ms since epoch>" show "2d 04:12:09" (or "04:12:09" under a
   day) and update every second while the page is visible. */

var timer = null;

function pad(n) { return n < 10 ? "0" + n : String(n); }

export function formatLeft(ms) {
  if (ms <= 0) return "now";
  var s = Math.floor(ms / 1000);
  var d = Math.floor(s / 86400);
  s -= d * 86400;
  var h = Math.floor(s / 3600);
  s -= h * 3600;
  var m = Math.floor(s / 60);
  s -= m * 60;
  return (d ? d + "d " : "") + pad(h) + ":" + pad(m) + ":" + pad(s);
}

function tick() {
  var now = Date.now();
  var els = document.querySelectorAll("[data-tick-to]");
  if (!els.length) return stop();
  els.forEach(function (el) {
    if (el.offsetParent === null) return;
    var text = formatLeft(Number(el.getAttribute("data-tick-to")) - now);
    if (el.textContent !== text) el.textContent = text;
  });
}

function stop() { clearInterval(timer); timer = null; }

export function startTicking() {
  tick();
  if (timer || document.visibilityState === "hidden") return;
  timer = setInterval(tick, 1000);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") stop();
  else if (document.querySelector("[data-tick-to]")) startTicking();
});
