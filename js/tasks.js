import { apiListTasks, apiCreateTask, apiUpdateTask, apiDeleteTask } from './api.js';
import { categoryById, categoryOptions, categoryIcon } from './categories.js';
import { icon } from './icons.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

/* A checklist for one day. Today's list can pull in unfinished tasks from
   earlier days; tomorrow's list is how you plan tomorrow (there is no
   separate "tomorrow's plan" box any more). A task can carry a life area so
   finishing it counts on the density map. */
var lists = {};   // key ("today" | "tomorrow") -> list state

export async function renderTasks(container, day, opts) {
  opts = opts || {};
  var key = opts.key || "today";
  var list = { key: key, day: day, tasks: [], carry: [], container: container, opts: opts };
  lists[key] = list;
  var results = await Promise.all([
    apiListTasks({ day_date: day }),
    opts.carry === false ? Promise.resolve([]) : apiListTasks({ before: day, completed: false })
  ]);
  list.tasks = results[0];
  list.carry = results[1];
  draw(list);
  container.onsubmit = function (e) { handleSubmit(list, e); };
  container.onchange = function (e) { handleChange(list, e); };
  container.onclick = function (e) { handleClick(list, e); };
}

export function getTodayTasks() {
  return lists.today ? lists.today.tasks.slice() : [];
}

/* Add tasks to today's list from elsewhere (the brain dump). */
export async function addTodayTasks(titles) {
  var list = lists.today;
  if (!list) return 0;
  var made = await Promise.all(titles.map(function (title) {
    return apiCreateTask({ dayDate: list.day, title: title.slice(0, 300), activityCategory: null });
  }));
  list.tasks = list.tasks.concat(made);
  draw(list);
  emitChange("tasks");
  return made.length;
}

function draw(list) {
  var done = list.tasks.filter(function (t) { return t.completed; }).length;
  var total = list.tasks.length;
  var o = list.opts;

  var carry = list.carry.length
    ? '<div class="carry-hint carry-hint--tasks">' + icon("history") +
        "<span>" + list.carry.length + " unfinished from earlier</span>" +
        '<button type="button" class="link-btn" data-task-action="carry">Bring to today</button>' +
      "</div>"
    : "";

  var items = list.tasks.length
    ? '<ul class="task-list">' + list.tasks.map(taskRow).join("") + "</ul>"
    : '<p class="empty-line">' + (o.empty || "Nothing on the list yet.") + "</p>";

  list.container.innerHTML =
    carry +
    (total && o.progress !== false ? '<div class="task-progress" aria-label="' + done + " of " + total + ' done"><span style="width:' + Math.round((done / total) * 100) + '%"></span></div>' : "") +
    items +
    '<form class="inline-form task-add" data-form="task" autocomplete="off">' +
      '<span class="task-add-icon" aria-hidden="true">' + icon("plus") + "</span>" +
      '<input class="text-input" name="title" maxlength="300" placeholder="' + (o.placeholder || "Add a task") + '" aria-label="' + (o.label || "New task") + '" required>' +
      '<select class="select-input" name="category" aria-label="Life area">' + categoryOptions("", "No area") + "</select>" +
      '<button type="submit" class="sr-only">Add</button>' +
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
      (cat ? '<span class="area-tag" title="' + cat.label + '">' + categoryIcon(cat) + "<span>" + cat.label + "</span></span>" : "") +
      '<button type="button" class="icon-btn icon-btn--quiet" data-task-action="delete" data-task-id="' + t.id + '" aria-label="Delete task">' + icon("x") + "</button>" +
    "</li>"
  );
}

async function handleSubmit(list, e) {
  var form = e.target.closest('[data-form="task"]');
  if (!form) return;
  e.preventDefault();
  var title = form.elements.title.value.trim();
  if (!title) return;
  var area = form.elements.category.value || null;
  try {
    var task = await apiCreateTask({ dayDate: list.day, title: title, activityCategory: area });
    list.tasks.push(task);
    draw(list);
    var input = list.container.querySelector('[data-form="task"] input[name="title"]');
    var select = list.container.querySelector('[data-form="task"] select');
    if (select && area) select.value = area;   // keep the area for the next one
    if (input) input.focus();
    emitChange("tasks");
  } catch (err) {
    toast("Couldn't add the task", "error");
  }
}

async function handleChange(list, e) {
  var id = e.target.getAttribute("data-task-toggle");
  if (!id) return;
  var task = list.tasks.find(function (t) { return String(t.id) === id; });
  if (!task) return;
  var completed = e.target.checked;
  try {
    var updated = await apiUpdateTask(task.id, { completed: completed });
    Object.assign(task, updated);
    draw(list);
    emitChange("tasks");
    var remaining = list.tasks.filter(function (t) { return !t.completed; }).length;
    if (completed && remaining === 0 && list.key === "today") toast("All done for today. Good work.");
  } catch (err) {
    e.target.checked = !completed;
    toast("Couldn't update the task", "error");
  }
}

async function handleClick(list, e) {
  var btn = e.target.closest("[data-task-action]");
  if (!btn) return;
  var action = btn.getAttribute("data-task-action");

  if (action === "delete") {
    var id = Number(btn.getAttribute("data-task-id"));
    var removed = list.tasks.find(function (t) { return t.id === id; });
    try {
      await apiDeleteTask(id);
      list.tasks = list.tasks.filter(function (t) { return t.id !== id; });
      draw(list);
      emitChange("tasks");
      toast("Task deleted", "ok", {
        action: {
          label: "Undo",
          run: async function () {
            var back = await apiCreateTask({ dayDate: removed.dayDate, title: removed.title, activityCategory: removed.activityCategory, completed: removed.completed });
            if (removed.completed) back = await apiUpdateTask(back.id, { completed: true });
            list.tasks.push(back);
            draw(list);
            emitChange("tasks");
          }
        }
      });
    } catch (err) {
      toast("Couldn't delete the task", "error");
    }
  }

  if (action === "carry") {
    btn.disabled = true;
    try {
      var moved = await Promise.all(list.carry.map(function (t) { return apiUpdateTask(t.id, { dayDate: list.day }); }));
      list.tasks = list.tasks.concat(moved);
      list.carry = [];
      draw(list);
      emitChange("tasks");
      toast("Moved " + moved.length + " task" + (moved.length === 1 ? "" : "s") + " to today");
    } catch (err) {
      btn.disabled = false;
      toast("Couldn't move the tasks", "error");
    }
  }
}
