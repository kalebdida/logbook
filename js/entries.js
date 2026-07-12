import { escapeHtml, formatDate } from './utils.js';

export var STATUS = {
  good: { code: "200", label: "OK", color: "#e8b95c", glow: "rgba(232,185,92,0.55)" },
  okay: { code: "102", label: "PROCESSING", color: "#4dd0c4", glow: "rgba(77,208,196,0.45)" },
  rough: { code: "500", label: "ERROR", color: "#c96a6a", glow: "rgba(201,106,106,0.45)" }
};

export function createEntry(mood, text) {
  return { id: Date.now().toString(), date: new Date().toISOString(), mood: mood, text: text };
}

export function mergeImportedEntries(existing, imported) {
  var existingIds = {};
  existing.forEach(function (e) { existingIds[e.id] = true; });
  var merged = existing.slice();
  var added = 0;
  imported.forEach(function (item) {
    if (item && item.id && item.date && item.mood && typeof item.text === "string" && !existingIds[item.id]) {
      merged.push(item);
      existingIds[item.id] = true;
      added++;
    }
  });
  return { entries: merged, added: added };
}

export function runDecrypt(id, text) {
  var el = document.getElementById("decrypt-" + id);
  if (!el) return;
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
  if (entries.length === 0) {
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";
  var sorted = entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  el.innerHTML = sorted
    .map(function (e) {
      var s = STATUS[e.mood];
      var title = escapeHtml(formatDate(e.date) + " \u00B7 " + s.code);
      return '<div class="star" title="' + title + '" style="background:' + s.color + ";box-shadow:0 0 8px " + s.glow + '"></div>';
    })
    .join("");
}

export function renderWeekAgo(entries, onExpand) {
  var el = document.getElementById("weekAgoSection");
  var target = new Date();
  target.setDate(target.getDate() - 7);
  var found = entries.find(function (e) { return new Date(e.date).toDateString() === target.toDateString(); });
  if (!found) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "block";
  var preview = found.text.length > 90 ? found.text.slice(0, 90) + "\u2026" : found.text;
  el.innerHTML =
    '<div class="verse-label" style="color:#4dd0c4">// one week ago</div>' +
    '<div class="week-ago-text">' + escapeHtml(preview.replace(/\n+/g, " ")) + "</div>";
  el.onclick = function () {
    onExpand(found.id);
  };
}

export function renderEntries(entries, query, filterStatus, expandedId) {
  var container = document.getElementById("entriesList");
  var emptyMsg = document.getElementById("entriesEmptyMsg");
  var sorted = entries.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  var q = query.trim().toLowerCase();
  var filtered = sorted.filter(function (e) {
    var matchesQuery = q === "" || e.text.toLowerCase().indexOf(q) !== -1;
    var matchesStatus = !filterStatus || e.mood === filterStatus;
    return matchesQuery && matchesStatus;
  });

  if (entries.length === 0) {
    container.innerHTML = "";
    emptyMsg.textContent = "nothing logged yet. the sky is empty. write the first one above.";
    emptyMsg.style.display = "block";
    return;
  }
  if (filtered.length === 0) {
    container.innerHTML = "";
    emptyMsg.textContent = "no entries match that search.";
    emptyMsg.style.display = "block";
    return;
  }
  emptyMsg.style.display = "none";

  container.innerHTML = filtered
    .map(function (e) {
      var s = STATUS[e.mood];
      var isOpen = expandedId === e.id;
      var bodyHtml = isOpen
        ? '<span id="decrypt-' + e.id + '" class="decrypt-text"></span>'
        : '<div class="clamp">' + escapeHtml(e.text.replace(/\n+/g, " ")) + "</div>";
      return (
        '<div class="entry-card" data-id="' + e.id + '">' +
        '<div class="entry-card-top">' +
        '<span class="dot" style="background:' + s.color + ";box-shadow:0 0 6px " + s.glow + '"></span>' +
        '<span class="entry-date">' + formatDate(e.date) + "</span>" +
        '<span class="entry-status" style="color:' + s.color + '">' + s.code + " " + s.label + "</span>" +
        "</div>" +
        '<div class="entry-body">' + bodyHtml + "</div>" +
        "</div>"
      );
    })
    .join("");

  if (expandedId) {
    var openEntry = entries.find(function (e) { return e.id === expandedId; });
    if (openEntry) runDecrypt(openEntry.id, openEntry.text);
  }
}
