/* Per-device preferences (look and feel, timer lengths). Your journal data
   lives on the backend; these are just how this browser shows it. */
var KEY = "logbook-prefs";

export var DEFAULT_PREFS = {
  name: "kaleb",
  autosave: true,
  rain: true,
  scanlines: true,
  boot: true,
  sound: true,
  notifications: false,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15
};

var cache = null;

export function getPrefs() {
  if (cache) return cache;
  var stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (e) {}
  cache = Object.assign({}, DEFAULT_PREFS, stored);
  return cache;
}

export function setPrefs(patch) {
  cache = Object.assign({}, getPrefs(), patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {}
  document.dispatchEvent(new CustomEvent("logbook:prefs-changed", { detail: { patch: patch, prefs: cache } }));
  return cache;
}
