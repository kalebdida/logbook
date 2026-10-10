/* The "look & feel" card: pick a theme, describe a vibe, make one from a
   picture, or fine-tune every detail. Anything generated is shown as a
   preview first; nothing changes for good until you press keep. */
import {
  BUILT_IN, BACKGROUNDS, GLYPHS, ROUNDNESS, FONTS, DEFAULT_THEME,
  allThemes, currentTheme, applyTheme, saveCustomTheme, deleteCustomTheme,
  normalizeTheme, fixContrast, contrast, themeFromVibe, themeFromImage,
  AI_THEME_PROMPT, themeFromAIReply
} from './themes.js';
import { aiStatus, aiChat } from './ai.js';
import { toast } from './toast.js';
import { escapeHtml, submitForm } from './utils.js';
import { icon } from './icons.js';

var COLORS = [
  ["bg", "background"], ["surface", "cards"], ["text", "text"], ["text2", "soft text"], ["muted", "muted"],
  ["accent", "accent"], ["accent2", "second accent"], ["warm", "warm"], ["danger", "danger"]
];

var EXAMPLES = [
  "rainy tokyo apartment, lofi",
  "cozy coffee shop at night",
  "neon tokyo cyberpunk",
  "calm ocean morning, light and airy",
  "ethiopian highlands",
  "minimal black and white",
  "dreamy purple galaxy"
];

var SURPRISE = [
  "midnight jazz bar", "retro arcade neon", "soft pastel sakura morning", "deep forest cabin, snow", "desert sunset, warm",
  "vaporwave miami", "library with old books", "matrix hacker terminal", "ice cave, cold and clean", "summer fireflies",
  "royal gold luxury", "rainy london evening", "addis at dawn", "lavender fields, light", "volcanic red and black"
];

var LABELS = {
  background: { night: "night sky over the mountain", window: "rain on the window", rain: "falling code", stars: "stars", snow: "snow", fireflies: "fireflies", none: "nothing" },
  glyphs: { binary: "01 binary", katakana: "katakana", hex: "hex", dots: "dots" },
  roundness: { sharp: "sharp", soft: "soft", round: "round" },
  font: { maru: "soft rounded + mincho", mono: "monospace", sans: "clean sans", serif: "book serif", rounded: "rounded" }
};

var card = null;
var preview = null;   // a theme on screen that isn't saved yet
var watching = false;

/* What's on screen right now: the preview if there is one, else the saved theme. */
function onScreen() {
  return preview || currentTheme();
}

function swatchStyle(t) {
  var c = t.colors;
  return escapeHtml(
    "--sw-bg:" + c.bg + ";--sw-surface:" + c.surface + ";--sw-text:" + c.text + ";--sw-muted:" + c.muted +
    ";--sw-accent:" + c.accent + ";--sw-accent2:" + c.accent2 + ";--sw-warm:" + c.warm + ";--sw-font:" + FONTS[t.font]
  );
}

function swatch(t, activeId) {
  var custom = !BUILT_IN.some(function (b) { return b.id === t.id; });
  return (
    '<div class="theme-swatch-wrap">' +
      '<button type="button" class="theme-swatch" data-theme-id="' + escapeHtml(t.id) + '" aria-pressed="' + (t.id === activeId) + '" style="' + swatchStyle(t) + '"' +
        (t.note ? ' title="' + escapeHtml(t.note) + '"' : "") + ">" +
        '<span class="sw-preview' + (t.image ? " sw-preview--image" : "") + (t.background === "night" || t.background === "window" ? " sw-preview--scene" : "") + '"' + (t.image ? ' style="background-image:url(&quot;' + escapeHtml(t.image) + '&quot;)"' : "") + ">" +
          '<span class="sw-card"><span class="sw-aa">Aa</span><span class="sw-line"></span><span class="sw-line sw-line--short"></span></span>' +
          '<span class="sw-dots"><i></i><i></i><i></i></span>' +
          (t.id === DEFAULT_THEME ? '<span class="sw-badge">default</span>' : "") +
        "</span>" +
        '<span class="sw-name">' + escapeHtml(t.name) + "</span>" +
      "</button>" +
      (custom ? '<button type="button" class="sw-delete" data-delete-theme="' + escapeHtml(t.id) + '" aria-label="delete ' + escapeHtml(t.name) + '">' + icon("x") + "</button>" : "") +
    "</div>"
  );
}

function select(name, options, labels, value) {
  return '<select class="select-input" name="' + name + '">' +
    options.map(function (o) { return '<option value="' + o + '"' + (o === value ? " selected" : "") + ">" + escapeHtml(labels[o] || o) + "</option>"; }).join("") +
    "</select>";
}

