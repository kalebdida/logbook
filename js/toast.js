/* Small status messages, bottom right, styled as terminal output. */
var MAX_VISIBLE = 4;

export function toast(message, kind, options) {
  var host = document.getElementById("toasts");
  if (!host) return;
  var el = document.createElement("div");
  el.className = "toast toast--" + (kind || "ok");
  el.setAttribute("role", kind === "error" ? "alert" : "status");

  var text = document.createElement("span");
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
