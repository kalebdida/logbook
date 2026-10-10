/* Themes: the whole look of the app from one small object.

   {
     id, name, mode: "dark" | "light",
     colors: { bg, surface, text, text2, muted, accent, accent2, warm, danger },   // hex
     font: "maru" | "mono" | "sans" | "serif" | "rounded",
     background: "night" | "window" | "rain" | "stars" | "snow" | "fireflies" | "none",
     glyphs: "binary" | "katakana" | "hex" | "dots",       // for rain
     scanlines: bool, glow: bool,
     roundness: "sharp" | "soft" | "round",
     image: optional data URL used as a faint backdrop,
     css: optional extra CSS for anything the options don't cover
   }

   Everything else (borders, dim text, tints) is derived, and generated
   themes are pushed to readable contrast before they're applied.
   "night" is the default and matches the CSS defaults in base.css exactly. */

var THEME_KEY = "logbook-theme";          // id of the active theme
var CUSTOM_KEY = "logbook-custom-themes";  // themes you made
var VARS_KEY = "logbook-theme-vars";       // precomputed CSS vars, read by index.html before first paint

export var BACKGROUNDS = ["night", "window", "rain", "stars", "snow", "fireflies", "none"];
export var DEFAULT_THEME = "night";
export var GLYPHS = ["binary", "katakana", "hex", "dots"];
export var ROUNDNESS = ["sharp", "soft", "round"];

export var FONTS = {
  maru: '"Zen Maru Gothic", ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
  mono: 'var(--mono)',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", Nunito, Quicksand, "Varela Round", system-ui, sans-serif'
};

var ROUND = { sharp: [2, 3, 4], soft: [6, 9, 13], round: [10, 14, 20] };

/* headings, the clock, the verse: a book face for the softer fonts */
var MINCHO = '"Shippori Mincho", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
var DISPLAY = { maru: MINCHO, serif: FONTS.serif, mono: FONTS.mono, sans: FONTS.sans, rounded: FONTS.rounded };

