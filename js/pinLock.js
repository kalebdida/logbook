import { icon } from './icons.js';
import { sceneSvg } from './scene.js';
import { mountMascot } from './mascot.js';
import { getPrefs } from './prefs.js';
import { isDevice } from './connection.js';

/* A PIN for this device: Logbook asks for it when it opens, and again after
   a minute away. It guards the screen on a phone someone else is holding;
   it isn't your account password (the server login stays as it is). Only a
   salted hash is kept, in this browser. Logging out removes it. */

var KEY = "logbook-pin";
var AWAY_MS = 60 * 1000;
var hiddenAt = 0;
var open = null;

function saved() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}

export function hasPin() { return Boolean(saved()); }

async function digest(salt, pin) {
  var data = new TextEncoder().encode(salt + ":" + pin);
  var buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

export async function setPin(pin) {
  var salt = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  localStorage.setItem(KEY, JSON.stringify({ salt: salt, hash: await digest(salt, pin), len: pin.length }));
}

export function clearPin() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

async function check(pin) {
  var s = saved();
  return Boolean(s) && (await digest(s.salt, pin)) === s.hash;
}

/* mode "unlock": resolves when the right PIN is in.
   mode "set": asks twice, resolves with the new PIN (or null if cancelled).
   mode "confirm": the current PIN before turning it off; resolves true/false. */
export function pinPad(mode) {
  if (open) return open;
  open = new Promise(function (resolve) {
    var el = document.createElement("div");
    el.className = "pin-screen";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Enter your PIN");
    var title = mode === "set" ? "Choose a PIN" : mode === "confirm" ? "Your current PIN" : "Welcome back";
    el.innerHTML =
      '<div class="pin-scene" aria-hidden="true">' + sceneSvg(window.innerWidth < window.innerHeight * 1.2 ? { crop: "peak" } : null) + "</div>" +
      '<div class="pin-card">' +
        '<div class="pin-cat"></div>' +
        '<p class="pin-title">' + title + "</p>" +
        '<p class="pin-hint">' + (mode === "set" ? "4 to 6 digits. You'll type it when Logbook opens on this device." : "Enter your PIN") + "</p>" +
        '<div class="pin-dots" aria-hidden="true">' + "<i></i>".repeat(6) + "</div>" +
        '<div class="pin-keys">' +
          [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" class="pin-key" data-k="' + n + '">' + n + "</button>"; }).join("") +
          (mode === "unlock" ? '<button type="button" class="pin-key pin-key--quiet" data-k="forgot">Forgot</button>' : '<button type="button" class="pin-key pin-key--quiet" data-k="cancel">Cancel</button>') +
          '<button type="button" class="pin-key" data-k="0">0</button>' +
          '<button type="button" class="pin-key pin-key--quiet" data-k="back" aria-label="Delete">' + icon("delete") + "</button>" +
        "</div>" +
        (mode !== "unlock" ? "" : '<button type="button" class="link-btn pin-ok" data-k="ok" hidden>Unlock</button>') +
      "</div>";
    document.body.appendChild(el);
    document.body.classList.add("has-pin");
    var cat = null;
    try { if (getPrefs().mascot !== false) cat = mountMascot(el.querySelector(".pin-cat"), { size: "md", place: "lock", quiet: true, awake: true }); } catch (e) {}
    if (cat) cat.react("shy");

    var typed = "", first = null, misses = 0, waitUntil = 0;
    var want = mode === "set" ? 6 : ((saved() || {}).len || 6);   // dots to show
    var dots = el.querySelectorAll(".pin-dots i");
    var hint = el.querySelector(".pin-hint");
    function paint() {
      dots.forEach(function (d, i) { d.classList.toggle("is-on", i < typed.length); d.hidden = i >= want; });
    }
    function done(value) {
      el.classList.add("is-leaving");
      document.body.classList.remove("has-pin");
      document.removeEventListener("keydown", onKey);
      setTimeout(function () { el.remove(); }, 380);
      open = null;
      resolve(value);
    }
    function wrong(text) {
      var card = el.querySelector(".pin-card");
      card.classList.remove("is-wrong"); void card.offsetWidth; card.classList.add("is-wrong");
      typed = ""; paint();
      hint.textContent = text;
      if (cat) { cat.react("unshy"); cat.react("sad"); setTimeout(function () { if (cat) cat.react("shy"); }, 1600); }
    }
    async function submit() {
      if (mode === "set") {
        if (typed.length < 4) return;
        if (!first) { first = typed; typed = ""; paint(); hint.textContent = "Once more, to be sure"; return; }
        if (typed !== first) { first = null; return wrong("Those didn't match. Choose a PIN again."); }
        return done(typed);
      }
      if (Date.now() < waitUntil) return;
      if (await check(typed)) {
        if (cat) { cat.react("cheer"); }
        return setTimeout(function () { done(true); }, mode === "unlock" ? 350 : 0);
      }
      misses++;
      if (misses >= 5) {
        waitUntil = Date.now() + 30000;
        wrong("Too many tries. Wait 30 seconds.");
        setTimeout(function () { hint.textContent = "Enter your PIN"; }, 30000);
      } else wrong("That's not it");
    }
    function press(k) {
      if (k === "back") { typed = typed.slice(0, -1); return paint(); }
      if (k === "cancel") return done(mode === "set" ? null : false);
      if (k === "forgot") {
        hint.innerHTML = isDevice()
          ? "Your data is only on this device, so the PIN can't be reset without it. Keep trying calmly."
          : 'Log out and log back in with your password; that clears the PIN. <button type="button" class="link-btn" data-k="logout">Log out</button>';
        return;
      }
      if (k === "logout") {
        clearPin();
        import('./lock.js').then(function (m) { m.logout(); });
        return;
      }
      if (!/^\d$/.test(k) || typed.length >= 6) return;
      typed += k;
      paint();
      // unlocking checks as soon as the length matches what could be right
      if (mode !== "set" && typed.length === want) submit();
      else if (mode === "set" && typed.length === 6) submit();
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-k]");
      if (b) press(b.getAttribute("data-k"));
    });
    function onKey(e) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter" && mode === "set") submit();
      else if (e.key === "Escape" && mode !== "unlock") press("cancel");
    }
    document.addEventListener("keydown", onKey);
    if (mode === "set") {
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "primary-btn pin-next";
      ok.textContent = "Next";
      ok.addEventListener("click", submit);
      el.querySelector(".pin-card").appendChild(ok);
    }
    paint();
  });
  return open;
}

export function startPinLock() {
  if (hasPin()) pinPad("unlock");
  document.addEventListener("visibilitychange", function () {
    if (!hasPin()) return;
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) pinPad("unlock");
  });
}
