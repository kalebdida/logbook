import { apiListDeadlines, apiCreateDeadline, apiUpdateDeadline, apiDeleteDeadline } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { dateKey } from './dayRecord.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';

/* Dates that matter: application deadlines, exams, events. The "Coming up"
   card on Today counts down to them, the nearest one shows in the hero, and
   the calendar marks their days. */

export var KINDS = {
  deadline: { label: "Deadline", icon: "flag" },
  exam: { label: "Exam", icon: "graduation-cap" },
  event: { label: "Event", icon: "calendar-days" }
};

var SHOWN = 4;
var items = [];
var loaded = false;
var managing = false;
var showAll = false;

export function daysUntil(dateStr, from) {
  var a = new Date((from || dateKey(new Date())) + "T00:00:00");
  var b = new Date(dateStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export function countdownLabel(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return -days + " days ago";
  if (days < 14) return "In " + days + " days";
  if (days < 60) return "In " + Math.round(days / 7) + " weeks";
  return "In " + Math.round(days / 30.4) + " months";
}

function urgency(days) {
  if (days < 0) return "past";
  if (days <= 3) return "soon";
  if (days <= 14) return "near";
  return "far";
}

/* Open items, nearest first (missed ones from the last 2 weeks stay on top
   until they're checked off or deleted). */
export function upcoming() {
  var today = dateKey(new Date());
  return items.filter(function (d) { return !d.done && daysUntil(d.dueDate, today) >= -14; })
    .sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate) || a.id - b.id; });
}

export function deadlinesOn(day) {
  return items.filter(function (d) { return d.dueDate === day; });
}

export async function loadDeadlines() {
  items = await apiListDeadlines();
  loaded = true;
  return items;
}

function niceDate(dateStr) {
  var d = new Date(dateStr + "T00:00:00");
  var sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

function row(d) {
  var days = daysUntil(d.dueDate);
  var k = KINDS[d.kind] || KINDS.deadline;
  var big = days < 0 ? "!" : days > 99 ? Math.round(days / 7) + "w" : String(days);
  var small = days < 0 ? "missed" : days === 0 ? "today" : days > 99 ? "" : days === 1 ? "day" : "days";
  return '<li class="due-row due-row--' + urgency(days) + '" data-due-id="' + d.id + '">' +
    '<span class="due-count" aria-hidden="true"><b>' + big + "</b>" + (small ? "<small>" + small + "</small>" : "") + "</span>" +
    '<span class="due-text">' +
      '<span class="due-title">' + escapeHtml(d.title) + "</span>" +
      '<span class="due-meta">' + icon(k.icon) + "<span>" + k.label + " · " + niceDate(d.dueDate) + " · " + countdownLabel(days) + "</span></span>" +
    "</span>" +
    (managing
      ? '<button type="button" class="icon-btn icon-btn--quiet" data-due-delete aria-label="Delete ' + escapeHtml(d.title) + '">' + icon("trash-2") + "</button>"
      : '<button type="button" class="icon-btn icon-btn--quiet due-done" data-due-done aria-label="Mark ' + escapeHtml(d.title) + ' done" title="Done">' + icon("check") + "</button>") +
  "</li>";
}

function draw() {
  var el = document.getElementById("deadlinesSection");
  if (!el) return;
  var list = upcoming();
  var shown = showAll ? list : list.slice(0, SHOWN);
  var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 7);
  el.innerHTML =
    '<div class="card due-card">' +
      '<div class="habits-head">' +
        '<h3 class="daily-section-title">' + icon("hourglass") + "<span>Coming up</span></h3>" +
        (list.length ? '<button type="button" class="link-btn" data-due-manage>' + (managing ? "Done" : "Edit") + "</button>" : "") +
      "</div>" +
      (list.length
        ? '<ul class="due-list">' + shown.map(row).join("") + "</ul>" +
          (list.length > SHOWN ? '<button type="button" class="link-btn due-more" data-due-more>' + (showAll ? "Show less" : "Show " + (list.length - SHOWN) + " more") + "</button>" : "")
        : '<p class="habits-empty">Application deadlines, exams, anything with a date. Each one counts down here and shows on the calendar.</p>') +
      '<form class="due-add" autocomplete="off">' +
        '<input class="text-input" name="title" maxlength="300" placeholder="What\'s due" aria-label="What\'s due" required>' +
        '<input class="text-input due-date-input" type="date" name="date" aria-label="Date" value="' + dateKey(tomorrow) + '" required>' +
        '<select class="select-input" name="kind" aria-label="Kind">' +
          Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k].label + "</option>"; }).join("") +
        "</select>" +
        '<button type="submit" class="tool-btn tool-btn--add">' + icon("plus") + "<span>Add</span></button>" +
      "</form>" +
    "</div>";
}

async function onSubmit(e) {
  var form = e.target.closest(".due-add");
  if (!form) return;
  e.preventDefault();
  var title = form.elements.title.value.trim();
  var date = form.elements.date.value;
  if (!title || !date) return;
  try {
    var made = await apiCreateDeadline({ title: title, dueDate: date, kind: form.elements.kind.value });
    items.push(made);
    draw();
    emitChange("deadlines");
    var days = daysUntil(made.dueDate);
    toast(days >= 0 ? title + ": " + countdownLabel(days).toLowerCase() : "Added");
    var input = document.querySelector("#deadlinesSection .due-add [name=title]");
    if (input) input.focus();
  } catch (err) {
    toast("Couldn't add it", "error");
  }
}

async function onClick(e) {
  var el = e.target;
  if (el.closest("[data-due-manage]")) { managing = !managing; return draw(); }
  if (el.closest("[data-due-more]")) { showAll = !showAll; return draw(); }
  var rowEl = el.closest("[data-due-id]");
  if (!rowEl) return;
  var id = Number(rowEl.getAttribute("data-due-id"));
  var item = items.find(function (d) { return d.id === id; });
  if (!item) return;
  if (el.closest("[data-due-done]")) {
    rowEl.classList.add("is-leaving");
    try {
      var updated = await apiUpdateDeadline(id, { done: true });
      Object.assign(item, updated);
      setTimeout(draw, 260);
      emitChange("deadlines");
      toast("Done: " + item.title, "ok", { action: { label: "Undo", run: async function () {
        Object.assign(item, await apiUpdateDeadline(id, { done: false }));
        draw();
        emitChange("deadlines");
      } } });
    } catch (err) {
      rowEl.classList.remove("is-leaving");
      toast("Couldn't update it", "error");
    }
    return;
  }
  if (el.closest("[data-due-delete]")) {
    try {
      await apiDeleteDeadline(id);
      items = items.filter(function (d) { return d.id !== id; });
      if (!upcoming().length) managing = false;
      draw();
      emitChange("deadlines");
      toast("Deleted", "ok", { action: { label: "Undo", run: async function () {
        items.push(await apiCreateDeadline(item));
        draw();
        emitChange("deadlines");
      } } });
    } catch (err) {
      toast("Couldn't delete it", "error");
    }
  }
}

var wired = false;
export async function renderDeadlines() {
  var el = document.getElementById("deadlinesSection");
  try {
    await loadDeadlines();
  } catch (e) {
    if (e.status === 404) { if (el) el.hidden = true; return; }   // an older server
    throw e;
  }
  if (!el) return;
  el.hidden = false;
  draw();
  if (!wired) {
    wired = true;
    el.addEventListener("submit", onSubmit);
    el.addEventListener("click", onClick);
  }
}

export function deadlinesLoaded() { return loaded; }
