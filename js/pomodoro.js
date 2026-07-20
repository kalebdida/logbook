import { dateKey } from "./dayRecord.js";

export var POMODORO_STORAGE_KEY = "logbook-pomodoro";

var MINUTE = 60 * 1000;
var TICK_INTERVAL = 1000;
var SAVE_INTERVAL = 30 * 1000;
var LONG_BREAK_EVERY = 4;

var MODE_LABELS = {
  focus: "focus",
  shortBreak: "short break",
  longBreak: "long break"
};

var DEFAULT_DURATIONS = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15
};

var state = null;
var tickTimer = null;
var lastSavedAt = 0;
var globalListenersAttached = false;

/*
  Call once from app.js after #pomodoroSection exists.

  Optional durations are set once, on the first run only:
  renderPomodoro({ focus: 50, shortBreak: 10, longBreak: 20 });
*/
export function renderPomodoro(durations) {
  var container = document.getElementById("pomodoroSection");
  if (!container) return;

  ensureState(durations);
  if (syncTimer()) saveState();

  container.innerHTML = `
    <div class="pomodoro-card" data-pomodoro-mode="focus">
      <div class="daily-section-title">// lock-in</div>

      <div class="pomodoro-mode-row" role="group" aria-label="Timer mode">
        <button class="tool-btn" type="button" data-pomodoro-action="mode" data-mode="focus">focus</button>
        <button class="tool-btn" type="button" data-pomodoro-action="mode" data-mode="shortBreak">short break</button>
        <button class="tool-btn" type="button" data-pomodoro-action="mode" data-mode="longBreak">long break</button>
      </div>

      <div class="pomodoro-timer" id="pomodoroTime" role="timer" aria-live="polite">25:00</div>
      <div class="pomodoro-status" id="pomodoroStatus">focus ready</div>

      <div class="pomodoro-summary">
        <span id="pomodoroSessions">sessions today: 0</span>
        <span id="pomodoroFocusTime">focus today: 0 min</span>
      </div>

      <div class="pomodoro-controls" role="group" aria-label="Pomodoro controls">
        <button class="tool-btn" id="pomodoroStart" type="button" data-pomodoro-action="start">start</button>
        <button class="tool-btn" id="pomodoroPause" type="button" data-pomodoro-action="pause">pause</button>
        <button class="tool-btn" type="button" data-pomodoro-action="reset">reset</button>
        <button class="tool-btn" id="pomodoroSkip" type="button" data-pomodoro-action="skip">skip break</button>
      </div>
    </div>
  `;

  container.onclick = handleClick;
  attachGlobalListeners();
  updateView();

  if (state.timer.status === "running") {
    startTicking();
  }
}

export function getPomodoroStats() {
  ensureState();
  if (syncTimer()) saveState();
  return statsSnapshot();
}

function ensureState(durations) {
  if (state) return;
  state = loadState() || createState(durations);
  ensureToday();
}

function createState(durations) {
  var today = dateKey(new Date());
  var settings = {
    focus: (durations && durations.focus) || DEFAULT_DURATIONS.focus,
    shortBreak: (durations && durations.shortBreak) || DEFAULT_DURATIONS.shortBreak,
    longBreak: (durations && durations.longBreak) || DEFAULT_DURATIONS.longBreak
  };

  return {
    version: 1,
    settings: settings,
    lastActiveDate: today,
    days: {},
    totals: { sessions: 0, focusMs: 0 },
    timer: createTimer("focus", settings)
  };
}

function createTimer(mode, settings) {
  var durationMs = settings[mode] * MINUTE;
  return {
    mode: mode,
    status: "ready",
    durationMs: durationMs,
    remainingMs: durationMs,
    startedAt: null,
    endsAt: null
  };
}

