/* Where this copy of Logbook keeps its data.

   "server": a Logbook backend. Same address as the page by default (what
   you get running uvicorn), or any URL, e.g. your hosted server from the
   Android app. Optional password login.
   "device": everything stays in this browser (IndexedDB). No server needed.

   First visit decides by itself: if config.js names a server (the GitHub
   Pages front door for a server on Render), use that; else if the page was
   served by a Logbook backend, use it; otherwise use this device. After that
   the choice is remembered, so a server that's briefly down never silently
   flips you onto an empty device database.

   Every page load reports how connecting goes, for a loading screen:
     document "logbook:connect-progress", detail { phase, elapsed, server }
     phase "connecting" -> "waking" (after ~4s; a free host is waking up) ->
     "ready" or "offline". While waiting it fires about once a second, and
     each load ends with exactly one "ready" or "offline". "offline" means we
     gave up waiting; the app then shows its usual "can't reach" warning and
     keeps checking in the background. */
var KEY = "logbook-connection";
var state = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function getConnection() {
  if (!state) {
    state = Object.assign({ mode: null, serverUrl: "", token: "" }, load() || {});
    if (state.pendingToken) { // a login that reloaded the page (see lock.js)
      state.token = state.pendingToken;
      delete state.pendingToken;
      save();
    }
  }
  return state;
}

export function setConnection(patch) {
  state = Object.assign({}, getConnection(), patch);
  save();
  return state;
}

export function isDevice() {
  return getConnection().mode === "device";
}

export function serverBase() {
  return (getConnection().serverUrl || "").replace(/\/+$/, "");
}

/* Is there a Logbook backend at this base URL ("" = the page's own origin)?
   Returns its /health body, or null. */
export async function probeServer(base, timeoutMs) {
  var r = await probe(base, timeoutMs);
  return r.health;
}

/* { kind: "logbook" | "absent" | "unknown", health }
   "absent": something answered and it isn't Logbook (a static host, the Android app)
   "unknown": nothing answered in time (busy, offline, waking up) */
async function probe(base, timeoutMs) {
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 2500) : null;
  try {
    var res = await fetch((base || "") + "/health", { signal: ctrl ? ctrl.signal : undefined, cache: "no-store" });
    if (!res.ok) return { kind: res.status >= 500 ? "unknown" : "absent", health: null };
    var body = null;
    try { body = await res.json(); } catch (e) {}
    return body && body.app === "logbook" ? { kind: "logbook", health: body } : { kind: "absent", health: null };
  } catch (e) {
    return { kind: "unknown", health: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* The server config.js names (window.LOGBOOK_CONFIG.apiUrl), or "". */
export function configuredServer() {
  try {
    var url = window.LOGBOOK_CONFIG && window.LOGBOOK_CONFIG.apiUrl;
    return typeof url === "string" && /^https?:\/\//.test(url.trim()) ? url.trim().replace(/\/+$/, "") : "";
  } catch (e) {
    return "";
  }
}

var WAIT_LIMIT_MS = 90000;    // Render's free plan can take about a minute to wake
var WAKING_AFTER_MS = 4000;   // slower than this: it's probably waking up
var PROBE_TIMEOUT_MS = 15000;

function hostOf(base) {
  if (base === null) return "";
  if (!base) return location.host;
  return base.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function progress(phase, started, base) {
  try {
    document.dispatchEvent(new CustomEvent("logbook:connect-progress", {
      detail: { phase: phase, elapsed: Math.max(0, Date.now() - started), server: hostOf(base) }
    }));
  } catch (e) {}
}

/* "connecting" now, then "connecting"/"waking" about once a second until stopped. */
function ticker(base, started) {
  progress("connecting", started, base);
  var id = setInterval(function () {
    progress(Date.now() - started >= WAKING_AFTER_MS ? "waking" : "connecting", started, base);
  }, 1000);
  return function stop() { clearInterval(id); };
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* Keeps asking a remote server until it answers, for up to ~90s: a free host
   that was asleep answers nothing (or an error page) while it wakes up. */
async function waitForServer(base) {
  var started = Date.now();
  var stop = ticker(base, started);
  var ok = false;
  try {
    while (!ok) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break; // no network: don't make anyone wait
      var left = WAIT_LIMIT_MS - (Date.now() - started);
      if (left <= 0) break;
      var r = await probe(base, Math.min(PROBE_TIMEOUT_MS, left));
      if (r.kind === "logbook") ok = true;
      else await sleep(Math.min(1000, Math.max(0, WAIT_LIMIT_MS - (Date.now() - started))));
    }
  } finally {
    stop();
  }
  progress(ok ? "ready" : "offline", started, base);
  return ok;
}

export async function resolveConnection() {
  var c = getConnection();
  if (!c.mode && configuredServer()) c = setConnection({ mode: "server", serverUrl: configuredServer() });
  if (c.mode === "device") {
    progress("ready", Date.now(), null);
    return c;
  }
  if (c.mode === "server") {
    // the page's own server served this page, so it's awake; a remote one may be asleep
    if (serverBase()) await waitForServer(serverBase());
    else progress("ready", Date.now(), "");
    return getConnection();
  }
  if (location.protocol.indexOf("http") !== 0) {
    progress("ready", Date.now(), null);
    return setConnection({ mode: "device", serverUrl: "" });
  }
  var started = Date.now();
  var stop = ticker("", started);
  var r;
  try {
    r = await probe("", 6000);
    if (r.kind === "unknown") r = await probe("", 10000);
  } finally {
    stop();
  }
  progress(r.kind === "unknown" ? "offline" : "ready", started, r.kind === "absent" ? null : "");
  if (r.kind === "logbook") return setConnection({ mode: "server", serverUrl: "" });
  if (r.kind === "absent") return setConnection({ mode: "device", serverUrl: "" });
  // the page came from somewhere that isn't answering right now: assume its
  // server for this visit, but don't remember it, so the next visit asks again
  state = Object.assign({}, getConnection(), { mode: "server", serverUrl: "" });
  return state;
}

/* A short name for where the data lives, for settings and the lock screen. */
export function describeConnection() {
  var c = getConnection();
  if (c.mode === "device") return "This device";
  var host = hostOf(serverBase());
  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return "Your server on this computer";
  return host;
}
