import { apiListGoals, apiCreateGoal, apiUpdateGoal, apiDeleteGoal, apiRestoreBackup } from "./api.js";
import { icon } from "./icons.js";
import { dateKey } from "./dayRecord.js";
import { escapeHtml } from "./utils.js";
import { categoryById, categoryOptions } from "./categories.js";
import { emitChange } from "./bus.js";
import { toast } from "./toast.js";

// Goals are about progress; anything with a date is a deadline (with a
// countdown) and anything daily is a habit, so goals don't ask for either.
var CATEGORIES = ["weekly", "monthly", "long-term"];
var PRIORITIES = ["low", "medium", "high"];
var PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
var CELEBRATION_DURATION = 700;

var state = {
  goals: null,
  query: "",
  category: "all",
  sort: "priority",
  hideCompleted: false,
  editingId: null
};

/*
  Mount this once after <div id="goalsSection"></div> is in the page.
  Goal data now lives on the backend (see api.js), state.goals is an
  in-memory cache of it: loaded once, then kept in sync by each write
  function's own response rather than re-fetched on every render. Search,
  filter, sort, and the stats below all read from that cache, so none of
  that logic needed to change, only the functions that actually load or
  mutate a goal did.
*/
export async function renderGoals() {
  var container = document.getElementById("goalsSection");
  if (!container) return;

  await ensureGoals();
  container.innerHTML = renderGoalsShell();
  container.onclick = handleClick;
  container.oninput = handleInput;
  container.onchange = handleChange;
  container.onsubmit = handleSubmit;
  animateProgressBars();
}

export async function getGoals() {
  await ensureGoals();
  return state.goals.map(copyGoal);
}

export async function getGoalStats() {
  await ensureGoals();
  return buildGoalStats(state.goals);
}

async function ensureGoals() {
  if (state.goals) return;
  // the backend already validates category/priority/progress and derives
  // completed/completedAt, so unlike the old localStorage path this
  // doesn't need a defensive normalize pass over what comes back
  state.goals = await apiListGoals();
}

function copyGoal(goal) {
  return Object.assign({}, goal);
}

function renderGoalsShell() {
  var stats = buildGoalStats(state.goals);
  // with nothing to count or search yet, the numbers and filters are just noise
  var hasGoals = state.goals.length > 0;

  return `
    <section class="goals-card" aria-label="Goals">
      <div class="goals-heading">
        <p class="density-subtitle">Bigger things you're building toward. Move the progress as you go</p>
        <button class="primary-btn goals-add-button" type="button" data-goal-action="add">${icon("plus")}<span>New goal</span></button>
      </div>

      ${hasGoals ? renderSummary(stats) + renderControls() : ""}
      ${renderEditor()}
      <div class="goals-list" id="goalsList">${renderGoalListMarkup()}</div>
    </section>
  `;
}

function renderSummary(stats) {
  return `
    <div class="goals-summary" aria-label="Goal summary">
      ${renderSummaryItem("Done today", stats.todayCompleted, "circle-check")}
      ${renderSummaryItem("Overall progress", stats.overallProgress + "%", "chart-column")}
      ${renderSummaryItem("In progress", stats.active, "flag")}
      ${renderSummaryItem("Best streak", stats.longestCompletionStreak + (stats.longestCompletionStreak === 1 ? " day" : " days"), "trophy")}
    </div>
  `;
}

function renderSummaryItem(label, value, iconName) {
  return `
    <div class="stat-card goal-stat-card">
      <span class="stat-icon">${icon(iconName)}</span>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>
  `;
}

