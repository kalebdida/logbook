/* Login screen for a password-protected server. */
import { apiLogin } from './api.js';
import { setConnection, serverBase, describeConnection } from './connection.js';
import { escapeHtml } from './utils.js';

var waiting = null;

export function showLock(reason) {
  if (waiting) return waiting;
  waiting = new Promise(function (resolve) {
    var el = document.createElement("div");
    el.id = "lockScreen";
    el.className = "lock-screen";
    el.innerHTML =
      '<form class="lock-panel" autocomplete="on">' +
        '<div class="lock-brand">logbook</div>' +
        '<p class="lock-line">&gt; ' + (reason === "expired" ? "session expired. log in again." : "this logbook is locked.") + "</p>" +
        '<p class="lock-server">server: ' + escapeHtml(describeConnection()) + "</p>" +
        '<label class="lock-field"><span>password</span>' +
          '<input type="password" name="password" autocomplete="current-password" required autofocus></label>' +
        '<p class="lock-error" role="alert"></p>' +
        '<button type="submit" class="primary-btn">unlock</button>' +
        '<button type="button" class="link-btn lock-switch" data-lock="device">use this device instead</button>' +
      "</form>";
    document.body.appendChild(el);
    document.body.classList.add("has-overlay", "is-booted");
    var form = el.querySelector("form");
    var input = form.elements.password;
    setTimeout(function () { input.focus(); }, 50);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var err = form.querySelector(".lock-error");
      err.textContent = "";
      form.querySelector("button[type=submit]").disabled = true;
      try {
        var res = await apiLogin(serverBase(), input.value);
        setConnection({ token: res.token || "" });
        el.remove();
        document.body.classList.remove("has-overlay");
        waiting = null;
        resolve(true);
      } catch (ex) {
        err.textContent = ex.status === 401 ? "wrong password." : ex.status === 429 ? ex.detail : "can't reach the server.";
        input.select();
      } finally {
        form.querySelector("button[type=submit]").disabled = false;
      }
    });
    form.querySelector('[data-lock="device"]').addEventListener("click", function () {
      if (!confirm("switch this copy of logbook to keep data on this device? your server data stays on the server.")) return;
      setConnection({ mode: "device", token: "" });
      location.reload();
    });
  });
  return waiting;
}

export function logout() {
  setConnection({ token: "" });
  location.reload();
}
