/* The animated layer behind everything. Each theme picks one:
   night (a still, twinkling sky), window (rain on glass, city lights
   blurred behind it), rain (falling glyphs), stars, snow, fireflies, or
   nothing.
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
  kind = document.documentElement.dataset.background || t.background || "night";
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
  /* a quiet sky: stars that stay put and breathe, thinning toward the
     horizon, and once in a long while a shooting star */
  night: {
    fps: 24,
    setup: function () {
      var n = Math.round(width * height / 4200);
      var stars = [];
      for (var i = 0; i < n; i++) {
        var y = Math.pow(Math.random(), 1.6) * height * 0.9;
        stars.push({ x: Math.random() * width, y: y, z: Math.random(), tw: Math.random() * Math.PI * 2, sp: 0.0006 + Math.random() * 0.0016,
          c: Math.random() > 0.9 ? colors.accent2 : Math.random() > 0.93 ? colors.accent : colors.text });
      }
      return { stars: stars, shoot: null, t: 0, next: 6000 + Math.random() * 14000 };
    },
    draw: function (s, dt) {
      ctx.clearRect(0, 0, width, height);
      s.t += dt;
      for (var i = 0; i < s.stars.length; i++) {
        var st = s.stars[i];
        var fade = 1 - st.y / height;
        var a = (0.12 + st.z * 0.62) * (0.55 + 0.45 * Math.sin(st.tw + s.t * st.sp)) * (0.35 + fade * 0.65);
        var r = 0.45 + st.z * st.z * 1.25;
        ctx.fillStyle = rgba(st.c, a);
        ctx.beginPath();
        ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      s.next -= dt;
      if (!s.shoot && s.next <= 0) {
        s.shoot = { x: width * (0.35 + Math.random() * 0.6), y: height * (0.04 + Math.random() * 0.3), life: 0, len: 90 + Math.random() * 80 };
        s.next = 14000 + Math.random() * 26000;
      }
      if (s.shoot) {
        var sh = s.shoot;
        sh.life += dt;
        var p = sh.life / 1100;
        var ease = 1 - Math.pow(1 - Math.min(1, p), 3);
        var hx = sh.x - ease * 300, hy = sh.y + ease * 120;
        var tail = sh.len * Math.sin(Math.min(1, p) * Math.PI);
        var g = ctx.createLinearGradient(hx, hy, hx + tail, hy - tail * 0.4);
        g.addColorStop(0, rgba(lighten(colors.text, 0.5), 0.85 * (1 - p)));
        g.addColorStop(1, rgba(colors.text, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + tail, hy - tail * 0.4);
        ctx.stroke();
        if (p >= 1) s.shoot = null;
      }
    }
  },

  /* a window on a rainy night: soft city lights out of focus, rain
     falling past, drops sliding down the glass */
  window: {
    fps: 30,
    setup: function () {
      var lights = [], drops = [], streaks = [];
      var nl = Math.max(10, Math.round(width * height / 42000));
      for (var i = 0; i < nl; i++) {
        lights.push({ x: Math.random() * width, y: height * (0.25 + Math.random() * 0.75), r: 18 + Math.random() * 60,
          c: Math.random() > 0.55 ? colors.accent : Math.random() > 0.4 ? colors.accent2 : colors.warm, ph: Math.random() * Math.PI * 2, a: 0.05 + Math.random() * 0.11 });
      }
      var ns = Math.round(width * height / 9000);
      for (var j = 0; j < ns; j++) streaks.push(newStreak(true));
      var nd = Math.round(width * height / 60000);
      for (var k = 0; k < nd; k++) drops.push(newDrop(true));
      return { lights: lights, streaks: streaks, drops: drops, t: 0 };
    },
    draw: function (s, dt) {
      ctx.clearRect(0, 0, width, height);
      s.t += dt;
      for (var i = 0; i < s.lights.length; i++) {
        var l = s.lights[i];
        var a = l.a * (0.75 + 0.25 * Math.sin(l.ph + s.t * 0.0004));
        var g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
        g.addColorStop(0, rgba(l.c, a));
        g.addColorStop(0.7, rgba(l.c, a * 0.55));
        g.addColorStop(1, rgba(l.c, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineCap = "round";
      for (var j = 0; j < s.streaks.length; j++) {
        var st = s.streaks[j];
        st.y += st.v * dt;
        st.x += st.v * dt * 0.12;
        if (st.y > height + 30) s.streaks[j] = newStreak(false);
        ctx.strokeStyle = rgba(colors.text, st.a);
        ctx.lineWidth = st.w;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x - st.len * 0.12, st.y - st.len);
        ctx.stroke();
      }
      for (var k = 0; k < s.drops.length; k++) {
        var d = s.drops[k];
        if (d.wait > 0) { d.wait -= dt; } else { d.y += d.v * dt; d.x += Math.sin(d.y * 0.05) * 0.08; }
        if (d.y > height + 10) s.drops[k] = newDrop(false);
        ctx.strokeStyle = rgba(colors.text, 0.06);
        ctx.lineWidth = d.r * 0.9;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - d.r);
        ctx.lineTo(d.x, d.y - d.r - d.trail);
        ctx.stroke();
        var dg = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
        dg.addColorStop(0, rgba(colors.text, 0.28));
        dg.addColorStop(1, rgba(colors.text, 0.04));
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

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

function newStreak(anywhere) {
  return { x: Math.random() * (width + 100) - 60, y: anywhere ? Math.random() * height : -30 - Math.random() * height * 0.3,
    v: 0.5 + Math.random() * 0.5, len: 12 + Math.random() * 22, w: 0.6 + Math.random() * 0.6, a: 0.05 + Math.random() * 0.1 };
}

function newDrop(anywhere) {
  return { x: Math.random() * width, y: anywhere ? Math.random() * height : -10, r: 1.5 + Math.random() * 2.8,
    v: 0.015 + Math.random() * 0.05, trail: 6 + Math.random() * 30, wait: Math.random() * 6000 };
}

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
