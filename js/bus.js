/* One event for "data changed", so views like the today console and the
   companion can refresh without every module knowing about every other. */
export function emitChange(kind, detail) {
  document.dispatchEvent(new CustomEvent("logbook:data-changed", { detail: Object.assign({ kind: kind }, detail || {}) }));
}

export function onChange(handler) {
  document.addEventListener("logbook:data-changed", function (e) { handler(e.detail || {}); });
}
