/* Settings cards for where data lives, and for the AI companion. */
import { getConnection, setConnection, isDevice, probeServer, describeConnection, serverBase } from './connection.js';
import { serverRequest, apiLogin, apiAuthStatus } from './api.js';
import { deviceRequest, initDeviceStore, deviceStoragePersisted } from './deviceStore.js';
import { getAIConfig, setAIConfig, aiStatus, aiChat } from './ai.js';
import { logout } from './lock.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';
import { canInstall, isInstalled, promptInstall } from './pwa.js';

/* ---------- storage ---------- */

export async function renderStorageCard(el) {
  if (!el) return;
  var c = getConnection();
  var device = isDevice();
  var authRequired = false, persisted = true;
  if (!device) {
    try { authRequired = (await apiAuthStatus()).required; } catch (e) {}
  } else if (!window.Capacitor) {
    persisted = await deviceStoragePersisted();
  }

  el.innerHTML =
    '<h3 class="daily-section-title">where your data lives</h3>' +
    '<p class="storage-now"><span class="status-dot is-online"></span> ' +
      (device
        ? "<strong>this device.</strong> everything is saved in this browser. no server, works offline. back it up now and then."
        : "<strong>" + escapeHtml(describeConnection()) + ".</strong> " + (authRequired ? "password protected, you're logged in." : "no password.")) +
    "</p>" +
    (device && !persisted
      ? '<p class="setting-hint storage-risk">this browser hasn\'t promised to keep it: it may clear site data you haven\'t visited in a while (Safari does after 7 days). installing logbook as an app protects it. either way, download a backup now and then, or connect a server.</p>'
      : "") +
    '<div class="settings-actions">' +
      (device
        ? ""
        : '<button type="button" class="tool-btn" id="toDevice">keep data on this device instead</button>' +
          (authRequired ? '<button type="button" class="tool-btn" id="logoutBtn">log out</button>' : "")) +
    "</div>" +
    '<details class="connect-box"' + (device ? " open" : "") + "><summary>" + (device ? "connect to a logbook server" : "connect to a different server") + "</summary>" +
      '<form id="connectForm" class="connect-form" autocomplete="off">' +
        '<label class="setting-row"><span class="setting-text"><span class="setting-label">server address</span>' +
          '<span class="setting-hint">e.g. https://your-logbook.onrender.com, or http://127.0.0.1:8000 on this computer</span></span>' +
          '<input class="text-input" name="url" type="url" required placeholder="https://..." value="' + escapeHtml(c.serverUrl || "") + '"></label>' +
        '<label class="setting-row"><span class="setting-text"><span class="setting-label">password</span><span class="setting-hint">leave empty if the server has none</span></span>' +
          '<input class="text-input" name="password" type="password" autocomplete="current-password"></label>' +
        '<label class="setting-row"><span class="setting-text"><span class="setting-label">copy what\'s here to the server</span>' +
          '<span class="setting-hint">adds this copy\'s data to the server. never overwrites anything there.</span></span>' +
          '<input type="checkbox" class="switch" name="copy" checked></label>' +
        '<button type="submit" class="primary-btn">connect</button>' +
      "</form>" +
    "</details>";

  var toDeviceBtn = el.querySelector("#toDevice");
  if (toDeviceBtn) {
    toDeviceBtn.addEventListener("click", async function () {
      if (!confirm("keep data on this device from now on? a copy of everything on the server comes along. the server keeps its data too.")) return;
      toDeviceBtn.disabled = true;
      try {
        var backup = await serverRequest(serverBase(), c.token, "/backup", {});
        await initDeviceStore();
        await deviceRequest("/backup/restore", { method: "POST", body: JSON.stringify(backup) });
        setConnection({ mode: "device", token: "" });
        location.reload();
      } catch (e) {
        toDeviceBtn.disabled = false;
        toast("couldn't copy your data from the server: " + (e.detail || e.message), "error");
      }
    });
  }
  var logoutBtn = el.querySelector("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  el.querySelector("#connectForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var form = e.target;
    var url = form.elements.url.value.trim().replace(/\/+$/, "");
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "connecting…";
    try {
      var health = await probeServer(url, 70000); // free hosts can take a minute to wake up
      if (!health) throw new Error("no logbook server answered at that address");
      var token = "";
      if (health.auth_required) token = (await apiLogin(url, form.elements.password.value)).token;
      if (form.elements.copy.checked) {
        var here = device
          ? await deviceRequest("/backup", {})
          : await serverRequest(serverBase(), c.token, "/backup", {});
        await serverRequest(url, token, "/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(here) });
      }
      setConnection({ mode: "server", serverUrl: url === location.origin ? "" : url, token: token });
      location.reload();
    } catch (ex) {
      toast(ex.status === 401 ? "wrong password" : "couldn't connect: " + (ex.detail || ex.message), "error");
      btn.disabled = false;
      btn.textContent = "connect";
    }
  });
}

/* ---------- AI ---------- */

var PROVIDERS = [
  ["", "off"],
  ["anthropic", "Claude (Anthropic)"],
  ["openai", "OpenAI-compatible (OpenAI, OpenRouter, Groq, Ollama…)"]
];

