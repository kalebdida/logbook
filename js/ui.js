import { getPrefs, displayName } from './prefs.js';
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
    warn.innerHTML = "<strong>Can't reach your logbook server</strong> (" + serverBase().replace(/</g, "") + "). " +
      "Nothing will load or save until it's back. If it's on a free host it may be waking up, which takes about a minute. " +
      "This page retries on its own. You can switch to keeping data on this device in settings.";
    return;
  }
  warn.innerHTML =
    "<strong>Can't reach the logbook backend.</strong> Nothing will load or save until it's back. " +
    "Start it from the backend folder with <code>uvicorn app.main:app --reload</code>, then open " +
    "<code>http://127.0.0.1:8000</code>. This page retries on its own.";
}

export function showStorageWarning(kind) {
  var warn = document.getElementById("storageWarning");
  if (!warn) return;
  warn.hidden = false;
  warn.textContent = kind === "device"
    ? "This browser won't let Logbook save data (private window or blocked site data). Anything you write disappears when you close the tab. Use a normal window, or connect to a Logbook server in settings."
    : "This browser is blocking local storage, so settings and the live focus timer won't be remembered here. Your journal data is safe on the server.";
}

/* The loading screen. Every look opens on it: the theme's scene, the
   name, and a line that says what's happening. A free server can take up
   to a minute to wake, so after a few seconds it says so plainly instead
   of leaving a blank screen. The terminal theme keeps its boot lines. */
var splashTimer = null;

export function initSplash() {
  var bootEl = document.getElementById("boot");
  if (!bootEl) return;
  var terminal = document.documentElement.dataset.theme === "terminal";
  bootEl.classList.toggle("is-terminal", terminal);
  if (!terminal) {
    import('./scene.js').then(function (m) {
      if (bootEl.dataset.done) return;
      var holder = document.createElement("div");
      holder.className = "splash-scene";
      holder.setAttribute("aria-hidden", "true");
      holder.innerHTML = m.sceneSvg(window.innerWidth < window.innerHeight * 1.2 ? { crop: "peak" } : null);
      bootEl.insertBefore(holder, bootEl.firstChild);
    }).catch(function () {});
  }
  var line = document.getElementById("splashLine");
  var note = document.getElementById("splashNote");
  var cat = null;
  document.addEventListener("logbook:connect-progress", function (e) {
    if (bootEl.dataset.done || !line) return;
    var d = e.detail || {};
    if (d.phase === "connecting") line.textContent = "Connecting to your logbook…";
    if (d.phase === "waking") {
      bootEl.classList.add("is-waking");
      var secs = Math.round(d.elapsed / 1000);
      line.textContent = "Waking up the server… " + secs + "s";
      note.hidden = false;
      note.textContent = "Free servers take a nap when nobody's around. The first visit after a quiet spell takes up to a minute. Nothing you type will be lost.";
      if (!cat && !terminal) {
        cat = true;
        import('./mascot.js').then(function (m) {
          var spot = document.createElement("div");
          spot.className = "splash-cat";
          bootEl.querySelector(".splash").insertBefore(spot, bootEl.querySelector(".splash-title"));
          var c = m.mountMascot(spot, { size: "md", place: "splash" });
          if (c && c.sleep) c.sleep(true);
        }).catch(function () {});
      }
    }
    if (d.phase === "ready") line.textContent = "Almost there…";
    if (d.phase === "offline") line.textContent = "Can't reach the server right now. Opening what's here…";
  });
  // a quick load never shows the screen at all; a slow one fades it in
  splashTimer = setTimeout(function () { bootEl.classList.add("is-visible"); }, 350);
}

export function hideSplashForLock() {
  var bootEl = document.getElementById("boot");
  if (bootEl) bootEl.classList.add("is-under-lock");
}

/* Called once data is loaded: the terminal theme types its boot lines
   (any key skips; can be turned off in settings), every other look fades
   the loading screen away. */
export function startBoot(entryCount) {
  var bootEl = document.getElementById("boot");
  var prefs = getPrefs();
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var terminal = document.documentElement.dataset.theme === "terminal";
  clearTimeout(splashTimer);

  function finish() {
    if (bootEl.dataset.done) return;
    bootEl.dataset.done = "1";
    clearInterval(timer);
    document.removeEventListener("keydown", finish);
    bootEl.removeEventListener("click", finish);
    bootEl.classList.add("is-leaving");
    document.body.classList.add("is-booted");
    setTimeout(function () { bootEl.hidden = true; bootEl.innerHTML = ""; }, reduce ? 0 : 650);
  }

  var timer = null;
  if (!prefs.boot || reduce || !terminal) {
    finish();
    return;
  }

  bootEl.classList.add("is-visible");
  var container = document.getElementById("bootLines");
  var lines = [
    "> initializing logbook...",
    isDevice() ? "> opening local vault..." : "> connecting to backend...",
    "> user: " + displayName().toLowerCase(),
    "> clearance: personal / eyes only",
    "> entries on record: " + entryCount,
    "> access granted."
  ];
  var i = 0;
  timer = setInterval(function () {
    var row = document.createElement("div");
    row.textContent = lines[i];
    if (i === lines.length - 1) row.className = "boot-granted";
    container.appendChild(row);
    i++;
    if (i >= lines.length) {
      clearInterval(timer);
      setTimeout(finish, 450);
    }
  }, 170);
  document.addEventListener("keydown", finish);
  bootEl.addEventListener("click", finish);
}
