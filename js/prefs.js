/* Per-device preferences (look and feel, timer lengths). Your journal data
   lives on the backend; these are just how this browser shows it. */
import { getConnection } from './connection.js';

var KEY = "logbook-prefs";

export var DEFAULT_PREFS = {
  name: "",
  autosave: true,
  rain: true,
  scanlines: true,
  boot: true,
  sound: true,
  notifications: false,
  phoneNotify: false,        // Android app: deadline and streak notifications with the app closed
  nudges: true,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  mascot: true,
  mascotName: "Mochi",
  dailyLine: "verse",        // verse | quote | affirmation | custom | mix | off
  dailyLineCustom: "",
  verseTranslation: "kjv",   // kjv | web | bbe | asv (bible-api.com)
  foldLog: true,             // the time log card starts open
  clock24: true,
  focusScene: true,          // the focus space fills the screen with the scene
  autoBreak: false,          // start the break by itself when focus ends
  dash: { deadlines: true, age: true, sleep: true, gratitude: true, photo: true, habits: false, prayers: true, brainDump: true, replay: true, log: false, night: true }
};

var cache = null;

export function getPrefs() {
  if (cache) return cache;
  var stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (e) {}
  cache = Object.assign({}, DEFAULT_PREFS, stored);
  // Oct 2026: the time log and habits left the Today page (one toggle in settings brings each back)
  if (!cache.cut2610) {
    cache.dash = Object.assign({}, DEFAULT_PREFS.dash, cache.dash || {}, { habits: false, log: false });
    cache.cut2610 = true;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
  }
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

/* What to call you: the name from settings, else your username, else "friend".
   Shown with a capital first letter. */
export function displayName() {
  var n = String(getPrefs().name || "").trim();
  if (!n) { try { n = String(getConnection().username || "").trim(); } catch (e) {} }
  if (!n) n = "friend";
  return n.charAt(0).toUpperCase() + n.slice(1);
}
