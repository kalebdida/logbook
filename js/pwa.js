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
    toast("logbook is installed. open it from your home screen or app list.");
    document.dispatchEvent(new CustomEvent("logbook:installable", { detail: { available: false } }));
  });

  if (!("serviceWorker" in navigator) || window.Capacitor || !/^https?:$/.test(location.protocol)) return;
  if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return; // needs https
  navigator.serviceWorker.register("sw.js").then(function (reg) {
    reg.addEventListener("updatefound", function () {
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", function () {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast("a new version of logbook is ready", "ok", {
            duration: 15000,
            action: { label: "reload", run: function () { worker.postMessage("skip-waiting"); } }
          });
        }
      });
    });
  }).catch(function (e) { console.warn("logbook: offline mode unavailable", e); });
  var reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
