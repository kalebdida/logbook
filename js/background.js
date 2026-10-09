/* The animated layer behind everything. Each theme picks one:
   rain (with a glyph set), stars, snow, fireflies, or nothing.
   Colors come from the theme's CSS variables, so a new theme recolors it
   without a reload. Paused while the tab is hidden; off when reduced motion
   is requested or "animated background" is switched off in settings. */
import { getPrefs } from './prefs.js';
import { currentTheme } from './themes.js';

var GLYPHS = {
  binary: "01",
  katakana: "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789",
  hex: "0123456789ABCDEF",
  dots: "·•∙◦"
};
var FONT_SIZE = 15;

var canvas, ctx, width = 0, height = 0, dpr = 1;
var raf = null, last = 0;
var kind = "none", glyphs = GLYPHS.binary;
var colors = { bg: [5, 8, 6], accent: [124, 232, 160], accent2: [77, 208, 196], warm: [232, 185, 92], text: [234, 255, 242] };
var state = null;

function readColor(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  var parts = v.split(/[\s,]+/).map(Number);
  return parts.length >= 3 && parts.every(function (n) { return !isNaN(n); }) ? parts.slice(0, 3) : fallback;
}

function rgba(c, a) {
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
}

function lighten(c, t) {
  return c.map(function (v) { return Math.round(v + (255 - v) * t); });
}

function readTheme() {
  var t = currentTheme();
  kind = document.documentElement.dataset.background || t.background || "rain";
  glyphs = GLYPHS[t.glyphs] || GLYPHS.binary;
  colors = {
    bg: readColor("--bg-rgb", colors.bg),
    accent: readColor("--accent-rgb", colors.accent),
    accent2: readColor("--accent2-rgb", colors.accent2),
    warm: readColor("--warm-rgb", colors.warm),
    text: readColor("--text-rgb", colors.text)
  };
}

/* ---------- the four effects ---------- */

