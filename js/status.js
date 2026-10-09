import { apiHealth } from './api.js';
import { isDevice, describeConnection } from './connection.js';
import { showBackendWarning } from './ui.js';
import { toast } from './toast.js';

/* Watches the backend so the page can say plainly when it's unreachable,
   and recover on its own when it comes back. */
var online = null;
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
  var changed = ok !== online;
  var wasOffline = online === false;
  online = ok;

  var dot = document.getElementById("statusDot");
  var label = document.getElementById("statusLabel");
  if (dot) dot.className = "status-dot " + (ok ? "is-online" : "is-offline");
  if (label) label.textContent = isDevice() ? "saved on this device" : ok ? "backend online" : "backend offline";
  showBackendWarning(!ok);

  if (changed) {
    if (ok && wasOffline) toast(isDevice() ? "storage is back" : "backend is back online");
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
