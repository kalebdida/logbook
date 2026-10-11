import { apiHealth } from './api.js';
import { isDevice, describeConnection } from './connection.js';
import { showBackendWarning } from './ui.js';
import { toast } from './toast.js';

/* Watches the backend so the page can say plainly when it's unreachable,
   and recover on its own when it comes back. */
var online = null;
var misses = 0;
var fastTimer = null;
var listeners = [];

export function onStatus(fn) {
  listeners.push(fn);
}

export function isOnline() {
  return online !== false;
}

export async function checkBackend() {
  var ok;
  try {
    await apiHealth();
    ok = true;
  } catch (e) {
    ok = false;
  }
  // one missed check is usually a blip; say something on the second
  misses = ok ? 0 : misses + 1;
  if (!ok && misses < 2) {
    clearTimeout(fastTimer);
    fastTimer = setTimeout(checkBackend, 3000);
    return online !== false;
  }
  var changed = ok !== online;
  var wasOffline = online === false;
  online = ok;

  var dot = document.getElementById("statusDot");
  var label = document.getElementById("statusLabel");
  if (dot) dot.className = "status-dot " + (ok ? "is-online" : "is-offline");
  if (label) label.textContent = isDevice() ? "On this device" : ok ? "Online" : "Offline";
  showBackendWarning(!ok);
  clearTimeout(fastTimer);
  if (!ok) fastTimer = setTimeout(checkBackend, 5000);   // while it's away, look often so it clears fast

  if (changed) {
    if (ok && wasOffline) toast(isDevice() ? "Storage is back" : "Back online");
    listeners.forEach(function (fn) { fn(ok, wasOffline); });
  }
  return ok;
}

export function startStatusWatch() {
  if (isDevice()) return; // nothing to watch: the data is right here
  setInterval(checkBackend, 20000);
  window.addEventListener("focus", checkBackend);
  window.addEventListener("online", checkBackend);
}