export var BUILT_IN = [
  { id: "night", name: "night", note: "fuji under the stars. deep blue, warm windows, a slow sky.", mode: "dark",
    colors: { bg: "#0a1430", surface: "#121e3d", text: "#edf0fa", text2: "#bcc5df", muted: "#8792b5", accent: "#f4c56c", accent2: "#8ec8ff", warm: "#f5ad7a", danger: "#ec8f95" },
    font: "maru", background: "night", glyphs: "dots", scanlines: false, glow: false, roundness: "round" },
  { id: "window", name: "rainy window", note: "a small apartment, rain on the glass, the city blurred behind it.", mode: "dark",
    colors: { bg: "#0c111d", surface: "#151c2c", text: "#e9edf5", text2: "#b8c0d2", muted: "#848ea6", accent: "#ffc977", accent2: "#9cc3e8", warm: "#f0a77e", danger: "#e98d93" },
    font: "maru", background: "window", glyphs: "dots", scanlines: false, glow: false, roundness: "round" },
  { id: "terminal", name: "terminal", note: "the original. phosphor green, matrix rain, scanlines.", mode: "dark",
    colors: { bg: "#050806", surface: "#0c1410", text: "#eafff2", text2: "#c8c4b8", muted: "#8890a8", accent: "#7ce8a0", accent2: "#4dd0c4", warm: "#e8b95c", danger: "#c96a6a" },
    font: "mono", background: "rain", glyphs: "binary", scanlines: true, glow: true, roundness: "soft" },
  { id: "amber", name: "amber crt", note: "an old monochrome monitor, warm and buzzing.", mode: "dark",
    colors: { bg: "#0b0700", surface: "#161004", text: "#ffd89a", text2: "#e6bf7d", muted: "#a68547", accent: "#ffb000", accent2: "#ffcf5a", warm: "#ff8c1a", danger: "#ff5f3f" },
    font: "mono", background: "rain", glyphs: "hex", scanlines: true, glow: true, roundness: "sharp" },
  { id: "paper", name: "paper", note: "a quiet notebook. light, serif, nothing moving.", mode: "light",
    colors: { bg: "#f4efe4", surface: "#fffcf5", text: "#24211c", text2: "#45403a", muted: "#6f685c", accent: "#2f6b4c", accent2: "#2a6788", warm: "#a85d14", danger: "#ad3427" },
    font: "serif", background: "none", glyphs: "dots", scanlines: false, glow: false, roundness: "soft" },
  { id: "glacier", name: "glacier", note: "cool blues, clean sans, a slow starfield.", mode: "dark",
    colors: { bg: "#0b1016", surface: "#131a23", text: "#e6edf3", text2: "#bac4ce", muted: "#8d99a8", accent: "#7cc4ff", accent2: "#8be3ee", warm: "#f2c57c", danger: "#f47174" },
    font: "sans", background: "stars", glyphs: "dots", scanlines: false, glow: false, roundness: "round" },
  { id: "dusk", name: "dusk", note: "synthwave purple and pink. neon on.", mode: "dark",
    colors: { bg: "#110a1d", surface: "#1b1230", text: "#f7ebff", text2: "#d8c4ec", muted: "#a08aba", accent: "#ff6ad5", accent2: "#8f80ff", warm: "#ffb86b", danger: "#ff5c7a" },
    font: "mono", background: "rain", glyphs: "katakana", scanlines: true, glow: true, roundness: "soft" },
  { id: "forest", name: "forest", note: "mossy greens, soft corners, snow drifting.", mode: "dark",
    colors: { bg: "#0e130f", surface: "#162019", text: "#e9efe4", text2: "#c5cfbb", muted: "#909c87", accent: "#a3d68e", accent2: "#80bba6", warm: "#e2bb72", danger: "#da7c6e" },
    font: "rounded", background: "snow", glyphs: "dots", scanlines: false, glow: false, roundness: "round" },
  { id: "contrast", name: "high contrast", note: "maximum readability. black, white, bright accents.", mode: "dark",
    colors: { bg: "#000000", surface: "#0b0b0b", text: "#ffffff", text2: "#f0f0f0", muted: "#cfcfcf", accent: "#ffd400", accent2: "#33e1ff", warm: "#ffd400", danger: "#ff7070" },
    font: "sans", background: "none", glyphs: "dots", scanlines: false, glow: false, roundness: "sharp" }
];

/* ---------- color math ---------- */

export function hexToRgb(hex) {
  var h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
  var n = parseInt(h, 16);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb) {
  return "#" + rgb.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join("");
}

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  var k = function (n) { return (n + h / 30) % 12; };
  var a = s * Math.min(l, 1 - l);
  var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export function toHsl(hex) {
  var c = hexToRgb(hex).map(function (v) { return v / 255; });
  var max = Math.max.apply(null, c), min = Math.min.apply(null, c), l = (max + min) / 2, h = 0, s = 0;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === c[0]) h = (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0);
    else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
    else h = (c[0] - c[1]) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

export function mix(a, b, t) {
  var x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
}

