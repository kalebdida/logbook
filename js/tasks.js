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
  // the add button shows once there's something to add
  container.oninput = function (e) {
    var form = e.target.closest('[data-form="task"]');
    if (!form || e.target.name !== "title") return;
    var go = form.querySelector(".task-add-go");
    if (go) go.hidden = !e.target.value.trim();
  };
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

function norm(title) {
  return String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/* What "Bring to today" would bring: one copy per title (the newest), and
   nothing that is already on today's list. Older copies stay on their own
   days, unfinished, which is what really happened on those days. */
function carryCandidates(list) {
  var have = {};
  list.tasks.forEach(function (t) { have[norm(t.title)] = true; });
  var picked = [];
  list.carry.slice()
    .sort(function (a, b) { return a.dayDate < b.dayDate ? 1 : a.dayDate > b.dayDate ? -1 : 0; })
    .forEach(function (t) {
      var k = norm(t.title);
      if (have[k]) return;
      have[k] = true;
      picked.push(t);
    });
  return picked;
}

function draw(list) {
  var done = list.tasks.filter(function (t) { return t.completed; }).length;
  var total = list.tasks.length;
  var o = list.opts;

  var bring = carryCandidates(list);
  var preview = bring.slice(0, 3).map(function (t) { return escapeHtml(t.title); }).join(", ") + (bring.length > 3 ? " and " + (bring.length - 3) + " more" : "");
  var carry = bring.length
    ? '<div class="carry-hint carry-hint--tasks">' + icon("history") +
        '<span class="carry-text"><span class="carry-count">' + bring.length + " unfinished from earlier</span>" +
        '<span class="carry-preview">' + preview + "</span></span>" +
        '<button type="button" class="link-btn" data-task-action="carry">Bring to today</button>' +
      "</div>"
    : "";

  var items = list.tasks.length
    ? '<ul class="task-list">' + list.tasks.map(taskRow).join("") + "</ul>"
    : '<p class="empty-line">' + (o.empty || "Nothing on the list yet.") + "</p>";

  list.container.innerHTML =
    carry +
    (total && o.progress !== false
      ? '<div class="task-progress" role="progressbar" aria-label="Tasks done" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '"><span style="width:' + Math.round((done / total) * 100) + '%"></span></div>'
      : "") +
    items +
    '<form class="inline-form task-add" data-form="task" autocomplete="off">' +
      '<span class="task-add-icon" aria-hidden="true">' + icon("plus") + "</span>" +
      '<input class="text-input" name="title" maxlength="300" placeholder="' + (o.placeholder || "Add a task") + '" aria-label="' + (o.label || "New task") + '" enterkeyhint="done" required>' +
      '<select class="select-input" name="category" aria-label="Life area">' + categoryOptions("", "Area") + "</select>" +
      '<button type="submit" class="icon-btn task-add-go" aria-label="Add task" hidden>' + icon("arrow-up") + "</button>" +
    "</form>";
}

function taskRow(t) {
  var cat = categoryById(t.activityCategory);
  return (
    '<li class="task-row' + (t.completed ? " is-done" : "") + '" data-task-id="' + t.id + '">' +
      '<label class="task-check">' +
        '<input type="checkbox" class="check" data-task-toggle="' + t.id + '"' + (t.completed ? " checked" : "") + ">" +
        '<span class="check-box" aria-hidden="true">' + icon("check") + "</span>" +
        '<span class="task-text">' +
          '<span class="task-title"><span class="task-title-text">' + escapeHtml(t.title) + "</span></span>" +
          (cat ? '<span class="area-tag" title="' + cat.label + '">' + categoryIcon(cat) + "<span>" + cat.label + "</span></span>" : "") +
        "</span>" +
      "</label>" +
      '<button type="button" class="icon-btn icon-btn--quiet task-del" data-task-action="delete" data-task-id="' + t.id + '" aria-label="Delete ' + escapeHtml(t.title) + '">' + icon("x") + "</button>" +
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
    var at = list.tasks.findIndex(function (t) { return t.id === id; });
    var removed = list.tasks[at];
    if (!removed) return;
    btn.disabled = true;
    try {
      await apiDeleteTask(id);
      list.tasks = list.tasks.filter(function (t) { return t.id !== id; });
      draw(list);
      emitChange("tasks");
      toast("Task deleted", "ok", {
        action: {
          label: "Undo",
          run: async function () {
            try {
              var back = await apiCreateTask({ dayDate: removed.dayDate, title: removed.title, activityCategory: removed.activityCategory, completed: removed.completed });
              if (removed.completed && !back.completed) back = await apiUpdateTask(back.id, { completed: true });
              // back where it was, not at the end of the list
              list.tasks.splice(Math.min(at, list.tasks.length), 0, back);
              draw(list);
              emitChange("tasks");
            } catch (err) {
              toast("Couldn't bring the task back", "error");
            }
          }
        }
      });
    } catch (err) {
      btn.disabled = false;
      toast("Couldn't delete the task", "error");
    }
  }

  if (action === "carry") {
    var bring = carryCandidates(list);
    if (!bring.length) return;
    btn.disabled = true;
    try {
      var from = {};
      bring.forEach(function (t) { from[t.id] = t.dayDate; });
      var moved = await Promise.all(bring.map(function (t) { return apiUpdateTask(t.id, { dayDate: list.day }); }));
      list.tasks = list.tasks.concat(moved);
      list.carry = list.carry.filter(function (t) { return !from[t.id]; });
      draw(list);
      emitChange("tasks");
      toast("Moved " + moved.length + " task" + (moved.length === 1 ? "" : "s") + " to today", "ok", {
        action: {
          label: "Undo",
          run: async function () {
            try {
              var back = await Promise.all(moved.map(function (t) { return apiUpdateTask(t.id, { dayDate: from[t.id] }); }));
              list.tasks = list.tasks.filter(function (t) { return !from[t.id]; });
              list.carry = list.carry.concat(back.filter(function (t) { return !t.completed; }));
              draw(list);
              emitChange("tasks");
            } catch (err) {
              toast("Couldn't move them back", "error");
            }
          }
        }
      });
    } catch (err) {
      btn.disabled = false;
      toast("Couldn't move the tasks", "error");
    }
  }
}
