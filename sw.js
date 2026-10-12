/* Logbook service worker: makes the app open instantly, and offline.
   - A built copy (GitHub Pages, the Android app) installs every app file up
     front (FILES, stamped by scripts/build_web.py) and then answers from that
     copy: no waiting on the network for ~70 files on a slow connection.
   - Updates: the browser checks sw.js itself on every open. A new build has a
     new VERSION, so the new worker downloads the whole new copy in the
     background, takes over, and the page reloads into it when that's safe
     (js/pwa.js). Old copies are deleted.
   - config.js (which server to use): the saved copy at once, refreshed in
     the background, so a changed server address arrives on the next open.
   - Running from source (VERSION "dev"): network first, so edits show at once.
   - everything else (your server's API, Spotify, AI providers): untouched,
     never cached here */
var VERSION = "dev";
var FILES = [];
var CACHE = "logbook-" + VERSION;
var CORE = ["./", "index.html", "manifest.webmanifest", "assets/icon-192.png", "assets/favicon.svg"];
var STATIC = /\.(?:html|css|js|mjs|svg|png|jpg|jpeg|webp|ico|woff2?|webmanifest|json)$/;
var API_PREFIXES = ["/entries", "/days", "/tasks", "/activities", "/goals", "/pomodoro", "/habits", "/deadlines", "/prayers", "/verse", "/telegram", "/profile", "/sleep", "/photos", "/letters", "/backup", "/auth", "/ai", "/health", "/ping", "/docs", "/openapi.json"];
var BUILT = VERSION !== "dev";

self.addEventListener("install", function (event) {
  var list = BUILT && FILES.length ? ["./"].concat(FILES) : CORE;
  event.waitUntil(
    caches.open(CACHE).then(function (c) {
      // skip the browser's HTTP cache: a stale file must not land in a new copy
      return Promise.all(list.map(function (u) {
        return fetch(new Request(u, { cache: "reload" })).then(function (res) { if (res.ok) return c.put(u, res); });
      }));
    }).then(function () { return self.skipWaiting(); }).catch(function () {})
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("logbook-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (event) {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isAppFile(req) {
  if (req.method !== "GET") return false;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  var scope = new URL(self.registration.scope).pathname;
  var path = url.pathname.slice(scope.length - 1);
  if (API_PREFIXES.some(function (p) { return path === p || path.indexOf(p + "/") === 0 || path.indexOf(p + "?") === 0; })) return false;
  return req.mode === "navigate" || path === "/" || STATIC.test(path);
}

function fromNetwork(req) {
  var fresh = req.mode === "navigate" ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : new Request(req, { cache: "no-cache" });
  return fetch(fresh).then(function (res) {
    if (res && res.ok && res.type === "basic") {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  });
}

function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    if (req.mode === "navigate") return c.match("index.html").then(function (h) { return h || c.match("./"); });
    return c.match(req, { ignoreSearch: true });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (!isAppFile(req)) return;
  var path = new URL(req.url).pathname;
  if (BUILT && /\/config\.js$/.test(path)) {
    // which server to use: the saved copy at once (it blocks the first paint),
    // and a fresh one fetched behind it for next time
    var refresh = fromNetwork(req);
    event.waitUntil(refresh.catch(function () {}));
    event.respondWith(fromCache(req).then(function (hit) {
      return hit || refresh.catch(function () { return Response.error(); });
    }));
    return;
  }
  if (!BUILT) {
    // network first, the saved copy when offline
    event.respondWith(fromNetwork(req).catch(function () {
      return fromCache(req).then(function (hit) { return hit || Response.error(); });
    }));
    return;
  }
  // a built copy: answer from the saved copy at once; fetch only what's missing
  event.respondWith(fromCache(req).then(function (hit) {
    return hit || fromNetwork(req).catch(function () { return Response.error(); });
  }));
});