function renderControls() {
  return `
    <div class="goals-controls">
      <label class="search-field goals-search-wrap">${icon("search")}<input id="goalSearch" class="goals-search" type="search" value="${escapeHtml(state.query)}" placeholder="Search goals" aria-label="Search goals" /></label>

      <select id="goalCategoryFilter" class="goals-select" aria-label="Filter goals by category">
        <option value="all">All categories</option>
        ${CATEGORIES.map(function (category) {
          return `<option value="${category}"${selected(state.category, category)}>${categoryLabel(category)}</option>`;
        }).join("")}
      </select>

      <select id="goalSort" class="goals-select" aria-label="Sort goals">
        <option value="priority"${selected(state.sort, "priority")}>By priority</option>
        <option value="progress"${selected(state.sort, "progress")}>By progress</option>
        <option value="newest"${selected(state.sort, "newest")}>Newest first</option>
      </select>

      <label class="goals-collapse-control">
        <input id="goalHideCompleted" class="switch" type="checkbox"${state.hideCompleted ? " checked" : ""} />
        <span>Hide finished</span>
      </label>
    </div>
  `;
}

function renderEditor() {
  if (!state.editingId) return "";

  var existingGoal = state.editingId === "new" ? null : findGoal(state.editingId);
  var goal = existingGoal || {
    title: "",
    description: "",
    category: "monthly",
    priority: "medium",
    progress: 0,
    targetDate: "",
    activityCategory: ""
  };

  return `
    <form class="goals-editor" id="goalEditor">
      <div class="goals-editor-heading">
        <h3 class="form-title">${existingGoal ? "Edit goal" : "A new goal"}</h3>
        <button class="icon-btn goals-editor-close" type="button" data-goal-action="cancel" aria-label="Close the goal editor">${icon("x")}</button>
      </div>

      <label class="goals-field goals-field--wide">
        <span>Title</span>
        <input name="title" type="text" value="${escapeHtml(goal.title)}" maxlength="120" required />
      </label>

      <label class="goals-field goals-field--wide">
        <span>Description <em>Optional</em></span>
        <textarea name="description" rows="3" maxlength="500">${escapeHtml(goal.description)}</textarea>
      </label>

      <label class="goals-field">
        <span>Category</span>
        <select name="category">
          ${CATEGORIES.map(function (category) {
            return `<option value="${category}"${selected(goal.category, category)}>${categoryLabel(category)}</option>`;
          }).join("")}
        </select>
      </label>

      <label class="goals-field">
        <span>Priority</span>
        <select name="priority">
          ${PRIORITIES.map(function (priority) {
            return `<option value="${priority}"${selected(goal.priority, priority)}>${capitalize(priority)}</option>`;
          }).join("")}
        </select>
      </label>

      ${goal.targetDate ? `<input name="targetDate" type="hidden" value="${escapeHtml(goal.targetDate)}" />` : ""}
      <p class="goals-hint goals-field--wide">${icon("info")}<span>Something with a date, like an exam? Add it as a deadline on Today and it gets a countdown. Something every day? That's a habit.</span></p>

      <label class="goals-field goals-field--phone-wide" title="When it's done, it counts toward this area on the Life areas map">
        <span>Life area <em>Optional</em></span>
        <select name="activityCategory">${categoryOptions(goal.activityCategory || "", "None")}</select>
      </label>

      <label class="goals-field goals-progress-field">
        <span>Progress <output id="goalFormProgress">${goal.progress}%</output></span>
        <input id="goalProgress" name="progress" type="range" min="0" max="100" value="${goal.progress}" />
      </label>

      <div class="goals-editor-actions">
        ${existingGoal ? `<button class="tool-btn danger-btn goals-delete-button" type="button" data-goal-action="delete" data-goal-id="${escapeHtml(existingGoal.id)}">${icon("trash-2")}<span>Delete</span></button>` : ""}
        <button class="tool-btn" type="button" data-goal-action="cancel">Cancel</button>
        <button class="primary-btn goals-save-button" type="submit">${icon("check")}<span>${existingGoal ? "Save changes" : "Create goal"}</span></button>
      </div>
    </form>
  `;
}

function renderGoalListMarkup() {
  var goals = visibleGoals();

  if (goals.length === 0) {
    // writing the first goal: the editor says it all
    if (state.editingId === "new" && state.goals.length === 0) return "";
    return renderEmptyState();
  }

  return goals.map(renderGoalCard).join("");
}

