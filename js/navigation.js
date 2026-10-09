/* Page switching. The current page lives in the URL hash (#journal), so a
   refresh keeps you where you were and the back button works. */
export var PAGES = ["dashboard", "journal", "calendar", "focus", "goals", "companion", "settings"];
var DEFAULT_TARGET = "dashboard";
var current = null;

function targetFromHash() {
  var name = (location.hash || "").replace(/^#\/?/, "");
  return PAGES.indexOf(name) >= 0 ? name : DEFAULT_TARGET;
}

function show(target) {
  if (target === current) return;
  current = target;

  Array.prototype.forEach.call(document.querySelectorAll(".nav-page"), function (page) {
    var active = page.getAttribute("data-nav-page") === target;
    page.hidden = !active;
    if (active) {
      page.classList.remove("page-enter");
      void page.offsetWidth;
      page.classList.add("page-enter");
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-nav-target]"), function (btn) {
    var active = btn.getAttribute("data-nav-target") === target;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  var title = document.getElementById("pageTitle");
  if (title) title.textContent = target;
  document.title = target === DEFAULT_TARGET ? "logbook" : target + " · logbook";
  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent("logbook:navigated", { detail: { page: target } }));
}

export function navigateTo(target) {
  if (PAGES.indexOf(target) < 0) return;
  if (location.hash !== "#" + target) location.hash = target;
  else show(target);
}

export function currentPage() {
  return current;
}

export function initNavigation() {
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-nav-target]");
    if (!btn) return;
    e.preventDefault();
    navigateTo(btn.getAttribute("data-nav-target"));
  });
  window.addEventListener("hashchange", function () { show(targetFromHash()); });
  show(targetFromHash());
}
