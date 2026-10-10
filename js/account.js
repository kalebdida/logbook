/* Settings card for accounts on a server: who you're logged in as, your
   password, and, for the admin, invites and the list of people. The admin
   sees names and join dates only; there's nothing here (or on the server)
   that shows anyone else's logbook. */
import { icon } from './icons.js';
import {
  apiAuthStatus, apiMe, apiChangePassword, apiLogoutEverywhere, apiDeleteAccount,
  apiListInvites, apiCreateInvite, apiCancelInvite, apiListUsers, apiResetCode, apiRemoveUser
} from './api.js';
import { isDevice, setConnection, serverBase } from './connection.js';
import { logout, clearLocalTraces } from './lock.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

function day(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toLowerCase();
}

function serverAddress() {
  return serverBase() || location.origin;
}

function codeBox(code, kind, who) {
  var message = kind === "reset"
    ? "your logbook reset code: " + code + "\nopen " + serverAddress() + ", tap reset, use your username (" + who + ") and this code. it works once, for 2 days."
    : "you're invited to logbook: " + serverAddress() + "\ntap join and use this code: " + code + "\nit works once. your logbook is private: the app never shows it to anyone else, me included.";
  return '<div class="code-box" data-message="' + escapeHtml(message) + '">' +
    '<p class="code-box-label">' + (kind === "reset" ? "reset code for " + escapeHtml(who) : "invite code") + " · shown once, copy it now</p>" +
    '<code class="code-box-code">' + escapeHtml(code) + "</code>" +
    '<div class="settings-actions"><button type="button" class="primary-btn" data-copy-message>copy message</button>' +
    '<button type="button" class="tool-btn" data-copy-code>copy code</button></div>' +
  "</div>";
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("copied");
  } catch (e) {
    prompt("copy this:", text);
  }
}

function inviteRow(i) {
  var state = i.status === "used" ? "joined as " + escapeHtml(i.used_by || "?") + " · " + day(i.used_at)
    : i.status === "expired" ? "expired " + day(i.expires_at)
    : "open until " + day(i.expires_at);
  return '<li class="people-row" data-invite="' + i.id + '">' +
    '<span class="people-main"><span class="people-name">' + escapeHtml(i.note || (i.kind === "reset" ? "reset" : "invite")) + "</span>" +
    '<span class="people-meta">' + (i.kind === "reset" ? "reset code · " : "") + state + "</span></span>" +
    (i.status === "open" ? '<button type="button" class="link-btn" data-cancel-invite>cancel</button>' : "") +
  "</li>";
}

function userRow(u) {
  return '<li class="people-row" data-user="' + u.id + '" data-name="' + escapeHtml(u.username) + '">' +
    '<span class="people-main"><span class="people-name">' + escapeHtml(u.username) + (u.is_admin ? ' <span class="people-badge">admin</span>' : "") + "</span>" +
    '<span class="people-meta">joined ' + day(u.created_at) + "</span></span>" +
    (u.is_admin ? "" : '<button type="button" class="link-btn" data-reset-user>reset code</button><button type="button" class="link-btn habit-del" data-remove-user>remove</button>') +
  "</li>";
}

async function renderPeople(box) {
  var results = await Promise.all([apiListUsers(), apiListInvites()]);
  var users = results[0], invites = results[1];
  box.querySelector("[data-users]").innerHTML = users.map(userRow).join("");
  var recent = invites.filter(function (i) { return i.status === "open" || i.kind === "signup"; }).slice(0, 12);
  box.querySelector("[data-invites]").innerHTML = recent.length
    ? recent.map(inviteRow).join("")
    : '<li class="people-empty">no invites yet.</li>';
}

