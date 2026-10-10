import { escapeHtml, formatDate } from './utils.js';
import { dateKey } from './dayRecord.js';
import { icon } from './icons.js';

/* Moods are weather: a clear day, some clouds, rain. Colors are CSS
   variables, so every theme recolors them too. tint(a) gives a
   translucent version for backgrounds. */
function mood(key, label, iconName) {
  return {
    key: key,
    label: label,
    icon: iconName,
    color: "var(--mood-" + key + ")",
    glow: "rgb(var(--mood-" + key + "-rgb) / 0.5)",
    tint: function (alpha) { return "rgb(var(--mood-" + key + "-rgb) / " + alpha + ")"; }
  };
}

export var STATUS = {
  good: mood("good", "good", "sun"),
  okay: mood("okay", "okay", "cloud-sun"),
  rough: mood("rough", "rough", "cloud-rain")
};

/* A small colored label: icon + word. */
export function moodTag(key, extraClass) {
  var s = STATUS[key];
  if (!s) return "";
  return '<span class="mood-tag mood-tag--' + key + (extraClass ? " " + extraClass : "") + '">' + icon(s.icon) + "<span>" + s.label + "</span></span>";
}

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

/* Opening an entry: the terminal theme types it out in binary; every other
   look just lets it fade in (CSS). */
export function runDecrypt(id, text) {
  var el = document.getElementById("decrypt-" + id);
  if (!el) return;
  if (reduceMotion() || document.documentElement.dataset.theme !== "terminal") { el.textContent = text; return; }
  var frame = 0;
  var totalFrames = 12;
  var chars = "01";
  var timer = setInterval(function () {
    frame++;
    if (frame >= totalFrames) {
      el.textContent = text;
      clearInterval(timer);
      return;
    }
    var revealCount = Math.floor((frame / totalFrames) * text.length);
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === "\n" || c === " ") out += c;
      else out += i < revealCount ? c : chars[Math.floor(Math.random() * chars.length)];
    }
    el.textContent = out;
  }, 30);
}

/* "On this day": the oldest anniversary that has an entry wins:
   a year ago, then a month ago, then a week ago. */
function findReplay(entries) {
  var spans = [
    { label: "1 year ago", shift: function (d) { d.setFullYear(d.getFullYear() - 1); } },
    { label: "1 month ago", shift: function (d) { d.setMonth(d.getMonth() - 1); } },
    { label: "7 days ago", shift: function (d) { d.setDate(d.getDate() - 7); } }
  ];
  for (var i = 0; i < spans.length; i++) {
    var target = new Date();
    spans[i].shift(target);
    var key = dateKey(target);
    var found = entries.filter(function (e) { return dateKey(e.date) === key; });
    if (found.length) {
      found.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      return { entry: found[0], label: spans[i].label };
    }
  }
  return null;
}

export function renderWeekAgo(entries, onOpen) {
  var el = document.getElementById("weekAgoSection");
  if (!el) return;
  var replay = findReplay(entries);
  if (!replay) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  var found = replay.entry;
  el.hidden = false;
  var preview = found.text.length > 160 ? found.text.slice(0, 160) + "…" : found.text;
  el.innerHTML =
    '<div class="card-head">' +
      '<h3 class="card-title">' + icon("history") + "<span>on this day</span></h3>" +
      '<span class="card-meta">' + replay.label + "</span>" +
    "</div>" +
    '<div class="replay-meta">' + moodTag(found.mood) + '<span class="entry-date">' + formatDate(found.date) + "</span></div>" +
    '<p class="week-ago-text">' + escapeHtml(preview.replace(/\n+/g, " ")) + "</p>" +
    '<span class="replay-hint">open that day ' + icon("arrow-right") + "</span>";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.onclick = function () { onOpen(dateKey(found.date)); };
  el.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(dateKey(found.date)); } };
}

function highlight(text, query) {
  var safe = escapeHtml(text);
  var q = (query || "").trim();
  if (!q) return safe;
  var pattern = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(pattern, "gi"), function (m) { return "<mark>" + m + "</mark>"; });
}

