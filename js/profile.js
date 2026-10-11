import { apiGetProfile, apiSaveProfile } from './api.js';
import { getPrefs, setPrefs } from './prefs.js';

/* The account's birthday and the cat's name, kept on the server so every
   device agrees. The cat's name is mirrored into this browser's prefs so the
   login screen (before any data loads) already knows it. */

var current = { birthday: null, petName: "" };
var listeners = [];

export function getProfile() { return current; }

export function onProfile(fn) { listeners.push(fn); }

function changed() {
  listeners.forEach(function (fn) { try { fn(current); } catch (e) {} });
}

export async function loadProfile() {
  try {
    current = await apiGetProfile();
  } catch (e) {
    if (e.status === 404) return current;   // an older server
    throw e;
  }
  var local = String(getPrefs().mascotName || "").trim();
  if (current.petName && current.petName !== local) {
    setPrefs({ mascotName: current.petName });
  } else if (!current.petName && local && local !== "Mochi") {
    // named on this device before names were shared: share it now
    current = await apiSaveProfile({ petName: local }).catch(function () { return current; });
  }
  changed();
  return current;
}

export async function saveProfile(patch) {
  current = await apiSaveProfile(patch);
  if (patch.petName !== undefined) setPrefs({ mascotName: current.petName || "Mochi" });
  changed();
  return current;
}
