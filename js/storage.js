export var STORAGE_KEY = "logbook-entries";

export function storageWorks() {
  try {
    var k = "__logbook_test__";
    localStorage.setItem(k, "1");
    var ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok;
  } catch (e) {
    return false;
  }
}

export function loadEntries() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch (e) {
    return false;
  }
}

export function exportEntries(entries) {
  var payload = JSON.stringify(entries, null, 2);
  var blob = new Blob([payload], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "logbook-export-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readImportFile(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = function () {
      reject(new Error("file read error"));
    };
    reader.readAsText(file);
  });
}
