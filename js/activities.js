import { apiListActivities, apiCreateActivity, apiDeleteActivity } from './api.js';
import { CATEGORIES, categoryById, categoryIcon } from './categories.js';
import { icon } from './icons.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

/* Log what you actually did today, by life area, with how long it took.
   This is what feeds the density map with real evidence. The areas are one
   row of chips (it scrolls sideways on a phone); picking one only lights it,
   so nothing you typed is lost and the row stays where you scrolled it. */
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

function draw() {
  var chips = CATEGORIES.map(function (c) {
    var on = state.picked === c.id;
    return '<button type="button" class="area-chip' + (on ? " is-on" : "") + '" data-area="' + c.id + '" aria-pressed="' + on + '">' +
      icon(c.icon) + "<span>" + c.label + "</span></button>";
  }).join("");

  state.container.innerHTML =
    '<div class="area-chips" role="group" aria-label="Life area">' + chips + "</div>" +
    '<form class="inline-form activity-add" data-form="activity" autocomplete="off">' +
      '<input class="text-input" name="title" maxlength="300" placeholder="What did you do?" aria-label="What you did" enterkeyhint="done">' +
      '<input class="text-input text-input--num" name="minutes" type="number" min="1" max="1440" inputmode="numeric" placeholder="Min" aria-label="Minutes" enterkeyhint="done">' +
      '<button type="submit" class="tool-btn tool-btn--add">' + icon("plus") + "<span>Log</span></button>" +
    "</form>" +
    '<div class="activity-items">' + listHtml() + "</div>";
}

function listHtml() {
  return state.items.length
    ? '<ul class="activity-list">' + state.items.map(row).join("") + "</ul>"
    : '<p class="empty-line">Nothing logged yet. Pick an area, say what you did, add the minutes.</p>';
}

function drawList() {
  var box = state.container.querySelector(".activity-items");
  if (box) box.innerHTML = listHtml();
  else draw();
}

function row(a) {
  var cat = categoryById(a.activityCategory);
  return (
    '<li class="activity-row">' +
      '<span class="activity-icon" aria-hidden="true">' + (cat ? categoryIcon(cat) : icon("activity")) + "</span>" +
      '<span class="activity-title">' + escapeHtml(a.title) + "</span>" +
      (a.durationMinutes ? '<span class="activity-mins">' + formatMinutes(a.durationMinutes) + "</span>" : "") +
      '<button type="button" class="icon-btn icon-btn--quiet activity-del" data-activity-delete="' + a.id + '" aria-label="Delete ' + escapeHtml(a.title) + '">' + icon("x") + "</button>" +
    "</li>"
  );
}

function formatMinutes(m) {
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60);
  return h + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
}

function setPicked(id) {
  state.picked = id;
  Array.prototype.forEach.call(state.container.querySelectorAll("[data-area]"), function (b) {
    var on = b.getAttribute("data-area") === id;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on);
  });
  var row = state.container.querySelector(".area-chips");
  if (row) row.classList.remove("needs-pick");
}

function isTouch() {
  try { return window.matchMedia("(hover: none)").matches; } catch (e) { return false; }
}

async function handleClick(e) {
  var chip = e.target.closest("[data-area]");
  if (chip) {
    var id = chip.getAttribute("data-area");
    setPicked(state.picked === id ? null : id);
    if (state.picked) {
      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      // on a phone, don't pop the keyboard just for picking an area
      if (!isTouch()) state.container.querySelector('[data-form="activity"] [name="title"]').focus();
    }
    return;
  }

  var del = e.target.closest("[data-activity-delete]");
  if (del) {
    var aid = Number(del.getAttribute("data-activity-delete"));
    var at = state.items.findIndex(function (a) { return a.id === aid; });
    var gone = state.items[at];
    if (!gone) return;
    del.disabled = true;
    try {
      await apiDeleteActivity(aid);
      state.items = state.items.filter(function (a) { return a.id !== aid; });
      drawList();
      emitChange("activities");
      toast("Removed from the time log", "ok", {
        action: {
          label: "Undo",
          run: async function () {
            try {
              var back = await apiCreateActivity({ dayDate: gone.dayDate, title: gone.title, activityCategory: gone.activityCategory, durationMinutes: gone.durationMinutes });
              state.items.splice(Math.min(at, state.items.length), 0, back);
              drawList();
              emitChange("activities");
            } catch (err) {
              toast("Couldn't bring it back", "error");
            }
          }
        }
      });
    } catch (err) {
      del.disabled = false;
      toast("Couldn't delete that activity", "error");
    }
  }
}

async function handleSubmit(e) {
  var form = e.target.closest('[data-form="activity"]');
  if (!form) return;
  e.preventDefault();
  if (!state.picked) {
    var chips = state.container.querySelector(".area-chips");
    if (chips) {
      chips.classList.remove("needs-pick");
      void chips.offsetWidth;
      chips.classList.add("needs-pick");
    }
    toast("Pick a life area first", "warn");
    return;
  }
  var cat = categoryById(state.picked);
  var title = form.elements.title.value.trim() || cat.label;
  var minutes = parseInt(form.elements.minutes.value, 10);
  var submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    var created = await apiCreateActivity({
      dayDate: state.day,
      title: title,
      activityCategory: state.picked,
      durationMinutes: minutes > 0 ? Math.min(minutes, 1440) : null
    });
    state.items.push(created);
    form.elements.title.value = "";
    form.elements.minutes.value = "";
    drawList();
    emitChange("activities");
    if (isTouch() && document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
    toast("Logged " + cat.label + (created.durationMinutes ? ", " + formatMinutes(created.durationMinutes) : ""));
  } catch (err) {
    toast("Couldn't log the activity", "error");
  } finally {
    if (submit) submit.disabled = false;
  }
}
