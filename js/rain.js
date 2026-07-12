export function startMatrixRain() {
  var canvas = document.getElementById("rain");
  var ctx = canvas.getContext("2d");
  var fontSize = 15;
  var chars = "01";
  var width, height, columns, drops;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    columns = Math.max(1, Math.floor(width / fontSize));
    drops = new Array(columns).fill(0).map(function () { return Math.random() * -40; });
    ctx.fillStyle = "#050806";
    ctx.fillRect(0, 0, width, height);
  }
  resize();
  window.addEventListener("resize", resize);

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function frame() {
    ctx.fillStyle = "rgba(3,8,5,0.14)";
    ctx.fillRect(0, 0, width, height);
    ctx.font = fontSize + "px ui-monospace, Menlo, monospace";
    for (var i = 0; i < columns; i++) {
      var char = chars[Math.floor(Math.random() * chars.length)];
      var brightness = Math.random();
      ctx.fillStyle = brightness > 0.96 ? "#c9ffd8" : "rgba(57,255,140," + (0.12 + brightness * 0.35) + ")";
      ctx.fillText(char, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > height && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
  }
  if (!reduceMotion) setInterval(frame, 55);
}
