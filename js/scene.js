/* The scenes: the window at the top of the dashboard and the backdrop of
   the lock screen. Each one is a hand-drawn SVG colored from the theme's CSS
   variables (scene.css mixes a palette per scene from the theme tokens), so
   a custom theme recolors it.

     night     Fuji under the stars, a quiet town, a lit corner shop
               (the "window" background draws it too, blurred behind rain)
     bluehour  a small street at blue hour, Fuji behind, snow falling
     city      the city from the hill at dusk, a street lamp, a guardrail
     room      a rainy night from bed: the window, a lamp, a sleeping cat
     torii     a wet street under a torii, the moon over the mountains
     mist      a forest disappearing into teal fog
     rooftop   a school rooftop on a pale bright day

   Ambient motion (stars, a window going dark, a car driving off, rain, a
   breathing cat, birds) is CSS, slow, and stops for reduced motion.

   sceneSvg({ scene, crop: "peak" }): scene defaults to the one for the
   page's data-background (night when it has none); crop "peak" centers the
   view on the scene's subject, for tall screens where most of the width is
   cropped away. Scenes drawn without an explicit `scene` follow the theme:
   when it changes they're redrawn in place. */

function rand(seed) {
  // small deterministic generator, so the scene is the same every render
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function f(v) { return Math.round(v * 10) / 10; }

function stops(list) {
  return list.map(function (s) {
    return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] == null ? "" : ' stop-opacity="' + s[2] + '"') + "/>";
  }).join("");
}
function lin(id, list, attrs) {
  return '<linearGradient id="' + id + '" ' + (attrs || 'x1="0" y1="0" x2="0" y2="1"') + ">" + stops(list) + "</linearGradient>";
}
function rad(id, list, attrs) {
  return '<radialGradient id="' + id + '"' + (attrs ? " " + attrs : "") + ">" + stops(list) + "</radialGradient>";
}
function glow(id, color, a, attrs) { return rad(id, [[0, color, a], [0.35, color, a * 0.45], [1, color, 0]], attrs); }

/* gradient ids are per drawing: a gradient inside a hidden page doesn't paint for anyone else */
function namer(n) {
  return {
    id: function (k) { return k + n; },
    url: function (k) { return "url(#" + k + n + ")"; }
  };
}

function poly(pts) {
  return pts.map(function (p, i) { return (i ? "L" : "M") + f(p[0]) + " " + f(p[1]); }).join(" ") + " Z";
}

/* a wire hanging between two points */
function wire(x1, y1, x2, y2, s) {
  return "M" + f(x1) + " " + f(y1) + " Q" + f((x1 + x2) / 2) + " " + f((y1 + y2) / 2 + s * 2) + " " + f(x2) + " " + f(y2);
}

function stars(seed, count, ymax, every, big) {
  var r = rand(seed), out = "";
  for (var i = 0; i < count; i++) {
    var x = Math.round(r() * 1200), y = Math.round(Math.pow(r(), 1.4) * ymax + 6);
    var size = (0.45 + r() * r() * (big || 1.5)).toFixed(2);
    var o = (0.3 + r() * 0.6).toFixed(2);
    var tw = i % every === 0 ? ' class="tw" style="animation-delay:-' + (r() * 6).toFixed(1) + 's"' : "";
    out += '<circle cx="' + x + '" cy="' + y + '" r="' + size + '" opacity="' + o + '"' + tw + "/>";
  }
  return out;
}

/* rain or snow over the whole scene: one tile drawn twice, one above the
   other, so sliding it down by its own height loops without a seam */
function fall(seed, count, o) {
  var r = rand(seed), d = "";
  for (var i = 0; i < count; i++) {
    var x = r() * 1500 - 150, y = r() * 400;
    if (o.len) {
      var len = o.len * (0.6 + r() * 0.8);
      d += "M" + f(x) + " " + f(y) + "l" + f(-len * o.slant) + " " + f(len);
    } else {
      d += "M" + f(x) + " " + f(y) + "l0 .01";
    }
  }
  var dx = f(400 * (o.slant || 0));
  var path = '<path d="' + d + '"/>';
  return '<g class="scene-fall ' + o.cls + '" style="--fall-x:' + (-dx) + 'px" stroke="' + o.color + '" stroke-width="' + o.width + '" stroke-linecap="round" opacity="' + o.opacity + '"' + (o.clip ? ' clip-path="' + o.clip + '"' : "") + ">" +
    '<g class="fall-tile">' + path + '<g transform="translate(' + dx + ' -400)">' + path + "</g></g></g>";
}

/* soft flat-bottomed clouds: bumps along the top, a lit edge underneath */
function cloudPath(r, x, y, w, h) {
  var d = "M" + f(x) + " " + f(y), cx = x;
  while (cx < x + w) {
    var bw = Math.min(x + w - cx, Math.max(h * 1.2, w * (0.05 + r() * 0.09)));
    var mid = Math.sin(Math.PI * Math.min(1, Math.max(0, (cx + bw / 2 - x) / w)));
    var bh = h * (0.35 + r() * 0.65) * (0.3 + 0.7 * mid);
    d += " C" + f(cx + bw * 0.1) + " " + f(y - bh * 1.3) + " " + f(cx + bw * 0.9) + " " + f(y - bh * 1.3) + " " + f(cx + bw) + " " + f(y - r() * h * 0.15);
    cx += bw;
  }
  return d + " C" + f(x + w * 0.7) + " " + f(y + h * 0.45) + " " + f(x + w * 0.3) + " " + f(y + h * 0.45) + " " + f(x) + " " + f(y) + " Z";
}

/* long soft streaks, the way clouds lie along the horizon at dusk:
   overlapping flat ellipses, thickest in the middle */
function streakCloud(r, x, y, w, h) {
  var out = '<ellipse cx="' + f(x + w / 2) + '" cy="' + f(y) + '" rx="' + f(w / 2) + '" ry="' + f(h * 0.42) + '"/>';
  var n = 3 + Math.floor(r() * 4);
  for (var i = 0; i < n; i++) {
    var t = 0.15 + r() * 0.7, e = Math.sin(Math.PI * t);
    out += '<ellipse cx="' + f(x + w * t) + '" cy="' + f(y - h * (0.15 + r() * 0.45) * e) + '" rx="' + f(w * (0.12 + r() * 0.22)) + '" ry="' + f(h * (0.35 + r() * 0.45) * (0.5 + e * 0.5)) + '"/>';
  }
  return out;
}

/* lumpy on top, cut flat underneath, with an optional rim of light: the
   painted-anime cloud. key keeps clip ids apart within one drawing. */
function flatCloud(g, key, seed, x, y, w, h, o) {
  var r = rand(seed), shape = '<ellipse cx="' + f(x + w / 2) + '" cy="' + f(y) + '" rx="' + f(w / 2) + '" ry="' + f(h * 0.32) + '"/>';
  var n = o.lumps || Math.max(6, Math.round(w / (h * 1.1)));
  for (var i = 0; i < n; i++) {
    var t = 0.06 + 0.88 * r(), e = Math.pow(Math.sin(Math.PI * t), 0.7);
    var ry = h * (0.3 + 0.7 * r()) * (0.35 + 0.65 * e), rx = Math.max(ry * 1.2, w * (0.05 + 0.12 * r()) * (0.6 + 0.6 * e));
    shape += '<ellipse cx="' + f(x + w * t) + '" cy="' + f(y - ry * 0.45) + '" rx="' + f(rx) + '" ry="' + f(ry) + '"/>';
  }
  var id = g.id("cl" + key);
  var out = '<clipPath id="' + id + '"><rect x="' + f(x - w) + '" y="' + f(y - h * 4) + '" width="' + f(w * 3) + '" height="' + f(h * 4 + h * 0.16) + '"/></clipPath>';
  if (o.rim) out += '<g fill="' + o.rim + '" opacity="' + (o.rimOpacity || 1) + '" transform="translate(' + (o.rimDx || 0) + " " + o.rimDy + ')" clip-path="url(#' + id + ')">' + shape + "</g>";
  return out + '<g fill="' + o.fill + '"' + (o.opacity ? ' opacity="' + o.opacity + '"' : "") + ' clip-path="url(#' + id + ')">' + shape + "</g>";
}

/* a heap of round puffs with a flat base: a fair-weather cloud */
function cumulus(r, x, y, w, h) {
  var n = Math.max(4, Math.round(w / (h * 0.45))), out = "";
  for (var i = 0; i < n; i++) {
    var t = (i + 0.5) / n, e = Math.pow(Math.sin(Math.PI * t), 1.2);
    var rad = h * (0.18 + 0.62 * e) * (0.6 + r() * 0.6);
    out += '<circle cx="' + f(x + w * t + (r() - 0.5) * h * 0.3) + '" cy="' + f(y - rad * 0.55) + '" r="' + f(rad) + '"/>';
  }
  return out + '<rect x="' + f(x + h * 0.1) + '" y="' + f(y - h * 0.42) + '" width="' + f(w - h * 0.2) + '" height="' + f(h * 0.42) + '" rx="' + f(h * 0.21) + '"/>';
}

/* a car seen from behind, bottom-center at 0,0, about 190 wide */
function carRear(g) {
  return '<ellipse cx="0" cy="-2" rx="104" ry="9" fill="var(--scene-shadow)" opacity=".7"/>' +
    '<rect x="-88" y="0" width="22" height="70" fill="' + g.url("tailRefl") + '"/>' +
    '<rect x="66" y="0" width="22" height="70" fill="' + g.url("tailRefl") + '"/>' +
    '<rect x="-86" y="-24" width="30" height="24" rx="5" fill="var(--scene-tire)"/>' +
    '<rect x="56" y="-24" width="30" height="24" rx="5" fill="var(--scene-tire)"/>' +
    '<path d="M-96 -20 L-96 -72 Q-96 -84 -84 -86 L84 -86 Q96 -84 96 -72 L96 -20 Q96 -12 86 -12 L-86 -12 Q-96 -12 -96 -20 Z" fill="var(--scene-car)"/>' +
    '<path d="M-76 -86 L-62 -132 Q-59 -140 -50 -140 L50 -140 Q59 -140 62 -132 L76 -86 Z" fill="var(--scene-car)"/>' +
    '<path d="M-64 -90 L-53 -128 L53 -128 L64 -90 Z" fill="var(--scene-car-glass)"/>' +
    '<rect x="-94" y="-36" width="188" height="11" rx="4" fill="var(--scene-tire)" opacity=".75"/>' +
    '<rect x="-21" y="-60" width="42" height="17" rx="2" fill="var(--scene-plate)" opacity=".75"/>' +
    '<circle cx="-79" cy="-64" r="46" fill="' + g.url("tail") + '"/>' +
    '<circle cx="79" cy="-64" r="46" fill="' + g.url("tail") + '"/>' +
    '<rect x="-93" y="-71" width="30" height="13" rx="4" fill="var(--scene-tail)"/>' +
    '<rect x="63" y="-71" width="30" height="13" rx="4" fill="var(--scene-tail)"/>' +
    '<rect x="-89" y="-68" width="14" height="5" rx="2" fill="var(--scene-tail-core)"/>' +
    '<rect x="75" y="-68" width="14" height="5" rx="2" fill="var(--scene-tail-core)"/>';
}
function carDefs(g) {
  return glow(g.id("tail"), "var(--scene-tail)", 0.55) +
    lin(g.id("tailRefl"), [[0, "var(--scene-tail)", 0.28], [1, "var(--scene-tail)", 0]]);
}

/* ======================================================================
   night: Fuji under the stars (unchanged from the original)
   ====================================================================== */

function nightStars() {
  var r = rand(7), out = "";
  for (var i = 0; i < 70; i++) {
    var x = Math.round(r() * 1200), y = Math.round(r() * 230 + 6);
    var size = (0.5 + r() * r() * 1.5).toFixed(2);
    var o = (0.35 + r() * 0.6).toFixed(2);
    var tw = i % 5 === 0 ? ' class="tw" style="animation-delay:-' + (r() * 6).toFixed(1) + 's"' : "";
    out += '<circle cx="' + x + '" cy="' + y + '" r="' + size + '" opacity="' + o + '"' + tw + "/>";
  }
  return out;
}

/* the town along the bottom: low houses with pitched roofs, a few taller
   apartment blocks, and some lit windows */
function nightTown() {
  var r = rand(31), shapes = "", lights = "";
  var x = -10;
  function light(wx, wy, w) {
    var cool = r() > 0.8;
    var flick = r() > 0.9 ? ' class="flick" style="animation-delay:-' + Math.round(r() * 40) + 's"' : "";
    lights += '<rect' + flick + ' x="' + wx + '" y="' + wy + '" width="' + w + '" height="3" rx=".6" fill="' + (cool ? "var(--scene-lamp)" : "var(--scene-window)") + '" opacity="' + (0.5 + r() * 0.5).toFixed(2) + '"/>';
  }
  while (x < 1210) {
    var nearShop = x > 880 && x < 1080;
    var tall = !nearShop && (x < 300 || x > 1110) && r() > 0.45;
    if (tall) {
      var tw = 30 + Math.round(r() * 22), th = 40 + Math.round(r() * 34), ty = 378 - th;
      shapes += '<rect x="' + x + '" y="' + ty + '" width="' + tw + '" height="' + (th + 24) + '"/>';
      for (var fy = ty + 6; fy < 372; fy += 8) {
        for (var fx = x + 4; fx < x + tw - 6; fx += 8) if (r() > 0.62) light(fx, fy, 4);
      }
      x += tw + 3;
    } else {
      var w = 22 + Math.round(r() * 26), h = 10 + Math.round(r() * (nearShop ? 6 : 16)), top = 380 - h;
      var roof = 5 + Math.round(r() * 5);
      shapes += '<path d="M' + x + " " + (top + 1) + " L" + (x + w / 2) + " " + (top - roof) + " L" + (x + w) + " " + (top + 1) + " L" + (x + w) + " 402 L" + x + ' 402 Z"/>';
      if (r() > 0.4) light(x + 4 + Math.round(r() * (w - 12)), top + 3 + Math.round(r() * Math.max(1, h - 8)), 4 + Math.round(r() * 2));
      x += w + 1 + Math.round(r() * 6);
    }
  }
  return '<g class="scene-town" fill="var(--scene-ground)">' + shapes + "</g><g>" + lights + "</g>";
}

/* a soft line of treetops between the mountain and the town */
function nightTrees() {
  var r = rand(13), d = "M0 400 L0 352", x = 0;
  while (x < 1200) {
    var w = 8 + Math.round(r() * 12), y = 349 + Math.round(r() * 5), h = 3 + Math.round(r() * 7);
    d += " Q" + (x + w / 2) + " " + (y - h * 2) + " " + (x + w) + " " + y;
    x += w;
  }
  return '<path d="' + d + ' L1200 400 Z" fill="var(--scene-ridge)"/>';
}