export async function renderAICard(el) {
  if (!el) return;
  var cfg = getAIConfig();
  var status = await aiStatus();
  var viaServer = status.via === "server";

  el.innerHTML =
    '<h3 class="daily-section-title">AI companion</h3>' +
    '<p class="storage-now"><span class="status-dot ' + (status.available ? "is-online" : "") + '"></span> ' +
      (status.available
        ? "on, using <strong>" + escapeHtml(status.model || status.provider) + "</strong>" + (viaServer ? " through your server (the key stays on the server)." : " from this device.")
        : "off. the companion still works with simple local rules.") +
    "</p>" +
    (viaServer ? "" :
      '<form id="aiForm" autocomplete="off">' +
        '<label class="setting-row"><span class="setting-text"><span class="setting-label">provider</span></span>' +
          '<select class="select-input select-input--wide" name="provider">' +
          PROVIDERS.map(function (p) { return '<option value="' + p[0] + '"' + (cfg.provider === p[0] ? " selected" : "") + ">" + escapeHtml(p[1]) + "</option>"; }).join("") +
          "</select></label>" +
        '<label class="setting-row" data-ai-field><span class="setting-text"><span class="setting-label">API key</span><span class="setting-hint">saved in this browser only. not needed for a local model.</span></span>' +
          '<input class="text-input" name="apiKey" type="password" autocomplete="off"></label>' +
        '<label class="setting-row" data-ai-field><span class="setting-text"><span class="setting-label">model</span><span class="setting-hint">blank = claude-haiku-5-5 (Claude) or gpt-4o-mini</span></span>' +
          '<input class="text-input" name="model" value="' + escapeHtml(cfg.model) + '" placeholder="default"></label>' +
        '<label class="setting-row" data-ai-field data-ai-openai><span class="setting-text"><span class="setting-label">address</span><span class="setting-hint">Ollama: http://localhost:11434/v1. blank = api.openai.com</span></span>' +
          '<input class="text-input" name="baseUrl" value="' + escapeHtml(cfg.baseUrl) + '" placeholder="https://api.openai.com/v1"></label>' +
        '<div class="settings-actions"><button type="submit" class="primary-btn">save</button><button type="button" class="tool-btn" id="aiTest">test</button></div>' +
      "</form>") +
    '<label class="setting-row"><span class="setting-text"><span class="setting-label">let AI read entry text</span>' +
      '<span class="setting-hint">off: it only sees numbers (streaks, focus minutes, task counts), never what you wrote</span></span>' +
      '<input type="checkbox" class="switch" id="aiShareText"' + (cfg.shareText ? " checked" : "") + "></label>" +
    '<p class="setting-hint">nothing is sent until you ask the companion something. your provider\'s privacy terms apply to what you send. a local model (Ollama) keeps everything on your computer.</p>';

  el.querySelector("#aiShareText").addEventListener("change", function (e) {
    setAIConfig({ shareText: e.target.checked });
    document.dispatchEvent(new CustomEvent("logbook:ai-changed", { detail: { privacy: true } }));
  });

  var form = el.querySelector("#aiForm");
  if (!form) return;
  form.elements.apiKey.value = cfg.apiKey; // a property, not an attribute: CSS can't read it
  function syncFields() {
    var p = form.elements.provider.value;
    el.querySelectorAll("[data-ai-field]").forEach(function (row) { row.hidden = !p; });
    el.querySelectorAll("[data-ai-openai]").forEach(function (row) { row.hidden = p !== "openai"; });
  }
  syncFields();
  form.elements.provider.addEventListener("change", syncFields);
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    setAIConfig({
      provider: form.elements.provider.value,
      apiKey: form.elements.apiKey.value.trim(),
      model: form.elements.model.value.trim(),
      baseUrl: form.elements.baseUrl.value.trim()
    });
    toast("AI settings saved");
    renderAICard(el);
    document.dispatchEvent(new CustomEvent("logbook:ai-changed"));
  });
  el.querySelector("#aiTest").addEventListener("click", async function (e) {
    var btn = e.target;
    btn.disabled = true;
    btn.textContent = "testing…";
    setAIConfig({ provider: form.elements.provider.value, apiKey: form.elements.apiKey.value.trim(), model: form.elements.model.value.trim(), baseUrl: form.elements.baseUrl.value.trim() });
    try {
      var reply = await aiChat([{ role: "user", content: "reply with exactly: logbook link ok" }], "You are a connection test. Follow the instruction exactly.", 20);
      toast("AI answered: " + reply.slice(0, 80));
    } catch (ex) {
      toast(ex.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "test";
    }
  });
}

/* ---------- the app itself ---------- */

export function renderAppCard(el) {
  if (!el) return;
  var ua = navigator.userAgent || "";
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var native = Boolean(window.Capacitor);
  var line;
  if (native) line = "you're in the Android app. your data is stored in the app on this phone.";
  else if (isInstalled()) line = "installed. it opens in its own window and works offline.";
  else if (canInstall()) line = "install logbook as an app: its own window, a home screen icon, works offline.";
  else if (ios) line = "on iPhone or iPad: tap Share, then <strong>Add to Home Screen</strong>. it opens like an app and works offline.";
  else line = "open this page in Chrome or Edge to install it as an app. it already works offline here once loaded.";
  el.innerHTML =
    '<h3 class="daily-section-title">the app</h3>' +
    '<p class="storage-now">' + line + "</p>" +
    (canInstall() && !native ? '<div class="settings-actions"><button type="button" class="primary-btn" id="installApp">install logbook</button></div>' : "") +
    '<p class="setting-hint">android app (APK): built from the same code by the "android apk" GitHub action, or with <code>npm run apk</code>. see docs/ANDROID.md.</p>';
  var btn = el.querySelector("#installApp");
  if (btn) btn.addEventListener("click", async function () {
    var ok = await promptInstall();
    if (!ok) toast("not installed. you can do it any time from here.", "warn");
    renderAppCard(el);
  });
}

document.addEventListener("logbook:installable", function () {
  renderAppCard(document.getElementById("settingsApp"));
});
