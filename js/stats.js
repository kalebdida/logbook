import { STATUS } from './entries.js';

export function calcStreak(entries) {
  if (entries.length === 0) return 0;
  var days = {};
  entries.forEach(function (e) { days[new Date(e.date).toDateString()] = true; });
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!days[d.toDateString()]) { d.setDate(d.getDate() - 1); }
  var streak = 0;
  while (days[d.toDateString()]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function bar(pct, width) {
  width = width || 10;
  var filled = Math.max(0, Math.round((pct / 100) * width));
  var empty = Math.max(0, width - filled);
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

export function renderStats(entries) {
  var total = entries.length;
  var row = document.getElementById("statsRow");
  var bars = document.getElementById("statsBars");
  if (total === 0) {
    row.style.display = "none";
    bars.style.display = "none";
    return;
  }
  row.style.display = "grid";
  bars.style.display = "block";
  var streak = calcStreak(entries);
  document.getElementById("uptimeValue").textContent = streak + (streak === 1 ? " day" : " days");
  document.getElementById("totalValue").textContent = String(total);

  var counts = { good: 0, okay: 0, rough: 0 };
  entries.forEach(function (e) { if (counts[e.mood] !== undefined) counts[e.mood]++; });

  var html = "";
  Object.keys(STATUS).forEach(function (key) {
    var s = STATUS[key];
    var pct = total ? Math.round((counts[key] / total) * 100) : 0;
    html +=
      '<div class="bar-row" style="color:' + s.color + '">' +
      '<span class="bar-label">' + s.code + " " + s.label + "</span>" +
      "<span>" + bar(pct) + "</span>" +
      '<span class="bar-pct">' + pct + "%</span>" +
      "</div>";
  });
  bars.innerHTML = html;
}
