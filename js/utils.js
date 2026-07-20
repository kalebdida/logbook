export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(iso) {
  var d = new Date(iso);

  var date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  var time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });

  return date + " · " + time;
}

export function dayOfYear(d) {
  var start = new Date(d.getFullYear(), 0, 0);
  var diff = d - start;
  return Math.floor(diff / 86400000);
}
