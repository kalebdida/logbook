import { formatDate } from './utils.js';
import { storageWorks, loadEntries, saveEntries, exportEntries, readImportFile } from './storage.js';
import { renderConstellation, renderWeekAgo, renderEntries, createEntry, mergeImportedEntries } from './entries.js';
import { renderStats } from './stats.js';
import { renderVerse } from './verse.js';
import { startMatrixRain } from './rain.js';
import { renderHeader, updateSaveButtonState, showImportStatus, showStorageWarning, startBoot } from './ui.js';
import { renderDailyPage } from './dailyPage.js';
import { openDayViewer } from './dayViewer.js';
import { dateKey } from './dayRecord.js';
import { renderCalendar } from "./calendar.js";
import { renderPomodoro } from "./pomodoro.js";
import { renderGoals } from "./goals.js";
import { renderDensityMap } from "./densityMap.js";

var state = { entries: [], mood: null, expandedId: null, query: "", filterStatus: null };

function refreshAll() {
  renderHeader(state.entries.length);
  renderStats(state.entries);
  renderConstellation(state.entries);
  renderWeekAgo(state.entries, handleWeekAgoExpand);
  renderEntries(state.entries, state.query, state.filterStatus, state.expandedId);
}

function openViewerForEntryId(id) {
  var entry = state.entries.find(function (e) { return e.id === id; });
  if (!entry) return;
  openDayViewer(dateKey(entry.date));
}

function handleWeekAgoExpand(id) {
  state.expandedId = id;
  renderEntries(state.entries, state.query, state.filterStatus, state.expandedId);
  setTimeout(function () {
    var card = document.querySelector('.entry-card[data-id="' + id + '"]');
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 50);
  openViewerForEntryId(id);
}

function handleSave() {
  var textEl = document.getElementById("entryText");
  var textVal = textEl.value.trim();
  if (!state.mood || !textVal) return;
  var entry = createEntry(state.mood, textVal);
  state.entries.unshift(entry);
  var ok = saveEntries(state.entries);
  document.getElementById("saveStatus").textContent = ok ? "" : "write failed, try again";
  textEl.value = "";
  state.mood = null;
  Array.prototype.forEach.call(document.querySelectorAll(".mood-btn"), function (b) { b.classList.remove("active"); });
  updateSaveButtonState(state.mood);
  refreshAll();
}

function wireEvents() {
  Array.prototype.forEach.call(document.querySelectorAll(".mood-btn"), function (btn) {
    btn.addEventListener("click", function () {
      state.mood = btn.getAttribute("data-mood");
      Array.prototype.forEach.call(document.querySelectorAll(".mood-btn"), function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      updateSaveButtonState(state.mood);
    });
  });

  document.getElementById("entryText").addEventListener("input", function () {
    updateSaveButtonState(state.mood);
  });
  document.getElementById("saveBtn").addEventListener("click", handleSave);

  document.getElementById("searchInput").addEventListener("input", function (e) {
    state.query = e.target.value;
    renderEntries(state.entries, state.query, state.filterStatus, state.expandedId);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".filter-chip"), function (chip) {
    chip.addEventListener("click", function () {
      var s = chip.getAttribute("data-status");
      state.filterStatus = state.filterStatus === s ? null : s;
      Array.prototype.forEach.call(document.querySelectorAll(".filter-chip"), function (c) { c.classList.remove("active"); });
      if (state.filterStatus) chip.classList.add("active");
      renderEntries(state.entries, state.query, state.filterStatus, state.expandedId);
    });
  });

  document.getElementById("exportBtn").addEventListener("click", function () {
    exportEntries(state.entries);
  });
  document.getElementById("importBtn").addEventListener("click", function () {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    readImportFile(file)
      .then(function (parsed) {
        var result = mergeImportedEntries(state.entries, parsed);
        state.entries = result.entries;
        saveEntries(state.entries);
        refreshAll();
        showImportStatus("imported " + result.added + " new entr" + (result.added === 1 ? "y" : "ies"));
      })
      .catch(function () {
        showImportStatus("import failed: invalid file");
      });
  });

  document.getElementById("entriesList").addEventListener("click", function (e) {
    var card = e.target.closest(".entry-card");
    if (!card) return;
    var id = card.getAttribute("data-id");
    var opening = state.expandedId !== id;
    state.expandedId = opening ? id : null;
    renderEntries(state.entries, state.query, state.filterStatus, state.expandedId);
    if (opening) openViewerForEntryId(id);
  });
}

function init() {
  state.entries = loadEntries();

  if (!storageWorks()) {
    showStorageWarning();
  }

  document.getElementById("todayDate").textContent = formatDate(new Date().toISOString());
  renderVerse();
  refreshAll();
  renderDailyPage();
  renderCalendar();
  renderPomodoro();
  renderGoals();
  renderDensityMap();
  wireEvents();

  startMatrixRain();
  startBoot(state.entries.length);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
