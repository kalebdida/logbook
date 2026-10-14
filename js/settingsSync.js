/* Settings that follow your account to every device: theme, Today page
   cards, timer lengths, music presets, the cat's gifts. They're still saved
   in this browser (so the app opens instantly and works offline) and a copy
   lives on the server; the newest change wins.

   Stays on this device only, on purpose: the PIN and fingerprint, which
   server to use, half-written drafts, an AI key saved in this browser. */
import { apiGetSyncedSettings, apiPutSyncedSettings } from './api.js';
import { isDevice, isDemo } from './connection.js';

var SYNCED = ["logbook-prefs", "logbook-theme", "logbook-custom-themes", "logbook-theme-vars", "logbook-look",
  "logbook-music", "logbook-mascot-gifts"];
var STAMP = "logbook-settings-stamp";     // when this device last changed (or took) them
var applying = false;
var pushTimer = null;
var lastPull = 0;
var started = false;

function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function localStamp() { return Number(read(STAMP)) || 0; }
function setStamp(n) { try { Storage.prototype.setItem.call(localStorage, STAMP, String(n)); } catch (e) {} }

function snapshot() {
  var data = {};
  SYNCED.forEach(function (k) { var v = read(k); if (v !== null) data[k] = v; });
  return data;
}

function push() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(function () {
    apiPutSyncedSettings(snapshot(), localStamp()).catch(function () {});
  }, 1200);
}

/* Take the account's settings if they're newer than this device's. Changing
   the look or the page layout needs a fresh start, so the app reloads once. */
export async function pullSettings() {
  if (isDevice() || isDemo()) return;
  lastPull = Date.now();
  var r;
  try { r = await apiGetSyncedSettings(); } catch (e) { return; }
  if (!r) return;
  var mine = localStamp();
  if (r.stamp > mine) {
    var changed = false;
    applying = true;
    try {
      Object.keys(r.data || {}).forEach(function (k) {
        if (SYNCED.indexOf(k) < 0 || read(k) === r.data[k]) return;
        localStorage.setItem(k, r.data[k]);
        changed = true;
      });
    } finally { applying = false; }
    setStamp(r.stamp);
    if (changed) {
      var guard = "logbook-sync-reload-" + r.stamp;
      try { if (sessionStorage.getItem(guard)) return; sessionStorage.setItem(guard, "1"); } catch (e) {}
      var el = document.activeElement;
      var typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!typing) location.reload();
    }
  } else if (mine > r.stamp || (!r.stamp && Object.keys(snapshot()).length)) {
    if (!mine) setStamp(Date.now());
    push();                                   // this device has the newer settings (or the account has none yet)
  }
}

export function startSettingsSync() {
  if (started || isDevice() || isDemo()) return;
  started = true;
  // every change to a synced setting, wherever in the app it's made, goes up too
  var original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    original.call(this, k, v);
    if (this === window.localStorage && !applying && SYNCED.indexOf(k) >= 0) {
      setStamp(Date.now());
      push();
    }
  };
  pullSettings();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastPull > 30000) pullSettings();
  });
}