function renderEmptyState() {
  var hasGoals = state.goals.length > 0;
  var message = hasGoals
    ? "No goals match. Try another search or filter."
    : "No goals yet. What's one thing worth moving toward?";

  // the "New goal" button above is the one way in, so no second button here
  return `
    <div class="goals-empty">
      ${icon(hasGoals ? "search" : "mountain-snow")}
      <p>${message}</p>
    </div>
  `;
}

function renderGoalCard(goal) {
  var overdue = isOverdue(goal);
  var almostDone = !goal.completed && goal.progress > 80;
  var classes = ["goal-card"];
  if (goal.completed) classes.push("goal-card--completed");
  if (overdue) classes.push("goal-card--overdue");

  return `
    <article class="${classes.join(" ")}" data-goal-id="${escapeHtml(goal.id)}">
      <div class="goal-card-topline">
        <span class="goal-tags">
          <span class="goal-category">${categoryLabel(goal.category)}${areaTag(goal)}</span>
          ${renderGoalBadges(goal, overdue, almostDone)}
        </span>
        <span class="goal-priority goal-priority--${goal.priority}">${capitalize(goal.priority)}</span>
      </div>

      <h3 class="goal-title"><button class="goal-open" type="button" data-goal-action="edit" data-goal-id="${escapeHtml(goal.id)}" title="Edit this goal">${escapeHtml(goal.title)}</button></h3>

      ${goal.description ? `<p class="goal-description">${escapeHtml(goal.description)}</p>` : ""}

      <div class="goal-progress-row">
        <div class="goal-progress-track">
          <div class="goal-progress" aria-hidden="true">
            <div class="goal-progress-fill" data-progress="${goal.progress}"></div>
          </div>
          <input class="goal-progress-input" type="range" min="0" max="100" value="${goal.progress}" data-goal-progress="${escapeHtml(goal.id)}" aria-label="Progress for ${escapeHtml(goal.title)}" />
        </div>
        <output class="goal-percent" data-goal-percent>${goal.progress}%</output>
      </div>

      <div class="goal-footer">
        <span class="goal-target">${renderTargetDate(goal, overdue)}</span>
        <button class="tool-btn goal-complete-button" type="button" data-goal-action="complete" data-goal-id="${escapeHtml(goal.id)}">${goal.completed ? icon("rotate-ccw") + "<span>Reopen</span>" : icon("check") + "<span>Done</span>"}</button>
      </div>
    </article>
  `;
}

function areaTag(goal) {
  var cat = categoryById(goal.activityCategory);
  return cat ? ' <span class="goal-area" title="' + cat.label + '">' + icon(cat.icon) + "</span>" : "";
}

function renderGoalBadges(goal, overdue, almostDone) {
  var badges = [];
  if (goal.completed) badges.push('<span class="goal-badge goal-badge--complete">Complete</span>');
  if (almostDone) badges.push('<span class="goal-badge goal-badge--almost">Almost done</span>');
  // overdue needs no badge: the red date line and border already say it
  return badges.join("");
}

function renderTargetDate(goal, overdue) {
  if (!goal.targetDate) return "";
  return icon(overdue ? "triangle-alert" : "calendar-days") + "<span>" + (overdue ? "Was due " : "By ") + formatDate(goal.targetDate) + "</span>";
}

async function handleClick(event) {
  var button = event.target.closest("[data-goal-action]");
  if (!button) {
    // the card itself is the way in: a tap anywhere but the slider opens it
    var card = event.target.closest(".goal-card[data-goal-id]");
    if (card && !event.target.closest("input, button, a") && !hasSelection()) await openEditor(card.getAttribute("data-goal-id"));
    return;
  }

  var action = button.getAttribute("data-goal-action");
  var goalId = button.getAttribute("data-goal-id");

  try {
    if (action === "add") await openEditor("new");
    if (action === "edit") await openEditor(goalId);
    if (action === "cancel") await closeEditor();
    if (action === "complete") await toggleCompletion(goalId);
    if (action === "delete") await deleteGoal(goalId);
  } catch (e) {
    console.warn(e);
    toast("Couldn't save that. Check your connection and try again.", "error");
  }
}

