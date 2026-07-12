export function renderHeader(total) {
  document.getElementById("headerTitle").textContent =
    total === 0 ? "awaiting first entry" : total + " " + (total === 1 ? "entry" : "entries") + " logged";
}

export function updateSaveButtonState(mood) {
  var btn = document.getElementById("saveBtn");
  var hasText = document.getElementById("entryText").value.trim().length > 0;
  var enabled = !!mood && hasText;
  btn.disabled = !enabled;
  btn.classList.toggle("enabled", enabled);
}

export function showImportStatus(msg) {
  var el = document.getElementById("importStatus");
  el.textContent = msg;
  setTimeout(function () { el.textContent = ""; }, 4000);
}

export function showStorageWarning() {
  var warn = document.getElementById("storageWarning");
  warn.style.display = "block";
  warn.textContent =
    "this browser is not letting the page save local data, so entries will not persist between visits here. " +
    "try opening this file in a different browser (chrome and firefox both work well), or ask claude to help set this up as a hosted page instead.";
}

export function startBoot(entryCount) {
  var bootEl = document.getElementById("boot");
  var container = document.getElementById("bootLines");
  var lines = [
    "> initializing logbook...",
    "> reading local storage...",
    "> user: kaleb",
    "> clearance: personal / eyes only",
    "> entries on record: " + entryCount,
    "> access granted."
  ];
  var i = 0;
  var timer = setInterval(function () {
    var line = document.createElement("div");
    line.textContent = lines[i];
    line.style.color = i === lines.length - 1 ? "#e8b95c" : "#7ce8a0";
    container.appendChild(line);
    i++;
    if (i >= lines.length) {
      clearInterval(timer);
      setTimeout(function () {
        bootEl.style.opacity = "0";
        setTimeout(function () { bootEl.style.display = "none"; }, 500);
        document.getElementById("app").style.opacity = "1";
      }, 450);
    }
  }, 200);
}