function luminance(hex) {
  return hexToRgb(hex).map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }).reduce(function (sum, v, i) { return sum + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
}

export function contrast(a, b) {
  var x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* Nudge fg lighter (dark bg) or darker (light bg) until it reads. */
export function ensureContrast(fg, bg, ratio) {
  var c = toHsl(fg), lighter = luminance(bg) < 0.4, guard = 0;
  while (contrast(fg, bg) < ratio && guard++ < 60) {
    c[2] += lighter ? 2 : -2;
    if (c[2] >= 100 || c[2] <= 0) { c[1] = Math.max(0, c[1] - 10); c[2] = Math.max(0, Math.min(100, c[2])); }
    fg = hsl(c[0], c[1], c[2]);
  }
  return fg;
}

function chan(hex) { return hexToRgb(hex).join(" "); }

/* ---------- applying ---------- */

export function normalizeTheme(t) {
  var base = BUILT_IN[0];
  var out = Object.assign({}, base, t || {});
  out.colors = Object.assign({}, base.colors, (t && t.colors) || {});
  Object.keys(out.colors).forEach(function (k) {
    if (!/^#[0-9a-fA-F]{6}$/.test(out.colors[k])) out.colors[k] = base.colors[k];
  });
  if (["dark", "light"].indexOf(out.mode) < 0) out.mode = luminance(out.colors.bg) > 0.35 ? "light" : "dark";
  if (!FONTS[out.font]) out.font = "maru";
  if (BACKGROUNDS.indexOf(out.background) < 0) out.background = "none";
  if (GLYPHS.indexOf(out.glyphs) < 0) out.glyphs = "binary";
  if (!ROUND[out.roundness]) out.roundness = "soft";
  out.scanlines = Boolean(out.scanlines);
  out.glow = Boolean(out.glow);
  out.name = String(out.name || "custom").slice(0, 40);
  out.note = String(out.note || "").slice(0, 160);
  out.css = typeof out.css === "string" ? out.css.slice(0, 20000) : "";
  // only a plain base64 picture: nothing that could close the url("...") it goes into
  out.image = typeof out.image === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(out.image) ? out.image : "";
  return out;
}

/* Make any theme readable. Built-in themes already pass; this is for
   generated, picture-based, and hand-tuned ones. */
export function fixContrast(t) {
  var c = Object.assign({}, t.colors);
  var light = t.mode === "light";
  if (light && luminance(c.bg) < 0.5) c.bg = hsl(toHsl(c.bg)[0], Math.min(toHsl(c.bg)[1], 40), 95);
  if (!light && luminance(c.bg) > 0.06) c.bg = hsl(toHsl(c.bg)[0], Math.min(toHsl(c.bg)[1], 45), 6);
  if (contrast(c.surface, c.bg) > 1.6 || Math.abs(luminance(c.surface) - luminance(c.bg)) > 0.25) c.surface = mix(c.bg, light ? "#ffffff" : "#ffffff", light ? 0.6 : 0.05);
  c.text = ensureContrast(c.text, c.surface, 10);
  c.text2 = ensureContrast(c.text2, c.surface, 7);
  c.muted = ensureContrast(c.muted, c.surface, 4.6);
  ["accent", "accent2", "warm", "danger"].forEach(function (k) { c[k] = ensureContrast(c[k], c.surface, light ? 4.6 : 4); });
  return Object.assign({}, t, { colors: c });
}

export function themeVars(theme) {
  var t = normalizeTheme(theme);
  var c = t.colors, light = t.mode === "light", r = ROUND[t.roundness];
  var onAccent = contrast("#ffffff", c.accent) > contrast("#101010", c.accent) ? "#ffffff" : mix(c.accent, "#000000", 0.82);
  var vars = {
    "--bg-rgb": chan(c.bg), "--surface-rgb": chan(c.surface), "--text-rgb": chan(c.text),
    "--ink-rgb": light ? "0 0 0" : "255 255 255", "--shade-rgb": light ? "40 30 20" : "0 0 0",
    "--accent-rgb": chan(c.accent), "--accent2-rgb": chan(c.accent2), "--warm-rgb": chan(c.warm), "--danger-rgb": chan(c.danger),
    "--surface-deep": mix(c.surface, c.bg, 0.5),
    "--text-2": c.text2, "--text-3": mix(c.text2, c.muted, 0.4), "--muted": c.muted,
    "--faint": mix(c.muted, c.surface, 0.18), "--dim": mix(c.muted, c.surface, 0.3), "--placeholder": mix(c.muted, c.surface, 0.5),
    "--danger-text": mix(c.danger, c.text, light ? 0.15 : 0.4), "--warm-text": mix(c.warm, c.text, light ? 0.15 : 0.5),
    "--warm-dim": mix(c.warm, c.surface, 0.2), "--warm-faint": mix(c.warm, c.surface, 0.42), "--on-accent": onAccent,
    "--font-ui": FONTS[t.font], "--font-display": DISPLAY[t.font],
    "--serif": t.font === "maru" ? MINCHO : FONTS.serif, "--glow": t.glow ? "1" : "0",
    "--r-sm": r[0] + "px", "--r-md": r[1] + "px", "--r-lg": r[2] + "px",
    "color-scheme": t.mode
  };
  if (t.id === "terminal") {
    // pixel-for-pixel the original
    Object.assign(vars, { "--serif": "Georgia, \"Iowan Old Style\", \"Times New Roman\", serif", "--surface-deep": "#07100b", "--text-3": "#a8b6ac", "--faint": "#6b7394", "--dim": "#5b6482", "--placeholder": "#44504a",
      "--danger-text": "#e3a3a3", "--warm-text": "#f0d9a8", "--warm-dim": "#b98f4a", "--warm-faint": "#8a7040", "--on-accent": "#052b12" });
  }
  return vars;
}

function setCustomCss(css) {
  var el = document.getElementById("themeCss");
  if (!css) { if (el) el.textContent = ""; return; }
  if (!el) {
    el = document.createElement("style");
    el.id = "themeCss";
  }
  el.textContent = css;
  document.head.appendChild(el); // last in <head>, so it wins over the app's own CSS
}

function readJson(key, fallback) {
  try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fallback : v; } catch (e) { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

export function customThemes() {
  return readJson(CUSTOM_KEY, []).map(normalizeTheme);
}

export function allThemes() {
  return BUILT_IN.concat(customThemes());
}

export function findTheme(id) {
  return allThemes().find(function (t) { return t.id === id; }) || BUILT_IN[0];
}

var current = null;

export function currentTheme() {
  return current || findTheme(readJson(THEME_KEY, DEFAULT_THEME));
}

/* Apply a theme to the page. persist=false previews without saving. */
export function applyTheme(theme, persist) {
  var t = normalizeTheme(theme);
  current = t;
  var vars = themeVars(t);
  var root = document.documentElement;
  Object.keys(vars).forEach(function (k) {
    if (k === "color-scheme") root.style.colorScheme = vars[k];
    else root.style.setProperty(k, vars[k]);
  });
  root.dataset.theme = t.id;
  root.dataset.themeMode = t.mode;
  root.dataset.scanlines = t.scanlines ? "on" : "off";
  root.dataset.glow = t.glow ? "on" : "off";
  root.dataset.background = t.background;
  root.classList.toggle("has-backdrop-image", Boolean(t.image));
  root.style.setProperty("--backdrop-image", t.image ? 'url("' + t.image + '")' : "none");
  setCustomCss(t.css);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.colors.bg);
  var scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute("content", t.mode);
  if (persist !== false) {
    writeJson(THEME_KEY, t.id);
    writeJson(VARS_KEY, { id: t.id, vars: vars, mode: t.mode, bg: t.colors.bg, background: t.background, scanlines: t.scanlines, glow: t.glow, css: t.css });
  }
  document.dispatchEvent(new CustomEvent("logbook:theme-changed", { detail: { theme: t } }));
  return t;
}

export function saveCustomTheme(theme) {
  var t = normalizeTheme(theme);
  if (!t.id || BUILT_IN.some(function (b) { return b.id === t.id; })) t.id = "custom-" + Date.now().toString(36);
  var list = readJson(CUSTOM_KEY, []).filter(function (x) { return x.id !== t.id; });
  list.push(t);
  if (!writeJson(CUSTOM_KEY, list)) {
    // usually a big backdrop picture: keep the theme, drop the picture
    t.image = "";
    list[list.length - 1] = t;
    writeJson(CUSTOM_KEY, list);
    t.imageDropped = true;
  }
  return t;
}

export function deleteCustomTheme(id) {
  writeJson(CUSTOM_KEY, readJson(CUSTOM_KEY, []).filter(function (t) { return t.id !== id; }));
  if (currentTheme().id === id) applyTheme(BUILT_IN[0]);
}

/* The look changed in 2.2: night replaced terminal as the default. Anyone
   still on terminal got it by default, not by choice, so move them once.
   (index.html skips the saved terminal colors for the same reason.) */
var LOOK_KEY = "logbook-look";
export function initThemes() {
  if (readJson(LOOK_KEY, 0) < 2) {
    if (readJson(THEME_KEY, DEFAULT_THEME) === "terminal") writeJson(THEME_KEY, DEFAULT_THEME);
    writeJson(LOOK_KEY, 2);
  }
  applyTheme(currentTheme(), true);
}

/* ---------- describe a vibe (no AI needed) ---------- */

var HUES = [
  [["ocean", "sea", "blue", "water", "sky", "ice", "wave", "navy", "rain"], 205],
  [["teal", "aqua", "mint", "turquoise", "lagoon"], 172],
  [["forest", "nature", "green", "plant", "leaf", "matcha", "moss", "jungle", "earth", "garden"], 125],
  [["matrix", "hacker", "terminal", "code"], 140],
  [["gold", "luxury", "sun", "honey", "yellow", "lemon", "royal"], 46],
  [["amber", "retro", "crt", "vintage"], 38],
  [["orange", "sunset", "autumn", "fall", "fire", "peach", "desert"], 24],
  [["coffee", "brown", "cozy", "wood", "library", "chocolate", "latte", "cabin"], 28],
  [["red", "crimson", "blood", "rose", "love", "cherry", "wine", "ruby"], 354],
  [["pink", "sakura", "cute", "kawaii", "blush", "bubblegum", "flamingo"], 330],
  [["purple", "lavender", "violet", "galaxy", "space", "cosmic", "mystic", "grape", "night"], 268],
  [["cyberpunk", "neon", "synthwave", "vaporwave", "miami", "arcade"], 312]
];

function words(text) { return String(text || "").toLowerCase().match(/[a-z]+/g) || []; }
function any(ws, list) { return list.some(function (w) { return ws.indexOf(w) >= 0; }); }

function hashHue(text) {
  var h = 0;
  for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function themeFromVibe(text) {
  var ws = words(text);
  var light = any(ws, ["light", "bright", "day", "paper", "white", "pastel", "airy", "morning", "cream", "sunny"]) && !any(ws, ["dark", "night", "midnight"]);
  // the first color word you use wins ("coffee shop, rain outside" is brown, not blue)
  var hue = null;
  ws.some(function (w) {
    var hit = HUES.find(function (pair) { return pair[0].indexOf(w) >= 0; });
    if (hit) hue = hit[1];
    return Boolean(hit);
  });
  var mono = any(ws, ["gray", "grey", "monochrome", "mono", "noir", "black", "minimal", "minimalist"]);
  if (hue === null) hue = hashHue(ws.join(" ") || "logbook");

  var sat = 62;
  if (any(ws, ["calm", "soft", "muted", "pastel", "gentle", "quiet", "chill", "cozy", "minimal"])) sat = 38;
  if (any(ws, ["vibrant", "neon", "bold", "electric", "loud", "intense", "cyberpunk", "synthwave", "arcade"])) sat = 92;
  if (mono) sat = 6;

  var accent2Hue = hue + (any(ws, ["cyberpunk", "neon", "synthwave", "vaporwave"]) ? 180 : 40);
  var warmHue = hue >= 20 && hue <= 60 ? 15 : 42;
  var colors = light ? {
    bg: hsl(hue, sat * 0.35, 95), surface: hsl(hue, sat * 0.3, 99), text: hsl(hue, sat * 0.25, 12), text2: hsl(hue, sat * 0.2, 26),
    muted: hsl(hue, sat * 0.15, 42), accent: hsl(hue, sat, 33), accent2: hsl(accent2Hue, sat * 0.85, 33),
    warm: hsl(warmHue, 70, 36), danger: hsl(2, 62, 42)
  } : {
    bg: hsl(hue, sat * 0.4, 5), surface: hsl(hue, sat * 0.35, 9), text: hsl(hue, sat * 0.3, 93), text2: hsl(hue, sat * 0.18, 80),
    muted: hsl(hue, sat * 0.14, 62), accent: hsl(hue, sat, 66), accent2: hsl(accent2Hue, sat * 0.9, 64),
    warm: hsl(warmHue, 78, 64), danger: hsl(356, 70, 66)
  };
  if (any(ws, ["ethiopia", "ethiopian", "habesha", "abyssinia"])) {
    Object.assign(colors, light
      ? { accent: "#1d7a3a", accent2: "#1f5fa8", warm: "#b8860b", danger: "#c0272d" }
      : { accent: "#3ecf6b", accent2: "#5aa2ff", warm: "#fcd116", danger: "#ef4a4f" });
  }

  var font = any(ws, ["serif", "book", "books", "classic", "elegant", "library", "literary", "vintage", "journal", "poetry"]) ? "serif"
    : any(ws, ["rounded", "cute", "playful", "kawaii", "bubbly", "friendly", "soft"]) ? "rounded"
    : any(ws, ["terminal", "code", "hacker", "retro", "crt", "matrix", "cyber", "cyberpunk", "pixel", "arcade"]) ? "mono"
    : any(ws, ["modern", "clean", "minimal", "sleek", "apple", "simple", "pro"]) ? "sans"
    : light ? "sans" : "maru";
  var background = any(ws, ["matrix", "hacker", "code", "cyber", "cyberpunk", "terminal", "digital"]) ? "rain"
    : any(ws, ["rain", "rainy", "window", "apartment", "lofi", "storm", "drizzle"]) ? "window"
    : any(ws, ["ghibli", "fuji", "mountain", "mountains", "japan", "japanese", "anime", "konbini"]) ? "night"
    : any(ws, ["space", "galaxy", "stars", "starry", "cosmic", "dream", "dreamy", "night"]) ? "stars"
    : any(ws, ["snow", "winter", "christmas", "frost", "cold"]) ? "snow"
    : any(ws, ["firefly", "fireflies", "cozy", "summer", "campfire", "magic", "magical", "fairy", "warm", "candle"]) ? "fireflies"
    : "none";
  var glyphs = any(ws, ["japan", "japanese", "anime", "tokyo", "katakana", "manga"]) ? "katakana" : any(ws, ["hex", "code"]) ? "hex" : "binary";
  var scanlines = any(ws, ["retro", "crt", "vhs", "terminal", "hacker", "eighties", "arcade", "synthwave"]);
  var glow = any(ws, ["neon", "glow", "cyber", "cyberpunk", "synthwave", "crt", "electric", "arcade"]);
  var roundness = any(ws, ["sharp", "brutal", "brutalist", "hard", "square", "terminal", "pixel"]) ? "sharp"
    : any(ws, ["round", "rounded", "soft", "cute", "bubbly", "friendly", "cozy"]) ? "round" : "soft";

  var name = ws.filter(function (w) { return w.length > 2 && ["and", "the", "with", "vibe", "theme", "want", "like", "something", "make", "very"].indexOf(w) < 0; }).slice(0, 3).join(" ") || "my vibe";
  return fixContrast(normalizeTheme({
    id: "custom-" + Date.now().toString(36), name: name, note: "made from: “" + String(text).slice(0, 80) + "”",
    mode: light ? "light" : "dark", colors: colors, font: font, background: background, glyphs: glyphs,
    scanlines: scanlines, glow: glow, roundness: roundness
  }));
}

/* ---------- from a picture ---------- */

/* Reads an image file, returns { theme, image } where image is a small
   JPEG data URL you can optionally use as the backdrop. */
export function themeFromImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var sample = document.createElement("canvas");
        var w = 64, h = Math.max(1, Math.round(64 * img.height / img.width));
        sample.width = w; sample.height = h;
        var ctx = sample.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        var px = ctx.getImageData(0, 0, w, h).data;
        var buckets = {}, total = 0, lumSum = 0;
        for (var i = 0; i < px.length; i += 4) {
          var r = px[i], g = px[i + 1], b = px[i + 2];
          var key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
          (buckets[key] = buckets[key] || { n: 0, r: 0, g: 0, b: 0 });
          buckets[key].n++; buckets[key].r += r; buckets[key].g += g; buckets[key].b += b;
          lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b; total++;
        }
        var colors = Object.values(buckets).map(function (bk) { return rgbToHex([bk.r / bk.n, bk.g / bk.n, bk.b / bk.n]); });
        var counts = Object.values(buckets).map(function (bk) { return bk.n; });
        var ranked = colors.map(function (c, i) { return { c: c, n: counts[i], s: toHsl(c)[1], l: toHsl(c)[2] }; });
        var light = lumSum / total > 150;
        var vivid = ranked.filter(function (x) { return x.s > 35 && x.l > 25 && x.l < 80; })
          .sort(function (a, b) { return b.n * (b.s / 100) - a.n * (a.s / 100); });
        var base = ranked.slice().sort(function (a, b) { return b.n - a.n; })[0];
        var accent = vivid[0] ? vivid[0].c : hsl(toHsl(base.c)[0], 60, light ? 35 : 65);
        var accentHue = toHsl(accent)[0];
        var second = vivid.find(function (x) { return Math.abs(toHsl(x.c)[0] - accentHue) > 35; });
        var accent2 = second ? second.c : hsl(accentHue + 40, 55, light ? 35 : 62);
        var bh = toHsl(base.c)[0], bs = Math.min(toHsl(base.c)[1], 35);
        var theme = fixContrast(normalizeTheme({
          id: "custom-" + Date.now().toString(36), name: (file.name || "picture").replace(/\.[^.]+$/, "").slice(0, 30).toLowerCase(),
          note: "made from a picture", mode: light ? "light" : "dark",
          colors: light ? {
            bg: hsl(bh, bs, 95), surface: hsl(bh, bs * 0.8, 99), text: hsl(bh, 20, 12), text2: hsl(bh, 15, 26), muted: hsl(bh, 12, 42),
            accent: accent, accent2: accent2, warm: hsl(38, 70, 36), danger: hsl(2, 62, 42)
          } : {
            bg: hsl(bh, bs, 6), surface: hsl(bh, bs * 0.9, 10), text: hsl(bh, 20, 93), text2: hsl(bh, 14, 80), muted: hsl(bh, 10, 62),
            accent: accent, accent2: accent2, warm: hsl(40, 78, 64), danger: hsl(356, 70, 66)
          },
          font: light ? "sans" : "maru", background: "none", scanlines: false, glow: false, roundness: "round"
        }));
        // small backdrop copy (fits comfortably in browser storage)
        var big = document.createElement("canvas");
        var bw = Math.min(1280, img.width), bhh = Math.round(bw * img.height / img.width);
        big.width = bw; big.height = bhh;
        big.getContext("2d").drawImage(img, 0, 0, bw, bhh);
        var image = big.toDataURL("image/jpeg", 0.72);
        URL.revokeObjectURL(url);
        resolve({ theme: theme, image: image });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("couldn't read that image")); };
    img.src = url;
  });
}

