import { getPrefs } from './prefs.js';
import { isDevice, serverBase } from './connection.js';

export function showBackendWarning(show) {
  var warn = document.getElementById("storageWarning");
  if (!warn) return;
  if (show === false) {
    warn.hidden = true;
    return;
  }
  warn.hidden = false;
  if (serverBase()) {
    warn.innerHTML = "<strong>can't reach your logbook server</strong> (" + serverBase().replace(/</g, "") + "). " +
      "nothing will load or save until it's back. if it's on a free host it may be waking up, which takes about a minute. " +
      "this page retries on its own. you can switch to keeping data on this device in settings.";
    return;
  }
  warn.innerHTML =
    "<strong>can't reach the logbook backend.</strong> nothing will load or save until it's back. " +
    "start it from the backend folder with <code>uvicorn app.main:app --reload</code>, then open " +
    "<code>http://127.0.0.1:8000</code>. this page retries on its own.";
}

export function showStorageWarning(kind) {
  var warn = document.getElementById("storageWarning");
  if (!warn) return;
  warn.hidden = false;
  warn.textContent = kind === "device"
    ? "this browser won't let logbook save data (private window or blocked site data). anything you write disappears when you close the tab. use a normal window, or connect to a logbook server in settings."
    : "this browser is blocking local storage, so settings and the live focus timer won't be remembered here. your journal data is safe on the server.";
}

/* The terminal theme's boot sequence. Any key or click skips it; it can be
   turned off in settings. Every other look just fades in. */
export function startBoot(entryCount) {
  var bootEl = document.getElementById("boot");
  var app = document.getElementById("app");
  var prefs = getPrefs();
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var terminal = document.documentElement.dataset.theme === "terminal";

  function finish() {
    if (bootEl.dataset.done) return;
    bootEl.dataset.done = "1";
    clearInterval(timer);
    document.removeEventListener("keydown", finish);
    bootEl.removeEventListener("click", finish);
    bootEl.style.opacity = "0";
    setTimeout(function () { bootEl.hidden = true; }, 400);
    document.body.classList.add("is-booted");
  }

  if (!prefs.boot || reduce || !terminal) {
    bootEl.hidden = true;
    bootEl.dataset.done = "1";
    document.body.classList.add("is-booted");
    return;
  }

  var container = document.getElementById("bootLines");
  var lines = [
    "> initializing logbook...",
    isDevice() ? "> opening local vault..." : "> connecting to backend...",
    "> user: " + prefs.name,
    "> clearance: personal / eyes only",
    "> entries on record: " + entryCount,
    "> access granted."
  ];
  var i = 0;
  var timer = setInterval(function () {
    var line = document.createElement("div");
    line.textContent = lines[i];
    if (i === lines.length - 1) line.className = "boot-granted";
    container.appendChild(line);
    i++;
    if (i >= lines.length) {
      clearInterval(timer);
      setTimeout(finish, 450);
    }
  }, 170);
  document.addEventListener("keydown", finish);
  bootEl.addEventListener("click", finish);
  void app;
}