function nightTrain() {
  var cars = "";
  for (var i = 0; i < 4; i++) {
    var cx = i * 34;
    cars += '<rect x="' + cx + '" y="0" width="31" height="7" rx="2" fill="var(--scene-ridge)"/>';
    for (var k = 0; k < 4; k++) cars += '<rect x="' + (cx + 3 + k * 7) + '" y="2" width="4" height="2.4" rx=".5" fill="var(--scene-window)" opacity=".9"/>';
  }
  return '<g class="scene-train"><g transform="translate(0 343)">' + cars + "</g></g>";
}

function night(n) {
  return (
    "<defs>" +
      '<linearGradient id="scSky' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--scene-sky-top)"/><stop offset=".62" stop-color="var(--scene-sky-mid)"/><stop offset="1" stop-color="var(--scene-sky-low)"/></linearGradient>' +
      '<linearGradient id="scFuji' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--scene-peak)"/><stop offset="1" stop-color="var(--scene-ridge)"/></linearGradient>' +
      '<linearGradient id="scLit' + n + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--scene-snow)" stop-opacity="0"/><stop offset="1" stop-color="var(--scene-snow)" stop-opacity=".09"/></linearGradient>' +
      '<linearGradient id="scSnow' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--scene-snow)"/><stop offset="1" stop-color="var(--scene-snow-shade)"/></linearGradient>' +
      '<radialGradient id="scMoonGlow' + n + '"><stop offset="0" stop-color="var(--scene-moon)" stop-opacity=".28"/><stop offset="1" stop-color="var(--scene-moon)" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="scShopWin' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--scene-shop-light)"/><stop offset="1" stop-color="var(--scene-window)"/></linearGradient>' +
      '<radialGradient id="scShop' + n + '" cx=".5" cy="0" r="1"><stop offset="0" stop-color="var(--scene-window)" stop-opacity=".5"/><stop offset="1" stop-color="var(--scene-window)" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="scLampHalo' + n + '"><stop offset="0" stop-color="var(--scene-lamp)" stop-opacity=".45"/><stop offset="1" stop-color="var(--scene-lamp)" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="scHaze' + n + '" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="var(--scene-window)" stop-opacity=".16"/><stop offset="1" stop-color="var(--scene-window)" stop-opacity="0"/></radialGradient>' +
      '<mask id="scCrescent' + n + '"><circle cx="1010" cy="74" r="15" fill="#fff"/><circle cx="1017" cy="69" r="13.5" fill="#000"/></mask>' +
    "</defs>" +
    '<rect class="scene-sky" width="1200" height="400" fill="url(#scSky' + n + ')"/>' +
    '<g class="scene-stars" fill="var(--scene-star)">' + nightStars() + "</g>" +
    '<circle cx="1010" cy="74" r="70" fill="url(#scMoonGlow' + n + ')"/>' +
    '<circle cx="1010" cy="74" r="15" fill="var(--scene-moon)" mask="url(#scCrescent' + n + ')"/>' +
    // the far range, then the mountain
    '<path d="M0 318 C 90 300 170 296 250 306 S 380 292 450 300 S 640 290 760 302 S 1040 286 1200 296 L 1200 400 L 0 400 Z" fill="var(--scene-far)"/>' +
    '<path d="M370 340 C 520 304 650 206 738 124 L 750 113 Q 770 107 790 113 L 802 124 C 890 206 1020 304 1170 340 Z" fill="url(#scFuji' + n + ')"/>' +
    '<path d="M778 110 Q 786 110 790 113 L 802 124 C 890 206 1020 304 1170 340 L 1060 340 C 930 286 836 200 778 110 Z" fill="url(#scLit' + n + ')"/>' +
    '<path class="scene-snow" d="M686 170 C 706 152 724 137 738 124 L 750 113 Q 770 107 790 113 L 802 124 C 816 137 834 152 854 170 L 846 172 L 838 186 L 832 176 L 822 204 L 815 184 L 806 214 L 798 190 L 788 228 L 780 196 L 771 236 L 764 198 L 754 220 L 748 190 L 738 206 L 732 182 L 722 192 L 716 178 L 704 182 L 698 174 Z" fill="url(#scSnow' + n + ')"/>' +
    '<rect y="250" width="1200" height="150" fill="url(#scHaze' + n + ')"/>' +
    // tree line and the train that runs along it
    nightTrees() +
    nightTrain() +
    nightTown() +
    // the corner shop: a bright window strip under a cool sign band
    '<g class="scene-shop">' +
      '<ellipse cx="985" cy="396" rx="130" ry="20" fill="url(#scShop' + n + ')"/>' +
      '<rect x="918" y="356" width="134" height="40" fill="var(--scene-ground)"/>' +
      '<rect x="914" y="353" width="142" height="4" rx="1" fill="var(--scene-ridge)"/>' +
      '<rect x="918" y="358" width="134" height="5" fill="var(--scene-sign)"/>' +
      '<rect x="918" y="360" width="134" height="1" fill="var(--scene-lamp)" opacity=".6"/>' +
      '<rect class="shop-glow" x="923" y="367" width="124" height="22" rx="1" fill="url(#scShopWin' + n + ')"/>' +
      '<g fill="var(--scene-ground)" opacity=".5">' +
        '<rect x="954" y="367" width="1.6" height="22"/><rect x="985" y="367" width="1.6" height="22"/><rect x="1016" y="367" width="1.6" height="22"/>' +
        '<rect x="926" y="374" width="24" height="1.4"/><rect x="926" y="381" width="24" height="1.4"/><rect x="958" y="376" width="22" height="1.4"/><rect x="1020" y="374" width="24" height="1.4"/><rect x="1020" y="381" width="24" height="1.4"/>' +
      "</g>" +
      '<rect x="989" y="370" width="22" height="19" fill="var(--scene-shop-light)" opacity=".5"/>' +
    "</g>" +
    // a street lamp and a pole with wires
    '<g class="scene-lamp">' +
      '<circle cx="1084" cy="282" r="26" fill="url(#scLampHalo' + n + ')"/>' +
      '<ellipse cx="1084" cy="398" rx="60" ry="12" fill="url(#scLampHalo' + n + ')"/>' +
      '<rect x="1096.5" y="286" width="3" height="114" fill="var(--scene-ground)"/>' +
      '<path d="M1098 288 q 0 -8 -12 -8" stroke="var(--scene-ground)" stroke-width="3" fill="none"/>' +
      '<rect x="1078" y="279" width="12" height="4" rx="2" fill="var(--scene-lamp)"/>' +
    "</g>" +
    '<g class="scene-wires" stroke="var(--scene-ground)" fill="none" opacity=".8">' +
      '<rect x="1150" y="190" width="4" height="210" fill="var(--scene-ground)" stroke="none"/>' +
      '<rect x="1136" y="204" width="32" height="3" fill="var(--scene-ground)" stroke="none"/>' +
      '<rect x="1140" y="220" width="24" height="3" fill="var(--scene-ground)" stroke="none"/>' +
      '<path d="M1137 205 Q 820 262 420 238" stroke-width="1.1"/>' +
      '<path d="M1167 205 Q 860 280 470 262" stroke-width="1.1"/>' +
      '<path d="M1141 221 Q 860 292 520 282" stroke-width="1"/>' +
    "</g>"
  );
}

/* ======================================================================
   one-point perspective street, shared by blue hour and torii: things at
   depth k (0 at the vanishing point, 1 at the bottom edge) are k times
   their full size, so a car driving away is just a scale toward V
   ====================================================================== */

function street(VX, VY, drop) {
  var S = {
    y: function (k) { return VY + drop * k; },
    /* a building along the street. side -1 left, 1 right. b: { line, k1 (near), k2 (far),
       h (height at k=1), d (depth back from the street), roof (gable height), lit, seed } */
    building: function (side, b, r) {
      var X = function (k) { return VX + side * b.line * k; };
      var P = function (k, hf) { return [X(k), S.y(k) - hf * b.h * k]; };
      var k1 = b.k1, k2 = b.k2, out = "";
      // the long wall along the street
      out += '<path d="' + poly([P(k1, 0), P(k2, 0), P(k2, 1), P(k1, 1)]) + '" fill="var(--scene-house)"/>';
      var floors = Math.max(1, Math.round(b.h / 170)), bays = Math.max(2, Math.round((k1 - k2) * 9));
      for (var fl = 0; fl < floors; fl++) {
        for (var bay = 0; bay < bays; bay++) {
          var roll = r();
          if (roll > 0.62) continue;
          var ka = k1 + (k2 - k1) * (bay + 0.3) / bays, kb = k1 + (k2 - k1) * (bay + 0.62) / bays;
          var ha = (fl + 0.36) / floors, hb = (fl + 0.6) / floors;
          var lit = roll < (b.lit || 0.18);
          var flick = lit && r() > 0.85 ? ' class="flick" style="animation-delay:-' + Math.round(r() * 40) + 's"' : "";
          out += '<path' + flick + ' d="' + poly([P(ka, ha), P(kb, ha), P(kb, hb), P(ka, hb)]) + '" fill="' + (lit ? (r() > 0.75 ? "var(--scene-window-cool)" : "var(--scene-window)") : "var(--scene-house-dark)") + '" opacity="' + (lit ? (0.6 + r() * 0.35).toFixed(2) : 0.7) + '"/>';
        }
      }
      var top1 = S.y(k1) - b.h * k1, top2 = S.y(k2) - b.h * k2;
      var ridge = function (k) { return [X(k) + side * b.d * k / 2, S.y(k) - (b.h + b.roof) * k]; };
      if (b.roof) {
        out += '<path d="' + poly([[X(k1), top1], [X(k2), top2], ridge(k2), ridge(k1)]) + '" fill="' + (b.snowy ? "var(--scene-roof-snow)" : "var(--scene-roof)") + '"/>';
        // eave line
        out += '<path d="M' + f(X(k1)) + " " + f(top1) + " L" + f(X(k2)) + " " + f(top2) + '" stroke="var(--scene-roof)" stroke-width="' + f(Math.max(0.8, 9 * k1)) + '" opacity=".9"/>';
      } else {
        out += '<path d="' + poly([[X(k1), top1], [X(k2), top2], [X(k2), top2 - 10 * k2], [X(k1), top1 - 10 * k1]]) + '" fill="var(--scene-roof)"/>';
      }
      // the end that faces us
      var ex = X(k1), ew = side * b.d * k1, eb = S.y(k1), et = top1;
      var end = [[ex, eb], [ex + ew, eb], [ex + ew, et], [ex, et]];
      out += '<path d="' + poly(end) + '" fill="var(--scene-house-end)"/>';
      if (b.roof) {
        var peak = [ex + ew / 2, et - b.roof * k1];
        out += '<path d="' + poly([[ex - side * 4 * k1, et + 2 * k1], peak, [ex + ew + side * 4 * k1, et + 2 * k1]]) + '" fill="var(--scene-house-end)"/>';
        out += '<path d="M' + f(ex - side * 6 * k1) + " " + f(et + 3 * k1) + " L" + f(peak[0]) + " " + f(peak[1]) + " L" + f(ex + ew + side * 6 * k1) + " " + f(et + 3 * k1) + '" fill="none" stroke="' + (b.snowy ? "var(--scene-roof-snow)" : "var(--scene-roof)") + '" stroke-width="' + f(Math.max(0.8, 8 * k1)) + '" stroke-linejoin="round"/>';
      } else {
        out += '<rect x="' + f(Math.min(ex, ex + ew)) + '" y="' + f(et - 10 * k1) + '" width="' + f(Math.abs(ew)) + '" height="' + f(10 * k1) + '" fill="var(--scene-roof)"/>';
      }
      for (var ef = 0; ef < floors; ef++) {
        if (r() > 0.7) continue;
        var w0 = ex + ew * (0.2 + r() * 0.4), w1 = w0 + ew * 0.2;
        var y0 = eb - b.h * k1 * (ef + 0.6) / floors, y1 = eb - b.h * k1 * (ef + 0.36) / floors;
        var litE = r() < (b.lit || 0.18) + 0.15;
        out += '<rect x="' + f(Math.min(w0, w1)) + '" y="' + f(y0) + '" width="' + f(Math.abs(w1 - w0)) + '" height="' + f(y1 - y0) + '" fill="' + (litE ? "var(--scene-window)" : "var(--scene-house-dark)") + '" opacity="' + (litE ? 0.85 : 0.65) + '"/>';
      }
      return out;
    },
    /* a utility pole at depth k; returns its drawing and where wires attach */
    pole: function (side, line, k, height) {
      var x = VX + side * line * k, base = S.y(k), top = base - height * k, w = Math.max(1.1, 10 * k);
      var arm = 64 * k, arm2 = 44 * k;
      var out = '<path d="' + poly([[x - w * 0.42, top], [x + w * 0.42, top], [x + w * 0.55, base], [x - w * 0.55, base]]) + '"/>' +
        '<rect x="' + f(x - arm) + '" y="' + f(top + 22 * k) + '" width="' + f(arm * 2) + '" height="' + f(Math.max(0.8, 5 * k)) + '"/>' +
        '<rect x="' + f(x - arm2) + '" y="' + f(top + 62 * k) + '" width="' + f(arm2 * 2) + '" height="' + f(Math.max(0.7, 4 * k)) + '"/>';
      if (k > 0.2) out += '<rect x="' + f(x + w * 0.5) + '" y="' + f(top + 96 * k) + '" width="' + f(22 * k) + '" height="' + f(34 * k) + '" rx="' + f(5 * k) + '"/>';
      return { svg: out, x: x, top: top, pts: [[x - arm * 0.9, top + 22 * k], [x + arm * 0.9, top + 22 * k], [x - arm2 * 0.9, top + 62 * k], [x + arm2 * 0.9, top + 62 * k], [x, top + 112 * k]] };
    }
  };
  return S;
}

function poleRow(S, side, line, ks, height) {
  var poles = ks.map(function (k) { return S.pole(side, line, k, height); });
  var bodies = "", wires = "";
  for (var i = 0; i < poles.length - 1; i++) {
    var a = poles[i], b = poles[i + 1];
    for (var p = 0; p < a.pts.length; p++) {
      var span = Math.abs(a.pts[p][0] - b.pts[p][0]) + Math.abs(a.pts[p][1] - b.pts[p][1]);
      wires += '<path d="' + wire(a.pts[p][0], a.pts[p][1], b.pts[p][0], b.pts[p][1], span * 0.07) + '"/>';
    }
  }
  poles.forEach(function (p) { bodies += p.svg; });
  return { bodies: bodies, wires: wires, poles: poles };
}

