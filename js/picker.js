import { icon } from './icons.js';

/* Every <select> in the app gets this instead of the browser's plain list:
   a glass popover under the field on a computer, a sheet from the bottom on
   a phone. The real <select> stays underneath (invisible), so forms, values
   and change events work exactly as before; this only draws and picks. */

var enhanced = new WeakMap();      // select -> { wrap, button }
var openState = null;

function labelOf(sel) {
  var o = sel.options[sel.selectedIndex];
  return o ? o.textContent : "";
}

function sync(sel) {
  var e = enhanced.get(sel);
  if (!e) return;
  var o = sel.options[sel.selectedIndex];
  e.text.textContent = labelOf(sel);
  e.button.classList.toggle("is-placeholder", !o || o.value === "");
  e.button.disabled = sel.disabled;
}

/* a value set from code (sel.value = ...) fires no event: keep the label honest */
(function watchValue() {
  var proto = HTMLSelectElement.prototype;
  ["value", "selectedIndex"].forEach(function (prop) {
    var d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { d.set.call(this, v); if (enhanced.has(this)) sync(this); }
    });
  });
})();

function enhance(sel) {
  if (enhanced.has(sel) || sel.multiple || sel.size > 1 || sel.hasAttribute("data-native")) return;
  var wrap = document.createElement("span");
  wrap.className = "picker";
  // keep the field's own sizing classes on the wrapper
  sel.classList.forEach(function (c) { if (/^(select-input|goals-select)(--|$)/.test(c)) wrap.classList.add("picker--" + c); });
  var button = document.createElement("button");
  button.type = "button";
  button.className = "picker-btn";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  var aria = sel.getAttribute("aria-label") || (sel.labels && sel.labels[0] ? sel.labels[0].textContent.trim() : "");
  if (aria) button.setAttribute("aria-label", aria);
  var text = document.createElement("span");
  text.className = "picker-text";
  button.appendChild(text);
  var chev = document.createElement("span");
  chev.className = "picker-chev";
  chev.setAttribute("aria-hidden", "true");
  chev.innerHTML = icon("chevron-down");
  button.appendChild(chev);
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  wrap.appendChild(button);
  sel.classList.add("picker-native");
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");
  enhanced.set(sel, { wrap: wrap, button: button, text: text });
  sync(sel);
  sel.addEventListener("change", function () { sync(sel); });
  button.addEventListener("click", function () { if (openState && openState.sel === sel) close(); else open(sel); });
  button.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(sel); }
  });
  // labels that point at the select open the picker instead
  if (sel.labels) Array.prototype.forEach.call(sel.labels, function (l) {
    l.addEventListener("click", function (e) { if (!wrap.contains(e.target)) { e.preventDefault(); button.focus(); } });
  });
}

function choose(sel, idx) {
  if (sel.selectedIndex !== idx) {
    sel.selectedIndex = idx;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  sync(sel);
}

function open(sel) {
  close();
  var e = enhanced.get(sel);
  var phone = window.matchMedia("(max-width: 640px)").matches;
  var pop = document.createElement("div");
  pop.className = "picker-pop" + (phone ? " is-sheet" : "");
  var list = document.createElement("ul");
  list.className = "picker-list";
  list.setAttribute("role", "listbox");
  if (e.button.getAttribute("aria-label")) list.setAttribute("aria-label", e.button.getAttribute("aria-label"));
  var items = [];
  Array.prototype.forEach.call(sel.options, function (o, i) {
    if (o.hidden) return;
    var li = document.createElement("li");
    li.className = "picker-opt" + (i === sel.selectedIndex ? " is-on" : "") + (o.value === "" ? " is-none" : "");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === sel.selectedIndex));
    if (o.disabled) li.setAttribute("aria-disabled", "true");
    li.dataset.idx = i;
    li.innerHTML = '<span class="picker-opt-text"></span><span class="picker-tick" aria-hidden="true">' + icon("check") + "</span>";
    li.firstChild.textContent = o.textContent;
    list.appendChild(li);
    items.push(li);
  });
  if (phone) {
    var head = document.createElement("p");
    head.className = "picker-head";
    head.textContent = e.button.getAttribute("aria-label") || "Choose";
    pop.appendChild(head);
  }
  pop.appendChild(list);
  var backdrop = null;
  if (phone) {
    backdrop = document.createElement("div");
    backdrop.className = "picker-backdrop";
    document.body.appendChild(backdrop);
  }
  document.body.appendChild(pop);
  if (!phone) place(pop, e.button);
  e.button.setAttribute("aria-expanded", "true");
  e.wrap.classList.add("is-open");

  var active = Math.max(0, items.findIndex(function (li) { return Number(li.dataset.idx) === sel.selectedIndex; }));
  function mark() {
    items.forEach(function (li, k) { li.classList.toggle("is-active", k === active); });
    if (items[active]) items[active].scrollIntoView({ block: "nearest" });
  }
  mark();

  function onKey(ev) {
    if (ev.key === "Escape") { ev.preventDefault(); close(true); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      if (items[active] && items[active].getAttribute("aria-disabled") !== "true") { choose(sel, Number(items[active].dataset.idx)); close(true); }
    } else if (ev.key === "Tab") close();
    else if (ev.key.length === 1) {
      var k = items.findIndex(function (li) { return li.textContent.trim().toLowerCase().indexOf(ev.key.toLowerCase()) === 0; });
      if (k >= 0) { active = k; mark(); }
    }
  }
  function onDown(ev) {
    if (pop.contains(ev.target) || e.wrap.contains(ev.target)) return;
    close();
  }
  list.addEventListener("click", function (ev) {
    var li = ev.target.closest(".picker-opt");
    if (!li || li.getAttribute("aria-disabled") === "true") return;
    choose(sel, Number(li.dataset.idx));
    close(true);
  });
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  window.addEventListener("resize", closeNow);
  window.addEventListener("scroll", onScroll, true);
  function onScroll(ev) { if (!phone && !pop.contains(ev.target)) close(); }
  function closeNow() { close(); }

  openState = {
    sel: sel,
    close: function (refocus) {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", closeNow);
      window.removeEventListener("scroll", onScroll, true);
      e.button.setAttribute("aria-expanded", "false");
      e.wrap.classList.remove("is-open");
      pop.classList.add("is-leaving");
      if (backdrop) backdrop.classList.add("is-leaving");
      setTimeout(function () { pop.remove(); if (backdrop) backdrop.remove(); }, 180);
      if (refocus) e.button.focus();
    }
  };
}

function place(pop, button) {
  var r = button.getBoundingClientRect();
  var width = Math.max(r.width, 180);
  pop.style.minWidth = width + "px";
  var below = window.innerHeight - r.bottom;
  var h = Math.min(pop.scrollHeight, 320);
  var up = below < h + 16 && r.top > below;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + "px";
  if (up) { pop.style.bottom = (window.innerHeight - r.top + 6) + "px"; pop.classList.add("is-up"); }
  else pop.style.top = (r.bottom + 6) + "px";
}

function close(refocus) {
  if (!openState) return;
  var s = openState;
  openState = null;
  s.close(refocus);
}

function scan(root) {
  if (root.tagName === "SELECT") return enhance(root);
  if (root.querySelectorAll) root.querySelectorAll("select").forEach(enhance);
}

export function startPickers() {
  scan(document.body);
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      r.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
      if (r.type === "childList" && r.target.tagName === "SELECT") sync(r.target);
    });
  }).observe(document.body, { childList: true, subtree: true });
}
