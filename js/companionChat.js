/* "Ask your logbook": a chat with an AI that can see a summary of your
   recent days. With "let AI read entry text" off it only gets numbers
   (moods, task counts, focus minutes, habit check-ins, goal progress).
   Nothing is sent until you send a message. */
import { aiStatus, aiChat, getAIConfig } from './ai.js';
import { getEntries } from './journal.js';
import { apiListDaysAsMap } from './api.js';
import { getGoals } from './goals.js';
import { getPomodoroHistory } from './pomodoro.js';
import { habitSummary } from './habits.js';
import { calcStreak } from './stats.js';
import { dateKey } from './dayRecord.js';
import { STATUS } from './entries.js';
import { getPrefs } from './prefs.js';
import { navigateTo } from './navigation.js';
import { toast } from './toast.js';
import { escapeHtml, submitForm } from './utils.js';

var QUICK = [
  { label: "weekly review", text: "give me a weekly review of my last 7 days: what went well, what slipped, one pattern you notice, and one concrete thing to try next week." },
  { label: "plan tomorrow", text: "help me plan tomorrow. suggest one main focus and up to 3 tasks, based on my open tasks, goals, habits, and what I planned." },
  { label: "patterns", text: "what patterns do you see in my moods, focus time, tasks, and habits over the last two weeks? be specific and honest." },
  { label: "goals check", text: "how am I tracking on my goals? which one needs attention first, and what's the next small step?" }
];

var SESSION_KEY = "logbook-chat";
var history = readHistory();
var sending = false;

function readHistory() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]") || []; } catch (e) { return []; }
}

function saveHistory() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(history.slice(-30))); } catch (e) {}
}

function daysBack(n) {
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

function clip(text, n) {
  text = String(text || "").replace(/\s+/g, " ").trim();
  return text.length > n ? text.slice(0, n) + "…" : text;
}

/* A compact picture of the last two weeks, for the AI. */
export async function buildContext() {
  var shareText = getAIConfig().shareText;
  var entries = getEntries();
  var days = daysBack(14);
  var today = days[days.length - 1];
  var results = await Promise.all([
    apiListDaysAsMap().catch(function () { return {}; }),
    getGoals().catch(function () { return []; }),
    getPomodoroHistory().catch(function () { return {}; })
  ]);
  var dayMap = results[0], goals = results[1], focus = results[2];
  var habits = habitSummary();

  var lines = [];
  lines.push("today: " + today + " (" + new Date().toLocaleDateString("en", { weekday: "long" }).toLowerCase() + "), local time " + new Date().toTimeString().slice(0, 5));
  lines.push("writing streak: " + calcStreak(entries) + " days. total entries: " + entries.length + ".");
  lines.push("");
  lines.push("last 14 days (date | moods | tasks done/total | focus | activities):");
  days.forEach(function (d) {
    var es = entries.filter(function (e) { return dateKey(e.date) === d; });
    var moods = {};
    es.forEach(function (e) { moods[e.mood] = (moods[e.mood] || 0) + 1; });
    var moodText = Object.keys(moods).map(function (m) { return STATUS[m].code + " " + STATUS[m].label.toLowerCase() + " x" + moods[m]; }).join(", ") || "no entries";
    var rec = dayMap[d] || {};
    var tasks = rec.tasks || [];
    var acts = (rec.activities || []).map(function (a) { return (shareText ? clip(a.title, 40) + " " : "") + (a.durationMinutes ? a.durationMinutes + "m" : "") + (a.activityCategory ? " (" + a.activityCategory + ")" : ""); });
    var fm = focus[d] ? Math.round(focus[d].focusMs / 60000) : 0;
    lines.push("- " + d + " | " + moodText + " | tasks " + tasks.filter(function (t) { return t.completed; }).length + "/" + tasks.length + " | focus " + fm + "m" + (acts.length ? " | " + acts.join("; ") : ""));
  });

  if (habits.total) {
    lines.push("");
    lines.push("habits (" + habits.doneToday + "/" + habits.total + " done today):");
    habits.habits.forEach(function (h) {
      lines.push("- " + (shareText ? h.name : "habit") + ": " + (h.doneToday ? "done today" : "not yet today") + ", streak " + h.streak + "d");
    });
  }

  var open = goals.filter(function (g) { return !g.completed; });
  if (goals.length) {
    lines.push("");
    lines.push("goals (" + open.length + " open, " + (goals.length - open.length) + " done):");
    open.slice(0, 12).forEach(function (g) {
      lines.push("- " + (shareText ? clip(g.title, 80) : "goal") + " | " + g.category + ", " + g.priority + " priority, " + g.progress + "%" + (g.targetDate ? ", due " + g.targetDate : ""));
    });
  }

  var todayRec = dayMap[today];
  var openTasks = todayRec && todayRec.tasks ? todayRec.tasks.filter(function (t) { return !t.completed; }) : [];
  if (shareText) {
    if (todayRec) {
      lines.push("");
      lines.push("today's page:");
      if (todayRec.morning.intention) lines.push("- intention: " + clip(todayRec.morning.intention, 200));
      if (todayRec.morning.mainFocus) lines.push("- main focus: " + clip(todayRec.morning.mainFocus, 200));
      if (openTasks.length) lines.push("- open tasks: " + openTasks.map(function (t) { return clip(t.title, 60); }).join("; "));
      if (todayRec.nightReflection.tomorrowPlan) lines.push("- plan for tomorrow: " + clip(todayRec.nightReflection.tomorrowPlan, 200));
    }
    var yesterday = dayMap[days[days.length - 2]];
    if (yesterday && yesterday.nightReflection.tomorrowPlan) lines.push("- last night they planned: " + clip(yesterday.nightReflection.tomorrowPlan, 200));
    var recent = entries.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 15);
    if (recent.length) {
      lines.push("");
      lines.push("most recent journal entries (newest first):");
      recent.forEach(function (e) { lines.push("- [" + dateKey(e.date) + " " + STATUS[e.mood].code + "] " + clip(e.text, 280)); });
    }
  } else {
    lines.push("");
    lines.push("(the user chose not to share any written text: no entry text, task names or goal names. you only see numbers. don't ask them to paste private text.)");
    if (openTasks.length) lines.push("open tasks today: " + openTasks.length);
  }
  return lines.join("\n");
}