/* ---------- AI version of the vibe generator ---------- */

export var AI_THEME_PROMPT =
  "You design color themes for a journaling app. Reply with ONLY a JSON object, no prose, matching:\n" +
  '{"name": short lowercase name, "mode": "dark"|"light", "colors": {"bg","surface","text","text2","muted","accent","accent2","warm","danger"} as #rrggbb hex, ' +
  '"font": "maru"|"mono"|"sans"|"serif"|"rounded", "background": "night"|"window"|"rain"|"stars"|"snow"|"fireflies"|"none", "glyphs": "binary"|"katakana"|"hex"|"dots", ' +
  '"scanlines": bool, "glow": bool, "roundness": "sharp"|"soft"|"round"}\n' +
  "night is a starry sky over a mountain, window is rain on glass with city lights, rain is falling code glyphs. surface is a card color slightly off bg. text must be very readable on surface. accent is the main highlight, accent2 a second one, warm a warm highlight, danger for errors. Match the vibe the user describes.";

export function themeFromAIReply(reply, vibe) {
  var match = String(reply).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("the AI didn't send a theme back");
  var parsed = JSON.parse(match[0]);
  delete parsed.css;    // the AI picks colors and options only; custom CSS is yours to add
  delete parsed.image;
  parsed.id = "custom-" + Date.now().toString(36);
  parsed.note = "made by AI from: “" + String(vibe).slice(0, 80) + "”";
  return fixContrast(normalizeTheme(parsed));
}
