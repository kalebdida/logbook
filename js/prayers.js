import { apiListPrayers, apiCreatePrayer, apiUpdatePrayer, apiDeletePrayer } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { mascotSay, mascotReact } from './mascot.js';

/* A prayer journal: what you're praying for, and later how it was
   answered. The answered list is the point: looking back at it months
   later. */

var items = [];
var tab = "open";
var managing = false;
var answering = null;   // id of the prayer whose answer is being written

function since(iso) {
  var days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  return days === 0 ? "today" : days === 1 ? "1 day" : days < 60 ? days + " days" : Math.round(days / 30.4) + " months";
}

function short(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function openRow(p) {
  var writing = answering === p.id;
  return '<li class="prayer-row" data-prayer-id="' + p.id + '">' +
    '<span class="prayer-text">' + escapeHtml(p.text) + '<small>Praying for ' + since(p.createdAt) + "</small></span>" +
    (managing
      ? '<button type="button" class="icon-btn icon-btn--quiet" data-prayer-delete aria-label="Delete">' + icon("trash-2") + "</button>"
      : '<button type="button" class="chip prayer-answered" data-prayer-answer>' + icon("check") + "<span>Answered</span></button>") +
    (writing
      ? '<form class="prayer-answer-form" autocomplete="off">' +
          '<input class="text-input" name="answer" maxlength="4000" placeholder="How was it answered? (optional)" aria-label="How was it answered">' +
          '<button type="submit" class="tool-btn">' + icon("check") + "<span>Save</span></button>" +
          '<button type="button" class="icon-btn icon-btn--quiet" data-prayer-cancel aria-label="Cancel">' + icon("x") + "</button>" +
        "</form>"
      : "") +
  "</li>";
}

function answeredRow(p) {
  return '<li class="prayer-row is-answered" data-prayer-id="' + p.id + '">' +
    '<span class="prayer-text">' + escapeHtml(p.text) +
      (p.answer ? '<span class="prayer-answer">' + escapeHtml(p.answer) + "</span>" : "") +
      "<small>Answered " + short(p.answeredAt) + " · prayed " + since(p.createdAt).replace("today", "a day") + "</small></span>" +
    (managing
      ? '<button type="button" class="icon-btn icon-btn--quiet" data-prayer-delete aria-label="Delete">' + icon("trash-2") + "</button>"
      : '<button type="button" class="icon-btn icon-btn--quiet" data-prayer-reopen aria-label="Move back to praying" title="Still praying">' + icon("history") + "</button>") +
  "</li>";
}

function draw() {
  var el = document.getElementById("prayersSection");
  if (!el) return;
  var open = items.filter(function (p) { return !p.answeredAt; });
  var answered = items.filter(function (p) { return p.answeredAt; })
    .sort(function (a, b) { return b.answeredAt.localeCompare(a.answeredAt); });
  var list = tab === "open" ? open : answered;
  el.innerHTML =
    '<div class="card prayer-card">' +
      '<div class="habits-head">' +
        '<h3 class="daily-section-title">' + icon("hand-heart") + "<span>Prayers</span></h3>" +
        (items.length ? '<button type="button" class="link-btn" data-prayer-manage>' + (managing ? "Done" : "Edit") + "</button>" : "") +
      "</div>" +
      (items.length
        ? '<div class="segmented prayer-tabs" role="tablist" aria-label="Prayers">' +
            '<button type="button" role="tab" class="seg-btn' + (tab === "open" ? " active" : "") + '" aria-selected="' + (tab === "open") + '" data-prayer-tab="open">Praying <span class="seg-count">' + open.length + "</span></button>" +
            '<button type="button" role="tab" class="seg-btn' + (tab === "answered" ? " active" : "") + '" aria-selected="' + (tab === "answered") + '" data-prayer-tab="answered">Answered <span class="seg-count">' + answered.length + "</span></button>" +
          "</div>"
        : "") +
      (list.length
        ? '<ul class="prayer-list">' + list.map(tab === "open" ? openRow : answeredRow).join("") + "</ul>"
        : '<p class="habits-empty">' + (items.length
            ? (tab === "open" ? "Nothing open right now." : "When a prayer is answered, mark it. This list becomes something to look back on.")
            : "Write down what you're praying for. When it's answered, mark it, and keep a record of how.") + "</p>") +
      (tab === "open"
        ? '<form class="prayer-add" autocomplete="off">' +
            '<input class="text-input" name="text" maxlength="4000" placeholder="Something to pray for" aria-label="Something to pray for" required>' +
            '<button type="submit" class="tool-btn tool-btn--add">' + icon("plus") + "<span>Add</span></button>" +
          "</form>"
        : "") +
    "</div>";
  if (answering) {
    var input = el.querySelector(".prayer-answer-form input");
    if (input) input.focus();
  }
}

async function onSubmit(e) {
  var form = e.target;
  if (form.classList.contains("prayer-add")) {
    e.preventDefault();
    var text = form.elements.text.value.trim();
    if (!text) return;
    try {
      items.unshift(await apiCreatePrayer(text));
      draw();
      emitChange("prayers");
      var again = document.querySelector("#prayersSection .prayer-add input");
      if (again) again.focus();
    } catch (err) {
      toast("Couldn't save it", "error");
    }
    return;
  }
  if (form.classList.contains("prayer-answer-form")) {
    e.preventDefault();
    var id = answering;
    var answer = form.elements.answer.value.trim();
    try {
      var updated = await apiUpdatePrayer(id, { answered: true, answer: answer });
      var item = items.find(function (p) { return p.id === id; });
      if (item) Object.assign(item, updated);
      answering = null;
      draw();
      emitChange("prayers");
      mascotReact("happy");
      mascotSay("Answered. Worth remembering.");
      toast("Marked answered");
    } catch (err) {
      toast("Couldn't save it", "error");
    }
  }
}

async function onClick(e) {
  var el = e.target;
  var tabBtn = el.closest("[data-prayer-tab]");
  if (tabBtn) { tab = tabBtn.getAttribute("data-prayer-tab"); answering = null; return draw(); }
  if (el.closest("[data-prayer-manage]")) { managing = !managing; answering = null; return draw(); }
  if (el.closest("[data-prayer-cancel]")) { answering = null; return draw(); }
  var rowEl = el.closest("[data-prayer-id]");
  if (!rowEl) return;
  var id = Number(rowEl.getAttribute("data-prayer-id"));
  var item = items.find(function (p) { return p.id === id; });
  if (!item) return;
  if (el.closest("[data-prayer-answer]")) { answering = id; return draw(); }
  if (el.closest("[data-prayer-reopen]")) {
    try {
      Object.assign(item, await apiUpdatePrayer(id, { answered: false }));
      draw();
      emitChange("prayers");
    } catch (err) { toast("Couldn't update it", "error"); }
    return;
  }
  if (el.closest("[data-prayer-delete]")) {
    try {
      await apiDeletePrayer(id);
      items = items.filter(function (p) { return p.id !== id; });
      if (!items.length) managing = false;
      draw();
      emitChange("prayers");
      toast("Deleted", "ok", { action: { label: "Undo", run: async function () {
        var back = await apiCreatePrayer(item.text);
        if (item.answeredAt) back = await apiUpdatePrayer(back.id, { answered: true, answer: item.answer });
        items.push(back);
        draw();
        emitChange("prayers");
      } } });
    } catch (err) { toast("Couldn't delete it", "error"); }
  }
}

var wired = false;
export async function renderPrayers() {
  var el = document.getElementById("prayersSection");
  if (!el) return;
  try {
    items = await apiListPrayers();
  } catch (e) {
    if (e.status === 404) { el.hidden = true; return; }
    throw e;
  }
  el.hidden = false;
  draw();
  if (!wired) {
    wired = true;
    el.addEventListener("submit", onSubmit);
    el.addEventListener("click", onClick);
  }
}