/* selecting text in a card shouldn't open it */
function hasSelection() {
  var sel = window.getSelection && window.getSelection();
  return Boolean(sel && String(sel).trim());
}

function handleInput(event) {
  var target = event.target;

  if (target.id === "goalSearch") {
    state.query = target.value;
    refreshGoalList();
    return;
  }

  if (target.id === "goalProgress") {
    var formOutput = document.getElementById("goalFormProgress");
    if (formOutput) formOutput.textContent = target.value + "%";
    return;
  }

  if (target.hasAttribute("data-goal-progress")) {
    previewProgress(target);
  }
}

async function handleChange(event) {
  var target = event.target;

  if (target.id === "goalCategoryFilter") {
    state.category = target.value;
    refreshGoalList();
    return;
  }

  if (target.id === "goalSort") {
    state.sort = target.value;
    refreshGoalList();
    return;
  }

  if (target.id === "goalHideCompleted") {
    state.hideCompleted = target.checked;
    refreshGoalList();
    return;
  }

  if (target.hasAttribute("data-goal-progress")) {
    await saveProgress(target.getAttribute("data-goal-progress"), target.value);
  }
}

async function handleSubmit(event) {
  if (event.target.id !== "goalEditor") return;
  event.preventDefault();

  var form = event.target;
  var values = {
    title: form.elements.title.value.trim(),
    description: form.elements.description.value.trim(),
    category: form.elements.category.value,
    priority: form.elements.priority.value,
    progress: form.elements.progress.value,
    targetDate: (form.elements.targetDate || {}).value || "",
    activityCategory: form.elements.activityCategory.value
  };

  if (!values.title) {
    form.elements.title.focus();
    return;
  }

  var resultGoal;
  var action;
  var wasCompleted = false;
  var saveButton = form.querySelector(".goals-save-button");
  if (saveButton) saveButton.disabled = true;

  try {
    if (state.editingId === "new") {
      resultGoal = await apiCreateGoal(values);
      state.goals.unshift(resultGoal);
      action = "created";
    } else {
      var existing = findGoal(state.editingId);
      wasCompleted = existing ? existing.completed : false;
      resultGoal = await apiUpdateGoal(state.editingId, values);
      var idx = state.goals.findIndex(function (g) { return g.id === state.editingId; });
      if (idx >= 0) state.goals[idx] = resultGoal;
      action = "updated";
    }
  } catch (e) {
    console.warn(e);
    if (saveButton) saveButton.disabled = false;
    toast("Couldn't save the goal. Check your connection and try again.", "error");
    return;
  }

  var justCompleted = resultGoal.completed && !wasCompleted;

  state.editingId = null;
  await persistGoals(action, resultGoal);
  await renderGoals();
  if (justCompleted) triggerCelebration(resultGoal.id);
}

async function openEditor(goalId) {
  state.editingId = goalId;
  await renderGoals();

  var editor = document.getElementById("goalEditor");
  var title = editor && editor.querySelector("input[name='title']");
  if (!editor) return;
  editor.scrollIntoView({ block: "start" });
  // on a phone the keyboard would cover half the form: only jump into the title on a fresh goal
  if (title && (goalId === "new" || !window.matchMedia("(pointer: coarse)").matches)) title.focus({ preventScroll: true });
}

async function closeEditor() {
  state.editingId = null;
  await renderGoals();
}

function previewProgress(input) {
  var card = input.closest(".goal-card");
  if (!card) return;

  var value = clampProgress(input.value);
  var fill = card.querySelector(".goal-progress-fill");
  var percent = card.querySelector("[data-goal-percent]");
  if (fill) fill.style.width = value + "%";
  if (percent) percent.textContent = value + "%";
}

