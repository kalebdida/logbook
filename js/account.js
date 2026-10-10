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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function serverAddress() {
  return serverBase() || location.origin;
}

function avatar(name, big) {
  var n = String(name || "?").trim();
  // a stable hue per name, mixed from the theme's own colors
  var h = 0;
  for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return '<span class="avatar' + (big ? " avatar--lg" : "") + '" data-tint="' + (h % 4) + '" aria-hidden="true">' + escapeHtml(n.charAt(0).toUpperCase()) + "</span>";
}

function codeBox(code, kind, who) {
  var message = kind === "reset"
    ? "Your Logbook reset code: " + code + "\nOpen " + serverAddress() + ", tap Reset, and use your username (" + who + ") with this code. It works once, for 2 days."
    : "You're invited to Logbook: " + serverAddress() + "\nTap Join and use this code: " + code + "\nIt works once. Your logbook is private: the app never shows it to anyone else, me included.";
  return '<div class="code-box" data-message="' + escapeHtml(message) + '">' +
    '<p class="code-box-label">' + icon("key-round") + "<span>" + (kind === "reset" ? "Reset code for " + escapeHtml(who) : "Invite code") + "</span><em>Shown once. Copy it now.</em></p>" +
    '<code class="code-box-code">' + escapeHtml(code) + "</code>" +
    '<div class="settings-actions"><button type="button" class="primary-btn" data-copy-message>' + icon("send") + "<span>Copy invite message</span></button>" +
    '<button type="button" class="tool-btn" data-copy-code>' + icon("copy") + "<span>Copy code</span></button></div>" +
  "</div>";
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch (e) {
    prompt("Copy this:", text);
  }
}

function inviteRow(i) {
  var pill = i.status === "used" ? '<span class="pill pill--ok">Joined</span>'
    : i.status === "expired" ? '<span class="pill">Expired</span>'
    : '<span class="pill pill--open">Open</span>';
  var state = i.status === "used" ? "joined as " + escapeHtml(i.used_by || "?") + " · " + day(i.used_at)
    : i.status === "expired" ? "expired " + day(i.expires_at)
    : "open until " + day(i.expires_at);
  return '<li class="people-row" data-invite="' + i.id + '">' +
    '<span class="people-icon" aria-hidden="true">' + icon(i.kind === "reset" ? "key-round" : "mail") + "</span>" +
    '<span class="people-main"><span class="people-name">' + escapeHtml(i.note || (i.kind === "reset" ? "Reset code" : "Invite")) + " " + pill + "</span>" +
    '<span class="people-meta">' + (i.kind === "reset" ? "Reset code · " : "") + state + "</span></span>" +
    (i.status === "open" ? '<button type="button" class="tool-btn tool-btn--sm" data-cancel-invite>Cancel</button>' : "") +
  "</li>";
}

function userRow(u) {
  return '<li class="people-row" data-user="' + u.id + '" data-name="' + escapeHtml(u.username) + '">' +
    avatar(u.username) +
    '<span class="people-main"><span class="people-name">' + escapeHtml(u.username) + (u.is_admin ? ' <span class="people-badge">' + icon("shield-check") + "Admin</span>" : "") + "</span>" +
    '<span class="people-meta">Joined ' + day(u.created_at) + "</span></span>" +
    (u.is_admin ? "" : '<span class="people-actions"><button type="button" class="tool-btn tool-btn--sm" data-reset-user>' + icon("key-round") + "<span>Reset code</span></button>" +
      '<button type="button" class="tool-btn tool-btn--sm danger-btn" data-remove-user>' + icon("trash-2") + "<span>Remove</span></button></span>") +
  "</li>";
}

