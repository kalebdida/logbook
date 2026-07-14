export function dateKey(input) {
  var d = input instanceof Date ? input : new Date(input);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function createEmptyDayRecord(dateStr) {
  return {
    date: dateStr,
    morning: { intention: "", mainFocus: "", goals: [] },
    tasks: [],
    timeline: { morning: "",  afternoon: "",  evening: "",  highlight: "", unexpected: ""},
    journal: "",
    nightReflection: { whatHappened: "", wins: "", lessons: "", tomorrowPlan: "", gratitude: "" },
    brainDump: "",
    mood: null,
    activities: [],
    goals: [],
    statistics: {}
  };
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

export function getDayRecord(dateStr, entries, storedDays) {
  var stored = (storedDays && storedDays[dateStr]) || {};
  var empty = createEmptyDayRecord(dateStr);
  var explicitMood = stored.mood !== undefined && stored.mood !== null ? stored.mood : null;
  return {
    date: dateStr,
    morning: stored.morning || empty.morning,
    tasks: stored.tasks || empty.tasks,
    timeline: stored.timeline || empty.timeline,
    journal: stored.journal !== undefined ? stored.journal : empty.journal,
    nightReflection: stored.nightReflection || empty.nightReflection,
    brainDump: stored.brainDump !== undefined ? stored.brainDump : empty.brainDump,
    mood: explicitMood !== null ? explicitMood : deriveMoodFromEntries(entries, dateStr),
    activities: stored.activities || empty.activities,
    goals: stored.goals || empty.goals,
    statistics: stored.statistics || empty.statistics
  };
}

export function updateDayRecord(storedDays, dateStr, patch) {
  var next = {};
  var k;
  for (k in storedDays) { if (storedDays.hasOwnProperty(k)) next[k] = storedDays[k]; }
  var existing = next[dateStr] || {};
  next[dateStr] = Object.assign({}, existing, patch);
  return next;
}