async function saveProgress(goalId, value) {
  var goal = findGoal(goalId);
  if (!goal) return;

  var wasCompleted = goal.completed;
  var progress = clampProgress(value);
  if (progress === goal.progress) return;
  var hadFocus = document.activeElement && document.activeElement.getAttribute("data-goal-progress") === goalId;
  var updated;
  try {
    updated = await apiUpdateGoal(goalId, { progress: progress });
  } catch (e) {
    console.warn(e);
    toast("Couldn't save the progress. Check your connection and try again.", "error");
    await renderGoals();
    return;
  }
  var idx = state.goals.findIndex(function (g) { return g.id === goalId; });
  if (idx >= 0) state.goals[idx] = updated;

  var completedNow = updated.completed && !wasCompleted;
  await persistGoals(completedNow ? "completed" : (wasCompleted && !updated.completed ? "reopened" : "progress-updated"), updated, goal.progress);
  await renderGoals();
  // arrow keys keep working: the slider stays focused through the redraw
  if (hadFocus) {
    var slider = findGoalCard(goalId);
    slider = slider && slider.querySelector("[data-goal-progress]");
    if (slider) slider.focus({ preventScroll: true });
  }
  if (completedNow) triggerCelebration(updated.id);
}

async function toggleCompletion(goalId) {
  var goal = findGoal(goalId);
  if (!goal) return;

  var completing = !goal.completed;
  var newProgress = completing ? 100 : Math.min(goal.progress, 90);
  var updated = await apiUpdateGoal(goalId, { progress: newProgress });
  var idx = state.goals.findIndex(function (g) { return g.id === goalId; });
  if (idx >= 0) state.goals[idx] = updated;

  await persistGoals(completing ? "completed" : "reopened", updated, goal.progress);
  await renderGoals();
  if (completing) triggerCelebration(updated.id);
}

async function deleteGoal(goalId) {
  var goal = findGoal(goalId);
  if (!goal) return;

  // no "are you sure?": it goes right away and the toast can bring it back
  await apiDeleteGoal(goalId);
  state.goals = state.goals.filter(function (item) { return item.id !== goalId; });
  if (state.editingId === goalId) state.editingId = null;
  await notifyGoalsChanged("deleted", goal);
  emitChange("goals", { action: "deleted" });
  await renderGoals();
  toast("Goal deleted", "ok", {
    duration: 6000,
    action: {
      label: "Undo",
      run: async function () {
        try {
          // the same id, dates and progress as before, through the additive restore
          await apiRestoreBackup({ goals: [{
            id: goal.id, title: goal.title, description: goal.description || "", category: goal.category,
            priority: goal.priority, progress: goal.progress, target_date: goal.targetDate || null,
            activity_category: goal.activityCategory || null, created_at: goal.createdAt,
            updated_at: goal.updatedAt, completed_at: goal.completedAt
          }] });
          state.goals = await apiListGoals();
          emitChange("goals", { action: "restored" });
          await renderGoals();
        } catch (e) {
          toast("Couldn't bring the goal back", "error");
        }
      }
    }
  });
}

// the backend already persisted the write by the time this runs (every
// caller awaits an api* call first), so this is just the change
// notification now, kept in case something downstream (the companion,
// eventually) wants to listen for "logbook:goals-changed"
async function persistGoals(action, goal, progressBefore) {
  await notifyGoalsChanged(action, goal);
  emitChange("goals", { action: action });
  if (action === "completed") {
    // a slip of the finger on the slider shouldn't finish a goal for good
    var undo = typeof progressBefore === "number" && progressBefore < 100
      ? { label: "Undo", run: function () { saveProgress(goal.id, progressBefore).catch(function () {}); } }
      : null;
    toast("Goal complete: " + goal.title, "ok", undo ? { action: undo, duration: 5000 } : undefined);
  }
  else if (action === "created") toast("Goal created");
  else if (action === "updated") toast("Goal saved");
}

/* Re-fetch on the next render, used after an import. */
export function invalidateGoals() {
  state.goals = null;
}

async function notifyGoalsChanged(action, goal) {
  var stats = await getGoalStats();
  document.dispatchEvent(new CustomEvent("logbook:goals-changed", {
    detail: {
      action: action,
      goal: goal ? copyGoal(goal) : null,
      stats: stats
    }
  }));
}

function refreshGoalList() {
  var list = document.getElementById("goalsList");
  if (!list) return;
  list.innerHTML = renderGoalListMarkup();
  animateProgressBars();
}

