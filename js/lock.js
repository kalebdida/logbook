/* Login screen for a server with accounts: log in, join with an invite
   code, or set a new password with a reset code from the admin. */
import { apiLogin, apiSignup, apiResetPassword, apiForgotPassword } from './api.js';
import { getConnection, setConnection, serverBase, describeConnection } from './connection.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { sceneSvg } from './scene.js';
import { mountMascot } from './mascot.js';
import { getPrefs } from './prefs.js';
import { cacheClear } from './cache.js';
import { enterDemo } from './demo.js';

var waiting = null;

function greeting() {
  var h = new Date().getHours();
  return h >= 5 && h < 12 ? "Good morning." : h >= 12 && h < 17 ? "Good afternoon." : h >= 17 && h < 23 ? "Good evening." : "Up late?";
}

function reduceMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion() ? 0 : ms); }); }

var MODES = {
  login: { line: "Log in to open your logbook.", button: "Log in" },
  join: { line: "Got an invite? Make your account. Your logbook is yours alone.", button: "Create account" },
  reset: { line: "Forgot it? Get a code on Telegram (or from the admin), then set a new password.", button: "Set new password" }
};

function field(label, name, type, autocomplete, iconName, extra) {
  var peek = type === "password"
    ? '<button type="button" class="icon-btn icon-btn--sm lock-peek" data-peek="' + name + '" aria-label="Show password" aria-pressed="false">' + icon("eye") + "</button>"
    : "";
  return '<label class="lock-field" data-field="' + name + '"><span>' + label + "</span>" +
    '<span class="lock-input">' +
      '<input type="' + type + '" name="' + name + '" autocomplete="' + autocomplete + '"' + (extra || "") + ">" +
      icon(iconName) + peek +
    "</span></label>";
}

/* What a browser keeps between people on a shared phone: the companion
   chat, unsaved drafts, an AI key saved in this browser, the focus timer's
   local history. Data from the old one-browser version stays put, but isn't
   offered for import into whoever logs in next. */
