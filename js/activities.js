import { apiListActivities, apiCreateActivity, apiDeleteActivity } from './api.js';
import { CATEGORIES, categoryById } from './categories.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

/* Log what you actually did today, by life area, with how long it took.
   This is what feeds the density map with real evidence. */
var state = { day: null, items: [], container: null, picked: null };

export async function renderActivities(container, day) {
  state.container = container;
  state.day = day;
  state.items = await apiListActivities({ day_date: day });
  draw();
  container.onclick = handleClick;
  container.onsubmit = handleSubmit;
}

export function getTodayActivities() {
  return state.items.slice();
}

function totalMinutes() {
  return state.items.reduce(function (sum, a) { return sum + (a.durationMinutes || 0); }, 0);
}

function draw() {
  var chips = CATEGORIES.map(function (c) {
    var on = state.picked === c.id;
    return '<button type="button" class="area-chip' + (on ? " is-on" : "") + '" data-area="' + c.id + '" aria-pressed="' + on + '">' +
      '<span aria-hidden="true">' + c.icon + "</span> " + c.label.toLowerCase() + "</button>";
  }).join("");

  var list = state.items.length
    ? '<ul class="activity-list">' + state.items.map(row).join("") + "</ul>"
    : '<p class="empty-line">nothing logged yet. pick an area, add minutes, log it.</p>';

  var total = totalMinutes();
  state.container.innerHTML =
    '<div class="area-chips" role="group" aria-label="life area">' + chips + "</div>" +
    '<form class="inline-form" data-form="activity" autocomplete="off">' +
      '<input class="text-input" name="title" maxlength="300" placeholder="' + (state.picked ? "what did you do?" : "pick an area first") + '" aria-label="activity">' +
      '<input class="text-input text-input--num" name="minutes" type="number" min="1" max="1440" inputmode="numeric" placeholder="min" aria-label="minutes">' +
      '<button type="submit" class="tool-btn"' + (state.picked ? "" : " disabled") + ">log</button>" +
    "</form>" +
    list +
    (total ? '<div class="activity-total">' + formatMinutes(total) + " logged today</div>" : "");
}

function row(a) {
  var cat = categoryById(a.activityCategory);
  return (
    '<li class="activity-row">' +
      '<span class="activity-icon" aria-hidden="true">' + (cat ? cat.icon : "•") + "</span>" +
      '<span class="activity-title">' + escapeHtml(a.title) + "</span>" +
      (a.durationMinutes ? '<span class="activity-mins">' + formatMinutes(a.durationMinutes) + "</span>" : "") +
      '<button type="button" class="icon-btn" data-activity-delete="' + a.id + '" aria-label="delete activity">×</button>' +
    "</li>"
  );
}

function formatMinutes(m) {
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60);
  return h + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
}

async function handleClick(e) {
  var chip = e.target.closest("[data-area]");
  if (chip) {
    var id = chip.getAttribute("data-area");
    state.picked = state.picked === id ? null : id;
    var keep = state.container.querySelector('[data-form="activity"]');
    var title = keep ? keep.elements.title.value : "";
    var minutes = keep ? keep.elements.minutes.value : "";
    draw();
    var form = state.container.querySelector('[data-form="activity"]');
    form.elements.title.value = title;
    form.elements.minutes.value = minutes;
    if (state.picked) form.elements.title.focus();
    return;
  }

  var del = e.target.closest("[data-activity-delete]");
  if (del) {
    var aid = Number(del.getAttribute("data-activity-delete"));
    try {
      await apiDeleteActivity(aid);
      state.items = state.items.filter(function (a) { return a.id !== aid; });
      draw();
      emitChange("activities");
    } catch (err) {
      toast("couldn't delete that activity", "error");
    }
  }
}

async function handleSubmit(e) {
  var form = e.target.closest('[data-form="activity"]');
  if (!form) return;
  e.preventDefault();
  if (!state.picked) {
    toast("pick a life area first", "warn");
    return;
  }
  var cat = categoryById(state.picked);
  var title = form.elements.title.value.trim() || cat.label.toLowerCase();
  var minutes = parseInt(form.elements.minutes.value, 10);
  try {
    var created = await apiCreateActivity({
      dayDate: state.day,
      title: title,
      activityCategory: state.picked,
      durationMinutes: minutes > 0 ? Math.min(minutes, 1440) : null
    });
    state.items.push(created);
    draw();
    emitChange("activities");
    toast("logged " + cat.label.toLowerCase() + (created.durationMinutes ? ", " + formatMinutes(created.durationMinutes) : ""));
  } catch (err) {
    toast("couldn't log the activity", "error");
  }
}
