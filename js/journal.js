import { apiListEntries, apiCreateEntry, apiUpdateEntry, apiDeleteEntry, apiRestoreBackup } from './api.js';
import { renderEntries, STATUS } from './entries.js';
import { exportEntries, readImportFile } from './storage.js';
import { toRestorePayload, summarizeRestore } from './backupFormats.js';
import { openDayViewer } from './dayViewer.js';
import { dateKey } from './dayRecord.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { formatDate } from './utils.js';

/* The journal page: write entries, search and filter them, edit or delete
   them. Owns the in-memory list of entries other views read from. */
var state = { entries: [], mood: null, query: "", filterStatus: null, expandedId: null, editingId: null, editMood: null };

export function getEntries() {
  return state.entries;
}

export async function loadEntries() {
  state.entries = await apiListEntries();
  return state.entries;
}

function draw(animateId) {
  renderEntries(state.entries, {
    query: state.query,
    filterStatus: state.filterStatus,
    expandedId: state.expandedId,
    editingId: state.editingId,
    animateId: animateId
  });
}

export function renderJournal() {
  document.getElementById("todayDate").textContent = formatDate(new Date().toISOString());
  draw();
}

export function focusComposer(mood) {
  if (mood && STATUS[mood]) setMood(mood);
  var ta = document.getElementById("entryText");
  if (ta) ta.focus();
}

function setMood(mood) {
  state.mood = mood;
  Array.prototype.forEach.call(document.querySelectorAll(".form-box .mood-btn"), function (b) {
    var on = b.getAttribute("data-mood") === mood;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
  updateSaveButton();
}

function updateSaveButton() {
  var btn = document.getElementById("saveBtn");
  var hasText = document.getElementById("entryText").value.trim().length > 0;
  var enabled = Boolean(state.mood) && hasText;
  btn.disabled = !enabled;
  btn.classList.toggle("enabled", enabled);
  var hint = document.getElementById("saveStatus");
  if (hint && !hint.dataset.locked) hint.textContent = hasText && !state.mood ? "pick a status first" : "";
}

async function commitEntry() {
  var textEl = document.getElementById("entryText");
  var text = textEl.value.trim();
  if (!state.mood || !text) return;
  var btn = document.getElementById("saveBtn");
  btn.disabled = true;
  try {
    var entry = await apiCreateEntry(state.mood, text);
    state.entries.unshift(entry);
    textEl.value = "";
    setMood(null);
    draw();
    emitChange("entries");
    toast("entry committed");
  } catch (e) {
    btn.disabled = false;
    toast("couldn't save the entry. is the backend running?", "error");
  }
}

async function removeEntry(id) {
  var entry = state.entries.find(function (e) { return e.id === id; });
  if (!entry) return;
  try {
    await apiDeleteEntry(id);
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
    state.expandedId = null;
    draw();
    emitChange("entries");
    toast("entry deleted", "ok", {
      duration: 6000,
      action: {
        label: "undo",
        run: async function () {
          await apiRestoreBackup({ entries: [{ id: entry.id, occurred_at: entry.date, mood: entry.mood, text: entry.text }] });
          await loadEntries();
          state.expandedId = entry.id;
          draw();
          emitChange("entries");
        }
      }
    });
  } catch (e) {
    toast("couldn't delete the entry", "error");
  }
}

async function saveEdit(form) {
  var id = state.editingId;
  var text = form.querySelector("textarea").value.trim();
  if (!text) {
    toast("an entry can't be empty. delete it instead.", "warn");
    return;
  }
  try {
    var updated = await apiUpdateEntry(id, { text: text, mood: state.editMood });
    var i = state.entries.findIndex(function (e) { return e.id === id; });
    if (i >= 0) state.entries[i] = updated;
    state.editingId = null;
    draw();
    emitChange("entries");
    toast("entry updated");
  } catch (e) {
    toast("couldn't save your changes", "error");
  }
}

export function wireJournal() {
  Array.prototype.forEach.call(document.querySelectorAll(".form-box .mood-btn"), function (btn) {
    btn.addEventListener("click", function () {
      var mood = btn.getAttribute("data-mood");
      setMood(state.mood === mood ? null : mood);
    });
  });

  var textEl = document.getElementById("entryText");
  textEl.addEventListener("input", updateSaveButton);
  textEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitEntry();
    }
  });
  document.getElementById("saveBtn").addEventListener("click", commitEntry);

  document.getElementById("searchInput").addEventListener("input", function (e) {
    state.query = e.target.value;
    draw();
  });

  Array.prototype.forEach.call(document.querySelectorAll(".filter-chip"), function (chip) {
    chip.addEventListener("click", function () {
      var s = chip.getAttribute("data-status");
      state.filterStatus = state.filterStatus === s ? null : s;
      Array.prototype.forEach.call(document.querySelectorAll(".filter-chip"), function (c) {
        var on = c.getAttribute("data-status") === state.filterStatus;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on);
      });
      draw();
    });
  });

  document.getElementById("exportBtn").addEventListener("click", function () {
    exportEntries(state.entries);
    toast("exported " + state.entries.length + " entries");
  });
  document.getElementById("importBtn").addEventListener("click", function () {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", async function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      var converted = toRestorePayload(await readImportFile(file));
      var result = await apiRestoreBackup(converted.payload);
      await loadEntries();
      draw();
      emitChange("import");
      toast(summarizeRestore(result));
    } catch (err) {
      toast("import failed: " + (err.message || "invalid file"), "error");
    }
  });

  var list = document.getElementById("entriesList");
  list.addEventListener("click", function (e) {
    var card = e.target.closest(".entry-card");
    if (!card) return;
    var id = card.getAttribute("data-id");

    var moodBtn = e.target.closest("[data-edit-mood]");
    if (moodBtn) {
      state.editMood = moodBtn.getAttribute("data-edit-mood");
      Array.prototype.forEach.call(card.querySelectorAll("[data-edit-mood]"), function (b) {
        b.classList.toggle("active", b === moodBtn);
      });
      return;
    }

    var action = e.target.closest("[data-entry-action]");
    if (action) {
      var kind = action.getAttribute("data-entry-action");
      var entry = state.entries.find(function (x) { return x.id === id; });
      if (kind === "edit") {
        state.editingId = id;
        state.editMood = entry.mood;
        draw();
      } else if (kind === "cancel") {
        state.editingId = null;
        draw();
      } else if (kind === "delete") {
        removeEntry(id);
      } else if (kind === "day") {
        openDayViewer(dateKey(entry.date));
      }
      return;
    }

    if (card.classList.contains("is-editing") || e.target.closest("textarea, mark, a")) return;
    if (window.getSelection && String(window.getSelection()).length) return; // selecting text, not clicking
    var opening = state.expandedId !== id;
    state.expandedId = opening ? id : null;
    state.editingId = null;
    draw(opening ? id : null);
  });

  list.addEventListener("keydown", function (e) {
    var card = e.target.closest(".entry-card");
    if (card && e.target === card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      card.click();
    }
  });

  list.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-edit-form]");
    if (!form) return;
    e.preventDefault();
    saveEdit(form);
  });
}

/* Used by the constellation and the command palette to jump to an entry. */
export function revealEntry(id) {
  state.query = "";
  state.filterStatus = null;
  document.getElementById("searchInput").value = "";
  Array.prototype.forEach.call(document.querySelectorAll(".filter-chip"), function (c) { c.classList.remove("active"); });
  state.expandedId = id;
  state.editingId = null;
  draw(id);
  setTimeout(function () {
    var card = document.querySelector('.entry-card[data-id="' + CSS.escape(id) + '"]');
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 60);
}