/* ======================================================================
   bluehour: a small street at blue hour, Fuji behind the wires
   ====================================================================== */

function bluehour(n) {
  var g = namer(n), r = rand(23);
  var VX = 770, VY = 318, S = street(VX, VY, 82);
  var FUJI = "M290 322 C 470 292 612 204 734 126 L 751 114 Q 770 106 789 114 L 806 126 C 928 204 1070 292 1250 322 Z";
  var snow = "M500 80 L1040 80";
  for (var x = 1030; x >= 510; x -= 6 + Math.round(r() * 7)) {
    var dd = Math.abs(x - 770) / 250;
    var tooth = r() > 0.5 ? 10 + r() * 36 : r() * 8;
    snow += " L" + x + " " + f(222 - dd * dd * 30 + tooth);
  }
  snow += " Z";

  // the far town where the street meets the mountain
  var far = "", farLights = "";
  for (var fx = 560; fx < 1010;) {
    var w = 6 + r() * 18, h = 3 + r() * (Math.abs(fx - VX) < 60 ? 6 : 14);
    far += '<rect x="' + f(fx) + '" y="' + f(VY - h) + '" width="' + f(w) + '" height="' + f(h + 6) + '"/>';
    if (r() > 0.55) farLights += '<rect x="' + f(fx + 1 + r() * (w - 3)) + '" y="' + f(VY - h + 1 + r() * Math.max(0.5, h - 3)) + '" width="1.6" height="1.1" fill="' + (r() > 0.7 ? "var(--scene-window-cool)" : "var(--scene-window)") + '" opacity="' + (0.5 + r() * 0.5).toFixed(2) + '"/>';
    fx += w + r() * 3;
  }

  // the street: road, markings, snow along the edges
  var L = function (k) { return VX - 440 * k; }, R = function (k) { return VX + 380 * k; };
  var road = poly([[VX - 2, VY], [VX + 2, VY], [R(1), 400], [L(1), 400]]);
  var dashes = "";
  for (var k = 0.05; k < 1.05; k *= 1.42) {
    var k2 = k * 1.2, cx = function (kk) { return VX - 30 * kk; };
    dashes += '<path d="' + poly([[cx(k) - 2.4 * k, S.y(k)], [cx(k) + 2.4 * k, S.y(k)], [cx(k2) + 2.4 * k2, S.y(k2)], [cx(k2) - 2.4 * k2, S.y(k2)]]) + '"/>';
  }
  var edges = '<path d="M' + f(VX - 1) + " " + VY + " L" + f(VX - 410) + ' 400 M' + f(VX + 1) + " " + VY + " L" + f(VX + 352) + ' 400" stroke="var(--scene-paint)" stroke-width="2.4" opacity=".4" fill="none"/>';
  var banks = '<path d="' + poly([[VX - 3, VY], [L(1), 400], [L(1) - 60, 400]]) + '" fill="var(--scene-snow-ground)" opacity=".45"/>' +
    '<path d="' + poly([[VX + 3, VY], [R(1), 400], [R(1) + 36, 400]]) + '" fill="var(--scene-snow-ground)" opacity=".35"/>';
  for (var p = 0; p < 9; p++) {
    var pk = 0.15 + r() * 0.8, side = r() > 0.5 ? -1 : 1, px = side < 0 ? L(pk) + 20 * pk * r() : R(pk) - 30 * pk * r();
    banks += '<ellipse cx="' + f(px) + '" cy="' + f(S.y(pk)) + '" rx="' + f(40 * pk + 3) + '" ry="' + f(3 * pk + 0.6) + '" fill="var(--scene-snow-ground)" opacity=".5"/>';
  }

  // buildings, far to near
  var lefts = [
    [1.25, 0.86, 300, 300, 80, 1], [0.82, 0.6, 250, 260, 70, 1], [0.57, 0.44, 330, 240, 0, 0], [0.41, 0.31, 230, 280, 70, 1],
    [0.29, 0.22, 280, 240, 0, 0], [0.2, 0.15, 220, 260, 64, 1], [0.14, 0.1, 290, 240, 0, 0], [0.095, 0.066, 220, 260, 60, 1], [0.062, 0.04, 260, 240, 0, 0]
  ];
  var rights = [
    [0.78, 0.58, 230, 300, 0, 0], [0.55, 0.42, 260, 260, 80, 1], [0.4, 0.31, 220, 280, 0, 0], [0.29, 0.21, 260, 260, 70, 1],
    [0.19, 0.14, 220, 260, 0, 0], [0.13, 0.095, 250, 240, 60, 1], [0.09, 0.062, 220, 260, 0, 0], [0.058, 0.04, 240, 240, 50, 1]
  ];
  var blds = [];
  lefts.forEach(function (b) { blds.push({ side: -1, line: 660, k1: b[0], k2: b[1], h: b[2], d: b[3], roof: b[4], snowy: b[5], lit: 0.16 }); });
  rights.forEach(function (b) { blds.push({ side: 1, line: 560, k1: b[0], k2: b[1], h: b[2], d: b[3], roof: b[4], snowy: b[5], lit: 0.16 }); });
  blds.sort(function (a, b) { return a.k1 - b.k1; });
  var houses = blds.map(function (b) { return S.building(b.side, b, r); }).join("");

  // poles and wires
  var right = poleRow(S, 1, 470, [1.6, 0.4, 0.26, 0.17, 0.11, 0.07, 0.045], 790);
  var left = poleRow(S, -1, 560, [1.5, 0.5, 0.3, 0.19, 0.12, 0.075], 740);
  var cross = "";
  [[left.poles[2], right.poles[2]], [left.poles[3], right.poles[3]], [left.poles[4], right.poles[4]]].forEach(function (pair) {
    cross += '<path d="' + wire(pair[0].pts[1][0], pair[0].pts[1][1], pair[1].pts[0][0], pair[1].pts[0][1], 10 * (pair[0].pts[0][1] > 200 ? 0.6 : 1.4)) + '"/>';
  });
  // long wires sweeping in from the near poles, out of frame
  var sky = '<path d="' + wire(1260, -20, right.poles[1].pts[1][0], right.poles[1].pts[1][1], 26) + '"/>' +
    '<path d="' + wire(1260, 40, right.poles[1].pts[3][0], right.poles[1].pts[3][1], 20) + '"/>' +
    '<path d="' + wire(-40, -10, left.poles[1].pts[0][0], left.poles[1].pts[0][1], 22) + '"/>';

  // the traffic signal, hanging over the street from the pole at k .17
  var sp = right.poles[3], sk = 0.17, sy = sp.top + 40 * sk, sx0 = sp.x - 112 * sk;
  var lamp = function (cls, i, color) {
    var cx = sx0 + (14 + i * 18) * sk;
    return '<circle cx="' + f(cx) + '" cy="' + f(sy + 9 * sk) + '" r="' + f(6.4 * sk) + '" fill="var(--scene-pole)"/>' +
      '<g class="sig ' + cls + '"><circle cx="' + f(cx) + '" cy="' + f(sy + 9 * sk) + '" r="' + f(70 * sk) + '" fill="' + g.url(color) + '"/>' +
      '<circle cx="' + f(cx) + '" cy="' + f(sy + 9 * sk) + '" r="' + f(6 * sk) + '" fill="var(--scene-' + color + ')"/>' +
      '<rect x="' + f(cx - 3) + '" y="' + f(S.y(sk) + 3) + '" width="6" height="34" fill="' + g.url(color + "Refl") + '"/></g>';
  };
  var signal = '<rect x="' + f(sx0 + 40 * sk) + '" y="' + f(sy - 2 * sk) + '" width="' + f(sp.x - sx0 - 40 * sk) + '" height="' + f(3 * sk) + '" fill="var(--scene-pole)"/>' +
    '<rect x="' + f(sx0) + '" y="' + f(sy) + '" width="' + f(66 * sk) + '" height="' + f(18 * sk) + '" rx="' + f(4 * sk) + '" fill="var(--scene-pole)"/>' +
    lamp("sig-go", 0, "sig-go") + lamp("sig-amber", 1, "sig-amber") + lamp("sig-stop", 2, "sig-stop");

  // street lamps
  function streetLamp(side, line, k) {
    var x = VX + side * line * k, base = S.y(k), top = base - 470 * k, hx = x - side * 46 * k;
    return '<path d="M' + f(x) + " " + f(base) + " L" + f(x) + " " + f(top + 10 * k) + " Q" + f(x) + " " + f(top) + " " + f(hx) + " " + f(top) + '" stroke="var(--scene-pole)" stroke-width="' + f(Math.max(1, 6 * k)) + '" fill="none"/>' +
      '<circle class="lamp-hum" cx="' + f(hx) + '" cy="' + f(top + 4 * k) + '" r="' + f(150 * k) + '" fill="' + g.url("lampHalo") + '"/>' +
      '<rect x="' + f(hx - 14 * k) + '" y="' + f(top) + '" width="' + f(28 * k) + '" height="' + f(7 * k) + '" rx="' + f(3 * k) + '" fill="var(--scene-lamp)"/>' +
      '<ellipse cx="' + f(hx) + '" cy="' + f(base + 2) + '" rx="' + f(170 * k) + '" ry="' + f(16 * k) + '" fill="' + g.url("lampHalo") + '"/>';
  }

  // a car pulling away up the street, and one coming the other way
  var ck = 0.36;
  var car = '<g class="scene-car" style="transform-origin:' + VX + "px " + VY + 'px"><g transform="translate(' + f(VX - 215 * ck) + " " + f(S.y(ck)) + ") scale(" + ck + ')">' + carRear(g) + "</g></g>";
  // a vending machine glowing on the corner
  var vk = 0.3, vx = VX + 420 * vk, vb = S.y(vk);
  var vending = '<circle cx="' + f(vx + 14 * vk) + '" cy="' + f(vb - 40 * vk) + '" r="' + f(150 * vk) + '" fill="' + g.url("vend") + '"/>' +
    '<rect x="' + f(vx) + '" y="' + f(vb - 76 * vk) + '" width="' + f(30 * vk) + '" height="' + f(76 * vk) + '" rx="' + f(2 * vk) + '" fill="var(--scene-pole)"/>' +
    '<rect x="' + f(vx + 3 * vk) + '" y="' + f(vb - 72 * vk) + '" width="' + f(24 * vk) + '" height="' + f(40 * vk) + '" fill="var(--scene-vend)"/>' +
    '<rect x="' + f(vx + 3 * vk) + '" y="' + f(vb - 28 * vk) + '" width="' + f(24 * vk) + '" height="' + f(8 * vk) + '" fill="var(--scene-vend)" opacity=".6"/>' +
    '<ellipse cx="' + f(vx + 14 * vk) + '" cy="' + f(vb + 1) + '" rx="' + f(90 * vk) + '" ry="' + f(8 * vk) + '" fill="' + g.url("vend") + '"/>';
  var oncoming = '<g>' +
    '<circle cx="' + (VX + 14) + '" cy="' + (VY + 1.4) + '" r="16" fill="' + g.url("head") + '"/>' +
    '<rect x="' + (VX + 9.4) + '" y="' + (VY + 0.6) + '" width="2.6" height="1.4" rx=".6" fill="var(--scene-head)"/>' +
    '<rect x="' + (VX + 15.6) + '" y="' + (VY + 0.6) + '" width="2.6" height="1.4" rx=".6" fill="var(--scene-head)"/>' +
    '<rect x="' + (VX + 9) + '" y="' + (VY + 2.4) + '" width="10" height="26" fill="' + g.url("headRefl") + '"/>' +
  "</g>";

  return (
    "<defs>" +
      lin(g.id("bhSky"), [[0, "var(--scene-sky-top)"], [0.55, "var(--scene-sky-mid)"], [1, "var(--scene-sky-low)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="330"') +
      lin(g.id("bhFuji"), [[0, "var(--scene-peak)"], [1, "var(--scene-far)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="110" x2="0" y2="320"') +
      lin(g.id("bhSnow"), [[0, "var(--scene-snow)"], [1, "var(--scene-snow-shade)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="110" x2="0" y2="270"') +
      lin(g.id("bhRoad"), [[0, "var(--scene-road-far)"], [1, "var(--scene-road)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="318" x2="0" y2="400"') +
      lin(g.id("bhGround"), [[0, "var(--scene-far)"], [1, "var(--scene-ground)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="318" x2="0" y2="400"') +
      lin(g.id("bhShade"), [[0, "var(--scene-ridge)", 0], [1, "var(--scene-ridge)", 0.4]], 'x1="0" y1="0" x2="1" y2="0"') +
      glow(g.id("bhCloud"), "var(--scene-cloud)", 0.55) +
      rad(g.id("bhHaze"), [[0, "var(--scene-haze)", 0.5], [1, "var(--scene-haze)", 0]], 'cx=".5" cy="1" r=".7"') +
      glow(g.id("lampHalo"), "var(--scene-lamp)", 0.5) +
      glow(g.id("sig-go"), "var(--scene-sig-go)", 0.7) + glow(g.id("sig-amber"), "var(--scene-sig-amber)", 0.7) + glow(g.id("sig-stop"), "var(--scene-sig-stop)", 0.7) +
      lin(g.id("sig-goRefl"), [[0, "var(--scene-sig-go)", 0.4], [1, "var(--scene-sig-go)", 0]]) +
      lin(g.id("sig-amberRefl"), [[0, "var(--scene-sig-amber)", 0.4], [1, "var(--scene-sig-amber)", 0]]) +
      lin(g.id("sig-stopRefl"), [[0, "var(--scene-sig-stop)", 0.4], [1, "var(--scene-sig-stop)", 0]]) +
      glow(g.id("head"), "var(--scene-head)", 0.6) +
      lin(g.id("headRefl"), [[0, "var(--scene-head)", 0.35], [1, "var(--scene-head)", 0]]) +
      glow(g.id("vend"), "var(--scene-vend)", 0.45) +
      carDefs(g) +
      '<clipPath id="' + g.id("bhMt") + '"><path d="' + FUJI + '"/></clipPath>' +
    "</defs>" +
    '<rect class="scene-sky" width="1200" height="400" fill="' + g.url("bhSky") + '"/>' +
    '<g fill="var(--scene-star)">' + stars(41, 26, 120, 4, 1) + "</g>" +
    // Fuji, snow to the shoulders, the far side in shade
    '<path d="' + FUJI + '" fill="' + g.url("bhFuji") + '"/>' +
    '<g clip-path="' + g.url("bhMt") + '">' +
      '<path d="' + snow + '" fill="' + g.url("bhSnow") + '"/>' +
      '<path d="M770 100 C 784 150 812 220 880 330 L 1260 330 L 1260 90 Z" fill="' + g.url("bhShade") + '"/>' +
      '<g stroke="var(--scene-snow-shade)" stroke-width="1.1" fill="none" opacity=".3">' +
        '<path d="M756 118 Q 744 170 726 240"/><path d="M788 118 Q 806 176 826 250"/><path d="M742 130 Q 716 176 690 222"/>' +
      "</g>" +
    "</g>" +
    // a band of cloud resting on the mountain's shoulder
    '<g class="scene-drift" style="--drift:22px">' +
      '<ellipse cx="640" cy="238" rx="150" ry="13" fill="' + g.url("bhCloud") + '"/>' +
      '<ellipse cx="720" cy="230" rx="90" ry="10" fill="' + g.url("bhCloud") + '"/>' +
      '<ellipse cx="900" cy="250" rx="130" ry="9" fill="' + g.url("bhCloud") + '"/>' +
    "</g>" +
    '<rect y="250" width="1200" height="80" fill="' + g.url("bhHaze") + '"/>' +
    '<g fill="var(--scene-far-town)">' + far + "</g>" + farLights +
    // the ground, the road, snow
    '<rect y="' + VY + '" width="1200" height="' + (400 - VY) + '" fill="' + g.url("bhGround") + '"/>' +
    '<path d="' + road + '" fill="' + g.url("bhRoad") + '"/>' +
    banks + edges +
    '<g fill="var(--scene-paint)" opacity=".55">' + dashes + "</g>" +
    oncoming +
    car +
    houses +
    '<g fill="var(--scene-pole)">' + left.bodies + right.bodies + "</g>" +
    '<g stroke="var(--scene-wire)" stroke-width=".9" fill="none" opacity=".75">' + left.wires + right.wires + cross + sky + "</g>" +
    streetLamp(-1, 520, 0.31) + streetLamp(1, 430, 0.22) +
    vending +
    signal +
    fall(61, 70, { cls: "fall-slow", color: "var(--scene-flake)", width: 1.6, opacity: 0.55 }) +
    fall(62, 26, { cls: "fall-near", color: "var(--scene-flake)", width: 3, opacity: 0.6 })
  );
}

/* ======================================================================
   city: the city from the hill at dusk
   ====================================================================== */

function city(n) {
  var g = namer(n), r = rand(57);

  function skyline(seed, base, x0, x1, wmin, wmax, hmin, hmax, fill, o) {
    var rr = rand(seed), shapes = "", lights = "", x = x0;
    while (x < x1) {
      var w = wmin + rr() * (wmax - wmin), h = hmin + Math.pow(rr(), o.pow || 1) * (hmax - hmin);
      if (o.towers && x > o.towers[0] && x < o.towers[1] && rr() > 0.4) h = o.towerH[0] + rr() * (o.towerH[1] - o.towerH[0]);
      var top = base - h;
      if (o.gable && rr() > 0.4 && h < 34) {
        shapes += '<path d="M' + f(x) + " " + f(top + 2) + " L" + f(x + w / 2) + " " + f(top - 6) + " L" + f(x + w) + " " + f(top + 2) + " L" + f(x + w) + " " + f(base + 40) + " L" + f(x) + " " + f(base + 40) + ' Z"/>';
      } else {
        shapes += '<rect x="' + f(x) + '" y="' + f(top) + '" width="' + f(w) + '" height="' + f(h + 40) + '"/>';
        if (h > 70 && rr() > 0.3) {
          shapes += '<rect x="' + f(x + w / 2 - 0.6) + '" y="' + f(top - 12) + '" width="1.2" height="12"/>';
          lights += '<circle class="blink" style="animation-delay:-' + (rr() * 4).toFixed(1) + 's" cx="' + f(x + w / 2) + '" cy="' + f(top - 12) + '" r="1.6" fill="var(--scene-beacon)"/>';
        }
      }
      for (var wy = top + o.gy; wy < base - 2; wy += o.gy) {
        for (var wx = x + 2; wx < x + w - o.lw; wx += o.gx) {
          var roll = rr();
          if (roll > o.density) continue;
          var c = roll < o.density * 0.12 ? "var(--scene-window-cool)" : roll < o.density * 0.2 ? "var(--scene-neon)" : "var(--scene-window)";
          var tw = rr() > 0.93 ? ' class="twl" style="animation-delay:-' + (rr() * 9).toFixed(1) + 's"' : "";
          lights += '<rect' + tw + ' x="' + f(wx) + '" y="' + f(wy) + '" width="' + o.lw + '" height="' + o.lh + '" fill="' + c + '" opacity="' + (0.35 + rr() * 0.6).toFixed(2) + '"/>';
        }
      }
      x += w + rr() * (o.gap || 1);
    }
    return '<g fill="' + fill + '">' + shapes + "</g>" + lights;
  }

  // clouds: dark streaks with their undersides lit pink
  var clouds = "";
  [[-60, 190, 520, 30], [360, 164, 320, 20], [580, 212, 600, 30], [940, 140, 320, 18], [160, 230, 400, 12], [820, 240, 440, 11], [20, 124, 260, 11], [620, 104, 200, 8]].forEach(function (c, i) {
    clouds += flatCloud(g, i, Math.round(c[0] * 7 + c[1]), c[0], c[1], c[2], c[3], { fill: "var(--scene-cloud)", rim: "var(--scene-cloud-lit)", rimDy: 2.6, rimOpacity: 0.9 });
  });

  // the street lamp on its pole, and the wires
  var PX = 905;
  var pole = '<path d="M' + (PX - 4.5) + " -10 L" + (PX + 4.5) + " -10 L" + (PX + 6.5) + " 378 L" + (PX - 6.5) + ' 378 Z" fill="var(--scene-pole)"/>' +
    '<rect x="' + (PX - 34) + '" y="30" width="68" height="4" fill="var(--scene-pole)"/>' +
    '<rect x="' + (PX - 24) + '" y="52" width="48" height="3.4" fill="var(--scene-pole)"/>' +
    '<rect x="' + (PX + 5) + '" y="70" width="16" height="26" rx="4" fill="var(--scene-pole)"/>' +
    '<rect x="' + (PX + 5) + '" y="214" width="7" height="34" rx="1" fill="var(--scene-sign)"/>' +
    '<rect x="' + (PX + 6) + '" y="226" width="5" height="10" fill="var(--scene-paint)" opacity=".8"/>' +
    '<path d="M' + (PX - 2) + " 156 Q " + (PX - 4) + " 146 " + (PX - 20) + " 146 L" + (PX - 40) + ' 147" stroke="var(--scene-pole)" stroke-width="3" fill="none"/>';
  var lampHead = '<g class="lamp-hum"><circle cx="' + (PX - 46) + '" cy="150" r="80" fill="' + g.url("lampHalo") + '"/>' +
    '<path d="M' + (PX - 54) + " 152 L" + (PX - 140) + " 380 L" + (PX + 50) + " 380 L" + (PX - 38) + ' 152 Z" fill="' + g.url("cone") + '"/></g>' +
    '<ellipse cx="' + (PX - 46) + '" cy="149" rx="11" ry="3.6" fill="var(--scene-lamp-head)"/>';
  var wires = "";
  [[-60, 40, 30, 60], [-60, 92, 30, 52], [-40, 150, 52, 44], [-60, 208, 52, 30]].forEach(function (w, i) {
    var ax = i % 2 ? PX + 30 : PX - 30;
    wires += '<path d="' + wire(w[0], w[1], ax, w[2], w[3]) + '"/>';
  });
  [[1260, 20, 30, 18], [1260, 74, 52, 14], [1260, 130, 30, 10]].forEach(function (w) {
    wires += '<path d="' + wire(PX + 30, w[2], w[0], w[1], w[3]) + '"/>';
  });
  wires += '<path d="' + wire(118, 128, PX - 30, 32, 26) + '"/><path d="' + wire(118, 146, PX - 22, 54, 30) + '"/>';
  var pole2 = '<path d="M115.5 118 L120.5 118 L121.5 358 L114.5 358 Z" fill="var(--scene-pole)"/><rect x="100" y="126" width="36" height="2.6" fill="var(--scene-pole)"/><rect x="104" y="144" width="28" height="2.2" fill="var(--scene-pole)"/>';

  // guardrail along the hill road, and a crosswalk below
  var rail = "", rx;
  var ry = function (x) { return 338 - x * 0.012; };
  for (rx = 14; rx < 1200; rx += 44) {
    if (rx > PX - 30 && rx < PX + 20) continue;
    rail += '<rect x="' + f(rx - 2.2) + '" y="' + f(ry(rx) - 2) + '" width="4.4" height="' + f(372 - ry(rx) + 2) + '" rx="1.2" fill="var(--scene-rail)"/>' +
      '<rect x="' + f(rx + 0.6) + '" y="' + f(ry(rx)) + '" width="1.6" height="' + f(372 - ry(rx)) + '" fill="var(--scene-rail-shade)"/>';
  }
  var bars = '<path d="M0 ' + f(ry(0)) + " L1200 " + f(ry(1200)) + " L1200 " + f(ry(1200) + 5) + " L0 " + f(ry(0) + 5) + ' Z" fill="var(--scene-rail)"/>' +
    '<path d="M0 ' + f(ry(0) + 4) + " L1200 " + f(ry(1200) + 4) + '" stroke="var(--scene-rail-shade)" stroke-width="1.6"/>' +
    '<path d="M0 ' + f(ry(0) + 18) + " L1200 " + f(ry(1200) + 18) + " L1200 " + f(ry(1200) + 22) + " L0 " + f(ry(0) + 22) + ' Z" fill="var(--scene-rail)" opacity=".85"/>';
  var cross = "";
  for (var cx = -120; cx < 1300; cx += 86) {
    var tx = 640 + (cx - 640) * 0.78;
    cross += '<path d="' + poly([[cx, 402], [cx + 52, 402], [tx + 40, 377], [tx, 377]]) + '"/>';
  }

  return (
    "<defs>" +
      lin(g.id("ctSky"), [[0, "var(--scene-sky-top)"], [0.45, "var(--scene-sky-mid)"], [0.78, "var(--scene-horizon)"], [1, "var(--scene-sky-low)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="262"') +
      rad(g.id("ctGlow"), [[0, "var(--scene-horizon)", 0.55], [1, "var(--scene-horizon)", 0]], 'cx=".5" cy=".5" r=".5"') +
      lin(g.id("ctHaze"), [[0, "var(--scene-haze)", 0], [1, "var(--scene-haze)", 0.35]]) +
      glow(g.id("ctWarm"), "var(--scene-window)", 0.22) +
      lin(g.id("ctGround"), [[0, "var(--scene-ground-far)"], [1, "var(--scene-ground)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="340" x2="0" y2="400"') +
      glow(g.id("lampHalo"), "var(--scene-lamp)", 0.55) +
      lin(g.id("cone"), [[0, "var(--scene-lamp)", 0.16], [1, "var(--scene-lamp)", 0]]) +
    "</defs>" +
    '<rect class="scene-sky" width="1200" height="400" fill="' + g.url("ctSky") + '"/>' +
    '<g fill="var(--scene-star)">' + stars(5, 22, 90, 3, 1) + "</g>" +
    '<ellipse cx="640" cy="262" rx="720" ry="90" fill="' + g.url("ctGlow") + '"/>' +
    '<g class="scene-drift" style="--drift:-26px">' + clouds + "</g>" +
    '<path d="M0 254 C 120 246 220 242 340 248 S 560 240 680 246 S 940 238 1200 248 L1200 300 L0 300 Z" fill="var(--scene-far)"/>' +
    skyline(3, 292, -10, 1210, 6, 20, 4, 30, "var(--scene-city-far)", { gx: 3.4, gy: 3.4, lw: 1.3, lh: 1, density: 0.5, pow: 2, towers: [220, 420], towerH: [30, 60] }) +
    '<rect y="268" width="1200" height="26" fill="' + g.url("ctHaze") + '" opacity=".6"/>' +
    skyline(9, 300, 700, 1190, 16, 34, 30, 60, "var(--scene-city-tower)", { gx: 4.4, gy: 4.4, lw: 2.2, lh: 1.5, density: 0.42, towers: [740, 1180], towerH: [70, 170], gap: 8 }) +
    '<rect y="288" width="1200" height="18" fill="' + g.url("ctHaze") + '" opacity=".5"/>' +
    skyline(15, 330, -10, 1210, 18, 44, 12, 46, "var(--scene-city-mid)", { gx: 5, gy: 5, lw: 2.4, lh: 1.8, density: 0.46, pow: 1.6 }) +
    '<ellipse cx="560" cy="318" rx="760" ry="44" fill="' + g.url("ctWarm") + '"/>' +
    skyline(21, 356, -10, 1210, 22, 46, 10, 26, "var(--scene-city-near)", { gx: 8, gy: 7, lw: 3.4, lh: 2.6, density: 0.22, gable: true, gap: 4 }) +
    '<path d="M0 348 L1200 334 L1200 400 L0 400 Z" fill="' + g.url("ctGround") + '"/>' +
    '<g fill="var(--scene-paint)" opacity=".2">' + cross + "</g>" +
    '<g stroke="var(--scene-wire)" stroke-width="1" fill="none" opacity=".8">' + wires + "</g>" +
    pole2 + rail + bars + lampHead + pole
  );
}

/* ======================================================================
   room: a rainy night seen from bed
   ====================================================================== */

function room(n) {
  var g = namer(n), r = rand(77);
  var X0 = 92, X1 = 1108, Y0 = 26, Y1 = 290;

  // the town outside: a hill of lights, rooftops, poles, a railing
  var bokeh = "", glows = "";
  for (var i = 0; i < 190; i++) {
    var x = X0 + r() * (X1 - X0), y = 196 + Math.pow(r(), 0.7) * 80;
    var warm = r() > 0.22, s = 0.7 + r() * r() * 2;
    bokeh += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(s) + '" fill="' + (warm ? "var(--scene-window)" : "var(--scene-window-cool)") + '" opacity="' + (0.45 + r() * 0.55).toFixed(2) + '"' + (r() > 0.94 ? ' class="twl" style="animation-delay:-' + (r() * 9).toFixed(1) + 's"' : "") + "/>";
    if (r() > 0.8) glows += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(5 + s * 4) + '" fill="' + g.url(warm ? "bokeh" : "bokehCool") + '"/>';
  }
  var roofs = "", rx = X0 - 10;
  while (rx < X1) {
    var w = 30 + r() * 50, h = 8 + r() * 22, top = 286 - h;
    roofs += r() > 0.45
      ? '<path d="M' + f(rx) + " " + f(top + 4) + " L" + f(rx + w * 0.5) + " " + f(top - 8) + " L" + f(rx + w) + " " + f(top + 4) + " L" + f(rx + w) + " 300 L" + f(rx) + ' 300 Z"/>'
      : '<rect x="' + f(rx) + '" y="' + f(top) + '" width="' + f(w) + '" height="' + f(h + 20) + '"/>';
    rx += w + r() * 6;
  }
  var poles = "", pw = "";
  [[300, 92], [720, 108]].forEach(function (p) {
    poles += '<rect x="' + (p[0] - 2) + '" y="' + p[1] + '" width="4" height="' + (290 - p[1]) + '"/>' +
      '<rect x="' + (p[0] - 26) + '" y="' + (p[1] + 10) + '" width="52" height="3"/><rect x="' + (p[0] - 18) + '" y="' + (p[1] + 26) + '" width="36" height="2.6"/>';
  });
  pw += '<path d="' + wire(X0 - 10, 110, 274, 102, 8) + '"/><path d="' + wire(326, 102, 694, 118, 18) + '"/><path d="' + wire(746, 118, X1 + 10, 132, 10) + '"/>' +
    '<path d="' + wire(X0 - 10, 126, 282, 118, 6) + '"/><path d="' + wire(318, 118, 702, 134, 16) + '"/><path d="' + wire(738, 134, X1 + 10, 150, 8) + '"/>' +
    '<path d="' + wire(300, 104, X1 + 10, 60, 40) + '"/>';
  var tree = '<path d="M968 290 L972 150 Q 974 100 966 30 L 980 30 Q 988 100 986 150 L 990 290 Z"/>' +
    '<path d="M975 120 Q 1010 96 1050 92 M978 170 Q 940 150 916 150 M974 80 Q 950 60 930 56" stroke="var(--scene-out-near)" stroke-width="3" fill="none"/>';
  var leaves = "";
  [[X0 + 20, 80, 50], [X0 + 70, 120, 40], [X0 + 10, 150, 36], [940, 40, 46], [1010, 28, 50], [1070, 70, 44], [990, 96, 34], [1090, 130, 30]].forEach(function (c) {
    for (var lv = 0; lv < 34; lv++) {
      var a = r() * Math.PI * 2, d = Math.sqrt(r()) * c[2];
      var lx = c[0] + Math.cos(a) * d * 1.3, ly = c[1] + Math.sin(a) * d * 0.8;
      leaves += '<ellipse cx="' + f(lx) + '" cy="' + f(ly) + '" rx="' + f(3.5 + r() * 4) + '" ry="' + f(1.8 + r() * 1.6) + '" transform="rotate(' + Math.round(r() * 180) + " " + f(lx) + " " + f(ly) + ')"/>';
    }
  });
  var railing = '<rect x="' + X0 + '" y="230" width="' + (X1 - X0) + '" height="4"/><rect x="' + X0 + '" y="278" width="' + (X1 - X0) + '" height="3"/>';
  for (var bx = X0 + 6; bx < X1; bx += 15) railing += '<rect x="' + bx + '" y="234" width="2.2" height="56"/>';

  // drops on the glass
  var drops = "";
  for (var d = 0; d < 46; d++) {
    var dx = X0 + 8 + r() * (X1 - X0 - 16), dy = Y0 + 8 + r() * (Y1 - Y0 - 16), dr = 0.8 + r() * r() * 2.6;
    drops += '<circle cx="' + f(dx) + '" cy="' + f(dy) + '" r="' + f(dr) + '" fill="' + g.url("drop") + '"/>';
  }
  var sliding = "";
  [[250, 60, 0], [690, 40, -7], [1010, 90, -13]].forEach(function (s) {
    sliding += '<g class="slide" style="animation-delay:' + s[2] + 's"><path d="M' + s[0] + " " + (s[1] - 26) + " L" + s[0] + " " + s[1] + '" stroke="var(--scene-glass)" stroke-width="1.2" opacity=".35"/><circle cx="' + s[0] + '" cy="' + s[1] + '" r="2.4" fill="' + g.url("drop") + '"/></g>';
  });

  // the frame, the sill
  var frame = '<path fill-rule="evenodd" d="M0 0 H1200 V400 H0 Z M' + X0 + " " + Y0 + " H" + X1 + " V" + Y1 + " H" + X0 + ' Z" fill="' + g.url("wall") + '"/>' +
    '<g fill="var(--scene-frame)">' +
      '<path fill-rule="evenodd" d="M' + (X0 - 12) + " " + (Y0 - 12) + " H" + (X1 + 12) + " V" + (Y1 + 2) + " H" + (X0 - 12) + " Z M" + X0 + " " + Y0 + " H" + X1 + " V" + Y1 + " H" + X0 + ' Z"/>' +
      '<rect x="341" y="' + Y0 + '" width="10" height="' + (Y1 - Y0) + '"/>' +
      '<rect x="592" y="' + Y0 + '" width="16" height="' + (Y1 - Y0) + '"/>' +
      '<rect x="849" y="' + Y0 + '" width="10" height="' + (Y1 - Y0) + '"/>' +
      '<rect x="' + X0 + '" y="66" width="' + (X1 - X0) + '" height="7"/>' +
    "</g>" +
    '<g fill="var(--scene-frame-lit)" opacity=".5">' +
      '<rect x="' + X0 + '" y="73" width="' + (X1 - X0) + '" height="1"/>' +
      '<rect x="350" y="' + Y0 + '" width="1" height="' + (Y1 - Y0) + '"/><rect x="607" y="' + Y0 + '" width="1" height="' + (Y1 - Y0) + '"/><rect x="858" y="' + Y0 + '" width="1" height="' + (Y1 - Y0) + '"/>' +
    "</g>" +
    '<rect x="586" y="150" width="4" height="22" rx="2" fill="var(--scene-frame-lit)" opacity=".6"/><rect x="610" y="150" width="4" height="22" rx="2" fill="var(--scene-frame-lit)" opacity=".6"/>' +
    '<rect x="' + (X0 - 34) + '" y="' + (Y1 + 1) + '" width="' + (X1 - X0 + 68) + '" height="9" rx="2" fill="var(--scene-sill)"/>' +
    '<rect x="' + (X0 - 34) + '" y="' + (Y1 + 10) + '" width="' + (X1 - X0 + 68) + '" height="8" fill="var(--scene-frame)"/>';

  // curtains at the sides
  var curtains = "";
  [[0, 66], [1134, 66]].forEach(function (c) {
    curtains += '<rect x="' + c[0] + '" y="0" width="' + c[1] + '" height="400" fill="var(--scene-curtain)"/>';
    for (var fx = c[0] + 6; fx < c[0] + c[1]; fx += 13) curtains += '<rect x="' + fx + '" y="0" width="5" height="400" fill="var(--scene-curtain-fold)" opacity=".55"/>';
  });

  // a plant on the sill, another by the lamp
  function plant(px, base, s) {
    var out = '<path d="M' + f(px - 13 * s) + " " + f(base - 26 * s) + " L" + f(px + 13 * s) + " " + f(base - 26 * s) + " L" + f(px + 10 * s) + " " + f(base) + " L" + f(px - 10 * s) + " " + f(base) + ' Z" fill="var(--scene-pot)"/>';
    for (var l = 0; l < 22; l++) {
      var a = -165 + l * 7 + r() * 12, len = (14 + r() * 34) * s;
      var ex = px + Math.cos(a * Math.PI / 180) * len, ey = base - 24 * s + Math.sin(a * Math.PI / 180) * len * 0.9;
      out += '<path d="M' + f(px) + " " + f(base - 24 * s) + " Q" + f((px + ex) / 2 + (r() - 0.5) * 10 * s) + " " + f((base - 24 * s + ey) / 2 - 8 * s) + " " + f(ex) + " " + f(ey) + '" stroke="var(--scene-plant)" stroke-width="' + f(1.3 * s) + '" fill="none"/>' +
        '<ellipse cx="' + f(ex) + '" cy="' + f(ey) + '" rx="' + f((9 + r() * 4) * s) + '" ry="' + f(4.6 * s) + '" transform="rotate(' + Math.round(a + (r() - 0.5) * 30) + " " + f(ex) + " " + f(ey) + ')" fill="' + (r() > 0.7 ? "var(--scene-plant-lit)" : "var(--scene-plant)") + '"/>';
    }
    return out;
  }

  // the lamp on the sill
  var LX = 968, LY = 256;
  var lamp = '<g class="lamp-hum"><circle cx="' + LX + '" cy="' + LY + '" r="330" fill="' + g.url("lampWide") + '"/><circle cx="' + LX + '" cy="' + LY + '" r="70" fill="' + g.url("lampHalo") + '"/></g>' +
    '<rect x="' + (LX - 12) + '" y="' + (LY + 18) + '" width="24" height="17" rx="3" fill="var(--scene-lamp-base)"/>' +
    '<rect x="' + (LX - 15) + '" y="' + (LY + 31) + '" width="30" height="4" rx="1.5" fill="var(--scene-lamp-base)"/>' +
    '<circle cx="' + LX + '" cy="' + LY + '" r="19" fill="' + g.url("globe") + '"/>' +
    '<ellipse cx="' + LX + '" cy="' + (Y1 + 2) + '" rx="120" ry="5" fill="' + g.url("sillLight") + '"/>';

  // the bed, and the cat asleep on it
  var bed = '<path d="M250 400 L250 346 C 330 326 420 334 520 326 C 610 318 700 330 790 326 C 880 322 960 318 1060 322 C 1120 324 1170 320 1200 318 L1200 400 Z" fill="' + g.url("blanket") + '"/>' +
    '<path d="M1040 330 C 1060 300 1120 290 1200 292 L1200 338 C 1150 336 1080 338 1040 330 Z" fill="var(--scene-pillow)"/>' +
    '<g stroke="var(--scene-blanket-fold)" fill="none" stroke-width="2" opacity=".5">' +
      '<path d="M300 372 C 380 352 460 360 540 350"/><path d="M560 386 C 640 362 740 370 820 360"/><path d="M880 392 C 940 368 1020 362 1100 360"/><path d="M420 400 C 470 384 520 382 600 376"/>' +
    "</g>";
  var dots = "";
  for (var s = 0; s < 60; s++) {
    var sx = 270 + r() * 930, sy = 336 + r() * 64;
    dots += '<circle cx="' + f(sx) + '" cy="' + f(sy) + '" r="' + f(0.5 + r() * 0.9) + '" opacity="' + (0.25 + r() * 0.4).toFixed(2) + '"/>';
  }
  var CX = 806, CY = 332;
  var body = "M-74 0 C -84 -28 -58 -50 -20 -52 C 14 -54 42 -44 54 -30 C 58 -22 58 -10 56 0 Z";
  var head = "M40 -4 C 34 -22 46 -38 62 -38 L 64 -52 L 72 -40 C 76 -40 80 -40 84 -39 L 92 -50 L 92 -34 C 100 -26 98 -8 86 -2 Z";
  var cat = '<g transform="translate(' + CX + " " + CY + ')">' +
    '<ellipse cx="0" cy="2" rx="96" ry="9" fill="var(--scene-shadow)" opacity=".45"/>' +
    '<g class="cat-breathe">' +
      '<path d="' + body + '" fill="var(--scene-cat-rim)" transform="translate(0 -1.8)"/>' +
      '<path d="' + body + '" fill="var(--scene-cat)"/>' +
      '<g stroke="var(--scene-cat-stripe)" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"><path d="M-46 -42 Q -40 -30 -46 -18"/><path d="M-26 -48 Q -18 -34 -24 -20"/><path d="M-6 -50 Q 2 -36 -4 -22"/><path d="M14 -48 Q 22 -36 18 -24"/></g>' +
    "</g>" +
    '<g class="cat-head">' +
      '<path d="' + head + '" fill="var(--scene-cat-rim)" transform="translate(.6 -1.6)"/>' +
      '<path d="' + head + '" fill="var(--scene-cat)"/>' +
      '<path d="M62 -22 q 5 3 10 0" stroke="var(--scene-cat-rim)" stroke-width="1.2" fill="none" opacity=".7"/>' +
    "</g>" +
    '<path d="M-70 -2 C -66 8 -20 10 30 4 C 44 2 52 -2 54 -6" stroke="var(--scene-cat)" stroke-width="10" stroke-linecap="round" fill="none"/>' +
    '<path d="M-60 2 C -40 8 0 8 30 3" stroke="var(--scene-cat-rim)" stroke-width="1.2" fill="none" opacity=".35"/>' +
  "</g>";

  // the room in the dark: a low table on the left
  var table = '<path d="M0 330 L250 330 L250 340 L0 340 Z" fill="var(--scene-sill)"/><rect x="0" y="340" width="240" height="60" fill="var(--scene-frame)"/>' +
    '<rect x="128" y="322" width="62" height="8" rx="1.5" fill="var(--scene-book)"/><rect x="134" y="314" width="52" height="8" rx="1.5" fill="var(--scene-pot)"/>' +
    '<path d="M204 312 h16 v15 q0 3 -3 3 h-10 q-3 0 -3 -3 Z M220 316 q6 0 6 5 q0 5 -6 5" fill="var(--scene-book)" stroke="var(--scene-book)" stroke-width="2"/>' +
    '<path d="M209 308 q -3 -6 1 -11 M215 306 q -3 -6 1 -11" stroke="var(--scene-glass)" stroke-width="1" fill="none" opacity=".18"/>';

  return (
    "<defs>" +
      lin(g.id("rmSky"), [[0, "var(--scene-sky-top)"], [0.65, "var(--scene-sky-mid)"], [1, "var(--scene-sky-low)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="26" x2="0" y2="290"') +
      rad(g.id("rmTown"), [[0, "var(--scene-window)", 0.32], [1, "var(--scene-window)", 0]], 'cx=".5" cy="1" r=".7"') +
      glow(g.id("bokeh"), "var(--scene-window)", 0.4) + glow(g.id("bokehCool"), "var(--scene-window-cool)", 0.35) +
      rad(g.id("drop"), [[0, "var(--scene-glass)", 0.55], [0.6, "var(--scene-glass)", 0.15], [1, "var(--scene-glass)", 0.35]], 'cx=".4" cy=".35" r=".7"') +
      lin(g.id("wall"), [[0, "var(--scene-wall-top)"], [1, "var(--scene-wall)"]]) +
      glow(g.id("lampWide"), "var(--scene-window)", 0.3) +
      glow(g.id("lampHalo"), "var(--scene-lamp)", 0.75) +
      rad(g.id("globe"), [[0, "var(--scene-lamp-core)"], [0.55, "var(--scene-lamp)"], [1, "var(--scene-window)"]], 'cx=".45" cy=".45" r=".6"') +
      glow(g.id("sillLight"), "var(--scene-lamp)", 0.6) +
      lin(g.id("blanket"), [[0, "var(--scene-blanket-lit)"], [0.35, "var(--scene-blanket)"], [1, "var(--scene-blanket-deep)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="318" x2="0" y2="400"') +
      rad(g.id("bedLamp"), [[0, "var(--scene-window)", 0.28], [1, "var(--scene-window)", 0]], 'cx=".5" cy=".5" r=".5"') +
      '<clipPath id="' + g.id("glass") + '"><rect x="' + X0 + '" y="' + Y0 + '" width="' + (X1 - X0) + '" height="' + (Y1 - Y0) + '"/></clipPath>' +
    "</defs>" +
    '<g clip-path="' + g.url("glass") + '">' +
      '<rect class="scene-sky" x="' + X0 + '" y="' + Y0 + '" width="' + (X1 - X0) + '" height="' + (Y1 - Y0) + '" fill="' + g.url("rmSky") + '"/>' +
      '<rect x="' + X0 + '" y="150" width="' + (X1 - X0) + '" height="140" fill="' + g.url("rmTown") + '"/>' +
      '<path d="M' + X0 + " 214 C 260 200 420 206 560 198 C 700 190 860 204 " + X1 + ' 196 L' + X1 + " 290 L" + X0 + ' 290 Z" fill="var(--scene-far)"/>' +
      glows + bokeh +
      '<g fill="var(--scene-out-mid)">' + roofs + "</g>" +
      '<g fill="var(--scene-out-near)">' + poles + tree + leaves + "</g>" +
      '<g stroke="var(--scene-out-near)" stroke-width="1" fill="none" opacity=".85">' + pw + "</g>" +
      fall(81, 110, { cls: "fall-rain-far", color: "var(--scene-rain)", width: 0.8, opacity: 0.35, len: 16, slant: 0.06 }) +
      '<g fill="var(--scene-out-near)">' + railing + "</g>" +
      fall(82, 60, { cls: "fall-rain", color: "var(--scene-rain)", width: 1.1, opacity: 0.4, len: 24, slant: 0.06 }) +
      drops + sliding +
    "</g>" +
    frame + curtains +
    plant(170, Y1 + 1, 1) + plant(1062, Y1 + 1, 0.7) +
    lamp +
    table +
    bed +
    '<ellipse cx="' + LX + '" cy="350" rx="300" ry="70" fill="' + g.url("bedLamp") + '"/>' +
    '<g fill="var(--scene-sparkle)">' + dots + "</g>" +
    cat
  );
}

/* ======================================================================
   torii: a wet street under a torii, the moon over the mountains
   ====================================================================== */

function torii(n) {
  var g = namer(n), r = rand(19);
  var VX = 690, VY = 334, S = street(VX, VY, 66);

  var clouds = "";
  [[-40, 76, 340, 44], [190, 48, 280, 36], [420, 96, 240, 26], [600, 30, 200, 20], [680, 140, 300, 16], [990, 62, 260, 26]].forEach(function (c, i) {
    clouds += flatCloud(g, i, Math.round(c[0] * 5 + c[1]), c[0], c[1], c[2], c[3], { fill: "var(--scene-cloud)", opacity: 0.95, rim: "var(--scene-cloud-lit)", rimDx: 1.6, rimDy: -2.2, rimOpacity: 0.4 });
  });

  // mountains, far to near, the near hill wooded
  function ridge(seed, y0, x0, x1, amp, rough) {
    var rr = rand(seed), d = "M" + x0 + " 400 L" + x0 + " " + f(y0(x0)), x = x0;
    while (x < x1) {
      var w = rough ? 6 + rr() * 10 : 30 + rr() * 50;
      d += " Q" + f(x + w / 2) + " " + f(y0(x + w / 2) - amp * (0.5 + rr())) + " " + f(x + w) + " " + f(y0(x + w));
      x += w;
    }
    return d + " L" + f(x) + " 400 Z";
  }
  var m1 = ridge(3, function (x) { return 170 - 60 * Math.exp(-Math.pow((x - 560) / 180, 2)) - 40 * Math.exp(-Math.pow((x - 300) / 120, 2)) + Math.max(0, x - 700) * 0.06; }, 140, 1210, 6);
  var m2 = ridge(4, function (x) { return 214 + Math.sin(x / 140) * 12 + Math.max(0, x - 600) * 0.07 - 30 * Math.exp(-Math.pow((x - 180) / 160, 2)); }, -10, 1210, 5);
  var m3 = ridge(5, function (x) { return 96 + x * 0.36 + Math.max(0, x - 260) * 0.18; }, -10, 560, 4, true);
  var m4 = ridge(6, function (x) { return 284 - (x - 760) * 0.03; }, 740, 1210, 5, true);
  var villageLights = "";
  for (var v = 0; v < 120; v++) {
    var onNear = v < 50;
    var vx = onNear ? 20 + r() * 420 : 300 + r() * 620;
    var vy = onNear ? 150 + vx * 0.4 + r() * 40 : 222 + r() * 60 + Math.max(0, vx - 600) * 0.06;
    if (!onNear && vy > 318) continue;
    if (onNear && vy > 330) continue;
    var tw = r() > 0.9 ? ' class="twl" style="animation-delay:-' + (r() * 9).toFixed(1) + 's"' : "";
    villageLights += '<circle' + tw + ' cx="' + f(vx) + '" cy="' + f(vy) + '" r="' + f(0.5 + r() * (onNear ? 1.1 : 0.8)) + '" fill="' + (r() > 0.85 ? "var(--scene-window-cool)" : "var(--scene-window)") + '" opacity="' + (0.4 + r() * 0.6).toFixed(2) + '"/>';
  }
  // a few houses on the hillside
  var hill = "";
  [[150, 178, 26, 14], [182, 196, 22, 12], [120, 214, 30, 16], [228, 222, 26, 13], [262, 244, 30, 15], [196, 240, 22, 12], [320, 268, 26, 14]].forEach(function (h) {
    hill += '<path d="M' + h[0] + " " + (h[1] + 2) + " L" + (h[0] + h[2] / 2) + " " + (h[1] - h[3] * 0.5) + " L" + (h[0] + h[2]) + " " + (h[1] + 2) + " L" + (h[0] + h[2]) + " " + (h[1] + h[3]) + " L" + h[0] + " " + (h[1] + h[3]) + ' Z" fill="var(--scene-house-far)"/>' +
      '<rect x="' + (h[0] + 4) + '" y="' + (h[1] + 5) + '" width="' + (h[2] * 0.3) + '" height="3" fill="var(--scene-window)" opacity=".85"/>';
  });

  // the street
  var L = function (k) { return VX - 390 * k; }, R = function (k) { return VX + 370 * k; };
  var road = poly([[VX - 2, VY], [VX + 2, VY], [R(1.1), S.y(1.1)], [L(1.1), S.y(1.1)]]);
  var marks = "";
  for (var k = 0.05; k < 1.1; k *= 1.42) {
    var k2 = k * 1.22, cx = function (kk) { return VX - 10 * kk; };
    marks += '<path d="' + poly([[cx(k) - 2.6 * k, S.y(k)], [cx(k) + 2.6 * k, S.y(k)], [cx(k2) + 2.6 * k2, S.y(k2)], [cx(k2) - 2.6 * k2, S.y(k2)]]) + '"/>';
  }
  var puddles = "";
  for (var p = 0; p < 10; p++) {
    var pk = 0.2 + r() * 0.9, px = VX + (r() - 0.5) * 640 * pk;
    puddles += '<ellipse cx="' + f(px) + '" cy="' + f(S.y(pk)) + '" rx="' + f(60 * pk + 4) + '" ry="' + f(3.4 * pk + 0.5) + '" fill="var(--scene-puddle)" opacity="' + (0.18 + r() * 0.2).toFixed(2) + '"/>';
  }

  // houses along the street
  var blds = [
    { side: 1, line: 520, k1: 1.9, k2: 0.6, h: 300, d: 600, roof: 0 },
    { side: 1, line: 500, k1: 0.56, k2: 0.38, h: 260, d: 420, roof: 110 },
    { side: 1, line: 480, k1: 0.35, k2: 0.24, h: 300, d: 380, roof: 0 },
    { side: 1, line: 470, k1: 0.22, k2: 0.15, h: 240, d: 400, roof: 90 },
    { side: -1, line: 560, k1: 0.6, k2: 0.44, h: 210, d: 250, roof: 80 },
    { side: -1, line: 540, k1: 0.4, k2: 0.3, h: 250, d: 230, roof: 0 },
    { side: -1, line: 520, k1: 0.27, k2: 0.19, h: 210, d: 250, roof: 76 },
    { side: -1, line: 500, k1: 0.17, k2: 0.12, h: 230, d: 230, roof: 70 }
  ];
  blds.sort(function (a, b) { return a.k1 - b.k1; });
  var near = blds.filter(function (b) { return b.k1 > 0.7; }), farB = blds.filter(function (b) { return b.k1 <= 0.7; });
  var housesFar = farB.map(function (b) { b.lit = 0.3; return S.building(b.side, b, r); }).join("");
  // the big house on the right: a tiled eave and a lit window
  var big = near.map(function (b) { b.lit = 0; return S.building(b.side, b, r); }).join("");
  var EX = function (k) { return VX + 520 * k; }, top = function (k) { return S.y(k) - 300 * k; };
  var eave = poly([[EX(0.6) - 44, top(0.6) + 4], [EX(1.9) - 150, top(1.9) + 6], [EX(1.9) - 150, top(1.9) - 50], [EX(0.6) - 30, top(0.6) - 18]]);
  // the tiled eave edge: little arcs along the bottom of the roof
  var tiles = "", te = function (k) { return [EX(k) - 44 * k / 0.6 * (0.6 + (k - 0.6) * 0.6), top(k) + 4 + (k - 0.6) * 2]; };
  for (var tk = 0.6; tk < 1.9; tk *= 1.05) {
    var a = te(tk), b = te(tk * 1.05);
    tiles += "M" + f(a[0]) + " " + f(a[1]) + " Q" + f((a[0] + b[0]) / 2) + " " + f((a[1] + b[1]) / 2 + 4 * tk) + " " + f(b[0]) + " " + f(b[1]) + " ";
  }
  var winK = [0.72, 0.9], wP = function (kk, hf) { return [EX(kk), S.y(kk) - hf * 300 * kk]; };
  var bigWin = '<path d="' + poly([wP(winK[0], 0.38), wP(winK[1], 0.38), wP(winK[1], 0.72), wP(winK[0], 0.72)]) + '" fill="' + g.url("houseWin") + '"/>';
  var lattice = "";
  for (var lk = 1; lk < 4; lk++) {
    var kk = winK[0] + (winK[1] - winK[0]) * lk / 4;
    lattice += '<path d="M' + f(EX(kk)) + " " + f(wP(kk, 0.38)[1]) + " L" + f(EX(kk)) + " " + f(wP(kk, 0.72)[1]) + '"/>';
  }
  lattice += '<path d="M' + f(wP(winK[0], 0.55)[0]) + " " + f(wP(winK[0], 0.55)[1]) + " L" + f(wP(winK[1], 0.55)[0]) + " " + f(wP(winK[1], 0.55)[1]) + '"/>';
  var winGlow = '<circle cx="' + f(EX(0.8)) + '" cy="' + f(wP(0.8, 0.55)[1]) + '" r="80" fill="' + g.url("winGlow") + '"/>' +
    '<rect x="' + f(EX(0.72) - 40) + '" y="' + f(S.y(0.8) + 2) + '" width="50" height="40" fill="' + g.url("warmRefl") + '" opacity=".7"/>';

  // low wall and hedges along the left
  var wallP = function (k, hf) { return [VX - 430 * k, S.y(k) - hf * 50 * k]; };
  var lowWall = '<path d="' + poly([wallP(1.4, 0), wallP(0.12, 0), wallP(0.12, 1), wallP(1.4, 1)]) + '" fill="var(--scene-house)"/>';
  var hedgeTop = function (k) { var p0 = wallP(k, 1); return [p0[0] - 14 * k, p0[1] - 14 * k]; };
  var hd = "M" + f(wallP(1.4, 1)[0] - 400) + " " + f(wallP(1.4, 1)[1]) + " L" + f(hedgeTop(1.4)[0]) + " " + f(hedgeTop(1.4)[1]);
  for (var hk = 1.4; hk > 0.14; hk /= 1.06) {
    var h0 = hedgeTop(hk), h1 = hedgeTop(hk / 1.06);
    hd += " Q" + f((h0[0] + h1[0]) / 2) + " " + f(Math.min(h0[1], h1[1]) - (6 + r() * 14) * hk) + " " + f(h1[0]) + " " + f(h1[1]);
  }
  hd += " L" + f(wallP(0.14, 1)[0]) + " " + f(wallP(0.14, 1)[1]) + " L" + f(wallP(1.4, 1)[0] - 400) + " " + f(wallP(1.4, 1)[1]) + " Z";
  var hedge = '<path d="' + hd + '"/>';

  // poles and wires
  var right = poleRow(S, 1, 430, [1.4, 0.52, 0.3, 0.18, 0.11, 0.07], 700);
  var leftP = poleRow(S, -1, 470, [0.34, 0.2, 0.12, 0.075], 640);
  var sweep = '<path d="' + wire(right.poles[1].pts[0][0], right.poles[1].pts[0][1], -40, 30, 50) + '"/>' +
    '<path d="' + wire(right.poles[1].pts[2][0], right.poles[1].pts[2][1], -40, 120, 50) + '"/>' +
    '<path d="' + wire(right.poles[1].pts[1][0], right.poles[1].pts[1][1], 1260, -20, 20) + '"/>';

  // the torii
  var TX = 688, TY = 350, ts = 0.86;
  var t = function (x, y) { return f(TX + x * ts) + " " + f(TY + y * ts); };
  var gate =
    '<path d="M' + t(-104, 0) + " L" + t(-101, -136) + " L" + t(-89, -136) + " L" + t(-86, 0) + ' Z"/>' +
    '<path d="M' + t(86, 0) + " L" + t(89, -136) + " L" + t(101, -136) + " L" + t(104, 0) + ' Z"/>' +
    '<path d="M' + t(-118, -108) + " L" + t(118, -108) + " L" + t(118, -99) + " L" + t(-118, -99) + ' Z"/>' +
    '<path d="M' + t(-7, -134) + " L" + t(7, -134) + " L" + t(7, -108) + " L" + t(-7, -108) + ' Z"/>' +
    '<path d="M' + t(-120, -134) + " L" + t(120, -134) + " L" + t(120, -143) + " L" + t(-120, -143) + ' Z"/>';
  var gateShade = '<g fill="var(--scene-torii-top)" opacity=".35">' +
    '<path d="M' + t(-104, 0) + " L" + t(-101, -136) + " L" + t(-96, -136) + " L" + t(-98, 0) + ' Z"/>' +
    '<path d="M' + t(86, 0) + " L" + t(89, -136) + " L" + t(93, -136) + " L" + t(91, 0) + ' Z"/>' +
    '<path d="M' + t(-118, -101) + " L" + t(118, -101) + " L" + t(118, -99) + " L" + t(-118, -99) + ' Z"/></g>' +
    '<g fill="var(--scene-torii-top)"><path d="M' + t(-107, 0) + " L" + t(-106, -12) + " L" + t(-84, -12) + " L" + t(-83, 0) + ' Z"/><path d="M' + t(83, 0) + " L" + t(84, -12) + " L" + t(106, -12) + " L" + t(107, 0) + ' Z"/></g>';
  var kasagi = '<path d="M' + t(-134, -150) + " Q" + t(-120, -145) + " " + t(-100, -146) + " L" + t(100, -146) + " Q" + t(120, -145) + " " + t(134, -150) + " L" + t(136, -158) + " Q" + t(118, -153) + " " + t(98, -155) + " L" + t(-98, -155) + " Q" + t(-118, -153) + " " + t(-136, -158) + ' Z" fill="var(--scene-torii-top)"/>';
  var gateLit = '<g fill="var(--scene-torii-lit)" opacity=".5"><path d="M' + t(101, -136) + " L" + t(104, 0) + " L" + t(102.4, 0) + " L" + t(99.6, -136) + ' Z"/><path d="M' + t(-89, -136) + " L" + t(-86, 0) + " L" + t(-87.4, 0) + " L" + t(-90.4, -136) + ' Z"/><path d="M' + t(-120, -143) + " L" + t(120, -143) + " L" + t(120, -141.6) + " L" + t(-120, -141.6) + ' Z"/></g>';
  var gateRefl = '<g opacity=".3"><rect x="' + f(TX - 104 * ts) + '" y="' + TY + '" width="' + f(18 * ts) + '" height="36" fill="' + g.url("toriiRefl") + '"/><rect x="' + f(TX + 86 * ts) + '" y="' + TY + '" width="' + f(18 * ts) + '" height="36" fill="' + g.url("toriiRefl") + '"/></g>';

  // a lamp by the gate
  var lk2 = 0.36, lx = VX - 440 * lk2, lb = S.y(lk2), lt = lb - 460 * lk2;
  var lamp = '<rect x="' + f(lx - 1.4) + '" y="' + f(lt) + '" width="2.8" height="' + f(lb - lt) + '" fill="var(--scene-pole)"/>' +
    '<path d="M' + f(lx) + " " + f(lt + 2) + " q 0 -6 " + f(14) + ' -6" stroke="var(--scene-pole)" stroke-width="2.4" fill="none"/>' +
    '<g class="lamp-hum"><circle cx="' + f(lx + 16) + '" cy="' + f(lt - 3) + '" r="44" fill="' + g.url("lampHalo") + '"/></g>' +
    '<rect x="' + f(lx + 10) + '" y="' + f(lt - 6) + '" width="12" height="4" rx="1.6" fill="var(--scene-lamp)"/>' +
    '<rect x="' + f(lx + 12) + '" y="' + f(S.y(lk2 + 0.04)) + '" width="8" height="46" fill="' + g.url("lampRefl") + '"/>';

  var ck = 0.66;
  var car = '<g class="scene-car" style="transform-origin:' + VX + "px " + VY + 'px"><g transform="translate(' + f(VX - 250 * ck) + " " + f(S.y(ck)) + ") scale(" + ck + ')">' + carRear(g) + "</g></g>";
  var oncoming = '<g>' +
    '<circle cx="' + (VX + 8) + '" cy="' + (VY + 2) + '" r="22" fill="' + g.url("head") + '"/>' +
    '<rect x="' + (VX + 3) + '" y="' + (VY + 1) + '" width="3" height="1.6" rx=".6" fill="var(--scene-head)"/>' +
    '<rect x="' + (VX + 10) + '" y="' + (VY + 1) + '" width="3" height="1.6" rx=".6" fill="var(--scene-head)"/>' +
    '<rect x="' + (VX + 2.6) + '" y="' + (VY + 3) + '" width="11" height="40" fill="' + g.url("headRefl") + '"/>' +
  "</g>";

  return (
    "<defs>" +
      lin(g.id("tiSky"), [[0, "var(--scene-sky-top)"], [0.6, "var(--scene-sky-mid)"], [1, "var(--scene-sky-low)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="330"') +
      glow(g.id("moonGlow"), "var(--scene-moon)", 0.32) +
      rad(g.id("moonFace"), [[0, "var(--scene-moon-core)"], [1, "var(--scene-moon)"]], 'cx=".4" cy=".4" r=".7"') +
      lin(g.id("tiRoad"), [[0, "var(--scene-road-far)"], [1, "var(--scene-road)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="334" x2="0" y2="400"') +
      lin(g.id("tiMist"), [[0, "var(--scene-haze)", 0], [1, "var(--scene-haze)", 0.45]]) +
      lin(g.id("houseWin"), [[0, "var(--scene-lamp)"], [1, "var(--scene-window)"]]) +
      glow(g.id("winGlow"), "var(--scene-window)", 0.35) +
      lin(g.id("warmRefl"), [[0, "var(--scene-window)", 0.35], [1, "var(--scene-window)", 0]]) +
      lin(g.id("toriiRefl"), [[0, "var(--scene-torii)", 0.9], [1, "var(--scene-torii)", 0]]) +
      glow(g.id("lampHalo"), "var(--scene-lamp)", 0.55) +
      lin(g.id("lampRefl"), [[0, "var(--scene-lamp)", 0.4], [1, "var(--scene-lamp)", 0]]) +
      glow(g.id("head"), "var(--scene-head)", 0.6) +
      lin(g.id("headRefl"), [[0, "var(--scene-head)", 0.4], [1, "var(--scene-head)", 0]]) +
      carDefs(g) +
    "</defs>" +
    '<rect class="scene-sky" width="1200" height="400" fill="' + g.url("tiSky") + '"/>' +
    '<g fill="var(--scene-star)">' + stars(29, 30, 150, 4, 1.1) + "</g>" +
    '<g class="moon-glow"><circle cx="842" cy="80" r="150" fill="' + g.url("moonGlow") + '"/></g>' +
    '<circle cx="842" cy="80" r="22" fill="' + g.url("moonFace") + '"/>' +
    '<g fill="var(--scene-moon-shade)" opacity=".18"><circle cx="835" cy="74" r="6"/><circle cx="849" cy="88" r="4"/><circle cx="845" cy="70" r="2.6"/></g>' +
    '<g class="scene-drift" style="--drift:30px">' + clouds + "</g>" +
    '<path d="' + m1 + '" fill="var(--scene-mt1)"/>' +
    '<rect y="150" width="1200" height="80" fill="' + g.url("tiMist") + '"/>' +
    '<path d="' + m2 + '" fill="var(--scene-mt2)"/>' +
    '<rect y="210" width="1200" height="90" fill="' + g.url("tiMist") + '"/>' +
    '<path d="' + m4 + '" fill="var(--scene-mt3)"/>' +
    '<path d="' + m3 + '" fill="var(--scene-mt3)"/>' +
    villageLights + hill +
    '<rect y="300" width="1200" height="40" fill="' + g.url("tiMist") + '"/>' +
    '<rect y="' + VY + '" width="1200" height="' + (400 - VY) + '" fill="var(--scene-ground)"/>' +
    '<path d="' + road + '" fill="' + g.url("tiRoad") + '"/>' +
    puddles +
    '<g fill="var(--scene-paint)" opacity=".4">' + marks + "</g>" +
    '<path d="M' + (VX - 1) + " " + VY + " L" + f(L(1.1)) + " " + f(S.y(1.1)) + " M" + (VX + 1) + " " + VY + " L" + f(R(1.1)) + " " + f(S.y(1.1)) + '" stroke="var(--scene-paint)" stroke-width="1.6" opacity=".3"/>' +
    housesFar +
    gateRefl + '<g fill="var(--scene-torii)">' + gate + "</g>" + gateShade + kasagi + gateLit +
    oncoming +
    lamp +
    car +
    lowWall + '<g fill="var(--scene-hedge)">' + hedge + "</g>" +
    big +
    '<path d="' + eave + '" fill="var(--scene-roof)"/>' +
    '<path d="' + tiles + '" fill="none" stroke="var(--scene-roof-edge)" stroke-width="2.2" opacity=".8"/>' +
    winGlow + bigWin +
    '<g stroke="var(--scene-house-dark)" stroke-width="2" opacity=".7">' + lattice + "</g>" +
    '<g fill="var(--scene-pole)">' + leftP.bodies + right.bodies + "</g>" +
    '<g stroke="var(--scene-wire)" stroke-width=".9" fill="none" opacity=".75">' + leftP.wires + right.wires + sweep + "</g>" +
    fall(91, 120, { cls: "fall-rain-far", color: "var(--scene-rain)", width: 0.7, opacity: 0.35, len: 14, slant: 0.04 }) +
    fall(92, 60, { cls: "fall-rain", color: "var(--scene-rain)", width: 1, opacity: 0.4, len: 26, slant: 0.04 })
  );
}

/* ======================================================================
   mist: a forest going into teal fog
   ====================================================================== */

function mist(n) {
  var g = namer(n), r = rand(91);

  function conifer(x, base, top, w) {
    var h = base - top, tiers = 9 + Math.floor(r() * 5), right = [], i;
    for (i = 1; i <= tiers; i++) {
      var t = i / tiers, y = top + h * 0.86 * t, ww = w * (0.1 + 0.9 * Math.pow(t, 0.9)) * (0.8 + r() * 0.4);
      right.push([x + ww, y + h * 0.02]);
      right.push([x + ww * 0.3, y - h * 0.012]);
    }
    var d = "M" + f(x) + " " + f(top);
    right.forEach(function (p) { d += " L" + f(p[0]) + " " + f(p[1]); });
    d += " L" + f(x + w * 0.07) + " " + f(base) + " L" + f(x - w * 0.07) + " " + f(base);
    for (i = right.length - 1; i >= 0; i--) d += " L" + f(2 * x - right[i][0] + (r() - 0.5) * w * 0.12) + " " + f(right[i][1] + (r() - 0.5) * 3);
    return '<path d="' + d + ' Z"/>';
  }
  function trunk(x, base, top, w) {
    var out = '<path d="M' + f(x - w * 0.5) + " " + f(base) + " L" + f(x - w * 0.3) + " " + f(top) + " L" + f(x + w * 0.3) + " " + f(top) + " L" + f(x + w * 0.5) + " " + f(base) + ' Z"/>';
    // a thin crown: a few branches, leaves gathered at their ends
    var crown = "";
    for (var b = 0; b < 4; b++) {
      var by = top + (base - top) * (0.04 + r() * 0.3), dir = b % 2 ? 1 : -1, bl = w * (3 + r() * 4);
      var bx = x + dir * bl, bty = by - bl * 0.9;
      out += '<path d="M' + f(x) + " " + f(by) + " Q" + f(x + dir * bl * 0.3) + " " + f(by - bl * 0.6) + " " + f(bx) + " " + f(bty) + '" stroke-width="' + f(Math.max(0.6, w * 0.22)) + '" fill="none"/>';
      for (var c = 0; c < 14; c++) crown += '<circle cx="' + f(bx + (r() - 0.5) * w * 6) + '" cy="' + f(bty + (r() - 0.5) * w * 3.6) + '" r="' + f(w * (0.25 + r() * 0.45)) + '"/>';
    }
    return out + '<g stroke="none" opacity=".55">' + crown + "</g>";
  }
  function layer(cls, count, base, topMin, topMax, wMin, wMax, conMix) {
    var out = "";
    for (var i = 0; i < count; i++) {
      var x = -30 + r() * 1260, top = topMin + r() * (topMax - topMin);
      out += r() < conMix ? conifer(x, base + r() * 8, top, wMin * 4 + r() * wMax * 3) : trunk(x, base + r() * 8, top - 40, wMin + r() * (wMax - wMin));
    }
    return '<g fill="var(--scene-' + cls + ')" stroke="var(--scene-' + cls + ')">' + out + "</g>";
  }
  function fogBand(cls, y, count, rxMin, rxMax, ry, drift) {
    var out = "";
    for (var i = 0; i < count; i++) out += '<ellipse cx="' + f(-150 + r() * 1500) + '" cy="' + f(y + (r() - 0.5) * ry) + '" rx="' + f(rxMin + r() * (rxMax - rxMin)) + '" ry="' + f(ry * (0.6 + r() * 0.6)) + '" fill="' + g.url("fogBlob") + '"/>';
    return '<g class="scene-drift ' + cls + '" style="--drift:' + drift + 'px">' + out + "</g>";
  }
  var floor = "M-10 400 L-10 356", fx = -10;
  while (fx < 1210) {
    var fw = 6 + r() * 16;
    floor += " Q" + f(fx + fw / 2) + " " + f(350 - r() * 12 + Math.sin(fx / 160) * 6) + " " + f(fx + fw) + " " + f(354 + Math.sin((fx + fw) / 160) * 6);
    fx += fw;
  }
  floor += " L1210 400 Z";
  var motes = "";
  for (var m = 0; m < 16; m++) {
    motes += '<circle class="mote" style="animation-delay:-' + (r() * 16).toFixed(1) + 's" cx="' + f(480 + r() * 460) + '" cy="' + f(150 + r() * 180) + '" r="' + f(0.6 + r() * 1.1) + '"/>';
  }
  var near = "";
  [[34, 30], [118, 16], [1110, 22], [1182, 34]].forEach(function (t) {
    near += '<path d="M' + (t[0] - t[1] * 0.5) + " 410 L" + (t[0] - t[1] * 0.38) + " -10 L" + (t[0] + t[1] * 0.38) + " -10 L" + (t[0] + t[1] * 0.5) + ' 410 Z"/>';
  });
  near += '<path d="M40 120 q 40 -10 90 -40 M30 220 q -20 -20 -40 -26 M1110 90 q -40 -6 -100 -40 M1104 180 q -30 4 -60 -8 M1182 140 q -30 -20 -50 -60" stroke-width="5" fill="none"/>';
  [[96, 70, 30], [150, 40, 22], [1050, 44, 30], [1000, 70, 20], [1150, 110, 22]].forEach(function (c) {
    for (var lv = 0; lv < 90; lv++) {
      var a = r() * Math.PI * 2, d = Math.sqrt(r()) * c[2];
      var lx = c[0] + Math.cos(a) * d * 1.4, ly = c[1] + Math.sin(a) * d * 0.7;
      near += '<ellipse cx="' + f(lx) + '" cy="' + f(ly) + '" rx="' + f(3 + r() * 3.4) + '" ry="' + f(1.6 + r() * 1.4) + '" transform="rotate(' + Math.round(r() * 180) + " " + f(lx) + " " + f(ly) + ')" stroke="none"/>';
    }
  });

  return (
    "<defs>" +
      lin(g.id("msSky"), [[0, "var(--scene-sky-top)"], [0.5, "var(--scene-sky-mid)"], [1, "var(--scene-sky-low)"]]) +
      rad(g.id("msGlow"), [[0, "var(--scene-glow)", 0.95], [0.4, "var(--scene-glow)", 0.45], [1, "var(--scene-glow)", 0]], 'cx=".5" cy=".5" r=".5"') +
      lin(g.id("ray"), [[0, "var(--scene-glow)", 0.32], [1, "var(--scene-glow)", 0]]) +
      glow(g.id("fogBlob"), "var(--scene-fog)", 0.6) +
      lin(g.id("fogBand"), [[0, "var(--scene-fog)", 0], [0.6, "var(--scene-fog)", 0.5], [1, "var(--scene-fog)", 0.15]]) +
      lin(g.id("msFloor"), [[0, "var(--scene-floor-lit)"], [1, "var(--scene-floor)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="340" x2="0" y2="400"') +
    "</defs>" +
    '<rect class="scene-sky" width="1200" height="400" fill="' + g.url("msSky") + '"/>' +
    '<ellipse cx="720" cy="40" rx="560" ry="300" fill="' + g.url("msGlow") + '"/>' +
    layer("tree0", 60, 330, 30, 150, 2, 5, 0.4) +
    '<rect y="150" width="1200" height="200" fill="' + g.url("fogBand") + '"/>' +
    fogBand("fog-a", 280, 9, 160, 320, 40, 40) +
    '<g class="rays">' +
      '<path d="M700 0 L760 0 L640 380 L470 380 Z" fill="' + g.url("ray") + '"/>' +
      '<path d="M780 0 L820 0 L900 380 L790 380 Z" fill="' + g.url("ray") + '" opacity=".7"/>' +
      '<path d="M650 0 L680 0 L380 360 L300 360 Z" fill="' + g.url("ray") + '" opacity=".5"/>' +
    "</g>" +
    layer("tree1", 34, 342, 10, 120, 3, 7, 0.45) +
    '<rect y="190" width="1200" height="170" fill="' + g.url("fogBand") + '" opacity=".75"/>' +
    fogBand("fog-b", 320, 8, 140, 280, 30, -50) +
    layer("tree2", 18, 356, -20, 80, 6, 11, 0.5) +
    '<rect y="250" width="1200" height="120" fill="' + g.url("fogBand") + '" opacity=".5"/>' +
    layer("tree3", 8, 372, -40, 30, 11, 18, 0.35) +
    '<path d="' + floor + '" fill="' + g.url("msFloor") + '"/>' +
    fogBand("fog-a", 360, 7, 120, 240, 22, 30) +
    '<g fill="var(--scene-glow)" opacity=".8">' + motes + "</g>" +
    '<g fill="var(--scene-tree4)" stroke="var(--scene-tree4)">' + near + "</g>"
  );
}

/* ======================================================================
   rooftop: a pale bright day on the school roof
   ====================================================================== */

function rooftop(n) {
  var g = namer(n), r = rand(43);

  var clouds = "";
  // fair-weather clouds, white on top and blue in their shade, smaller and flatter toward the horizon
  [[200, 126, 220, 46], [450, 66, 150, 30], [640, 176, 280, 52], [770, 92, 120, 24], [1020, 70, 150, 30], [330, 214, 170, 16], [880, 226, 150, 12]].forEach(function (c, i) {
    var gid = g.id("cu" + i);
    clouds += lin(gid, [[0, "var(--scene-cloud)"], [0.55, "var(--scene-cloud)"], [1, "var(--scene-cloud-shade)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="' + f(c[1] - c[3] * 1.3) + '" x2="0" y2="' + f(c[1]) + '"') +
      '<g fill="url(#' + gid + ')" opacity=".95">' + cumulus(rand(Math.round(c[0] + c[1])), c[0], c[1], c[2], c[3]) + "</g>";
  });
  [[40, 60, 300, 6], [560, 124, 260, 5], [860, 40, 280, 6]].forEach(function (c) {
    clouds += '<g fill="var(--scene-cloud)" opacity=".45">' + streakCloud(rand(c[0] + 3), c[0], c[1], c[2], c[3]) + "</g>";
  });

  function blocks(seed, base, x0, x1, wmin, wmax, hmin, hmax, fill, line, lit) {
    var rr = rand(seed), out = "", lines = "", x = x0;
    while (x < x1) {
      var w = wmin + rr() * (wmax - wmin), h = hmin + rr() * (hmax - hmin), top = base - h;
      out += '<rect x="' + f(x) + '" y="' + f(top) + '" width="' + f(w) + '" height="' + f(h + 60) + '"/>';
      if (lit) out += '<rect x="' + f(x + w * 0.72) + '" y="' + f(top) + '" width="' + f(w * 0.28) + '" height="' + f(h + 60) + '" fill="' + lit + '" opacity=".55"/>';
      for (var y = top + 7; y < base; y += 7 + rr() * 3) lines += '<rect x="' + f(x + 3) + '" y="' + f(y) + '" width="' + f(w - 6) + '" height="1.6"/>';
      if (rr() > 0.6) out += '<rect x="' + f(x + w * 0.2) + '" y="' + f(top - 8) + '" width="' + f(w * 0.25) + '" height="8"/>';
      x += w + rr() * 10;
    }
    return '<g fill="' + fill + '">' + out + '</g><g fill="' + line + '" opacity=".55">' + lines + "</g>";
  }

  // the railing: nearer on the left, so lower there and more widely spaced
  var yt = function (x) { return 268 + (1200 - x) * 0.022; };
  var yb = function (x) { return yt(x) + 58 + (1200 - x) * 0.012; };
  var rail = "", shadows = "", x = 1204;
  var count = 0;
  while (x > -30) {
    var post = count % 7 === 0, w = (post ? 6 : 2.6) + (1200 - x) * (post ? 0.004 : 0.0016);
    rail += '<rect x="' + f(x - w / 2) + '" y="' + f(yt(x)) + '" width="' + f(w) + '" height="' + f(yb(x) - yt(x)) + '" fill="var(--scene-rail)"/>' +
      '<rect x="' + f(x + w * 0.1) + '" y="' + f(yt(x)) + '" width="' + f(w * 0.4) + '" height="' + f(yb(x) - yt(x)) + '" fill="var(--scene-rail-shade)" opacity=".6"/>';
    shadows += '<path d="' + poly([[x - w / 2, yb(x) + 10], [x + w / 2, yb(x) + 10], [x + w / 2 - 70, 420], [x - w / 2 - 70 - w, 420]]) + '"/>';
    x -= 16 + (1200 - x) * 0.012;
    count++;
  }
  var top = poly([[-10, yt(-10) - 6], [1210, yt(1210) - 4.6], [1210, yt(1210) + 1.6], [-10, yt(-10) + 2.4]]);
  var mid = poly([[-10, yb(-10) - 12], [1210, yb(1210) - 9], [1210, yb(1210) - 6.6], [-10, yb(-10) - 9]]);
  var ledge = poly([[-10, yb(-10)], [1210, yb(1210)], [1210, yb(1210) + 10], [-10, yb(-10) + 12]]);
  var railShadow = poly([[-10, yb(-10) + 12], [1210, yb(1210) + 10], [1140, 430], [-80, 430]]);

  function bird(bx, by, s, delay) {
    return '<g transform="translate(' + bx + " " + by + ") scale(" + s + ')"><path class="wing" style="animation-delay:' + delay + 's" d="M-10 0 Q -5 -5 0 0.5 Q 5 -5 10 0" fill="none" stroke="var(--scene-bird)" stroke-width="1.8" stroke-linecap="round"/></g>';
  }
  var flock = '<g class="scene-birds"><g class="birds-bob">' + bird(880, 92, 1.4, 0) + bird(912, 80, 1.1, -0.7) + bird(860, 110, 0.9, -1.6) + "</g></g>";
  var perched = '<g transform="translate(1046 ' + f(yt(1046) - 2) + ')"><path d="M-6 0 Q -6 -6 0 -7 Q 4 -7 5 -10 Q 8 -10 8 -8 L 11 -7 L 8 -6 Q 8 -1 2 0 Z M-6 -2 L-13 1 L-6 0 Z" fill="var(--scene-bird)"/></g>';

  return (
    "<defs>" +
      lin(g.id("rtSky"), [[0, "var(--scene-sky-top)"], [0.6, "var(--scene-sky-mid)"], [1, "var(--scene-sky-low)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300"') +
      glow(g.id("sun"), "var(--scene-sun)", 0.9) +
      lin(g.id("rtHaze"), [[0, "var(--scene-haze)", 0], [1, "var(--scene-haze)", 0.8]]) +
      lin(g.id("rtFloor"), [[0, "var(--scene-floor)"], [1, "var(--scene-floor-near)"]], 'gradientUnits="userSpaceOnUse" x1="0" y1="330" x2="0" y2="400"') +
    "</defs>" +
    '<rect class="scene-sky" width="1200" height="400" fill="' + g.url("rtSky") + '"/>' +
    '<circle cx="1020" cy="10" r="340" fill="' + g.url("sun") + '"/>' +
    '<g class="scene-drift" style="--drift:-36px">' + clouds + "</g>" +
    blocks(7, 300, -10, 1210, 40, 110, 50, 170, "var(--scene-bld-far)", "var(--scene-bld-far-line)", "") +
    '<rect y="200" width="1200" height="100" fill="' + g.url("rtHaze") + '"/>' +
    blocks(11, 300, 280, 900, 50, 90, 20, 70, "var(--scene-bld-mid)", "var(--scene-bld-mid-line)", "var(--scene-bld-lit)") +
    '<g fill="var(--scene-bld-near)">' +
      '<rect x="-10" y="56" width="176" height="260"/><rect x="166" y="140" width="96" height="180"/>' +
      '<rect x="950" y="-10" width="260" height="330"/><rect x="866" y="118" width="84" height="200"/>' +
      '<rect x="40" y="40" width="40" height="16"/><rect x="980" y="-10" width="2" height="1"/>' +
    "</g>" +
    '<g fill="var(--scene-bld-lit)" opacity=".6"><rect x="132" y="56" width="34" height="260"/><rect x="1150" y="-10" width="60" height="330"/><rect x="930" y="118" width="20" height="200"/></g>' +
    '<g fill="var(--scene-bld-near-line)" opacity=".6">' +
      (function () { var s = ""; for (var yy = 70; yy < 300; yy += 14) s += '<rect x="0" y="' + yy + '" width="130" height="3"/>'; for (var y2 = 8; y2 < 300; y2 += 15) s += '<rect x="960" y="' + y2 + '" width="186" height="3.4"/>'; for (var y3 = 130; y3 < 300; y3 += 13) s += '<rect x="872" y="' + y3 + '" width="56" height="2.6"/>'; return s; })() +
    "</g>" +
    '<g stroke="var(--scene-bld-near-line)" stroke-width="1.6" fill="none"><path d="M60 56 L60 14 M40 22 L82 22 M44 30 L76 30 M48 38 L72 38"/><path d="M900 118 L900 86 M884 92 L916 92"/></g>' +
    flock +
    '<path d="' + railShadow + '" fill="var(--scene-floor)"/>' +
    '<rect x="-10" y="' + f(yb(1210) + 8) + '" width="1220" height="120" fill="' + g.url("rtFloor") + '"/>' +
    '<g fill="var(--scene-shadow)" opacity=".13">' + shadows + "</g>" +
    '<path d="' + ledge + '" fill="var(--scene-ledge)"/>' +
    rail +
    '<path d="' + mid + '" fill="var(--scene-rail)"/>' +
    '<path d="' + top + '" fill="var(--scene-rail)"/>' +
    '<path d="M-10 ' + f(yt(-10) + 2.4) + " L1210 " + f(yt(1210) + 1.6) + '" stroke="var(--scene-rail-shade)" stroke-width="1.6"/>' +
    perched
  );
}

/* ---------- the registry ---------- */

var SCENES = {
  night: { draw: night, peak: "360 0 820 400" },
  bluehour: { draw: bluehour, peak: "360 0 820 400" },
  city: { draw: city, peak: "500 0 700 400" },
  room: { draw: room, peak: "420 0 820 400" },
  torii: { draw: torii, peak: "350 0 820 400" },
  mist: { draw: mist, peak: "300 0 820 400" },
  rooftop: { draw: rooftop, peak: "380 0 820 400" }
};

/* backgrounds that come with a scene ("window" is the night, behind rain) */
export var SCENE_BACKGROUNDS = ["night", "window", "bluehour", "city", "room", "torii", "mist", "rooftop"];

export function sceneFor(background) {
  if (background === "window") return "night";
  return SCENES[background] ? background : null;
}

export function hasScene(background) {
  return SCENE_BACKGROUNDS.indexOf(background) >= 0;
}

var drawings = 0;

export function sceneSvg(opts) {
  opts = opts || {};
  var auto = !opts.scene;
  var name = sceneFor(opts.scene) || sceneFor(document.documentElement.dataset.background) || "night";
  var n = String(++drawings);
  var view = opts.crop === "peak" ? SCENES[name].peak : "0 0 1200 400";
  return '<svg class="scene scene--' + name + '" data-scene="' + name + '"' + (auto ? ' data-scene-auto="' + (opts.crop || "") + '"' : "") +
    ' viewBox="' + view + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
    SCENES[name].draw(n) + "</svg>";
}

/* a scene that follows the theme is redrawn when the background changes */
if (typeof document !== "undefined") {
  document.addEventListener("logbook:theme-changed", function () {
    var want = sceneFor(document.documentElement.dataset.background);
    if (!want) return;
    document.querySelectorAll("svg.scene[data-scene-auto]").forEach(function (svg) {
      if (svg.getAttribute("data-scene") === want) return;
      var crop = svg.getAttribute("data-scene-auto");
      var holder = document.createElement("div");
      holder.innerHTML = sceneSvg(crop ? { crop: crop } : null);
      svg.replaceWith(holder.firstChild);
    });
  });
}
