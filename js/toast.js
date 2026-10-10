/* Small status messages that float up from the bottom. */
import { icon } from './icons.js';

var MAX_VISIBLE = 4;
var ICONS = { ok: "circle-check", warn: "triangle-alert", error: "circle-x" };

export function toast(message, kind, options) {
  var host = document.getElementById("toasts");
  if (!host) return;
  var el = document.createElement("div");
  el.className = "toast toast--" + (kind || "ok");
  el.setAttribute("role", kind === "error" ? "alert" : "status");

  var mark = document.createElement("span");
  mark.className = "toast-icon";
  mark.innerHTML = icon(ICONS[kind] || ICONS.ok);
  el.appendChild(mark);

  var text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  el.appendChild(text);

  if (options && options.action) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = options.action.label;
    btn.addEventListener("click", function () {
      options.action.run();
      dismiss();
    });
    el.appendChild(btn);
  }

  host.appendChild(el);
  while (host.children.length > MAX_VISIBLE) host.removeChild(host.firstChild);

  var timer = setTimeout(dismiss, (options && options.duration) || (kind === "error" ? 6000 : 2800));
  function dismiss() {
    clearTimeout(timer);
    el.classList.add("toast--leaving");
    setTimeout(function () { el.remove(); }, 200);
  }
  return dismiss;
}