async function renderPeople(box) {
  var results = await Promise.all([apiListUsers(), apiListInvites()]);
  var users = results[0], invites = results[1];
  box.querySelector("[data-users]").innerHTML = users.map(userRow).join("");
  var count = box.querySelector("[data-people-count]");
  if (count) count.textContent = users.length + (users.length === 1 ? " person" : " people");
  var recent = invites.filter(function (i) { return i.status === "open" || i.kind === "signup"; }).slice(0, 12);
  box.querySelector("[data-invites]").innerHTML = recent.length
    ? recent.map(inviteRow).join("")
    : '<li class="people-empty">No invites yet.</li>';
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
    '<div class="account-hero">' +
      avatar(me.username, true) +
      '<div class="account-who">' +
        '<p class="storage-now"><strong>' + escapeHtml(me.username) + "</strong>" +
          (me.is_admin ? ' <span class="people-badge">' + icon("shield-check") + "Admin</span>" : "") + "</p>" +
        '<p class="account-sub"><span class="status-dot is-online"></span>Logged in on ' + escapeHtml(serverAddress().replace(/^https?:\/\//, "")) + "</p>" +
      "</div>" +
      '<div class="account-actions">' +
        '<button type="button" class="tool-btn" data-logout>' + icon("log-out") + "<span>Log out</span></button>" +
        '<button type="button" class="tool-btn tool-btn--quiet" data-logout-all>Log out everywhere</button>' +
      "</div>" +
    "</div>" +
    '<p class="account-note">' + icon("lock") + "<span>" + (me.is_admin
      ? "Each person's logbook is theirs alone. There's no screen or route that shows you anyone else's; you see names and join dates."
      : "Your logbook is yours alone. Nobody else on this server can open it in the app, the admin included. If you forget your password the admin can give you a reset code, and any reset shows up right here.") + "</span></p>" +
    (lastReset
      ? '<p class="setting-hint storage-risk">Your password was last set with a reset code on ' + escapeHtml(day(lastReset)) + ". If that wasn't you, change your password and talk to the admin.</p>"
      : "") +

    (me.is_admin
      ? '<p class="setting-hint">Your password is LOGBOOK_PASSWORD on the server. Change it there (Render → Environment) and every device signs out.</p>'
      : '<details class="connect-box"><summary>' + icon("key-round") + "<span>Change password</span></summary>" +
          '<form class="connect-form" data-password-form autocomplete="off">' +
            '<input type="text" name="username" autocomplete="username" value="' + escapeHtml(me.username) + '" hidden>' +
            '<label class="setting-row"><span class="setting-text"><span class="setting-label">Current password</span></span>' +
              '<input class="text-input" name="current" type="password" autocomplete="current-password" required></label>' +
            '<label class="setting-row"><span class="setting-text"><span class="setting-label">New password</span><span class="setting-hint">At least 10 characters. Your other devices will need it.</span></span>' +
              '<input class="text-input" name="next" type="password" autocomplete="new-password" minlength="10" required></label>' +
            '<button type="submit" class="primary-btn">Change password</button>' +
          "</form></details>") +

    (me.is_admin
      ? '<div class="people" data-people>' +
          '<div class="people-invite">' +
            '<div class="people-invite-text"><h4 class="people-title">' + icon("users") + "<span>Invite a friend</span></h4>" +
              '<p class="setting-hint">They get their own logbook on your server that only they can read. The code works once, for 7 days.</p></div>' +
            '<form class="invite-form" data-invite-form autocomplete="off">' +
              '<input class="text-input" name="note" maxlength="60" placeholder="Who\'s it for? (only you see this)" aria-label="Who the invite is for">' +
              '<button type="submit" class="primary-btn">' + icon("plus") + "<span>Make invite</span></button>" +
            "</form>" +
            '<div data-code-slot></div>' +
          "</div>" +
          '<div class="people-cols">' +
            '<div><h4 class="people-title">People <span class="people-count" data-people-count></span></h4><ul class="people-list" data-users></ul></div>' +
            '<div><h4 class="people-title">Invites</h4><ul class="people-list" data-invites></ul></div>' +
          "</div>" +
        "</div>"
      : '<details class="connect-box danger-zone"><summary>' + icon("trash-2") + "<span>Delete my account</span></summary>" +
          '<form class="connect-form" data-delete-form autocomplete="off">' +
            '<p class="setting-hint">Deletes your account and everything in it from the server, for good. Download a backup first (Your data, below) if you want to keep it.</p>' +
            '<label class="setting-row"><span class="setting-text"><span class="setting-label">Your password</span></span>' +
              '<input class="text-input" name="password" type="password" autocomplete="current-password" required></label>' +
            '<button type="submit" class="tool-btn danger-btn">Delete my account</button>' +
          "</form></details>");

  el.querySelector("[data-logout]").addEventListener("click", logout);
  el.querySelector("[data-logout-all]").addEventListener("click", async function () {
    if (!confirm("Sign out every device logged in as " + me.username + ", this one included?")) return;
    try {
      await apiLogoutEverywhere();
      logout();
    } catch (e) { toast("Couldn't do that: " + (e.detail || e.message), "error"); }
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
      toast("Password changed. Other devices are signed out.");
    } catch (ex) {
      toast(ex.status === 401 ? "Current password is wrong" : (ex.detail || ex.message), "error");
    } finally { btn.disabled = false; }
  });

  var del = el.querySelector("[data-delete-form]");
  if (del) del.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!confirm("Delete your account and everything in it? This can't be undone.")) return;
    try {
      await apiDeleteAccount(del.elements.password.value);
      clearLocalTraces();
      setConnection({ token: "", username: "" });
      location.reload();
    } catch (ex) {
      toast(ex.status === 401 ? "Wrong password" : (ex.detail || ex.message), "error");
    }
  });

  var people = el.querySelector("[data-people]");
  if (!people) return;
  var slot = people.querySelector("[data-code-slot]");
  try { await renderPeople(people); } catch (e) { toast("Couldn't load people: " + (e.detail || e.message), "error"); }

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
      if (!confirm("Make a one-time reset code for " + name + "? They use it to set a new password. Their old password stops working once they do.")) return;
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
        '<span class="setting-hint">Removes ' + escapeHtml(name) + " and everything they wrote, for good. Your admin password:</span>" +
        '<input class="text-input" type="password" name="password" autocomplete="current-password" required aria-label="Admin password">' +
        '<button type="submit" class="tool-btn tool-btn--sm danger-btn">Remove for good</button><button type="button" class="link-btn" data-cancel-remove>Cancel</button>';
      row.appendChild(form);
      form.elements.password.focus();
      form.querySelector("[data-cancel-remove]").addEventListener("click", function () { form.remove(); });
      form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        try {
          await apiRemoveUser(id, form.elements.password.value);
          toast(name + " removed");
          renderPeople(people);
        } catch (ex) { toast(ex.status === 401 ? "Wrong password" : (ex.detail || ex.message), "error"); }
      });
    }
  });
}