function loadState() {
  try {
    var raw = localStorage.getItem(POMODORO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveState() {
  if (!state) return;

  state.timer.remainingMs = remainingMs();
  state.lastActiveDate = dateKey(new Date());
  lastSavedAt = Date.now();

  try {
    localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("logbook: failed to save pomodoro state", e);
  }
}

function ensureToday() {
  var today = dateKey(new Date());
  if (!state.days[today]) {
    state.days[today] = { sessions: 0, focusMs: 0 };
  }
  var changed = state.lastActiveDate !== today;
  state.lastActiveDate = today;
  return changed;
}

function dayStats(day) {
  if (!state.days[day]) {
    state.days[day] = { sessions: 0, focusMs: 0 };
  }
  return state.days[day];
}

function remainingMs() {
  if (state.timer.status !== "running") {
    return state.timer.remainingMs;
  }
  return Math.max(0, state.timer.endsAt - Date.now());
}

function syncTimer() {
  var dayChanged = ensureToday();

  if (state.timer.status !== "running") {
    return dayChanged;
  }

  state.timer.remainingMs = remainingMs();
  if (state.timer.remainingMs > 0) {
    return dayChanged;
  }

  completeTimer(state.timer.endsAt, true);
  return true;
}

function startTimer() {
  syncTimer();
  if (state.timer.status === "running") return;

  if (state.timer.remainingMs === 0) {
    state.timer = createTimer(state.timer.mode, state.settings);
  }

  var resumed = state.timer.status === "paused";
  var now = Date.now();
  state.timer.status = "running";
  state.timer.startedAt = now;
  state.timer.endsAt = now + state.timer.remainingMs;

  saveState();
  startTicking();
  updateView();
  emitPomodoroEvent(state.timer.mode === "focus" ? "focus-started" : "break-started", {
    resumed: resumed
  });
}

function pauseTimer() {
  if (state.timer.status !== "running") return;

  syncTimer();
  if (state.timer.status !== "running") {
    updateView();
    return;
  }

  state.timer.remainingMs = remainingMs();
  state.timer.status = "paused";
  state.timer.startedAt = null;
  state.timer.endsAt = null;

  stopTicking();
  saveState();
  updateView();
}

function resetTimer(reason) {
  var previousMode = state.timer.mode;
  stopTicking();
  state.timer = createTimer(previousMode, state.settings);
  saveState();
  updateView();
  emitPomodoroEvent("session-reset", {
    reason: reason || "manual",
    previousMode: previousMode
  });
}

function selectMode(mode) {
  if (state.timer.status === "running" || state.timer.mode === mode) return;

  var previousMode = state.timer.mode;
  state.timer = createTimer(mode, state.settings);
  saveState();
  updateView();
  emitPomodoroEvent("session-reset", {
    reason: "mode-change",
    previousMode: previousMode,
    nextMode: mode
  });
}

function skipBreak() {
  if (state.timer.mode === "focus") return;
  completeTimer(Date.now(), false, true);
  updateView();
}

function completeTimer(completedAt, recovered, skipped) {
  var completedMode = state.timer.mode;
  stopTicking();

  if (completedMode === "focus") {
    var stats = dayStats(dateKey(new Date(completedAt)));
    stats.sessions++;
    stats.focusMs += state.timer.durationMs;
    state.totals.sessions++;
    state.totals.focusMs += state.timer.durationMs;

    var nextBreak = state.totals.sessions % LONG_BREAK_EVERY === 0 ? "longBreak" : "shortBreak";
    state.timer = createTimer(nextBreak, state.settings);
  } else {
    state.timer = createTimer("focus", state.settings);
  }

  ensureToday();
  saveState();
  emitPomodoroEvent(completedMode === "focus" ? "focus-completed" : "break-completed", {
    completedMode: completedMode,
    completedAt: completedAt,
    recovered: Boolean(recovered),
    skipped: Boolean(skipped)
  });
}

function startTicking() {
  if (tickTimer !== null) return;
  tickTimer = window.setInterval(tick, TICK_INTERVAL);
}

function stopTicking() {
  if (tickTimer === null) return;
  window.clearInterval(tickTimer);
  tickTimer = null;
}

function tick() {
  if (syncTimer()) {
    saveState();
    updateView();
    return;
  }

  updateClock();
  if (Date.now() - lastSavedAt >= SAVE_INTERVAL) {
    saveState();
  }
}

function handleClick(event) {
  var button = event.target.closest("[data-pomodoro-action]");
  if (!button) return;

  var action = button.getAttribute("data-pomodoro-action");
  if (action === "start") startTimer();
  if (action === "pause") pauseTimer();
  if (action === "reset") resetTimer();
  if (action === "skip") skipBreak();
  if (action === "mode") selectMode(button.getAttribute("data-mode"));
}

function updateView() {
  var card = document.querySelector(".pomodoro-card");
  if (!card) return;

  var timer = state.timer;
  var isRunning = timer.status === "running";
  var isBreak = timer.mode !== "focus";
  var today = dayStats(dateKey(new Date()));

  card.setAttribute("data-pomodoro-mode", timer.mode);
  document.getElementById("pomodoroStatus").textContent = statusText();
  document.getElementById("pomodoroSessions").textContent = "sessions today: " + today.sessions;
  document.getElementById("pomodoroFocusTime").textContent = "focus today: " + formatFocusTime(today.focusMs);
  document.getElementById("pomodoroStart").textContent = timer.status === "paused" ? "resume" : "start";
  document.getElementById("pomodoroStart").disabled = isRunning;
  document.getElementById("pomodoroPause").disabled = !isRunning;
  document.getElementById("pomodoroSkip").disabled = !isBreak;

  Array.prototype.forEach.call(document.querySelectorAll("[data-pomodoro-action='mode']"), function (button) {
    var active = button.getAttribute("data-mode") === timer.mode;
    button.disabled = isRunning;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  updateClock();
}

function updateClock() {
  var time = document.getElementById("pomodoroTime");
  if (!time || !state) return;
  time.textContent = formatTime(Math.ceil(remainingMs() / 1000));
}

function statusText() {
  var label = MODE_LABELS[state.timer.mode];
  if (state.timer.status === "running") return label + " in progress";
  if (state.timer.status === "paused") return label + " paused";
  return label + " ready";
}

function formatTime(totalSeconds) {
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function formatFocusTime(focusMs) {
  var minutes = focusMs / MINUTE;
  return (Number.isInteger(minutes) ? minutes : minutes.toFixed(1)) + " min";
}

function statsSnapshot() {
  var today = dayStats(dateKey(new Date()));
  return {
    today: {
      date: dateKey(new Date()),
      sessions: today.sessions,
      focusMs: today.focusMs,
      focusMinutes: today.focusMs / MINUTE
    },
    lifetime: {
      sessions: state.totals.sessions,
      focusMs: state.totals.focusMs,
      focusMinutes: state.totals.focusMs / MINUTE
    },
    timer: {
      mode: state.timer.mode,
      status: state.timer.status,
      remainingMs: remainingMs()
    }
  };
}

function emitPomodoroEvent(type, details) {
  document.dispatchEvent(new CustomEvent("logbook:pomodoro", {
    detail: Object.assign({
      type: type,
      at: new Date().toISOString(),
      stats: statsSnapshot()
    }, details || {})
  }));
}

function attachGlobalListeners() {
  if (globalListenersAttached) return;
  globalListenersAttached = true;

  function refreshAfterAway() {
    var changed = syncTimer();
    if (changed) saveState();
    updateView();

    if (state.timer.status === "running") startTicking();
    else stopTicking();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshAfterAway();
  });
  window.addEventListener("focus", refreshAfterAway);
  window.addEventListener("pagehide", saveState);
}
