/* The night scene: Fuji under the stars, a quiet town, a lit corner shop.
   It's the window at the top of the dashboard and the backdrop of the lock
   screen. Pure SVG, colored from the theme's CSS variables (see scene.css),
   so a custom theme recolors it. Ambient motion (twinkling stars, a far-off
   train, a window going dark) is CSS and stops for reduced motion.

   sceneSvg({ crop: "peak" }) centers the view on the mountain, for tall
   screens where most of the width gets cropped away. */

function rand(seed) {
  // small deterministic generator, so the scene is the same every render
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function stars() {
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
function town() {
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
function trees() {
  var r = rand(13), d = "M0 400 L0 352", x = 0;
  while (x < 1200) {
    var w = 8 + Math.round(r() * 12), y = 349 + Math.round(r() * 5), h = 3 + Math.round(r() * 7);
    d += " Q" + (x + w / 2) + " " + (y - h * 2) + " " + (x + w) + " " + y;
    x += w;
  }
  return '<path d="' + d + ' L1200 400 Z" fill="var(--scene-ridge)"/>';
}

function train() {
  var cars = "";
  for (var i = 0; i < 4; i++) {
    var cx = i * 34;
    cars += '<rect x="' + cx + '" y="0" width="31" height="7" rx="2" fill="var(--scene-ridge)"/>';
    for (var k = 0; k < 4; k++) cars += '<rect x="' + (cx + 3 + k * 7) + '" y="2" width="4" height="2.4" rx=".5" fill="var(--scene-window)" opacity=".9"/>';
  }
  return '<g class="scene-train"><g transform="translate(0 343)">' + cars + "</g></g>";
}

var drawings = 0;

export function sceneSvg(opts) {
  opts = opts || {};
  // gradient ids are per drawing: a gradient inside a hidden page doesn't paint for anyone else
  var n = String(++drawings);
  var view = opts.crop === "peak" ? "360 0 820 400" : "0 0 1200 400";
  return (
    '<svg class="scene" viewBox="' + view + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
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
      '<g class="scene-stars" fill="var(--scene-star)">' + stars() + "</g>" +
      '<circle cx="1010" cy="74" r="70" fill="url(#scMoonGlow' + n + ')"/>' +
      '<circle cx="1010" cy="74" r="15" fill="var(--scene-moon)" mask="url(#scCrescent' + n + ')"/>' +
      // the far range, then the mountain
      '<path d="M0 318 C 90 300 170 296 250 306 S 380 292 450 300 S 640 290 760 302 S 1040 286 1200 296 L 1200 400 L 0 400 Z" fill="var(--scene-far)"/>' +
      '<path d="M370 340 C 520 304 650 206 738 124 L 750 113 Q 770 107 790 113 L 802 124 C 890 206 1020 304 1170 340 Z" fill="url(#scFuji' + n + ')"/>' +
      '<path d="M778 110 Q 786 110 790 113 L 802 124 C 890 206 1020 304 1170 340 L 1060 340 C 930 286 836 200 778 110 Z" fill="url(#scLit' + n + ')"/>' +
      '<path class="scene-snow" d="M686 170 C 706 152 724 137 738 124 L 750 113 Q 770 107 790 113 L 802 124 C 816 137 834 152 854 170 L 846 172 L 838 186 L 832 176 L 822 204 L 815 184 L 806 214 L 798 190 L 788 228 L 780 196 L 771 236 L 764 198 L 754 220 L 748 190 L 738 206 L 732 182 L 722 192 L 716 178 L 704 182 L 698 174 Z" fill="url(#scSnow' + n + ')"/>' +
      '<rect y="250" width="1200" height="150" fill="url(#scHaze' + n + ')"/>' +
      // tree line and the train that runs along it
      trees() +
      train() +
      town() +
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
      "</g>" +
    "</svg>"
  );
}