var EFFECTS = {
  rain: {
    fps: 18,
    setup: function () {
      var columns = Math.max(1, Math.floor(width / FONT_SIZE));
      ctx.fillStyle = rgba(colors.bg, 1);
      ctx.fillRect(0, 0, width, height);
      return { columns: columns, drops: new Array(columns).fill(0).map(function () { return Math.random() * -40; }) };
    },
    draw: function (s) {
      ctx.fillStyle = rgba(colors.bg, 0.14);
      ctx.fillRect(0, 0, width, height);
      ctx.font = FONT_SIZE + "px ui-monospace, Menlo, monospace";
      var head = lighten(colors.accent, 0.7);
      for (var i = 0; i < s.columns; i++) {
        var b = Math.random();
        ctx.fillStyle = b > 0.96 ? rgba(head, 1) : rgba(colors.accent, 0.12 + b * 0.35);
        ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], i * FONT_SIZE, s.drops[i] * FONT_SIZE);
        if (s.drops[i] * FONT_SIZE > height && Math.random() > 0.975) s.drops[i] = 0;
        s.drops[i] += 1;
      }
    }
  },

  stars: {
    fps: 30,
    setup: function () {
      var n = Math.round(width * height / 5200);
      var stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({ x: Math.random() * width, y: Math.random() * height, z: Math.random(), tw: Math.random() * Math.PI * 2, c: Math.random() > 0.85 ? colors.accent2 : Math.random() > 0.7 ? colors.accent : colors.text });
      }
      return { stars: stars, shoot: null, t: 0 };
    },
    draw: function (s, dt) {
      ctx.clearRect(0, 0, width, height);
      s.t += dt;
      for (var i = 0; i < s.stars.length; i++) {
        var st = s.stars[i];
        st.x -= (0.004 + st.z * 0.018) * dt;       // a slow drift to the left
        if (st.x < -2) { st.x = width + 2; st.y = Math.random() * height; }
        var a = (0.25 + st.z * 0.6) * (0.65 + 0.35 * Math.sin(st.tw + s.t * (0.0012 + st.z * 0.002)));
        ctx.fillStyle = rgba(st.c, a);
        var r = 0.5 + st.z * 1.3;
        ctx.fillRect(st.x, st.y, r, r);
      }
      // now and then, a shooting star
      if (!s.shoot && Math.random() < dt / 9000) {
        s.shoot = { x: Math.random() * width * 0.8 + width * 0.2, y: Math.random() * height * 0.4, life: 0 };
      }
      if (s.shoot) {
        var sh = s.shoot;
        sh.life += dt;
        var p = sh.life / 900;
        var hx = sh.x - p * 260, hy = sh.y + p * 110;
        var g = ctx.createLinearGradient(hx, hy, hx + 70, hy - 30);
        g.addColorStop(0, rgba(lighten(colors.accent2, 0.6), 0.9 * (1 - p)));
        g.addColorStop(1, rgba(colors.accent2, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + 70, hy - 30);
        ctx.stroke();
        if (p >= 1) s.shoot = null;
      }
    }
  },

  snow: {
    fps: 30,
    setup: function () {
      var n = Math.round(width * height / 9000);
      var flakes = [];
      for (var i = 0; i < n; i++) flakes.push(newFlake(true));
      return { flakes: flakes, t: 0 };
    },
    draw: function (s, dt) {
      ctx.clearRect(0, 0, width, height);
      s.t += dt;
      var wind = Math.sin(s.t / 6000) * 0.012;
      for (var i = 0; i < s.flakes.length; i++) {
        var f = s.flakes[i];
        f.y += f.v * dt;
        f.x += (wind + Math.sin(f.phase + s.t * 0.0011) * 0.01) * dt * (0.5 + f.r / 3);
        if (f.y > height + 4 || f.x < -6 || f.x > width + 6) s.flakes[i] = newFlake(false);
        ctx.fillStyle = rgba(colors.text, f.a);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  fireflies: {
    fps: 30,
    setup: function () {
      var n = Math.max(12, Math.round(width * height / 26000));
      var flies = [];
      for (var i = 0; i < n; i++) {
        flies.push({ x: Math.random() * width, y: Math.random() * height, a: Math.random() * Math.PI * 2, sp: 0.01 + Math.random() * 0.025, ph: Math.random() * Math.PI * 2, r: 1 + Math.random() * 1.6, c: Math.random() > 0.3 ? colors.warm : colors.accent });
      }
      return { flies: flies, t: 0 };
    },
    draw: function (s, dt) {
      ctx.clearRect(0, 0, width, height);
      s.t += dt;
      for (var i = 0; i < s.flies.length; i++) {
        var f = s.flies[i];
        f.a += (Math.random() - 0.5) * 0.08;
        f.x += Math.cos(f.a) * f.sp * dt;
        f.y += Math.sin(f.a) * f.sp * dt - 0.002 * dt;
        if (f.x < -10) f.x = width + 10; else if (f.x > width + 10) f.x = -10;
        if (f.y < -10) f.y = height + 10; else if (f.y > height + 10) f.y = -10;
        var glow = Math.max(0, Math.sin(f.ph + s.t * 0.0016));
        if (glow < 0.02) continue;
        var rad = f.r * 7;
        var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
        g.addColorStop(0, rgba(lighten(f.c, 0.5), 0.85 * glow));
        g.addColorStop(0.25, rgba(f.c, 0.35 * glow));
        g.addColorStop(1, rgba(f.c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(f.x - rad, f.y - rad, rad * 2, rad * 2);
      }
    }
  }
};

function newFlake(anywhere) {
  var r = 0.6 + Math.random() * 2.2;
  return { x: Math.random() * width, y: anywhere ? Math.random() * height : -4, r: r, v: 0.012 + r * 0.012, a: 0.25 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 };
}

/* ---------- running it ---------- */

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  // rain is drawn in whole glyph cells and looks right at 1x; the soft effects get sharper pixels
  var scale = kind === "rain" ? 1 : dpr;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  state = EFFECTS[kind] ? EFFECTS[kind].setup() : null;
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  var fx = EFFECTS[kind];
  if (!fx) return;
  var dt = now - last;
  if (dt < 1000 / fx.fps) return;
  last = now;
  fx.draw(state, Math.min(dt, 100));
}

function wanted() {
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  return getPrefs().rain && EFFECTS[kind] && !reduce && document.visibilityState !== "hidden";
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}

function sync() {
  if (wanted()) {
    canvas.hidden = false;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  } else {
    stop();
    if (!getPrefs().rain || !EFFECTS[kind]) {
      ctx.clearRect(0, 0, width, height);
      canvas.hidden = true;
    }
  }
}

function restart() {
  var before = kind;
  readTheme();
  if (before !== kind || EFFECTS[kind]) resize();
  sync();
}

export function startBackground() {
  canvas = document.getElementById("rain");
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  readTheme();
  resize();
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("logbook:prefs-changed", sync);
  document.addEventListener("logbook:theme-changed", restart);
  try {
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", sync);
  } catch (e) {}
  sync();
}
