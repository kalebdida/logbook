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

/* The longest run of days in a row with an entry, ever. */
export function bestStreak(entries) {
  var days = Array.from(new Set(entries.map(function (e) {
    var d = new Date(e.date);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  }))).sort(function (a, b) { return a - b; });
  var best = 0, run = 0;
  days.forEach(function (day, i) {
    run = i && day - days[i - 1] === 1 ? run + 1 : 1;
    if (run > best) best = run;
  });
  return best;
}

/* a small horizontal meter (pct 0-100); styled by .meter in components.css */
export function bar(pct) {
  var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return '<span class="meter" role="presentation"><i style="width:' + p + '%"></i></span>';
}
