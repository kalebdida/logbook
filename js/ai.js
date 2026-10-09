/* The AI behind the companion. Two ways to reach one:
   1. through your Logbook server, which holds the key (best: the key never
      touches the browser). Set LOGBOOK_AI_* on the server.
   2. straight from this browser with a key saved on this device. This is
      how device mode (static hosting, the Android app) gets AI.
   Either way, nothing is sent until you ask the companion something. */
import { apiAIStatus, apiAIChat } from './api.js';
import { isDevice } from './connection.js';

var KEY = "logbook-ai";
var DEFAULT_MODELS = { anthropic: "claude-haiku-5-5", openai: "gpt-4o-mini" };

export function getAIConfig() {
  try {
    return Object.assign({ provider: "", apiKey: "", model: "", baseUrl: "", shareText: true }, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {
    return { provider: "", apiKey: "", model: "", baseUrl: "", shareText: true };
  }
}

export function setAIConfig(patch) {
  var next = Object.assign(getAIConfig(), patch);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

function directReady(c) {
  if (c.provider === "anthropic") return Boolean(c.apiKey);
  if (c.provider === "openai") return Boolean(c.apiKey || c.baseUrl);
  return false;
}

/* { available, via: "server"|"device"|null, provider, model } */
export async function aiStatus() {
  if (!isDevice()) {
    try {
      var s = await apiAIStatus();
      if (s && s.available) return { available: true, via: "server", provider: s.provider, model: s.model };
    } catch (e) {}
  }
  var c = getAIConfig();
  if (directReady(c)) return { available: true, via: "device", provider: c.provider, model: c.model || DEFAULT_MODELS[c.provider] };
  return { available: false, via: null, provider: null, model: null };
}

export async function aiChat(messages, system, maxTokens) {
  var status = await aiStatus();
  if (!status.available) {
    var e = new Error("AI isn't set up yet. add a key in settings, or run a local model.");
    e.code = "not-configured";
    throw e;
  }
  if (status.via === "server") return (await apiAIChat(messages, system, maxTokens)).text;
  return direct(getAIConfig(), messages, system, maxTokens || 900);
}

async function direct(c, messages, system, maxTokens) {
  var model = c.model || DEFAULT_MODELS[c.provider];
  var res, body;
  try {
    if (c.provider === "anthropic") {
      res = await fetch((c.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "") + "/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": c.apiKey,
          "anthropic-version": "2023-06-01",
          // required for browser calls; the key lives only on this device
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({ model: model, max_tokens: maxTokens, system: system, messages: messages })
      });
    } else {
      var headers = { "content-type": "application/json" };
      if (c.apiKey) headers.authorization = "Bearer " + c.apiKey;
      res = await fetch((c.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ model: model, max_tokens: maxTokens, messages: [{ role: "system", content: system }].concat(messages) })
      });
    }
  } catch (e) {
    throw new Error(c.baseUrl && /localhost|127\.0\.0\.1/.test(c.baseUrl)
      ? "can't reach your local model. is it running? (for Ollama, start it with OLLAMA_ORIGINS=* so the browser may call it)"
      : "can't reach the AI provider. check your connection.");
  }
  try { body = await res.json(); } catch (e) { body = {}; }
  if (!res.ok) {
    var msg = body && body.error ? (body.error.message || body.error) : "";
    throw new Error("AI provider error " + res.status + (msg ? ": " + msg : ""));
  }
  if (c.provider === "anthropic") {
    return (body.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
  }
  return ((body.choices || [])[0] || {}).message ? body.choices[0].message.content || "" : "";
}