function editorHtml(t) {
  var c = t.colors;
  var ratio = contrast(c.text, c.surface);
  return (
    '<div class="theme-editor-grid">' +
      '<label class="te-field te-field--name"><span>name</span><input class="text-input" name="name" maxlength="40" value="' + escapeHtml(t.name) + '"></label>' +
      '<label class="te-field"><span>mode</span>' + select("mode", ["dark", "light"], { dark: "dark", light: "light" }, t.mode) + "</label>" +
      '<label class="te-field"><span>font</span>' + select("font", Object.keys(FONTS), LABELS.font, t.font) + "</label>" +
      '<label class="te-field"><span>background</span>' + select("background", BACKGROUNDS, LABELS.background, t.background) + "</label>" +
      '<label class="te-field"' + (t.background === "rain" ? "" : " hidden") + ' data-te-glyphs><span>rain glyphs</span>' + select("glyphs", GLYPHS, LABELS.glyphs, t.glyphs) + "</label>" +
      '<label class="te-field"><span>corners</span>' + select("roundness", ROUNDNESS, LABELS.roundness, t.roundness) + "</label>" +
      '<label class="te-check"><input type="checkbox" class="switch" name="scanlines"' + (t.scanlines ? " checked" : "") + "><span>crt scanlines</span></label>" +
      '<label class="te-check"><input type="checkbox" class="switch" name="glow"' + (t.glow ? " checked" : "") + "><span>neon glow</span></label>" +
    "</div>" +
    '<div class="te-colors">' +
      COLORS.map(function (pair) {
        return '<label class="te-color"><input type="color" name="color-' + pair[0] + '" value="' + c[pair[0]] + '"><span>' + pair[1] + "</span></label>";
      }).join("") +
    "</div>" +
    '<p class="te-contrast ' + (ratio >= 7 ? "is-good" : ratio >= 4.5 ? "is-ok" : "is-bad") + '">text contrast ' + ratio.toFixed(1) + ":1 " +
      (ratio >= 7 ? "· easy to read" : ratio >= 4.5 ? "· readable" : "· hard to read") +
      (ratio < 7 ? ' <button type="button" class="link-btn" data-te="fix">fix readability</button>' : "") + "</p>" +
    (t.image ? '<p class="te-image">this theme has a backdrop picture. <button type="button" class="link-btn" data-te="remove-image">remove it</button></p>' : "") +
    '<details class="te-css"><summary>custom CSS (advanced)</summary>' +
      '<p class="setting-hint">for anything the options above don\'t cover. it\'s saved with the theme. the color variables are <code>--accent-rgb</code>, <code>--surface-rgb</code> and friends, used as <code>rgb(var(--accent-rgb) / 0.5)</code>.</p>' +
      '<textarea class="text-input te-css-input" name="css" rows="6" spellcheck="false" placeholder=".console-clock { letter-spacing: 0; }">' + escapeHtml(t.css || "") + "</textarea>" +
    "</details>" +
    '<div class="settings-actions">' +
      '<button type="button" class="primary-btn" data-te="save">save as my theme</button>' +
      '<button type="button" class="tool-btn" data-te="reset">start over</button>' +
    "</div>"
  );
}

