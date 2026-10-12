import { icon } from './icons.js';
import { toast } from './toast.js';

/* "Send it": the system share menu where the browser has one, otherwise
   (the Android app's web view) our own sheet with the apps people actually
   use. Each app opens with the message already typed. */

var APPS = [
  { id: "telegram", label: "Telegram", icon: "send", url: function (t) { return "https://t.me/share/url?url=" + encodeURIComponent(t); } },
  { id: "whatsapp", label: "WhatsApp", icon: "message-circle", url: function (t) { return "https://wa.me/?text=" + encodeURIComponent(t); } },
  { id: "sms", label: "Text message", icon: "smartphone", url: function (t) { return "sms:?body=" + encodeURIComponent(t); } },
  { id: "email", label: "Email", icon: "mail", url: function (t, subject) { return "mailto:?subject=" + encodeURIComponent(subject || "Logbook") + "&body=" + encodeURIComponent(t); } }
];

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch (e) { prompt("Copy this:", text); }
}

export async function shareText(text, subject) {
  var inApp = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!inApp && navigator.share) {
    try { await navigator.share({ text: text, title: subject }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  openSheet(text, subject);
}

function openSheet(text, subject) {
  var phone = window.matchMedia("(max-width: 640px)").matches;
  var backdrop = document.createElement("div");
  backdrop.className = "picker-backdrop";
  var pop = document.createElement("div");
  pop.className = "picker-pop share-pop is-sheet" + (phone ? "" : " is-center");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Send with");
  pop.innerHTML = '<p class="picker-head">Send with</p>' +
    '<div class="share-grid">' +
      APPS.map(function (a) {
        return '<a class="share-app share-app--' + a.id + '" href="' + a.url(text, subject).replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' +
          '<span class="share-icon">' + icon(a.icon) + "</span><span>" + a.label + "</span></a>";
      }).join("") +
      '<button type="button" class="share-app share-app--copy" data-share-copy><span class="share-icon">' + icon("copy") + "</span><span>Copy</span></button>" +
    "</div>";
  document.body.appendChild(backdrop);
  document.body.appendChild(pop);
  function close() {
    document.removeEventListener("keydown", onKey, true);
    pop.classList.add("is-leaving");
    backdrop.classList.add("is-leaving");
    setTimeout(function () { pop.remove(); backdrop.remove(); }, 180);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey, true);
  backdrop.addEventListener("click", close);
  pop.addEventListener("click", function (e) {
    if (e.target.closest("[data-share-copy]")) { copyText(text); return close(); }
    if (e.target.closest(".share-app")) setTimeout(close, 150);
  });
  var first = pop.querySelector(".share-app");
  if (first) first.focus({ preventScroll: true });
}
