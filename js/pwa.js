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

  if (!("serviceWorker" in navigator) || window.Capacitor || !/^https?:$/.test(location.protocol)) return;
  if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return; // needs https
  navigator.serviceWorker.register("sw.js").then(function (reg) {
    reg.addEventListener("updatefound", function () {
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", function () {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast("A new version of Logbook is ready", "ok", {
            duration: 15000,
            action: { label: "Reload", run: function () { worker.postMessage("skip-waiting"); } }
          });
        }
      });
    });
  }).catch(function (e) { console.warn("logbook: offline mode unavailable", e); });
  var reloading = false;
  // a first visit gets its first worker without a reload (it would wipe
  // whatever was typed meanwhile, like a half-filled login); only an update
  // that replaces a running worker reloads
  var hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