export function clearLocalTraces() {
  try { sessionStorage.clear(); } catch (e) {}
  cacheClear();
  try { localStorage.removeItem("logbook-pin"); localStorage.removeItem("logbook-bio"); } catch (e) {}
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
      '<div class="lock-scene" aria-hidden="true">' + sceneSvg(window.innerWidth < window.innerHeight * 1.2 ? { crop: "peak" } : null) + "</div>" +
      '<form class="lock-panel" autocomplete="on" novalidate>' +
        '<header class="lock-head">' +
          '<span class="lock-mark" aria-hidden="true">' + icon("moon-star") + "</span>" +
          '<p class="lock-greet"></p>' +
          '<h1 class="lock-brand">Logbook</h1>' +
          '<p class="lock-line"></p>' +
        "</header>" +
        '<div class="lock-tabs" role="tablist" aria-label="What do you want to do?">' +
          '<button type="button" class="lock-tab" role="tab" data-mode="login">Log in</button>' +
          '<button type="button" class="lock-tab" role="tab" data-mode="join">Join</button>' +
          '<button type="button" class="lock-tab" role="tab" data-mode="reset">Reset</button>' +
        "</div>" +
        '<div class="lock-fields">' +
          field("Invite code", "invite", "text", "off", "key-round", ' placeholder="xxxx-xxxx-xxxx" spellcheck="false" autocapitalize="off"') +
          field("Reset code", "code", "text", "off", "key-round", ' placeholder="xxxx-xxxx-xxxx" spellcheck="false" autocapitalize="off"') +
          field("Username", "username", "text", "username", "user", ' spellcheck="false" autocapitalize="off" maxlength="32"') +
          field("Password", "password", "password", "current-password", "lock", "") +
          field("Password again", "password2", "password", "new-password", "lock", "") +
        "</div>" +
        '<p class="lock-hint" data-hint="new">At least 10 characters. Nobody else can read your logbook, the admin included.</p>' +
        '<div class="lock-forgot" data-hint="forgot" hidden>' +
          '<button type="button" class="tool-btn" data-lock="tg-code">' + icon("send") + "<span>Send me a code on Telegram</span></button>" +
          '<p class="lock-hint">Works if you connected Telegram in Settings. No Telegram? Ask the admin for a reset code.</p>' +
        "</div>" +
        '<p class="lock-error" role="alert"></p>' +
        '<button type="submit" class="primary-btn"></button>' +
        '<button type="button" class="link-btn lock-forgot-link" data-lock="forgot">Forgot your password?</button>' +
        '<footer class="lock-foot">' +
          '<span class="lock-server" title="Where your logbook lives">' + icon("server") + "<span>" + escapeHtml(describeConnection()) + "</span></span>" +
          '<span class="lock-foot-links">' +
            '<button type="button" class="link-btn lock-switch" data-lock="demo">Look around first</button>' +
            '<button type="button" class="link-btn lock-switch" data-lock="device">Use this device instead</button>' +
          "</span>" +
        "</footer>" +
      "</form>";
    document.body.appendChild(el);
    document.body.classList.add("has-overlay", "is-booted");
    var form = el.querySelector("form");
    var f = form.elements;
    var err = form.querySelector(".lock-error");
    var last = getConnection().username || "";
    f.username.value = last;
    form.querySelector(".lock-greet").textContent = greeting();

    // the cat keeps you company here too: it watches you type your name,
    // covers its eyes for the password, and is pleased when you get in
    var cat = null;
    try {
      if (getPrefs().mascot !== false) {
        cat = mountMascot(form, { size: "md", place: "lock", quiet: true, awake: true });
        form.classList.add("has-cat");
      }
    } catch (e) { cat = null; }
    var shyLine = false, openedAt = Date.now();
    function catDo(kind) { if (cat) cat.react(kind); }
    function catSay(text) { if (cat) cat.say(text); }
    setTimeout(function () {
      if (!el.isConnected) return;
      catSay(reason === "expired" ? "You were away a while. Log in again?" : last ? "Hi again, " + last + "." : "Hi. I'm " + (String(getPrefs().mascotName || "").trim() || "Mochi") + ". I'll wait here.");
    }, 1300);
    function isSecret(t) { return t && t.name && /^password2?$/.test(t.name); }
    form.addEventListener("focusin", function (e) {
      if (isSecret(e.target)) {
        catDo("shy");
        if (!shyLine) {
          shyLine = true;
          setTimeout(function () { if (el.isConnected) catSay("I won't look."); }, Math.max(250, 4200 - (Date.now() - openedAt)));
        }
        catDo(e.target.type === "text" ? "peek" : "unpeek");
      } else if (!e.target.closest("[data-peek]")) {
        catDo("unshy");
      }
    });
    form.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!form.contains(document.activeElement) || !isSecret(document.activeElement) && !document.activeElement.closest("[data-peek]")) catDo("unshy");
      }, 60);
    });

    // the scene drifts a little with the pointer
    if (!reduceMotion()) {
      el.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        el.style.setProperty("--px", (e.clientX / window.innerWidth - 0.5).toFixed(3));
        el.style.setProperty("--py", (e.clientY / window.innerHeight - 0.5).toFixed(3));
      }, { passive: true });
    }

    async function leave() {
      catDo("cheer");
      catSay(greeting() === "Up late?" ? "Welcome in. Keep it short tonight." : "Welcome in.");
      await wait(750);
      el.classList.add("is-leaving");
      await wait(450);
    }

    function setMode(next) {
      mode = next;
      var isNew = mode !== "login";
      form.querySelector(".lock-line").textContent = mode === "login" && reason === "expired" ? "You were logged out. Log in again." : MODES[mode].line;
      form.querySelector("button[type=submit]").textContent = MODES[mode].button;
      form.querySelectorAll(".lock-tab").forEach(function (t) {
        t.classList.toggle("is-active", t.getAttribute("data-mode") === mode);
        t.setAttribute("aria-selected", String(t.getAttribute("data-mode") === mode));
      });
      form.querySelector('[data-field="invite"]').hidden = mode !== "join";
      form.querySelector('[data-field="code"]').hidden = mode !== "reset";
      form.querySelector('[data-field="password2"]').hidden = !isNew;
      form.querySelector('[data-hint="new"]').hidden = !isNew;
      form.querySelector('[data-hint="forgot"]').hidden = mode !== "reset";
      var forgotLink = form.querySelector('[data-lock="forgot"]');
      if (forgotLink) forgotLink.hidden = mode !== "login";
      f.password.setAttribute("autocomplete", isNew ? "new-password" : "current-password");
      form.querySelector('[data-field="password"] > span').textContent = isNew ? "New password" : "Password";
      err.textContent = "";
      var first = mode === "join" ? f.invite : mode === "reset" ? f.code : (f.username.value ? f.password : f.username);
      setTimeout(function () { first.focus(); }, 30);
    }
    setMode("login");

    form.querySelectorAll(".lock-tab").forEach(function (t) {
      t.addEventListener("click", function () { setMode(t.getAttribute("data-mode")); });
    });
    form.querySelectorAll("[data-peek]").forEach(function (b) {
      b.addEventListener("click", function () {
        var input = f[b.getAttribute("data-peek")];
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        b.setAttribute("aria-pressed", String(show));
        b.setAttribute("aria-label", show ? "Hide password" : "Show password");
        b.innerHTML = icon(show ? "eye-off" : "eye");
        input.focus();
        catDo(show ? "peek" : "unpeek");
        if (show) catSay("Okay, I peeked. A little.");
      });
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      err.textContent = "";
      var username = f.username.value.trim().toLowerCase();
      if (mode !== "login") {
        if (!username) { err.textContent = "Pick a username."; return f.username.focus(); }
        if (f.password.value.length < 10) { err.textContent = "Your password needs at least 10 characters."; return f.password.focus(); }
        if (f.password.value !== f.password2.value) { err.textContent = "The two passwords don't match."; return f.password2.focus(); }
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
          await leave();
          location.reload();
          return;
        }
        setConnection({ token: res.token || "", username: who });
        await leave();
        el.remove();
        document.body.classList.remove("has-overlay");
        waiting = null;
        resolve(true);
      } catch (ex) {
        err.textContent = ex.status === 401 ? "Wrong username or password."
          : ex.status === 429 || ex.status === 400 ? ex.detail
          : "Can't reach the server. It may be waking up; try again in a moment.";
        form.classList.remove("is-wrong");
        void form.offsetWidth;
        form.classList.add("is-wrong");
        f.password.select();
        if (ex.status === 401) setTimeout(function () { catDo("unshy"); catDo("sad"); catSay("Hmm. That's not it."); }, 40);
        else if (!ex.status) catSay("The server's still yawning. Give it a moment.");
      } finally {
        btn.disabled = false;
      }
    });
    form.querySelector('[data-lock="forgot"]').addEventListener("click", function () { setMode("reset"); });
    form.querySelector('[data-lock="tg-code"]').addEventListener("click", async function (e) {
      var btn = e.currentTarget;
      var username = f.username.value.trim().toLowerCase();
      if (!username) { err.textContent = "Type your username first."; return f.username.focus(); }
      btn.disabled = true;
      try {
        await apiForgotPassword(serverBase(), username);
        err.textContent = "";
        form.querySelector(".lock-line").textContent = "If that account has Telegram connected, a code is on its way. Paste it below.";
        catSay("Check Telegram. I sent it there.");
        f.code.focus();
      } catch (ex) {
        err.textContent = ex.status === 429 ? ex.detail : "Can't reach the server. Try again in a moment.";
      } finally {
        setTimeout(function () { btn.disabled = false; }, 20000);   // one code at a time
      }
    });
    form.querySelector('[data-lock="demo"]').addEventListener("click", function () {
      catSay("Sure. Have a look around.");
      setTimeout(enterDemo, reduceMotion() ? 0 : 500);
    });
    form.querySelector('[data-lock="device"]').addEventListener("click", function () {
      if (!confirm("Switch this copy of Logbook to keep data on this device? Your server data stays on the server.")) return;
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