function systemPrompt(context) {
  return (
    "You are the companion inside Logbook, the private journal and personal OS of " + getPrefs().name + ". " +
    "Moods are logged as HTTP statuses: 200 OK = good, 102 PROCESSING = okay, 500 ERROR = rough. " +
    "Be warm, direct, and practical, like a friend who pays attention. Keep answers short (under 170 words) unless asked for more. " +
    "Use plain lowercase prose or a few short bullets. No therapy clichés, no lecturing, no emojis unless they use them. " +
    "Only use the data below. Never invent days, entries, or numbers. If the data doesn't answer something, say so. " +
    "If they seem to be struggling a lot, be kind and suggest talking to someone they trust.\n\n" +
    "THEIR DATA:\n" + context
  );
}

/* light formatting for replies: **bold**, bullet lines, paragraphs */
function format(text) {
  var html = "";
  escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").split(/\n/).forEach(function (line) {
    var m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) html += '<span class="chat-bullet">' + m[1] + "</span>";
    else if (!line.trim()) html += '<span class="chat-gap"></span>';
    else html += '<span class="chat-line">' + line + "</span>";
  });
  return html.replace(/(<span class="chat-gap"><\/span>)+/g, '<span class="chat-gap"></span>');
}

function messagesHtml() {
  if (!history.length) {
    return '<p class="chat-empty">ask anything about your days. it reads a summary of the last two weeks.</p>';
  }
  return history.map(function (m, i) {
    return '<div class="chat-msg chat-msg--' + m.role + '">' +
      '<span class="chat-who">' + (m.role === "user" ? "&gt; you" : "companion") + "</span>" +
      '<div class="chat-text">' + format(m.content) + "</div>" +
      (m.role === "assistant" ? '<button type="button" class="link-btn chat-copy" data-chat-copy="' + i + '">copy</button>' : "") +
    "</div>";
  }).join("");
}

/* What goes to the AI: the recent turns, only role and text, no failed
   replies, starting with one of yours (some providers insist). */
