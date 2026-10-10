/* Life areas shared by tasks, activities, goals, and the density map.
   Keep in sync with ActivityCategory in backend/app/schemas/common.py.
   icon is a name from icons.js. */
import { icon, hasIcon } from './icons.js';
import { escapeHtml } from './utils.js';

export var CATEGORIES = [
  { id: "coding", label: "Coding", icon: "code-xml" },
  { id: "learning", label: "Learning", icon: "book-open" },
  { id: "fitness", label: "Fitness", icon: "dumbbell" },
  { id: "faith", label: "Faith", icon: "cross" },
  { id: "social", label: "Social", icon: "users" },
  { id: "work", label: "Work", icon: "briefcase" },
  { id: "rest", label: "Rest", icon: "moon" },
  { id: "creativity", label: "Creativity", icon: "palette" },
  { id: "reflection", label: "Reflection", icon: "feather" }
];

var BY_ID = {};
CATEGORIES.forEach(function (c) { BY_ID[c.id] = c; });

export function categoryById(id) {
  return BY_ID[id] || null;
}

/* the area's icon as inline SVG ("" for no area) */
export function categoryIcon(cat) {
  return cat ? icon(cat.icon) : "";
}

export function categoryOptions(selected, emptyLabel) {
  var html = '<option value="">' + (emptyLabel || "no area") + "</option>";
  CATEGORIES.forEach(function (c) {
    html += '<option value="' + c.id + '"' + (c.id === selected ? " selected" : "") + ">" + c.label.toLowerCase() + "</option>";
  });
  return html;
}

/* Icons a habit can wear. Older habits may hold an emoji instead; those
   still show as written. */
export var HABIT_ICONS = [
  "cross", "book-open", "dumbbell", "footprints", "droplet", "apple", "bed", "moon",
  "sun", "code-xml", "pen-line", "music-2", "brain", "heart", "leaf", "coffee"
];

export function habitIcon(h) {
  if (h.icon && hasIcon(h.icon)) return icon(h.icon);
  if (h.icon) return '<span class="emoji-icon">' + escapeHtml(h.icon) + "</span>";
  var cat = categoryById(h.category);
  return cat ? icon(cat.icon) : icon("sparkle");
}
