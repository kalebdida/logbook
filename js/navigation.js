/* Page switching. The current page lives in the URL hash (#journal), so a
   refresh keeps you where you were and the back button works. On phones the
   last three pages live behind "more" in the tab bar. */
export var PAGES = ["dashboard", "journal", "calendar", "focus", "goals", "companion", "settings"];
var LABELS = { dashboard: "today" };
var EXTRA = ["goals", "companion", "settings"];
var DEFAULT_TARGET = "dashboard";
var current = null;

function targetFromHash() {
  var name = (location.hash || "").replace(/^#\/?/, "");
  return PAGES.indexOf(name) >= 0 ? name : DEFAULT_TARGET;
}

export function pageLabel(target) {
  return LABELS[target] || target;
}

/* the soft light behind the active nav item slides to it */
function moveGlow() {
  var glow = document.querySelector(".nav-glow");
  var list = document.querySelector(".nav-list");
  if (!glow || !list) return;
  var active = list.querySelector(".sidebar-nav-item.active");
  if ((!active || active.offsetParent === null) && EXTRA.indexOf(current) >= 0) active = list.querySelector(".nav-more");
  if (!active || active.offsetParent === null) { glow.style.opacity = "0"; return; }
  glow.style.opacity = "";
  glow.style.width = active.offsetWidth + "px";
  glow.style.height = active.offsetHeight + "px";
  glow.style.transform = "translate(" + active.offsetLeft + "px, " + active.offsetTop + "px)";
}

function show(target) {
  if (target === current) return;
  current = target;
  closeMore();

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
  var more = document.querySelector(".nav-more");
  if (more) more.classList.toggle("is-holding", EXTRA.indexOf(target) >= 0);
  document.body.dataset.page = target;

  var title = document.getElementById("pageTitle");
  if (title) title.textContent = pageLabel(target);
  document.title = target === DEFAULT_TARGET ? "logbook" : pageLabel(target) + " · logbook";
  window.scrollTo(0, 0);
  moveGlow();
  document.dispatchEvent(new CustomEvent("logbook:navigated", { detail: { page: target } }));
}

/* ---------- the "more" sheet (phones) ---------- */

function openMore() {
  var sheet = document.getElementById("moreSheet");
  if (!sheet) return;
  sheet.hidden = false;
  document.body.classList.add("has-overlay");
  var btn = document.querySelector(".nav-more");
  if (btn) btn.setAttribute("aria-expanded", "true");
  var first = sheet.querySelector(".sheet-item");
  if (first) first.focus({ preventScroll: true });
}

export function closeMore() {
  var sheet = document.getElementById("moreSheet");
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  document.body.classList.remove("has-overlay");
  var btn = document.querySelector(".nav-more");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

export function isMoreOpen() {
  var sheet = document.getElementById("moreSheet");
  return Boolean(sheet && !sheet.hidden);
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
    if (e.target.closest("[data-more]")) {
      e.preventDefault();
      if (isMoreOpen()) closeMore(); else openMore();
      return;
    }
    if (e.target.closest("[data-more-close]")) { closeMore(); return; }
    if (e.target.closest("#moreSheet [data-command]")) closeMore();
    var btn = e.target.closest("[data-nav-target]");
    if (!btn) return;
    e.preventDefault();
    closeMore();
    navigateTo(btn.getAttribute("data-nav-target"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isMoreOpen()) closeMore();
  });
  window.addEventListener("hashchange", function () { show(targetFromHash()); });
  var t = null;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(moveGlow, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveGlow);
  show(targetFromHash());
}
