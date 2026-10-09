/* Where this copy of Logbook keeps its data.

   "server": a Logbook backend. Same address as the page by default (what
   you get running uvicorn), or any URL, e.g. your hosted server from the
   Android app. Optional password login.
   "device": everything stays in this browser (IndexedDB). No server needed.

   First visit decides by itself: if the page was served by a Logbook
   backend, use it; otherwise use this device. After that the choice is
   remembered, so a server that's briefly down never silently flips you
   onto an empty device database. */
var KEY = "logbook-connection";
var state = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function getConnection() {
  if (!state) state = Object.assign({ mode: null, serverUrl: "", token: "" }, load() || {});
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

export async function resolveConnection() {
  var c = getConnection();
  if (c.mode === "device" || c.mode === "server") return c;
  if (location.protocol.indexOf("http") !== 0) return setConnection({ mode: "device", serverUrl: "" });
  var r = await probe("", 6000);
  if (r.kind === "unknown") r = await probe("", 10000);
  if (r.kind === "logbook") return setConnection({ mode: "server", serverUrl: "" });
  if (r.kind === "absent") return setConnection({ mode: "device", serverUrl: "" });
  // the page came from somewhere that isn't answering right now: assume its
  // server for this visit, but don't remember it, so the next visit asks again
  state = Object.assign({}, getConnection(), { mode: "server", serverUrl: "" });
  return state;
}

export function describeConnection() {
  var c = getConnection();
  if (c.mode === "device") return "this device";
  return c.serverUrl ? c.serverUrl.replace(/^https?:\/\//, "") : "this computer's server";
}
