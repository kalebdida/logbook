import { loadGoals, saveGoals } from "./storage.js";
import { dateKey } from "./dayRecord.js";
import { escapeHtml } from "./utils.js";

var CATEGORIES = ["daily", "weekly", "monthly", "long-term"];
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
  Goal data remains isolated in localStorage through storage.js: "logbook-goals".
*/
export function renderGoals() {
  var container = document.getElementById("goalsSection");
  if (!container) return;

  ensureGoals();
  container.innerHTML = renderGoalsShell();
  container.onclick = handleClick;
  container.oninput = handleInput;
  container.onchange = handleChange;
  container.onsubmit = handleSubmit;
  animateProgressBars();
}

export function getGoals() {
  ensureGoals();
  return state.goals.map(copyGoal);
}

export function getGoalStats() {
  ensureGoals();
  return buildGoalStats(state.goals);
}

function ensureGoals() {
  if (state.goals) return;
  state.goals = loadGoals().map(normalizeGoal);
}

function normalizeGoal(goal) {
  var now = new Date().toISOString();
  var progress = clampProgress(goal.progress);
  var completed = Boolean(goal.completed) || progress === 100;

  return {
    id: goal.id || createGoalId(),
    title: String(goal.title || "Untitled goal"),
    description: String(goal.description || ""),
    category: CATEGORIES.indexOf(goal.category) >= 0 ? goal.category : "daily",
    priority: PRIORITIES.indexOf(goal.priority) >= 0 ? goal.priority : "medium",
    progress: completed ? 100 : progress,
    completed: completed,
    createdAt: goal.createdAt || now,
    updatedAt: goal.updatedAt || goal.createdAt || now,
    completedAt: completed ? (goal.completedAt || now) : null,
    targetDate: isDateString(goal.targetDate) ? goal.targetDate : null
  };
}

function createGoal(values) {
  var now = new Date().toISOString();
  var progress = clampProgress(values.progress);
  var completed = progress === 100;

  return {
    id: createGoalId(),
    title: values.title,
    description: values.description,
    category: values.category,
    priority: values.priority,
    progress: completed ? 100 : progress,
    completed: completed,
    createdAt: now,
    updatedAt: now,
    completedAt: completed ? now : null,
    targetDate: values.targetDate || null
  };
}

function createGoalId() {
  return "goal-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function copyGoal(goal) {
  return Object.assign({}, goal);
}

function renderGoalsShell() {
  var stats = buildGoalStats(state.goals);

  return `
    <section class="goals-card" aria-label="Goals">
      <div class="goals-heading">
        <div class="daily-section-title">// goals</div>
        <button class="tool-btn goals-add-button" type="button" data-goal-action="add">+ add goal</button>
      </div>

      ${renderSummary(stats)}
      ${renderControls()}
      ${renderEditor()}
      <div class="goals-list" id="goalsList">${renderGoalListMarkup()}</div>
    </section>
  `;
}

function renderSummary(stats) {
  return `
    <div class="goals-summary" aria-label="Goal summary">
      ${renderSummaryItem("today", stats.todayCompleted)}
      ${renderSummaryItem("completion", stats.overallProgress + "%")}
      ${renderSummaryItem("active", stats.active)}
      ${renderSummaryItem("best streak", stats.longestCompletionStreak + " days")}
    </div>
  `;
}

function renderSummaryItem(label, value) {
  return `
    <div class="stat-card goal-stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>
  `;
}