function render() {
  var t = onScreen();
  var active = currentTheme().id;
  card.innerHTML =
    '<div class="theme-head">' +
      '<h3 class="daily-section-title">' + icon("palette") + "<span>look &amp; feel</span></h3>" +
      '<span class="theme-current">now: <b>' + escapeHtml(t.name) + "</b>" + (preview ? " <em>(preview)</em>" : "") + "</span>" +
    "</div>" +
    '<p class="setting-hint">night is the default. pick another look, describe the vibe you want, or make one from a picture. nothing changes for good until you keep it.</p>' +
    '<div class="theme-gallery" role="group" aria-label="themes">' + allThemes().map(function (x) { return swatch(x, preview ? "" : active); }).join("") + "</div>" +
    '<div class="theme-preview-bar"' + (preview ? "" : " hidden") + ' role="status">' +
      '<span>previewing <b>' + escapeHtml(preview ? preview.name : "") + "</b>. not saved yet.</span>" +
      '<span class="theme-preview-actions">' +
        '<button type="button" class="primary-btn" data-preview="keep">' + icon("check") + "<span>keep it</span></button>" +
        '<button type="button" class="tool-btn" data-preview="tweak">tweak</button>' +
        '<button type="button" class="tool-btn" data-preview="undo">undo</button>' +
      "</span>" +
    "</div>" +
    '<div class="theme-makers">' +
      '<form class="theme-maker" id="vibeForm">' +
        '<label class="theme-maker-title" for="vibeText">describe your vibe</label>' +
        '<textarea class="text-input vibe-input" id="vibeText" rows="2" maxlength="300" placeholder="e.g. cozy coffee shop at night, rain on the window, warm and calm"></textarea>' +
        '<div class="vibe-examples">' + EXAMPLES.map(function (x) { return '<button type="button" class="chip" data-vibe="' + escapeHtml(x) + '">' + escapeHtml(x) + "</button>"; }).join("") + "</div>" +
        '<div class="settings-actions">' +
          '<button type="submit" class="primary-btn">' + icon("wand-sparkles") + "<span>make it</span></button>" +
          '<button type="button" class="tool-btn" id="vibeAI" hidden>' + icon("sparkles") + "<span>make it with AI</span></button>" +
          '<button type="button" class="tool-btn" id="vibeSurprise">' + icon("dices") + "<span>surprise me</span></button>" +
        "</div>" +
        '<p class="setting-hint" id="vibeHint">' + OFFLINE_HINT + "</p>" +
      "</form>" +
      '<div class="theme-maker">' +
        '<span class="theme-maker-title">from a picture</span>' +
        '<p class="setting-hint">a wallpaper, a photo, album art. the colors are picked out on this device; the picture never leaves it.</p>' +
        '<label class="file-pick"><input type="file" accept="image/*" id="themePicture"><span>' + icon("image") + "choose a picture</span></label>" +
        '<label class="setting-row"><span class="setting-text"><span class="setting-label">use it as a faint backdrop</span></span>' +
          '<input type="checkbox" class="switch" id="themePictureBackdrop" checked></label>' +
      "</div>" +
    "</div>" +
    '<details class="theme-editor" id="themeEditor"><summary>fine-tune every detail</summary><form class="theme-editor-form" autocomplete="off"></form></details>' +
    '<div class="settings-actions theme-io">' +
      '<button type="button" class="tool-btn" id="themeExport">' + icon("download") + "<span>export this theme</span></button>" +
      '<button type="button" class="tool-btn" id="themeImport">' + icon("upload") + "<span>import a theme</span></button>" +
      '<input type="file" id="themeImportFile" accept="application/json,.json" hidden>' +
      (active !== DEFAULT_THEME || preview ? '<button type="button" class="link-btn" id="themeDefault">back to night</button>' : "") +
    "</div>";

  fillEditor();
  syncAIButton();
}

var OFFLINE_HINT = "works offline: it reads colors, moods, places and styles from your words.";
function syncAIButton() {
  aiStatus().then(function (s) {
    var btn = card && card.querySelector("#vibeAI");
    if (!btn) return;
    btn.hidden = !s.available;
    card.querySelector("#vibeHint").textContent = OFFLINE_HINT + (s.available ? " or let AI design it." : " set up the AI companion below and AI can design themes too.");
  }).catch(function () {});
}

function fillEditor() {
  var form = card && card.querySelector(".theme-editor-form");
  if (form) form.innerHTML = editorHtml(onScreen());
}

function showPreview(theme, message) {
  preview = normalizeTheme(theme);
  applyTheme(preview, false);
  var editorOpen = card.querySelector("#themeEditor").open;
  render();
  card.querySelector("#themeEditor").open = editorOpen;
  if (message) toast(message);
}

function keep() {
  if (!preview) return;
  var saved = saveCustomTheme(preview);
  preview = null;
  applyTheme(saved, true);
  render();
  toast(saved.imageDropped ? "theme saved, but the picture was too big to keep" : "theme saved: " + saved.name, saved.imageDropped ? "warn" : "ok");
}

function undo() {
  preview = null;
  applyTheme(currentTheme(), true);
  render();
}

function pick(id) {
  var before = currentTheme();
  var next = allThemes().find(function (t) { return t.id === id; });
  if (!next) return;
  preview = null;
  applyTheme(next, true);
  render();
  if (before.id !== next.id) {
    toast("theme: " + next.name, "ok", { action: { label: "undo", run: function () { applyTheme(before, true); preview = null; if (card && card.isConnected) render(); } } });
  }
}

