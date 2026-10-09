/* Date helpers and the views derived from entries. Day records themselves
   are read and written through api.js. */

export function dateKey(input) {
  var d = input instanceof Date ? input : new Date(input);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}


export function deriveTimelineFromEntries(entries, dateStr) {
  var forDay = entries.filter(function (e) { return dateKey(e.date) === dateStr; });
  forDay.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  return forDay.map(function (e) {
    return { id: e.id, time: e.date, text: e.text, mood: e.mood, source: "entry" };
  });
}

export function deriveMoodFromEntries(entries, dateStr) {
  var forDay = entries.filter(function (e) { return dateKey(e.date) === dateStr; });
  if (forDay.length === 0) return null;
  forDay.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return forDay[0].mood;
}