function renderControls() {
  return `
    <div class="goals-controls">
      <input id="goalSearch" class="goals-search" type="search" value="${escapeHtml(state.query)}" placeholder="search goals..." aria-label="Search goals" />

      <select id="goalCategoryFilter" class="goals-select" aria-label="Filter goals by category">
        <option value="all">all categories</option>
        ${CATEGORIES.map(function (category) {
          return `<option value="${category}"${selected(state.category, category)}>${categoryLabel(category)}</option>`;
        }).join("")}
      </select>

      <select id="goalSort" class="goals-select" aria-label="Sort goals">
        <option value="priority"${selected(state.sort, "priority")}>priority</option>
        <option value="due-date"${selected(state.sort, "due-date")}>due date</option>
        <option value="progress"${selected(state.sort, "progress")}>progress</option>
        <option value="newest"${selected(state.sort, "newest")}>newest</option>
      </select>

      <label class="goals-collapse-control">
        <input id="goalHideCompleted" type="checkbox"${state.hideCompleted ? " checked" : ""} />
        hide completed
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
    category: "daily",
    priority: "medium",
    progress: 0,
    targetDate: ""
  };

  return `
    <form class="goals-editor" id="goalEditor">
      <div class="goals-editor-heading">
        <div class="section-label">${existingGoal ? "edit goal" : "new goal"}</div>
        <button class="goals-editor-close" type="button" data-goal-action="cancel" aria-label="Close goal editor">×</button>
      </div>

      <label class="goals-field goals-field--wide">
        <span>title</span>
        <input name="title" type="text" value="${escapeHtml(goal.title)}" maxlength="120" required autofocus />
      </label>

      <label class="goals-field goals-field--wide">
        <span>description <em>optional</em></span>
        <textarea name="description" rows="3" maxlength="500">${escapeHtml(goal.description)}</textarea>
      </label>

      <label class="goals-field">
        <span>category</span>
        <select name="category">
          ${CATEGORIES.map(function (category) {
            return `<option value="${category}"${selected(goal.category, category)}>${categoryLabel(category)}</option>`;
          }).join("")}
        </select>
      </label>

      <label class="goals-field">
        <span>priority</span>
        <select name="priority">
          ${PRIORITIES.map(function (priority) {
            return `<option value="${priority}"${selected(goal.priority, priority)}>${capitalize(priority)}</option>`;
          }).join("")}
        </select>
      </label>

      <label class="goals-field">
        <span>target date <em>optional</em></span>
        <input name="targetDate" type="date" value="${escapeHtml(goal.targetDate || "")}" />
      </label>

      <label class="goals-field goals-progress-field">
        <span>starting progress <output id="goalFormProgress">${goal.progress}%</output></span>
        <input id="goalProgress" name="progress" type="range" min="0" max="100" value="${goal.progress}" />
      </label>

      <div class="goals-editor-actions">
        <button class="tool-btn" type="button" data-goal-action="cancel">cancel</button>
        <button class="tool-btn goals-save-button" type="submit">${existingGoal ? "save changes" : "create goal"}</button>
      </div>
    </form>
  `;
}

function renderGoalListMarkup() {
  var goals = visibleGoals();

  if (goals.length === 0) {
    return renderEmptyState();
  }

  return goals.map(renderGoalCard).join("");
}

function renderEmptyState() {
  var hasGoals = state.goals.length > 0;
  var message = hasGoals
    ? "no goals match this view. adjust your filters or search."
    : "nothing is queued yet. define the next thing worth moving toward.";

  return `
    <div class="goals-empty">
      <div class="section-label">clear field</div>
      <p>${message}</p>
      ${hasGoals ? "" : '<button class="tool-btn" type="button" data-goal-action="add">+ add your first goal</button>'}
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
        <span class="goal-category">${categoryLabel(goal.category)}</span>
        <span class="goal-priority goal-priority--${goal.priority}">${capitalize(goal.priority)}</span>
      </div>

      <div class="goal-title-row">
        <h3 class="goal-title">${escapeHtml(goal.title)}</h3>
        ${renderGoalBadges(goal, overdue, almostDone)}
      </div>

      ${goal.description ? `<p class="goal-description">${escapeHtml(goal.description)}</p>` : ""}

      <div class="goal-progress-row">
        <div class="goal-progress" aria-label="${goal.progress}% complete">
          <div class="goal-progress-fill" data-progress="${goal.progress}"></div>
        </div>
        <output class="goal-percent" data-goal-percent>${goal.progress}%</output>
      </div>

      <input class="goal-progress-input" type="range" min="0" max="100" value="${goal.progress}" data-goal-progress="${escapeHtml(goal.id)}" aria-label="Progress for ${escapeHtml(goal.title)}" />

      <div class="goal-footer">
        <span class="goal-target">${renderTargetDate(goal, overdue)}</span>
        <div class="goal-actions">
          <button class="tool-btn" type="button" data-goal-action="edit" data-goal-id="${escapeHtml(goal.id)}">edit</button>
          <button class="tool-btn" type="button" data-goal-action="complete" data-goal-id="${escapeHtml(goal.id)}">${goal.completed ? "reopen" : "complete"}</button>
          <button class="tool-btn goal-delete-button" type="button" data-goal-action="delete" data-goal-id="${escapeHtml(goal.id)}">delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderGoalBadges(goal, overdue, almostDone) {
  var badges = [];
  if (goal.completed) badges.push('<span class="goal-badge goal-badge--complete">complete</span>');
  if (almostDone) badges.push('<span class="goal-badge goal-badge--almost">almost done</span>');
  if (overdue) badges.push('<span class="goal-badge goal-badge--overdue">overdue</span>');
  return badges.join("");
}

function renderTargetDate(goal, overdue) {
  if (!goal.targetDate) return "no target date";
  return (overdue ? "overdue · " : "target · ") + formatDate(goal.targetDate);
}

function handleClick(event) {
  var button = event.target.closest("[data-goal-action]");
  if (!button) return;

  var action = button.getAttribute("data-goal-action");
  var goalId = button.getAttribute("data-goal-id");

  if (action === "add") openEditor("new");
  if (action === "edit") openEditor(goalId);
  if (action === "cancel") closeEditor();
  if (action === "complete") toggleCompletion(goalId);
  if (action === "delete") deleteGoal(goalId);
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

function handleChange(event) {
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
    saveProgress(target.getAttribute("data-goal-progress"), target.value);
  }
}

function handleSubmit(event) {
  if (event.target.id !== "goalEditor") return;
  event.preventDefault();

  var form = event.target;
  var values = {
    title: form.elements.title.value.trim(),
    description: form.elements.description.value.trim(),
    category: form.elements.category.value,
    priority: form.elements.priority.value,
    progress: form.elements.progress.value,
    targetDate: form.elements.targetDate.value
  };

  if (!values.title) {
    form.elements.title.focus();
    return;
  }

  var createdGoal;
  var action;
  if (state.editingId === "new") {
    createdGoal = createGoal(values);
    state.goals.unshift(createdGoal);
    action = "created";
  } else {
    createdGoal = updateGoal(state.editingId, values);
    action = "updated";
  }

  var justCompleted = createdGoal && createdGoal.completed && !createdGoal.completedAtBeforeUpdate;
  if (createdGoal) delete createdGoal.completedAtBeforeUpdate;

  state.editingId = null;
  persistGoals(action, createdGoal);
  renderGoals();
  if (justCompleted) triggerCelebration(createdGoal.id);
}

function openEditor(goalId) {
  state.editingId = goalId;
  renderGoals();

  var title = document.querySelector("#goalEditor input[name='title']");
  if (title) title.focus();
}

function closeEditor() {
  state.editingId = null;
  renderGoals();
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

function saveProgress(goalId, value) {
  var goal = findGoal(goalId);
  if (!goal) return;

  var wasCompleted = goal.completed;
  var progress = clampProgress(value);
  goal.progress = progress;
  goal.completed = progress === 100;
  goal.completedAt = goal.completed ? (goal.completedAt || new Date().toISOString()) : null;
  goal.updatedAt = new Date().toISOString();

  persistGoals(goal.completed && !wasCompleted ? "completed" : "progress-updated", goal);
  renderGoals();
  if (goal.completed && !wasCompleted) triggerCelebration(goal.id);
}

function updateGoal(goalId, values) {
  var goal = findGoal(goalId);
  if (!goal) return null;

  var wasCompleted = goal.completed;
  var progress = clampProgress(values.progress);
  goal.title = values.title;
  goal.description = values.description;
  goal.category = values.category;
  goal.priority = values.priority;
  goal.progress = progress;
  goal.completed = progress === 100;
  goal.targetDate = values.targetDate || null;
  goal.updatedAt = new Date().toISOString();
  goal.completedAt = goal.completed ? (goal.completedAt || goal.updatedAt) : null;
  goal.completedAtBeforeUpdate = wasCompleted;
  return goal;
}

function toggleCompletion(goalId) {
  var goal = findGoal(goalId);
  if (!goal) return;

  var completing = !goal.completed;
  goal.completed = completing;
  goal.progress = completing ? 100 : Math.min(goal.progress, 90);
  goal.completedAt = completing ? new Date().toISOString() : null;
  goal.updatedAt = new Date().toISOString();

  persistGoals(completing ? "completed" : "reopened", goal);
  renderGoals();
  if (completing) triggerCelebration(goal.id);
}

function deleteGoal(goalId) {
  var goal = findGoal(goalId);
  if (!goal) return;

  if (window.confirm && !window.confirm("Delete this goal?")) return;

  state.goals = state.goals.filter(function (item) { return item.id !== goalId; });
  if (state.editingId === goalId) state.editingId = null;
  persistGoals("deleted", goal);
  renderGoals();
}

function persistGoals(action, goal) {
  saveGoals(state.goals);
  notifyGoalsChanged(action, goal);
}

function notifyGoalsChanged(action, goal) {
  document.dispatchEvent(new CustomEvent("logbook:goals-changed", {
    detail: {
      action: action,
      goal: goal ? copyGoal(goal) : null,
      stats: getGoalStats()
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

function isDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

