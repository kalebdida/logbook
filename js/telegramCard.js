import { apiTelegramStatus, apiTelegramSetup, apiTelegramRemove, apiTelegramLink, apiTelegramUpdate, apiTelegramUnlink } from './api.js';
import { isDevice } from './connection.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { toast } from './toast.js';

/* Settings → Telegram. The admin sets the bot up once (a token from
   @BotFather); then every account connects its own chat with one tap. */

var waiting = null;   // polling for "connected" after the link opened

function hours(selected) {
  var out = '<option value="off"' + (selected == null ? " selected" : "") + ">Off</option>";
  for (var h = 4; h <= 11; h++) out += '<option value="' + h + '"' + (selected === h ? " selected" : "") + ">" + h + ":00</option>";
  return out;
}

export async function renderTelegramCard(el) {
  if (!el) return;
  var group = document.getElementById("set-telegram");
  if (isDevice()) {
    el.innerHTML = head() + '<p class="setting-hint">The Telegram bot lives on a Logbook server. It isn\'t available while your data is kept on this device.</p>';
    return;
  }
  var s;
  try {
    s = await apiTelegramStatus();
  } catch (e) {
    if (e.status === 404 && group) { group.hidden = true; return; }   // an older server
    el.innerHTML = head() + '<p class="setting-hint">Couldn\'t reach the server.</p>';
    return;
  }
  if (group) group.hidden = false;

  var body = "";
  if (!s.configured) {
    body = s.admin
      ? '<ol class="tg-steps">' +
          '<li>In Telegram, open <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> and send <code>/newbot</code>. Pick any name.</li>' +
          "<li>It replies with a token like <code>123456789:ABC…</code>. Paste it here.</li>" +
        "</ol>" +
        '<form class="tg-setup" autocomplete="off">' +
          '<input class="text-input" name="token" type="password" placeholder="Bot token" aria-label="Bot token" autocomplete="off" spellcheck="false" required>' +
          '<button type="submit" class="primary-btn">' + icon("send") + "<span>Turn on the bot</span></button>" +
        "</form>" +
        '<p class="setting-hint">The token stays on your server. Nobody else can use your bot: each account connects its own chat.</p>'
      : '<p class="setting-hint">The bot isn\'t set up on this server yet. The admin turns it on once, then you can connect.</p>';
  } else if (!s.linked) {
    body = '<p class="storage-now"><span class="status-dot"></span> Not connected yet.</p>' +
      '<div class="settings-actions"><button type="button" class="primary-btn" data-tg="connect">' + icon("send") + "<span>Connect Telegram</span></button></div>" +
      '<p class="setting-hint tg-wait" hidden>Telegram opened. Tap <b>Start</b> there, then come back. This page notices on its own.</p>';
  } else {
    body = '<p class="storage-now"><span class="status-dot is-online"></span> Connected to <a href="https://t.me/' + escapeHtml(s.bot) + '" target="_blank" rel="noopener">@' + escapeHtml(s.bot) + "</a></p>" +
      '<label class="setting-row"><span class="setting-text"><span class="setting-label">Morning message</span>' +
        '<span class="setting-hint">Today\'s verse, what\'s due, and your tasks</span></span>' +
        '<select class="select-input" data-tg="morning">' + hours(s.morning_hour) + "</select></label>" +
      '<div class="tg-cheats">' +
        ["/log 45m #coding fixed the login bug", "/task call the bank", "/j today felt long but good", "/due nov 1 23:59 Early decision", "/pray wisdom", "/grateful family dinner", "/sleep", "/wake", "/today"]
          .map(function (c) { return "<code>" + escapeHtml(c) + "</code>"; }).join("") +
      "</div>" +
      '<p class="setting-hint">Anything that isn\'t a command goes to your companion. Send a photo and it becomes today\'s photo. Hashtags pick the life area.</p>' +
      '<div class="settings-actions"><a class="tool-btn" href="https://t.me/' + escapeHtml(s.bot) + '" target="_blank" rel="noopener">' + icon("external-link") + "<span>Open the chat</span></a>" +
        '<button type="button" class="link-btn" data-tg="unlink">Disconnect</button></div>';
  }
  if (s.configured && s.admin) {
    body += '<p class="setting-hint tg-admin">Bot @' + escapeHtml(s.bot) + ' is on for this server. <button type="button" class="link-btn danger-btn" data-tg="remove">Turn off the bot</button></p>';
  }
  el.innerHTML = head() + body;
  wire(el);
}

function head() {
  return '<h3 class="daily-section-title">' + icon("send") + "<span>Telegram</span></h3>";
}

function wire(el) {
  var form = el.querySelector(".tg-setup");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = form.querySelector("button");
      btn.disabled = true;
      try {
        await apiTelegramSetup(form.elements.token.value.trim());
        toast("The bot is on. Now connect your chat.");
        renderTelegramCard(el);
      } catch (ex) {
        toast(ex.detail || "Couldn't turn on the bot", "error");
        btn.disabled = false;
      }
    });
  }
  el.onclick = async function (e) {
    var b = e.target.closest("[data-tg]");
    if (!b || b.tagName === "SELECT") return;
    var what = b.getAttribute("data-tg");
    if (what === "connect") {
      // open the window first (a popup blocker allows it only straight from the tap)
      var win = window.open("about:blank", "_blank");
      try {
        var res = await apiTelegramLink();
        if (win) win.location.href = res.url;
        else location.href = res.url;
        var hint = el.querySelector(".tg-wait");
        if (hint) hint.hidden = false;
        watch(el);
      } catch (ex) {
        if (win) win.close();
        toast(ex.detail || "Couldn't make a link", "error");
      }
    }
    if (what === "unlink") {
      await apiTelegramUnlink().catch(function () {});
      toast("Telegram disconnected");
      renderTelegramCard(el);
    }
    if (what === "remove") {
      if (!confirm("Turn off the Telegram bot for everyone on this server?")) return;
      await apiTelegramRemove().catch(function () {});
      renderTelegramCard(el);
    }
  };
  var morning = el.querySelector('[data-tg="morning"]');
  if (morning) {
    morning.addEventListener("change", async function () {
      var v = morning.value;
      try {
        await apiTelegramUpdate(v === "off" ? { morning_off: true } : { morning_hour: Number(v) });
        toast(v === "off" ? "Morning message off" : "Morning message at " + v + ":00");
      } catch (ex) {
        toast("Couldn't save that", "error");
      }
    });
  }
}

function watch(el) {
  clearInterval(waiting);
  var tries = 0;
  waiting = setInterval(async function () {
    tries++;
    if (tries > 60 || !el.isConnected) return clearInterval(waiting);
    try {
      var s = await apiTelegramStatus();
      if (s.linked) {
        clearInterval(waiting);
        toast("Telegram connected");
        renderTelegramCard(el);
      }
    } catch (e) {}
  }, 3000);
}