/* Read the editor into a theme and show it. */
function readEditor(form) {
  var base = onScreen();
  var colors = {};
  COLORS.forEach(function (pair) { colors[pair[0]] = form.elements["color-" + pair[0]].value; });
  return normalizeTheme(Object.assign({}, base, {
    name: form.elements.name.value.trim() || base.name,
    mode: form.elements.mode.value,
    font: form.elements.font.value,
    background: form.elements.background.value,
    glyphs: form.elements.glyphs.value,
    roundness: form.elements.roundness.value,
    scanlines: form.elements.scanlines.checked,
    glow: form.elements.glow.checked,
    css: form.elements.css.value,
    colors: colors
  }));
}

/* Editing a built-in theme makes your own copy of it. */
function asOwn(t) {
  if (BUILT_IN.some(function (b) { return b.id === t.id; })) {
    return Object.assign({}, t, { id: "custom-" + Date.now().toString(36), name: t.name + " (mine)", note: "your take on " + t.name });
  }
  return t;
}

var editTimer = null;
function onEditorInput(e) {
  var form = e.currentTarget;
  clearTimeout(editTimer);
  editTimer = setTimeout(function () {
    var t = readEditor(form);
    var wasPreview = Boolean(preview);
    preview = asOwn(t);
    if (!wasPreview && form.elements.name.value === currentTheme().name) {
      form.elements.name.value = preview.name;
    }
    applyTheme(preview, false);
    // update the bits that depend on the values without rebuilding the form (keeps focus)
    var glyphRow = form.querySelector("[data-te-glyphs]");
    if (glyphRow) glyphRow.hidden = preview.background !== "rain";
    var ratio = contrast(preview.colors.text, preview.colors.surface);
    var line = form.querySelector(".te-contrast");
    if (line) {
      line.className = "te-contrast " + (ratio >= 7 ? "is-good" : ratio >= 4.5 ? "is-ok" : "is-bad");
      line.firstChild.textContent = "text contrast " + ratio.toFixed(1) + ":1 " + (ratio >= 7 ? "· easy to read" : ratio >= 4.5 ? "· readable" : "· hard to read");
    }
    var bar = card.querySelector(".theme-preview-bar");
    bar.hidden = false;
    bar.querySelector("b").textContent = preview.name;
    card.querySelector(".theme-current").innerHTML = "now: <b>" + escapeHtml(preview.name) + "</b> <em>(preview)</em>";
  }, 60);
}

function download(obj, filename) {
  var url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function readFileText(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result)); };
    r.onerror = function () { reject(new Error("couldn't read the file")); };
    r.readAsText(file);
  });
}

async function makeWithAI(vibe, btn) {
  btn.disabled = true;
  var label = btn.innerHTML;
  btn.innerHTML = icon("sparkles") + "<span>designing…</span>";
  try {
    var reply = await aiChat([{ role: "user", content: "The vibe: " + vibe }], AI_THEME_PROMPT, 600);
    showPreview(themeFromAIReply(reply, vibe), "the AI made you a theme. keep it if you like it.");
  } catch (e) {
    toast("AI couldn't make a theme: " + (e.detail || e.message) + ". here's the offline version.", "warn", { duration: 5000 });
    showPreview(themeFromVibe(vibe));
  } finally {
    var again = card.querySelector("#vibeAI");
    if (again) { again.disabled = false; again.innerHTML = label; }
  }
}

