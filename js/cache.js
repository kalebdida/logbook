/* The last copy of what the server said, kept in this browser (IndexedDB,
   never localStorage), so the app opens at once from it and then checks
   with the server in the background. Server mode only; device mode already
   has its data right here.

   Each account's copy is kept apart, and switching accounts or logging out
   wipes the whole thing (lock.js clearLocalTraces). */

var DB_NAME = "logbook-cache";
var STORE = "get";
var CACHEABLE = /^\/(entries|days|tasks|activities|goals|pomodoro|habits|deadlines|prayers|verse)(\/|\?|$)/;

var user = "";
var memory = new Map();     // path -> JSON text, this account only
var booting = false;
var served = new Set();     // paths answered from the copy while booting
var dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    var req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  dbPromise.catch(function () { dbPromise = null; });
  return dbPromise;
}

function keyFor(path) { return user + "\n" + path; }

export function cacheable(path) { return Boolean(user) && CACHEABLE.test(path); }

export function setCacheUser(name) {
  if (name === user) return;
  user = String(name || "");
  memory = new Map();
}

/* Reads this account's copy into memory. True when there's enough of it to
   open the app (the journal list is the one thing every page needs). */
export async function cacheLoad() {
  if (!user) return false;
  try {
    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readonly");
      var store = tx.objectStore(STORE);
      var range = IDBKeyRange.bound(user + "\n", user + "\n￿");
      var req = store.openCursor(range);
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) return;
        memory.set(String(cur.key).slice(user.length + 1), cur.value);
        cur.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
  } catch (e) {
    return false;
  }
  return memory.has("/entries/?limit=5000");
}

export function setCacheBoot(on) {
  booting = Boolean(on);
  if (booting) served = new Set();
}

export function cacheBooting() { return booting; }

/* undefined when there's no copy */
export function cacheRead(path) {
  if (!booting || !cacheable(path) || !memory.has(path)) return undefined;
  served.add(path);
  return JSON.parse(memory.get(path));
}

/* true when the server's answer differs from the copy */
export function cacheWrite(path, data) {
  if (!cacheable(path)) return false;
  var text;
  try { text = JSON.stringify(data); } catch (e) { return false; }
  var changed = memory.get(path) !== text;
  if (!changed) return false;
  memory.set(path, text);
  var key = keyFor(path);
  openDb().then(function (db) {
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(text, key);
  }).catch(function () {});
  return true;
}

/* Asks the server again for everything the app opened with. True if any of
   it changed, so the caller knows to draw again. */
export async function cacheRevalidate(fetcher) {
  var paths = Array.from(served);
  served = new Set();
  var results = await Promise.all(paths.map(function (p) {
    return fetcher(p).then(function (data) { return cacheWrite(p, data); }, function (e) {
      if (e && e.status === 404) return false;
      throw e;
    });
  }));
  return results.some(Boolean);
}

export function cacheClear() {
  memory = new Map();
  served = new Set();
  try {
    var close = dbPromise ? dbPromise.then(function (db) { db.close(); }).catch(function () {}) : Promise.resolve();
    dbPromise = null;
    close.then(function () { try { indexedDB.deleteDatabase(DB_NAME); } catch (e) {} });
  } catch (e) {}
}
