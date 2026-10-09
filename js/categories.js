/* Life areas shared by tasks, activities, goals, and the density map.
   Keep in sync with ActivityCategory in backend/app/schemas/common.py. */
export var CATEGORIES = [
  { id: "coding", label: "Coding", icon: "💻" },
  { id: "learning", label: "Learning", icon: "📚" },
  { id: "fitness", label: "Fitness", icon: "🏋" },
  { id: "faith", label: "Faith", icon: "🙏" },
  { id: "social", label: "Social", icon: "👥" },
  { id: "work", label: "Work", icon: "💼" },
  { id: "rest", label: "Rest", icon: "🧘" },
  { id: "creativity", label: "Creativity", icon: "🎨" },
  { id: "reflection", label: "Reflection", icon: "📝" }
];

var BY_ID = {};
CATEGORIES.forEach(function (c) { BY_ID[c.id] = c; });

export function categoryById(id) {
  return BY_ID[id] || null;
}

export function categoryOptions(selected, emptyLabel) {
  var html = '<option value="">' + (emptyLabel || "no area") + "</option>";
  CATEGORIES.forEach(function (c) {
    html += '<option value="' + c.id + '"' + (c.id === selected ? " selected" : "") + ">" + c.icon + " " + c.label.toLowerCase() + "</option>";
  });
  return html;
}
