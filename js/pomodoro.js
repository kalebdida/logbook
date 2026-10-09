import { dateKey } from "./dayRecord.js";
import { apiRecordPomodoroSession, apiListPomodoroDays } from "./api.js";
import { getPrefs } from "./prefs.js";
import { emitChange } from "./bus.js";
import { toast } from "./toast.js";

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
  Call once from app.js after #pomodoroSection exists. Timer lengths come
  from settings (prefs.js); the live timer itself stays in this browser so
  it keeps ticking offline, and each finished focus block is also sent to
  the backend.
*/
export function renderPomodoro() {
  var container = document.getElementById("pomodoroSection");
  if (!container) return;

  ensureState(prefDurations());
  if (syncTimer()) saveState();

  container.innerHTML = `
    <div class="pomodoro-card" data-pomodoro-mode="focus">
      <h3 class="daily-section-title">lock-in</h3>

      <div class="pomodoro-mode-row" role="group" aria-label="Timer mode">
        <button class="tool-btn" type="button" data-pomodoro-action="mode" data-mode="focus">focus</button>
        <button class="tool-btn" type="button" data-pomodoro-action="mode" data-mode="shortBreak">short break</button>
        <button class="tool-btn" type="button" data-pomodoro-action="mode" data-mode="longBreak">long break</button>
      </div>

      <div class="pomodoro-dial" id="pomodoroRing">
        <div class="pomodoro-timer" id="pomodoroTime" role="timer">25:00</div>
        <div class="pomodoro-status" id="pomodoroStatus" aria-live="polite">focus ready</div>
      </div>

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

function prefDurations() {
  var p = getPrefs();
  return { focus: p.focusMinutes, shortBreak: p.shortBreakMinutes, longBreak: p.longBreakMinutes };
}

function ensureState(durations) {
  if (state) return;
  state = loadState() || createState(durations);
  state.settings = Object.assign({}, state.settings, durations || prefDurations());
  ensureToday();
}

/* Called when timer lengths change in settings. A timer that hasn't
   started picks up the new length right away; a running or paused one
   keeps its current length and the next one uses the new setting. */
export function applyPomodoroDurations() {
  if (!state) return;
  state.settings = Object.assign({}, state.settings, prefDurations());
  if (state.timer.status === "ready") state.timer = createTimer(state.timer.mode, state.settings);
  saveState();
  updateView();
}

/* Focus history per day: what this browser recorded, merged with what the
   backend has (the larger number wins), so clearing browser storage or
   switching browsers doesn't erase your history. */
var backendDays = {};

export async function getPomodoroHistory() {
  ensureState();
  if (syncTimer()) saveState();
  var merged = {};
  Object.keys(state.days).forEach(function (d) {
    merged[d] = { sessions: state.days[d].sessions, focusMs: state.days[d].focusMs };
  });
  try {
    (await apiListPomodoroDays()).forEach(function (row) {
      backendDays[row.date] = { sessions: row.sessions, focusMs: row.focus_ms };
      var local = merged[row.date] || { sessions: 0, focusMs: 0 };
      merged[row.date] = { sessions: Math.max(local.sessions, row.sessions), focusMs: Math.max(local.focusMs, row.focus_ms) };
    });
    updateView();
  } catch (e) {}
  return merged;
}

/* Today's focus, taking the larger of this browser's count and the
   backend's (another device, or cleared browser storage). */
export function getTodayFocus() {
  ensureState();
  var key = dateKey(new Date());
  var today = dayStats(key);
  var remote = backendDays[key] || { sessions: 0, focusMs: 0 };
  return {
    sessions: Math.max(today.sessions, remote.sessions),
    focusMs: Math.max(today.focusMs, remote.focusMs),
    running: state.timer.status === "running",
    mode: state.timer.mode
  };
}

export function toggleFocusFromAnywhere() {
  ensureState();
  if (state.timer.status === "running") {
    pauseTimer();
    return "paused";
  }
  startFocusFromAnywhere();
  return "started";
}

export function startFocusFromAnywhere() {
  ensureState();
  if (state.timer.status === "running") return;
  if (state.timer.mode !== "focus" && state.timer.status === "ready") state.timer = createTimer("focus", state.settings);
  startTimer();
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
  var parsed = null;
  try {
    var raw = localStorage.getItem(POMODORO_STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  // Repair anything missing or malformed instead of crashing on it; keep
  // whatever focus history is there.
  var fresh = createState(prefDurations());
  var days = parsed.days && typeof parsed.days === "object" ? parsed.days : {};
  Object.keys(days).forEach(function (d) {
    var v = days[d] || {};
    days[d] = { sessions: Math.max(0, Number(v.sessions) || 0), focusMs: Math.max(0, Number(v.focusMs) || 0) };
  });
  var timer = parsed.timer;
  var timerOk = timer && MODE_LABELS[timer.mode] && ["ready", "running", "paused"].indexOf(timer.status) >= 0 &&
    Number.isFinite(timer.durationMs) && Number.isFinite(timer.remainingMs) &&
    (timer.status !== "running" || Number.isFinite(timer.endsAt));
  return {
    version: 1,
    settings: Object.assign({}, fresh.settings, parsed.settings || {}),
    lastActiveDate: typeof parsed.lastActiveDate === "string" ? parsed.lastActiveDate : fresh.lastActiveDate,
    days: days,
    totals: {
      sessions: Math.max(0, Number(parsed.totals && parsed.totals.sessions) || 0),
      focusMs: Math.max(0, Number(parsed.totals && parsed.totals.focusMs) || 0)
    },
    timer: timerOk ? timer : fresh.timer
  };
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
  emitPomodoroEvent("paused");
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
    var completedDay = dateKey(new Date(completedAt));
    var stats = dayStats(completedDay);
    stats.sessions++;
    stats.focusMs += state.timer.durationMs;
    state.totals.sessions++;
    state.totals.focusMs += state.timer.durationMs;

    // Local state above stays the source of truth for "sessions today"
    // and the live timer, both of which need to work instantly and
    // offline. This is a fire-and-forget report to the backend on top of
    // that, not a replacement for it, a failed request here shouldn't
    // interrupt a running timer.
    apiRecordPomodoroSession(completedDay, state.timer.durationMs).then(function (row) {
      if (row) backendDays[row.date] = { sessions: row.sessions, focusMs: row.focus_ms };
    }).catch(function (e) {
      console.warn("logbook: failed to report pomodoro session to backend", e);
    });

    var nextBreak = state.totals.sessions % LONG_BREAK_EVERY === 0 ? "longBreak" : "shortBreak";
    state.timer = createTimer(nextBreak, state.settings);
  } else {
    state.timer = createTimer("focus", state.settings);
  }

  ensureToday();
  saveState();
  // background tabs tick slowly, so a timer can be noticed a little late;
  // still announce it unless it ended long ago (e.g. the laptop was asleep)
  if (!recovered || Date.now() - completedAt < 120000) announce(completedMode, skipped);
  emitChange("focus");
  emitPomodoroEvent(completedMode === "focus" ? "focus-completed" : "break-completed", {
    completedMode: completedMode,
    completedAt: completedAt,
    recovered: Boolean(recovered),
    skipped: Boolean(skipped)
  });
}

function announce(completedMode, skipped) {
  if (skipped) return;
  var message = completedMode === "focus" ? "focus block done. take a break." : "break's over. ready to focus?";
  toast(message);
  var prefs = getPrefs();
  if (prefs.sound) chime(completedMode === "focus" ? [660, 880, 990] : [880, 660]);
  if (prefs.notifications && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try { new Notification("logbook", { body: message, tag: "logbook-pomodoro" }); } catch (e) {}
  }
}

var audioCtx = null;
function chime(notes) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var t = audioCtx.currentTime;
    notes.forEach(function (freq, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.06, t + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.14);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + i * 0.16);
      osc.stop(t + i * 0.16 + 0.15);
    });
  } catch (e) {}
}

var baseTitle = null;
function updateTabTitle() {
  if (!state) return;
  if (state.timer.status === "running") {
    if (baseTitle === null) baseTitle = document.title;
    document.title = formatTime(Math.ceil(remainingMs() / 1000)) + " " + MODE_LABELS[state.timer.mode] + " · logbook";
  } else if (baseTitle !== null) {
    document.title = baseTitle;
    baseTitle = null;
  }
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
  var today = getTodayFocus();

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
  updateTabTitle();
  var time = document.getElementById("pomodoroTime");
  if (!time || !state) return;
  var secs = Math.ceil(remainingMs() / 1000);
  time.textContent = formatTime(secs);
  var ring = document.getElementById("pomodoroRing");
  if (ring) {
    var frac = state.timer.durationMs ? 1 - (secs * 1000) / state.timer.durationMs : 0;
    ring.style.setProperty("--progress", Math.max(0, Math.min(1, frac)).toFixed(4));
  }
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