function wire() {
  card.addEventListener("click", function (e) {
    var sw = e.target.closest("[data-theme-id]");
    if (sw) return pick(sw.getAttribute("data-theme-id"));

    var del = e.target.closest("[data-delete-theme]");
    if (del) {
      var id = del.getAttribute("data-delete-theme");
      var t = allThemes().find(function (x) { return x.id === id; });
      if (t && confirm("delete the theme “" + t.name + "”?")) {
        deleteCustomTheme(id);
        if (preview && preview.id === id) preview = null;
        render();
      }
      return;
    }

    var chip = e.target.closest("[data-vibe]");
    if (chip) {
      card.querySelector("#vibeText").value = chip.getAttribute("data-vibe");
      return showPreview(themeFromVibe(chip.getAttribute("data-vibe")));
    }

    var action = e.target.closest("[data-preview]");
    if (action) {
      var what = action.getAttribute("data-preview");
      if (what === "keep") keep();
      if (what === "undo") undo();
      if (what === "tweak") {
        var ed = card.querySelector("#themeEditor");
        ed.open = true;
        ed.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }

    var te = e.target.closest("[data-te]");
    if (te) {
      var kind = te.getAttribute("data-te");
      var form = card.querySelector(".theme-editor-form");
      if (kind === "save") { preview = asOwn(readEditor(form)); keep(); card.querySelector("#themeEditor").open = false; }
      if (kind === "reset") { undo(); card.querySelector("#themeEditor").open = true; }
      if (kind === "fix") { showPreview(asOwn(fixContrast(readEditor(form)))); card.querySelector("#themeEditor").open = true; }
      if (kind === "remove-image") { showPreview(asOwn(Object.assign(readEditor(form), { image: "" }))); card.querySelector("#themeEditor").open = true; }
      return;
    }

    if (e.target.closest("#vibeAI")) {
      var vibe = card.querySelector("#vibeText").value.trim();
      if (!vibe) return toast("describe the vibe first", "warn");
      return makeWithAI(vibe, e.target.closest("#vibeAI"));
    }
    if (e.target.closest("#vibeSurprise")) {
      var v = SURPRISE[Math.floor(Math.random() * SURPRISE.length)];
      card.querySelector("#vibeText").value = v;
      return showPreview(themeFromVibe(v), "surprise: " + v);
    }
    if (e.target.closest("#themeDefault")) return pick(DEFAULT_THEME);
    if (e.target.closest("#themeExport")) {
      var cur = onScreen();
      var out = Object.assign({}, cur);
      delete out.imageDropped;
      download({ logbook_theme: 1, theme: out }, "logbook-theme-" + cur.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json");
      return toast("theme exported. send the file to anyone with logbook.");
    }
    if (e.target.closest("#themeImport")) return card.querySelector("#themeImportFile").click();
  });

  card.addEventListener("submit", function (e) {
    if (e.target.id === "vibeForm") {
      e.preventDefault();
      var vibe = card.querySelector("#vibeText").value.trim();
      if (!vibe) return toast("describe the vibe first. colors, a place, a mood, anything.", "warn");
      showPreview(themeFromVibe(vibe));
    } else if (e.target.classList.contains("theme-editor-form")) {
      e.preventDefault();
    }
  });

  card.addEventListener("keydown", function (e) {
    // ctrl/cmd+enter in the vibe box makes it
    if (e.target.id === "vibeText" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitForm(card.querySelector("#vibeForm"));
    }
  });

  card.addEventListener("input", function (e) {
    var form = e.target.closest(".theme-editor-form");
    if (form) onEditorInput({ currentTarget: form });
  });
  card.addEventListener("change", async function (e) {
    var form = e.target.closest(".theme-editor-form");
    if (form) return onEditorInput({ currentTarget: form });

    if (e.target.id === "themePicture") {
      var file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        var made = await themeFromImage(file);
        if (card.querySelector("#themePictureBackdrop").checked) made.theme.image = made.image;
        showPreview(made.theme, "colors picked from your picture");
      } catch (err) {
        toast(err.message || "couldn't read that picture", "error");
      }
    }

    if (e.target.id === "themeImportFile") {
      var f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        var parsed = JSON.parse(await readFileText(f));
        var t = parsed && parsed.theme ? parsed.theme : parsed;
        if (!t || typeof t !== "object" || !t.colors) throw new Error("that isn't a logbook theme file");
        if (t.css && !confirm("this theme comes with custom CSS. CSS can change how anything looks and load things from the internet. only import it if you trust where it came from. continue?")) return;
        t = Object.assign({}, t, { id: "custom-" + Date.now().toString(36) });
        showPreview(t, "imported " + (t.name || "a theme") + ". keep it if you like it.");
      } catch (err) {
        toast(err.message || "couldn't import that theme", "error");
      }
    }
  });
}

export function renderThemeCard(el) {
  if (!el) return;
  card = el;
  render();
  wire();
  if (!watching) {
    watching = true;
    document.addEventListener("logbook:ai-changed", function () { if (card && card.isConnected) syncAIButton(); });
    // the theme changed from somewhere else (command prompt, undo toast): refresh the gallery
    var pending = null;
    document.addEventListener("logbook:theme-changed", function () {
      if (preview || !card || !card.isConnected) return;
      clearTimeout(pending);
      pending = setTimeout(function () {
        if (preview || card.contains(document.activeElement) && document.activeElement.closest(".theme-editor-form")) return;
        var open = card.querySelector("#themeEditor") && card.querySelector("#themeEditor").open;
        render();
        if (open) card.querySelector("#themeEditor").open = true;
      }, 30);
    });
    // leaving settings with an unsaved preview: offer to keep it
    document.addEventListener("logbook:navigated", function (e) {
      if (e.detail.page !== "settings" && preview) {
        var name = preview.name;
        toast("the theme “" + name + "” is only a preview", "warn", {
          duration: 8000,
          action: { label: "keep it", run: function () { if (preview && preview.name === name) keep(); } }
        });
      }
    });
  }
}
