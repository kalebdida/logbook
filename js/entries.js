import { escapeHtml, formatDate } from './utils.js';
import { dateKey } from './dayRecord.js';

/* Colors are CSS variables, so every theme recolors moods too.
   tint(a) gives a translucent version for backgrounds. */
function mood(key, code, label) {
  return {
    code: code,
    label: label,
    color: "var(--mood-" + key + ")",
    glow: "rgb(var(--mood-" + key + "-rgb) / 0.5)",
    tint: function (alpha) { return "rgb(var(--mood-" + key + "-rgb) / " + alpha + ")"; }
  };
}

export var STATUS = {
  good: mood("good", "200", "OK"),
  okay: mood("okay", "102", "PROCESSING"),
  rough: mood("rough", "500", "ERROR")
};

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

export function runDecrypt(id, text) {
  var el = document.getElementById("decrypt-" + id);
  if (!el) return;
  if (reduceMotion()) { el.textContent = text; return; }
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

export function renderConstellation(entries) {
  var el = document.getElementById("constellation");
  if (!el) return;
  if (entries.length === 0) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  var sorted = entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  el.innerHTML =
    '<div class="card-title">every entry, oldest first</div><div class="stars">' +
    sorted.map(function (e) {
      var s = STATUS[e.mood];
      var title = escapeHtml(formatDate(e.date) + " " + s.code);
      return '<button type="button" class="star" data-entry-id="' + escapeHtml(e.id) + '" title="' + title + '" aria-label="' + title + '" style="background:' + s.color + ";box-shadow:0 0 8px " + s.glow + '"></button>';
    }).join("") +
    "</div>";
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
  var s = STATUS[found.mood];
  var preview = found.text.length > 140 ? found.text.slice(0, 140) + "…" : found.text;
  el.innerHTML =
    '<div class="replay-header"><span>on this day</span><span class="replay-tag">' + replay.label + "</span></div>" +
    '<div class="entry-card-top">' +
      '<span class="dot" style="background:' + s.color + ";box-shadow:0 0 6px " + s.glow + '"></span>' +
      '<span class="entry-date">' + formatDate(found.date) + "</span>" +
      '<span class="entry-status" style="color:' + s.color + '">' + s.code + " " + s.label + "</span>" +
    "</div>" +
    '<p class="week-ago-text">' + escapeHtml(preview.replace(/\n+/g, " ")) + "</p>" +
    '<button type="button" class="link-btn replay-hint">open that day</button>';
  el.onclick = function () { onOpen(dateKey(found.date)); };
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
      ? "nothing logged yet. write the first entry above."
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
  var s = STATUS[e.mood];
  var isOpen = opts.expandedId === e.id;
  var isEditing = opts.editingId === e.id;
  var id = escapeHtml(e.id);

  var top =
    '<div class="entry-card-top">' +
      '<span class="dot" style="background:' + s.color + ";box-shadow:0 0 6px " + s.glow + '"></span>' +
      '<span class="entry-date">' + timeOf(e.date) + "</span>" +
      '<span class="entry-status" style="color:' + s.color + '">' + s.code + " " + s.label + "</span>" +
    "</div>";

  if (isEditing) {
    var moods = Object.keys(STATUS).map(function (m) {
      var st = STATUS[m];
      return '<button type="button" class="mood-btn mood-' + m + (m === e.mood ? " active" : "") + '" data-edit-mood="' + m + '">' + st.code + " " + st.label + "</button>";
    }).join("");
    return (
      '<div class="entry-card is-open is-editing" data-id="' + id + '">' + top +
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
    ? (opts.animateId === e.id ? '<span id="decrypt-' + id + '" class="decrypt-text"></span>' : '<span class="decrypt-text">' + highlight(e.text, q) + "</span>")
    : '<div class="clamp">' + highlight(e.text.replace(/\n+/g, " "), q) + "</div>";

  var actions = isOpen
    ? '<div class="entry-actions">' +
        '<button type="button" class="tool-btn" data-entry-action="day">view day</button>' +
        '<button type="button" class="tool-btn" data-entry-action="edit">edit</button>' +
        '<button type="button" class="tool-btn danger-btn" data-entry-action="delete">delete</button>' +
      "</div>"
    : "";

  return (
    '<div class="entry-card' + (isOpen ? " is-open" : "") + '" data-id="' + id + '"' + (isOpen ? "" : ' tabindex="0" role="button" aria-expanded="false"') + ">" +
      top + '<div class="entry-body">' + body + "</div>" + actions +
    "</div>"
  );
}
