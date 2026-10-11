import { apiCreateEntry } from './api.js';
import { sceneSvg } from './scene.js';
import { emitChange } from './bus.js';
import { mascotReact, mascotSay } from './mascot.js';
import { toast } from './toast.js';
import { loadEntries } from './journal.js';

/* Let something go: write what's weighing on you, fold it into a paper
   lantern and watch it rise past the mountain. Let it go and nothing is
   kept; or keep it, privately, in the journal. */

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

var LANTERN = '<svg class="lantern-svg" viewBox="0 0 60 84" aria-hidden="true">' +
  '<circle class="lantern-glow" cx="30" cy="44" r="30"/>' +
  '<path class="lantern-body" d="M14 18 Q 30 12 46 18 L 50 62 Q 30 70 10 62 Z"/>' +
  '<path class="lantern-rib" d="M18 30 Q 30 26 42 30 M16 44 Q 30 40 44 44 M14 56 Q 30 52 46 56"/>' +
  '<path class="lantern-cap" d="M20 14 h20 v5 h-20 z M22 66 h16 v4 h-16 z"/>' +
  '<path class="lantern-flame" d="M30 58 C 27 54, 28 50, 30 46 C 32 50, 33 54, 30 58 Z"/>' +
'</svg>';

export function openLantern() {
  if (document.querySelector(".lantern-overlay")) return;
  var el = document.createElement("div");
  el.className = "lantern-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Let something go");
  el.innerHTML =
    '<div class="lantern-scene" aria-hidden="true">' + sceneSvg({ crop: window.innerWidth < 700 ? "peak" : null }) + "</div>" +
    '<form class="lantern-card">' +
      '<p class="lantern-ask">What\'s weighing on you?</p>' +
      '<textarea class="lantern-text" maxlength="4000" rows="5" placeholder="Write it out. Nobody else will read this."></textarea>' +
      '<div class="lantern-actions">' +
        '<button type="submit" class="primary-btn" data-lantern="go">Let it go</button>' +
        '<button type="button" class="tool-btn" data-lantern="keep">Keep it in my journal</button>' +
        '<button type="button" class="link-btn" data-lantern="close">Not now</button>' +
      "</div>" +
    "</form>" +
    '<div class="lantern-flight" aria-hidden="true">' + LANTERN + "</div>" +
    '<p class="lantern-after" aria-live="polite"></p>';
  document.body.appendChild(el);
  document.body.classList.add("has-overlay");
  var text = el.querySelector(".lantern-text");
  setTimeout(function () { text.focus(); }, 60);

  function close() {
    el.classList.add("is-leaving");
    document.body.classList.remove("has-overlay");
    document.removeEventListener("keydown", onKey);
    setTimeout(function () { el.remove(); }, 400);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);

  async function release(keep) {
    var words = text.value.trim();
    if (!words) return text.focus();
    if (keep) {
      try {
        await apiCreateEntry("rough", words, "lantern");
        await loadEntries();
        emitChange("entries");
      } catch (e) {
        return toast("Couldn't keep it. It's still here.", "error");
      }
    }
    el.classList.add("is-releasing");
    el.querySelector(".lantern-after").textContent = keep ? "Kept, just for you. Now breathe." : "It's gone. Breathe.";
    mascotReact("wake");
    setTimeout(function () { mascotSay(keep ? "That was heavy. I'm glad you wrote it down." : "Lighter now? I'm here."); }, 2400);
    setTimeout(close, reduceMotion() ? 1500 : 5200);
  }

  el.addEventListener("submit", function (e) { e.preventDefault(); release(false); });
  el.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lantern]");
    if (!b) return;
    var what = b.getAttribute("data-lantern");
    if (what === "keep") release(true);
    if (what === "close") close();
  });
}