function animateProgressBars() {
  window.requestAnimationFrame(function () {
    Array.prototype.forEach.call(document.querySelectorAll(".goal-progress-fill[data-progress]"), function (fill) {
      fill.style.width = fill.getAttribute("data-progress") + "%";
    });
  });
}

function triggerCelebration(goalId) {
  var card = findGoalCard(goalId);
  if (!card) return;

  card.classList.remove("goal-card--celebrating");
  void card.offsetWidth;
  card.classList.add("goal-card--celebrating");
  window.setTimeout(function () {
    card.classList.remove("goal-card--celebrating");
  }, CELEBRATION_DURATION);
}

function findGoalCard(goalId) {
  var cards = document.querySelectorAll(".goal-card[data-goal-id]");
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].getAttribute("data-goal-id") === goalId) return cards[i];
  }
  return null;
}

function visibleGoals() {
  var query = state.query.trim().toLowerCase();
  var goals = state.goals.filter(function (goal) {
    var inCategory = state.category === "all" || goal.category === state.category;
    var matchesQuery = !query || (goal.title + " " + goal.description).toLowerCase().indexOf(query) >= 0;
    var isVisible = !state.hideCompleted || !goal.completed;
    return inCategory && matchesQuery && isVisible;
  });

  return goals.sort(compareGoals);
}

function compareGoals(left, right) {
  if (state.sort === "due-date") return compareDueDates(left, right);
  if (state.sort === "progress") return right.progress - left.progress || newestFirst(left, right);
  if (state.sort === "newest") return newestFirst(left, right);

  return PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority] || compareDueDates(left, right);
}

function compareDueDates(left, right) {
  if (!left.targetDate && !right.targetDate) return newestFirst(left, right);
  if (!left.targetDate) return 1;
  if (!right.targetDate) return -1;
  return left.targetDate.localeCompare(right.targetDate) || newestFirst(left, right);
}

function newestFirst(left, right) {
  return new Date(right.createdAt) - new Date(left.createdAt);
}

function buildGoalStats(goals) {
  var today = dateKey(new Date());
  var completed = goals.filter(function (goal) { return goal.completed; });
  var progressTotal = goals.reduce(function (total, goal) { return total + goal.progress; }, 0);

  return {
    total: goals.length,
    active: goals.length - completed.length,
    completed: completed.length,
    todayCompleted: completed.filter(function (goal) {
      return goal.completedAt && dateKey(new Date(goal.completedAt)) === today;
    }).length,
    overallProgress: goals.length ? Math.round(progressTotal / goals.length) : 0,
    overdue: goals.filter(function (goal) { return isOverdue(goal, today); }).length,
    longestCompletionStreak: longestCompletionStreak(completed),
    categories: categoryCounts(goals)
  };
}

function categoryCounts(goals) {
  var counts = { daily: 0, weekly: 0, monthly: 0, "long-term": 0 };
  goals.forEach(function (goal) { counts[goal.category]++; });
  return counts;
}

function longestCompletionStreak(completedGoals) {
  var completionDays = {};
  completedGoals.forEach(function (goal) {
    if (goal.completedAt) completionDays[dateKey(new Date(goal.completedAt))] = true;
  });

  var dates = Object.keys(completionDays).sort();
  var longest = 0;
  var current = 0;
  var previous = null;

  dates.forEach(function (day) {
    current = previous && nextDateKey(previous) === day ? current + 1 : 1;
    if (current > longest) longest = current;
    previous = day;
  });

  return longest;
}

function nextDateKey(day) {
  var parts = day.split("-");
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1);
  return dateKey(date);
}

function findGoal(goalId) {
  return state.goals.find(function (goal) { return goal.id === goalId; });
}

function isOverdue(goal, today) {
  today = today || dateKey(new Date());
  return !goal.completed && Boolean(goal.targetDate) && goal.targetDate < today;
}

function clampProgress(value) {
  var number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

function categoryLabel(category) {
  return category === "long-term" ? "Long-term" : capitalize(category);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value) {
  var parts = value.split("-");
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