function dayHeading(key) {
  var today = dateKey(new Date());
  var y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return "today";
  if (key === dateKey(y)) return "yesterday";
  var parts = key.split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).toLowerCase();
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/* opts: { query, filterStatus, expandedId, editingId, animateId } */
export function renderEntries(entries, opts) {
  opts = opts || {};
  var container = document.getElementById("entriesList");
  var emptyMsg = document.getElementById("entriesEmptyMsg");
  var count = document.getElementById("entriesCount");
  var sorted = entries.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  var q = (opts.query || "").trim().toLowerCase();
  var filtered = sorted.filter(function (e) {
    var matchesQuery = q === "" || e.text.toLowerCase().indexOf(q) !== -1;
    var matchesStatus = !opts.filterStatus || e.mood === opts.filterStatus;
    return matchesQuery && matchesStatus;
  });

  if (count) {
    count.textContent = filtered.length === entries.length
      ? entries.length + (entries.length === 1 ? " entry" : " entries")
      : filtered.length + " of " + entries.length;
  }

  if (entries.length === 0 || filtered.length === 0) {
    container.innerHTML = "";
    emptyMsg.textContent = entries.length === 0
      ? "nothing here yet. your first entry will show up here."
      : "no entries match that search.";
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  var html = "";
  var lastKey = null;
  filtered.forEach(function (e) {
    var key = dateKey(e.date);
    if (key !== lastKey) {
      if (lastKey !== null) html += "</div>";
      html += '<div class="entry-day"><h3 class="entry-day-heading">' + dayHeading(key) + "</h3>";
      lastKey = key;
    }
    html += entryCard(e, opts, q);
  });
  html += "</div>";
  container.innerHTML = html;

  if (opts.animateId) {
    var open = entries.find(function (e) { return e.id === opts.animateId; });
    if (open) runDecrypt(open.id, open.text);
  }

  if (opts.editingId) {
    var ta = container.querySelector(".entry-edit textarea");
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
}

function entryCard(e, opts, q) {
  var isOpen = opts.expandedId === e.id;
  var isEditing = opts.editingId === e.id;
  var id = escapeHtml(e.id);
  var moodClass = STATUS[e.mood] ? " entry-card--" + e.mood : "";

  var top =
    '<div class="entry-card-top">' +
      '<span class="entry-date">' + timeOf(e.date) + "</span>" +
      moodTag(e.mood, "entry-status") +
    "</div>";

  if (isEditing) {
    var moods = Object.keys(STATUS).map(function (m) {
      var st = STATUS[m];
      return '<button type="button" class="mood-btn mood-' + m + (m === e.mood ? " active" : "") + '" data-edit-mood="' + m + '">' + icon(st.icon) + "<span>" + st.label + "</span></button>";
    }).join("");
    return (
      '<div class="entry-card is-open is-editing' + moodClass + '" data-id="' + id + '">' + top +
        '<form class="entry-edit" data-edit-form="' + id + '">' +
          '<div class="mood-row">' + moods + "</div>" +
          '<textarea class="text-area" rows="5" aria-label="entry text">' + escapeHtml(e.text) + "</textarea>" +
          '<div class="entry-actions">' +
            '<button type="button" class="tool-btn" data-entry-action="cancel">cancel</button>' +
            '<button type="submit" class="primary-btn">save changes</button>' +
          "</div>" +
        "</form>" +
      "</div>"
    );
  }

  var body = isOpen
    ? (opts.animateId === e.id ? '<span id="decrypt-' + id + '" class="decrypt-text is-revealing"></span>' : '<span class="decrypt-text">' + highlight(e.text, q) + "</span>")
    : '<div class="clamp">' + highlight(e.text.replace(/\n+/g, " "), q) + "</div>";

  var actions = isOpen
    ? '<div class="entry-actions">' +
        '<button type="button" class="tool-btn" data-entry-action="day">' + icon("calendar-days") + "<span>view day</span></button>" +
        '<button type="button" class="tool-btn" data-entry-action="edit">' + icon("pencil") + "<span>edit</span></button>" +
        '<button type="button" class="tool-btn danger-btn" data-entry-action="delete">' + icon("trash-2") + "<span>delete</span></button>" +
      "</div>"
    : "";

  return (
    '<div class="entry-card' + (isOpen ? " is-open" : "") + moodClass + '" data-id="' + id + '"' + (isOpen ? "" : ' tabindex="0" role="button" aria-expanded="false"') + ">" +
      top + '<div class="entry-body">' + body + "</div>" + actions +
    "</div>"
  );
}
