/* Login screen for a server with accounts: log in, join with an invite
   code, or set a new password with a reset code from the admin. */
import { apiLogin, apiSignup, apiResetPassword } from './api.js';
import { getConnection, setConnection, serverBase, describeConnection } from './connection.js';
import { escapeHtml } from './utils.js';

var waiting = null;

var MODES = {
  login: { line: "this logbook is locked.", button: "unlock" },
  join: { line: "got an invite? make your account.", button: "create account" },
  reset: { line: "got a reset code from the admin? set a new password.", button: "set password" }
};

function field(label, name, type, autocomplete, extra) {
  return '<label class="lock-field" data-field="' + name + '"><span>' + label + "</span>" +
    '<input type="' + type + '" name="' + name + '" autocomplete="' + autocomplete + '"' + (extra || "") + "></label>";
}

/* What a browser keeps between people on a shared phone: the companion
   chat, unsaved drafts, an AI key saved in this browser, the focus timer's
   local history. Data from the old one-browser version stays put, but isn't
   offered for import into whoever logs in next. */
export function clearLocalTraces() {
  try { sessionStorage.clear(); } catch (e) {}
  try {
    localStorage.removeItem("logbook-ai");
    localStorage.removeItem("logbook-pomodoro");
    if (!localStorage.getItem("logbook-legacy-imported")) localStorage.setItem("logbook-legacy-imported", "switched-account");
  } catch (e) {}
}

export function showLock(reason) {
  if (waiting) return waiting;
  waiting = new Promise(function (resolve) {
    var mode = "login";
    var el = document.createElement("div");
    el.id = "lockScreen";
    el.className = "lock-screen";
    el.innerHTML =
      '<form class="lock-panel" autocomplete="on" novalidate>' +
        '<div class="lock-brand">logbook</div>' +
        '<p class="lock-line"></p>' +
        '<p class="lock-server">server: ' + escapeHtml(describeConnection()) + "</p>" +
        '<div class="lock-tabs" role="tablist">' +
          '<button type="button" class="lock-tab" data-mode="login">log in</button>' +
          '<button type="button" class="lock-tab" data-mode="join">join</button>' +
          '<button type="button" class="lock-tab" data-mode="reset">reset</button>' +
        "</div>" +
        field("invite code", "invite", "text", "off", ' placeholder="xxxx-xxxx-xxxx" spellcheck="false" autocapitalize="off"') +
        field("reset code", "code", "text", "off", ' placeholder="xxxx-xxxx-xxxx" spellcheck="false" autocapitalize="off"') +
        field("username", "username", "text", "username", ' spellcheck="false" autocapitalize="off" maxlength="32"') +
        field("password", "password", "password", "current-password", "") +
        field("password again", "password2", "password", "new-password", "") +
        '<p class="lock-hint" data-hint="new">at least 10 characters. the app never shows your logbook to anyone else, the admin included.</p>' +
        '<p class="lock-error" role="alert"></p>' +
        '<button type="submit" class="primary-btn"></button>' +
        '<button type="button" class="link-btn lock-switch" data-lock="device">use this device instead</button>' +
      "</form>";
    document.body.appendChild(el);
    document.body.classList.add("has-overlay", "is-booted");
    var form = el.querySelector("form");
    var f = form.elements;
    var err = form.querySelector(".lock-error");
    var last = getConnection().username || "";
    f.username.value = last;

    function setMode(next) {
      mode = next;
      var isNew = mode !== "login";
      form.querySelector(".lock-line").innerHTML = "&gt; " + (mode === "login" && reason === "expired" ? "session expired. log in again." : MODES[mode].line);
      form.querySelector("button[type=submit]").textContent = MODES[mode].button;
      form.querySelectorAll(".lock-tab").forEach(function (t) {
        t.classList.toggle("is-active", t.getAttribute("data-mode") === mode);
        t.setAttribute("aria-selected", String(t.getAttribute("data-mode") === mode));
      });
      form.querySelector('[data-field="invite"]').hidden = mode !== "join";
      form.querySelector('[data-field="code"]').hidden = mode !== "reset";
      form.querySelector('[data-field="password2"]').hidden = !isNew;
      form.querySelector('[data-hint="new"]').hidden = !isNew;
      f.password.setAttribute("autocomplete", isNew ? "new-password" : "current-password");
      form.querySelector('[data-field="password"] span').textContent = isNew ? "new password" : "password";
      err.textContent = "";
      var first = mode === "join" ? f.invite : mode === "reset" ? f.code : (f.username.value ? f.password : f.username);
      setTimeout(function () { first.focus(); }, 30);
    }
    setMode("login");

    form.querySelectorAll(".lock-tab").forEach(function (t) {
      t.addEventListener("click", function () { setMode(t.getAttribute("data-mode")); });
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      err.textContent = "";
      var username = f.username.value.trim().toLowerCase();
      if (mode !== "login") {
        if (!username) { err.textContent = "pick a username."; return f.username.focus(); }
        if (f.password.value.length < 10) { err.textContent = "password needs at least 10 characters."; return f.password.focus(); }
        if (f.password.value !== f.password2.value) { err.textContent = "the two passwords don't match."; return f.password2.focus(); }
      } else if (!f.password.value) {
        return f.password.focus();
      }
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        var base = serverBase();
        var res = mode === "join" ? await apiSignup(base, f.invite.value.trim(), username, f.password.value)
          : mode === "reset" ? await apiResetPassword(base, username, f.code.value.trim(), f.password.value)
          : await apiLogin(base, f.password.value, username);
        var who = res.user ? res.user.username : username;
        if (who !== last) {
          // a different person on this browser: start clean, so nothing of the
          // last one (chat in memory, a half-typed page, a pending autosave)
          // can show up or be saved into this account. The new login waits in
          // pendingToken until the fresh page loads: a save fired while this
          // page unloads goes out with no token and is refused.
          clearLocalTraces();
          setConnection({ token: "", pendingToken: res.token || "", username: who });
          location.reload();
          return;
        }
        setConnection({ token: res.token || "", username: who });
        el.remove();
        document.body.classList.remove("has-overlay");
        waiting = null;
        resolve(true);
      } catch (ex) {
        err.textContent = ex.status === 401 ? "wrong username or password."
          : ex.status === 429 || ex.status === 400 ? ex.detail
          : "can't reach the server.";
        f.password.select();
      } finally {
        btn.disabled = false;
      }
    });
    form.querySelector('[data-lock="device"]').addEventListener("click", function () {
      if (!confirm("switch this copy of logbook to keep data on this device? your server data stays on the server.")) return;
      clearLocalTraces();
      setConnection({ mode: "device", token: "" });
      location.reload();
    });
  });
  return waiting;
}

export function logout() {
  clearLocalTraces();
  setConnection({ token: "" });
  location.reload();
}
