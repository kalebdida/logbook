/* Streaks forgive one missed day a week (the streak charm): a single gap,
   with a written day on both sides, is bridged if that week's charm is
   still unused. Weeks start on Monday. The same rule lives in
   app/telegram.py (streak), so the bot and the app agree. */
function dayStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function weekOf(d) { var x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toDateString(); }

export function streakDetail(entries) {
  var days = {};
  entries.forEach(function (e) { days[new Date(e.date).toDateString()] = true; });
  var today = dayStart(new Date());
  var d = new Date(today);
  if (!days[d.toDateString()]) d.setDate(d.getDate() - 1);
  var used = {}, saved = [], streak = 0;
  for (var guard = 0; guard < 4000; guard++) {
    if (days[d.toDateString()]) { streak++; d.setDate(d.getDate() - 1); continue; }
    var before = new Date(d); before.setDate(before.getDate() - 1);
    var wk = weekOf(d);
    if (!used[wk] && days[before.toDateString()] && (streak > 0 || d < today)) {
      used[wk] = true;
      saved.push(new Date(d));
      d = before;
      continue;
    }
    break;
  }
  return { streak: streak, saved: saved, charmReady: !used[weekOf(today)] };
}

export function calcStreak(entries) {
  return entries.length ? streakDetail(entries).streak : 0;
}

/* The longest run of days in a row with an entry, ever. */
export function bestStreak(entries) {
  var days = Array.from(new Set(entries.map(function (e) {
    var d = new Date(e.date);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  }))).sort(function (a, b) { return a - b; });
  var best = 0, run = 0, usedWeek = null;
  days.forEach(function (day, i) {
    var gap = i ? day - days[i - 1] : 0;
    var missed = day - 1;                                   // the day a charm would cover
    var week = Math.floor((missed + 3) / 7);                // Monday-based week number (1970-01-01 was a Thursday)
    if (i && gap === 1) run++;
    else if (i && gap === 2 && usedWeek !== week) { run++; usedWeek = week; }
    else { run = 1; usedWeek = null; }
    if (run > best) best = run;
  });
  return best;
}

/* a small horizontal meter (pct 0-100); styled by .meter in components.css */
export function bar(pct) {
  var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return '<span class="meter" role="presentation"><i style="width:' + p + '%"></i></span>';
}
