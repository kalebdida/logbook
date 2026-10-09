/* Logbook service worker: makes the app open offline.
   - the app's own files (html, css, js, icons): network first, falling back
     to the last copy, so updates show up as soon as you're online
   - everything else (your server's API, Spotify, AI providers): untouched,
     never cached here
   The build script stamps VERSION; a new version clears old caches. */
var VERSION = "dev";
var CACHE = "logbook-" + VERSION;
var CORE = ["./", "index.html", "manifest.webmanifest", "assets/icon-192.png", "assets/favicon.svg"];
var STATIC = /\.(?:html|css|js|mjs|svg|png|jpg|jpeg|webp|ico|woff2?|webmanifest|json)$/;
var API_PREFIXES = ["/entries", "/days", "/tasks", "/activities", "/goals", "/pomodoro", "/habits", "/backup", "/auth", "/ai", "/health", "/docs", "/openapi.json"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}));
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

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (!isAppFile(req)) return;
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("index.html").then(function (h) { return h || caches.match("./"); });
        return Response.error();
      });
    })
  );
});
