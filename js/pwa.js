/* Installable app + offline. Registers the service worker, keeps the
   browser's install prompt for the "install" button, and tells you when a
   new version is ready. Skipped inside the Android app (Capacitor serves
   the files itself). */
import { toast } from './toast.js';

var deferred = null;

export function canInstall() {
  return Boolean(deferred);
}

export function isInstalled() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true || Boolean(window.Capacitor);
  } catch (e) {
    return false;
  }
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  var choice = await deferred.userChoice;
  deferred = null;
  document.dispatchEvent(new CustomEvent("logbook:installable", { detail: { available: false } }));
  return choice && choice.outcome === "accepted";
}

export function startPWA() {
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    document.dispatchEvent(new CustomEvent("logbook:installable", { detail: { available: true } }));
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    toast("Logbook is installed. Open it from your home screen or app list.");
    document.dispatchEvent(new CustomEvent("logbook:installable", { detail: { available: false } }));
  });

  // the Android app loads the live site, so it keeps an offline copy like a browser does;
  // only a copy bundled inside the app (served from localhost) skips this
  if (!("serviceWorker" in navigator) || (window.Capacitor && location.hostname === "localhost") || !/^https?:$/.test(location.protocol)) return;
  if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return; // needs https
  navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("logbook: offline mode unavailable", e); });
  var reloading = false;
  var openedAt = Date.now();
  // a first visit gets its first worker without a reload (it would wipe
  // whatever was typed meanwhile, like a half-filled login). An update (a new
  // worker with the whole new copy saved) reloads straight away if the app
  // only just opened and nothing is being typed; otherwise it asks.
  var hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    var el = document.activeElement;
    var typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (Date.now() - openedAt < 20000 && !typing) {
      reloading = true;
      location.reload();
      return;
    }
    toast("Logbook updated", "ok", { duration: 15000, action: { label: "Reload", run: function () { reloading = true; location.reload(); } } });
  });
}
