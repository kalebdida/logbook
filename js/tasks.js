import { apiListTasks, apiCreateTask, apiUpdateTask, apiDeleteTask } from './api.js';
import { categoryById, categoryOptions, categoryIcon } from './categories.js';
import { icon } from './icons.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

/* Today's checklist. A task can carry a life area so finishing it counts
   on the density map. Unfinished tasks from earlier days can be pulled
   into today in one click. */
var state = { day: null, tasks: [], carry: [], container: null };

export async function renderTasks(container, day) {
  state.container = container;
  state.day = day;
  var results = await Promise.all([
    apiListTasks({ day_date: day }),
    apiListTasks({ before: day, completed: false })
  ]);
  state.tasks = results[0];
  state.carry = results[1];
  draw();
  container.onsubmit = handleSubmit;
  container.onchange = handleChange;
  container.onclick = handleClick;
}

export function getTodayTasks() {
  return state.tasks.slice();
}

function draw() {
  var done = state.tasks.filter(function (t) { return t.completed; }).length;
  var total = state.tasks.length;

  var carry = state.carry.length
    ? '<div class="carry-hint carry-hint--tasks">' +
        "<span>" + state.carry.length + " unfinished from earlier days</span>" +
        '<button type="button" class="link-btn" data-task-action="carry">bring them to today</button>' +
      "</div>"
    : "";

  var list = state.tasks.length
    ? '<ul class="task-list">' + state.tasks.map(taskRow).join("") + "</ul>"
    : '<p class="empty-line">nothing on the list yet. add the first thing below.</p>';

  state.container.innerHTML =
    carry +
    (total ? '<div class="task-progress" aria-label="' + done + " of " + total + ' done"><span style="width:' + Math.round((done / total) * 100) + '%"></span></div>' : "") +
    list +
    '<form class="inline-form" data-form="task" autocomplete="off">' +
      '<input class="text-input" name="title" maxlength="300" placeholder="add a task" aria-label="new task" required>' +
      '<select class="select-input" name="category" aria-label="life area">' + categoryOptions("", "area") + "</select>" +
      '<button type="submit" class="tool-btn tool-btn--add">' + icon("plus") + "<span>add</span></button>" +
    "</form>";
}

function taskRow(t) {
  var cat = categoryById(t.activityCategory);
  return (
    '<li class="task-row' + (t.completed ? " is-done" : "") + '" data-task-id="' + t.id + '">' +
      '<label class="task-check">' +
        '<input type="checkbox" class="check" data-task-toggle="' + t.id + '"' + (t.completed ? " checked" : "") + ">" +
        '<span class="check-box" aria-hidden="true">' + icon("check") + "</span>" +
        '<span class="task-title">' + escapeHtml(t.title) + "</span>" +
      "</label>" +
      (cat ? '<span class="area-tag" title="' + cat.label + '">' + categoryIcon(cat) + "<span>" + cat.label.toLowerCase() + "</span></span>" : "") +
      '<button type="button" class="icon-btn icon-btn--quiet" data-task-action="delete" data-task-id="' + t.id + '" aria-label="delete task">' + icon("x") + "</button>" +
    "</li>"
  );
}

async function handleSubmit(e) {
  var form = e.target.closest('[data-form="task"]');
  if (!form) return;
  e.preventDefault();
  var title = form.elements.title.value.trim();
  if (!title) return;
  try {
    var task = await apiCreateTask({ dayDate: state.day, title: title, activityCategory: form.elements.category.value || null });
    state.tasks.push(task);
    draw();
    var input = state.container.querySelector('[data-form="task"] input[name="title"]');
    if (input) input.focus();
    emitChange("tasks");
  } catch (err) {
    toast("couldn't add the task", "error");
  }
}

async function handleChange(e) {
  var id = e.target.getAttribute("data-task-toggle");
  if (!id) return;
  var task = state.tasks.find(function (t) { return String(t.id) === id; });
  if (!task) return;
  var completed = e.target.checked;
  try {
    var updated = await apiUpdateTask(task.id, { completed: completed });
    Object.assign(task, updated);
    draw();
    emitChange("tasks");
    var remaining = state.tasks.filter(function (t) { return !t.completed; }).length;
    if (completed && remaining === 0) toast("all tasks done. good day's work.");
  } catch (err) {
    e.target.checked = !completed;
    toast("couldn't update the task", "error");
  }
}

async function handleClick(e) {
  var btn = e.target.closest("[data-task-action]");
  if (!btn) return;
  var action = btn.getAttribute("data-task-action");

  if (action === "delete") {
    var id = Number(btn.getAttribute("data-task-id"));
    var removed = state.tasks.find(function (t) { return t.id === id; });
    try {
      await apiDeleteTask(id);
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      draw();
      emitChange("tasks");
      toast("task deleted", "ok", {
        action: {
          label: "undo",
          run: async function () {
            var back = await apiCreateTask({ dayDate: removed.dayDate, title: removed.title, activityCategory: removed.activityCategory, completed: removed.completed });
            if (removed.completed) back = await apiUpdateTask(back.id, { completed: true });
            state.tasks.push(back);
            draw();
            emitChange("tasks");
          }
        }
      });
    } catch (err) {
      toast("couldn't delete the task", "error");
    }
  }

  if (action === "carry") {
    btn.disabled = true;
    try {
      var moved = await Promise.all(state.carry.map(function (t) { return apiUpdateTask(t.id, { dayDate: state.day }); }));
      state.tasks = state.tasks.concat(moved);
      state.carry = [];
      draw();
      emitChange("tasks");
      toast("moved " + moved.length + " task" + (moved.length === 1 ? "" : "s") + " to today");
    } catch (err) {
      btn.disabled = false;
      toast("couldn't move the tasks", "error");
    }
  }
}