function outgoing() {
  var turns = history.filter(function (m) { return !m.error; }).slice(-12).map(function (m) { return { role: m.role, content: m.content }; });
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

/* Changing what the AI may read, or which AI it is, starts a fresh chat, so
   text shared earlier isn't sent again under the new setting. */
document.addEventListener("logbook:ai-changed", function () {
  if (!history.length) return;
  history = [];
  saveHistory();
});

async function send(el, text) {
  text = String(text || "").trim();
  if (!text || sending) return;
  sending = true;
  history.push({ role: "user", content: text });
  draw(el, true);
  try {
    var context = await buildContext();
    var reply = await aiChat(outgoing(), systemPrompt(context), 700);
    history.push({ role: "assistant", content: String(reply || "").trim() || "(no answer)" });
  } catch (e) {
    history.push({ role: "assistant", content: "couldn't reach the AI: " + (e.detail || e.message), error: true });
  } finally {
    sending = false;
    saveHistory();
    draw(el, false);
  }
}

function draw(el, thinking) {
  var box = el.querySelector(".chat-log");
  if (!box) return;
  box.innerHTML = messagesHtml() + (thinking ? '<div class="chat-msg chat-msg--assistant chat-thinking"><span class="chat-who">companion</span><div class="chat-text"><span class="chat-dots"><i></i><i></i><i></i></span></div></div>' : "");
  box.scrollTop = box.scrollHeight;
  var btn = el.querySelector(".chat-form button[type=submit]");
  if (btn) btn.disabled = thinking;
  var clear = el.querySelector("[data-chat-clear]");
  if (clear) clear.hidden = !history.length;
}

export async function renderChatCard(el) {
  if (!el) return;
  var status = await aiStatus();
  if (!status.available) {
    el.innerHTML =
      '<h3 class="daily-section-title">ask your logbook</h3>' +
      '<p class="chat-off">connect an AI and you can talk to your logbook: weekly reviews, planning tomorrow, spotting patterns. ' +
        "use Claude or OpenAI with your own key, or a free model that runs on your own computer (Ollama). it's off until you turn it on.</p>" +
      '<button type="button" class="primary-btn" data-chat-setup>set up AI</button>';
    el.querySelector("[data-chat-setup]").addEventListener("click", function () {
      navigateTo("settings");
      setTimeout(function () { var c = document.getElementById("settingsAI"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 80);
    });
    return;
  }
  var share = getAIConfig().shareText;
  el.innerHTML =
    '<header class="companion-head">' +
      '<h3 class="daily-section-title">ask your logbook</h3>' +
      '<span class="companion-mode" title="' + escapeHtml(status.via === "server" ? "through your server" : "from this device") + '">' + escapeHtml(status.model || status.provider) + "</span>" +
    "</header>" +
    '<div class="chat-quick">' + QUICK.map(function (q, i) { return '<button type="button" class="chip" data-chat-quick="' + i + '">' + q.label + "</button>"; }).join("") + "</div>" +
    '<div class="chat-log" aria-live="polite"></div>' +
    '<form class="chat-form" autocomplete="off">' +
      '<textarea class="text-input chat-input" name="q" rows="1" maxlength="2000" placeholder="ask about your week, your goals, anything"></textarea>' +
      '<button type="submit" class="primary-btn">send</button>' +
    "</form>" +
    '<p class="chat-privacy">sends ' + (share ? "a summary of the last 2 weeks <strong>including what you wrote</strong>" : "<strong>numbers only</strong> (no text you wrote)") +
      ' when you ask. <button type="button" class="link-btn" data-chat-privacy>change</button>' +
      ' <button type="button" class="link-btn" data-chat-clear' + (history.length ? "" : " hidden") + ">clear chat</button></p>";
  draw(el, sending);

  el.onclick = function (e) {
    var q = e.target.closest("[data-chat-quick]");
    if (q) return send(el, QUICK[Number(q.getAttribute("data-chat-quick"))].text);
    var c = e.target.closest("[data-chat-copy]");
    if (c) {
      var msg = history[Number(c.getAttribute("data-chat-copy"))];
      if (msg && navigator.clipboard) navigator.clipboard.writeText(msg.content).then(function () { toast("copied"); }, function () { toast("couldn't copy", "warn"); });
      return;
    }
    if (e.target.closest("[data-chat-clear]")) { history = []; saveHistory(); draw(el, false); return; }
    if (e.target.closest("[data-chat-privacy]")) {
      navigateTo("settings");
      setTimeout(function () { var s = document.getElementById("aiShareText"); if (s) { s.scrollIntoView({ behavior: "smooth", block: "center" }); s.focus(); } }, 80);
    }
  };
  var form = el.querySelector(".chat-form");
  var input = form.elements.q;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = "";
    input.style.height = "";
    send(el, v);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitForm(form); }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(140, input.scrollHeight) + "px";
  });
}