export async function renderAccountCard(el) {
  if (!el) return;
  if (isDevice()) { el.hidden = true; return; }
  var status;
  try { status = await apiAuthStatus(); } catch (e) { el.hidden = true; return; }
  if (!status.accounts || !status.user) { el.hidden = true; return; }
  el.hidden = false;
  var me = status.user;
  var lastReset = null;
  if (!me.is_admin) {
    try { lastReset = (await apiMe()).last_reset_at; } catch (e) {}
  }

  el.innerHTML =
    '<h3 class="daily-section-title">' + icon("user") + "<span>account</span></h3>" +
    '<p class="storage-now"><span class="status-dot is-online"></span> logged in as <strong>' + escapeHtml(me.username) + "</strong>" +
      (me.is_admin ? ' <span class="people-badge">admin</span>' : "") + "</p>" +
    (me.is_admin
      ? '<p class="setting-hint">each person\'s logbook is theirs alone: the app has no screen or route that shows you anyone else\'s. you can see names and join dates.</p>'
      : '<p class="setting-hint">your logbook is yours alone. nobody else on this server can open it in the app, the admin included. if you forget your password the admin can give you a reset code, and any reset shows up right here.</p>') +
    (lastReset
      ? '<p class="setting-hint storage-risk">your password was last set with a reset code on ' + escapeHtml(day(lastReset)) + ". if that wasn't you, change your password and talk to the admin.</p>"
      : "") +
    '<div class="settings-actions">' +
      '<button type="button" class="tool-btn" data-logout>log out</button>' +
      '<button type="button" class="tool-btn" data-logout-all>log out everywhere</button>' +
    "</div>" +

    (me.is_admin
      ? '<p class="setting-hint">your password is LOGBOOK_PASSWORD on the server. change it there (render → environment) and every device signs out.</p>'
      : '<details class="connect-box"><summary>change password</summary>' +
          '<form class="connect-form" data-password-form autocomplete="off">' +
            '<input type="text" name="username" autocomplete="username" value="' + escapeHtml(me.username) + '" hidden>' +
            '<label class="setting-row"><span class="setting-text"><span class="setting-label">current password</span></span>' +
              '<input class="text-input" name="current" type="password" autocomplete="current-password" required></label>' +
            '<label class="setting-row"><span class="setting-text"><span class="setting-label">new password</span><span class="setting-hint">at least 10 characters. your other devices will need it.</span></span>' +
              '<input class="text-input" name="next" type="password" autocomplete="new-password" minlength="10" required></label>' +
            '<button type="submit" class="primary-btn">change password</button>' +
          "</form></details>") +

    (me.is_admin
      ? '<div class="people" data-people>' +
          '<h4 class="people-title">invite someone</h4>' +
          '<form class="habit-add" data-invite-form autocomplete="off">' +
            '<input class="text-input" name="note" maxlength="60" placeholder="who\'s it for? (only you see this)" aria-label="who the invite is for">' +
            '<button type="submit" class="primary-btn">make invite</button>' +
          "</form>" +
          '<div data-code-slot></div>' +
          '<h4 class="people-title">people</h4><ul class="people-list" data-users></ul>' +
          '<h4 class="people-title">invites</h4><ul class="people-list" data-invites></ul>' +
        "</div>"
      : '<details class="connect-box danger-zone"><summary>delete my account</summary>' +
          '<form class="connect-form" data-delete-form autocomplete="off">' +
            '<p class="setting-hint">deletes your account and everything in it from the server, for good. download a backup first (your data, above) if you want to keep it.</p>' +
            '<label class="setting-row"><span class="setting-text"><span class="setting-label">your password</span></span>' +
              '<input class="text-input" name="password" type="password" autocomplete="current-password" required></label>' +
            '<button type="submit" class="tool-btn habit-del">delete my account</button>' +
          "</form></details>");

  el.querySelector("[data-logout]").addEventListener("click", logout);
  el.querySelector("[data-logout-all]").addEventListener("click", async function () {
    if (!confirm("sign out every device logged in as " + me.username + ", this one included?")) return;
    try {
      await apiLogoutEverywhere();
      logout();
    } catch (e) { toast("couldn't do that: " + (e.detail || e.message), "error"); }
  });

  var pw = el.querySelector("[data-password-form]");
  if (pw) pw.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = pw.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      var res = await apiChangePassword(pw.elements.current.value, pw.elements.next.value);
      setConnection({ token: res.token });
      pw.reset();
      pw.closest("details").open = false;
      toast("password changed. other devices are signed out.");
    } catch (ex) {
      toast(ex.status === 401 ? "current password is wrong" : (ex.detail || ex.message), "error");
    } finally { btn.disabled = false; }
  });

  var del = el.querySelector("[data-delete-form]");
  if (del) del.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!confirm("delete your account and everything in it? this can't be undone.")) return;
    try {
      await apiDeleteAccount(del.elements.password.value);
      clearLocalTraces();
      setConnection({ token: "", username: "" });
      location.reload();
    } catch (ex) {
      toast(ex.status === 401 ? "wrong password" : (ex.detail || ex.message), "error");
    }
  });

  var people = el.querySelector("[data-people]");
  if (!people) return;
  var slot = people.querySelector("[data-code-slot]");
  try { await renderPeople(people); } catch (e) { toast("couldn't load people: " + (e.detail || e.message), "error"); }

  people.querySelector("[data-invite-form]").addEventListener("submit", async function (e) {
    e.preventDefault();
    var form = e.target;
    try {
      var inv = await apiCreateInvite(form.elements.note.value.trim());
      slot.innerHTML = codeBox(inv.code, "signup");
      form.reset();
      renderPeople(people);
    } catch (ex) { toast(ex.detail || ex.message, "error"); }
  });

  people.addEventListener("click", async function (e) {
    var t = e.target;
    var box = t.closest(".code-box");
    if (t.closest("[data-copy-message]") && box) return copy(box.getAttribute("data-message"));
    if (t.closest("[data-copy-code]") && box) return copy(box.querySelector("code").textContent);

    var inviteRowEl = t.closest("[data-invite]");
    if (t.closest("[data-cancel-invite]") && inviteRowEl) {
      try { await apiCancelInvite(inviteRowEl.getAttribute("data-invite")); renderPeople(people); }
      catch (ex) { toast(ex.detail || ex.message, "error"); }
      return;
    }
    var row = t.closest("[data-user]");
    if (!row) return;
    var id = row.getAttribute("data-user"), name = row.getAttribute("data-name");
    if (t.closest("[data-reset-user]")) {
      if (!confirm("make a one-time reset code for " + name + "? they use it to set a new password. their old password stops working once they do.")) return;
      try {
        var r = await apiResetCode(id);
        slot.innerHTML = codeBox(r.code, "reset", name);
        renderPeople(people);
      } catch (ex) { toast(ex.detail || ex.message, "error"); }
    }
    if (t.closest("[data-remove-user]") && !row.querySelector("form")) {
      var form = document.createElement("form");
      form.className = "people-confirm";
      form.innerHTML =
        '<span class="setting-hint">removes ' + escapeHtml(name) + " and everything they wrote, for good. your admin password:</span>" +
        '<input class="text-input" type="password" name="password" autocomplete="current-password" required aria-label="admin password">' +
        '<button type="submit" class="tool-btn habit-del">remove</button><button type="button" class="link-btn" data-cancel-remove>cancel</button>';
      row.appendChild(form);
      form.elements.password.focus();
      form.querySelector("[data-cancel-remove]").addEventListener("click", function () { form.remove(); });
      form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        try {
          await apiRemoveUser(id, form.elements.password.value);
          toast(name + " removed");
          renderPeople(people);
        } catch (ex) { toast(ex.status === 401 ? "wrong password" : (ex.detail || ex.message), "error"); }
      });
    }
  });
}
