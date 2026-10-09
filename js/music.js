/* Soundtrack: three ways to have sound while you work.
     1. your own audio files, kept in this browser (IndexedDB), with a real player
     2. ambient sound generated live (rain, waves, wind, fire, noise, a focus tone)
     3. Spotify, embedded from any link you paste
   It can follow the focus timer: start with a focus block, pause on breaks.
   A mini player shows what's playing from any page.
   Music is not part of backups; it stays on the device it was added on. */
import { navigateTo } from './navigation.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

var KEY = "logbook-music";
var DB_NAME = "logbook-music";
var STORE = "tracks";
var AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|weba|mp4)$/i;

var DEFAULTS = {
  tab: "local",
  source: "",            // what played last: local | ambient | spotify
  volume: 0.8,
  shuffle: false,
  repeat: "all",         // off | all | one
  lastTrack: "",
  linkFocus: false,
  ambient: {},           // id -> level 0..1
  ambientVolume: 0.7,
  spotify: { current: "", presets: [] }
};

var settings = loadSettings();

function loadSettings() {
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    var out = Object.assign({}, DEFAULTS, s);
    out.ambient = Object.assign({}, s.ambient || {});
    out.spotify = Object.assign({ current: "", presets: [] }, s.spotify || {});
    return out;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save(patch) {
  if (patch) Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
}

function folderPickSupported() {
  // phones (and the Android app) only let you pick files, not folders
  return "webkitdirectory" in document.createElement("input") && !/android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function fmtSize(bytes) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes > 1e6) return Math.round(bytes / 1e6) + " MB";
  return Math.max(1, Math.round(bytes / 1e3)) + " KB";
}

/* =====================================================================
   1. your files
   ===================================================================== */

var dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    if (!window.indexedDB) return reject(new Error("this browser can't store music"));
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error("couldn't open music storage")); };
  });
  dbPromise.catch(function () { dbPromise = null; });
  return dbPromise;
}

function run(mode, work) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(STORE, mode);
      var req = work(t.objectStore(STORE));
      t.oncomplete = function () { resolve(req ? req.result : undefined); };
      t.onabort = t.onerror = function () {
        var err = t.error || (req && req.error) || new Error("storage error");
        if (err && err.name === "QuotaExceededError") err = new Error("this device's storage is full");
        reject(err);
      };
    });
  });
}

var tracks = [];          // metadata only, sorted by when they were added
var current = null;       // the track loaded in the player
var objectUrl = "";
var audio = null;

function getAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.volume = settings.volume;
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("play", function () {
    if (!current) return; // the silent unlock, not a track
    save({ source: "local" });
    stopOthers("local");
    refresh();
  });
  audio.addEventListener("pause", refresh);
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("error", function () {
    if (current) toast("can't play “" + current.name + "” in this browser", "error");
  });
  return audio;
}

async function loadTracks() {
  try {
    var all = await run("readonly", function (s) { return s.getAll(); });
    tracks = (all || []).map(function (r) {
      return { id: r.id, name: r.name, artist: r.artist, size: r.size, type: r.type, added: r.added, duration: r.duration || 0 };
    }).sort(function (a, b) { return a.added - b.added; });
  } catch (e) {
    tracks = [];
  }
  return tracks;
}

function parseName(filename) {
  var base = filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  base = base.replace(/^\d{1,3}(\s*[-.]\s*|\s+)/, "");  // "01 - ", "01. ", "01 "
  var i = base.indexOf(" - ");
  if (i > 0) return { artist: base.slice(0, i).trim(), name: base.slice(i + 3).trim() || base };
  return { artist: "", name: base || filename };
}

function readDuration(blob) {
  return new Promise(function (resolve) {
    var a = new Audio();
    var url = URL.createObjectURL(blob);
    var done = function (d) { URL.revokeObjectURL(url); a.src = ""; resolve(isFinite(d) ? d : 0); };
    var timer = setTimeout(function () { done(0); }, 5000);
    a.preload = "metadata";
    a.onloadedmetadata = function () { clearTimeout(timer); done(a.duration); };
    a.onerror = function () { clearTimeout(timer); done(0); };
    a.src = url;
  });
}

function newId() {
  var b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

export async function addFiles(fileList) {
  var files = Array.from(fileList || []).filter(function (f) {
    return (f.type && f.type.indexOf("audio/") === 0) || AUDIO_EXT.test(f.name);
  });
  if (!files.length) {
    toast("no audio files in that", "warn");
    return 0;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  var probe = getAudio();
  var added = 0, skipped = 0;
  var existing = {};
  tracks.forEach(function (t) { existing[t.name + "|" + t.size] = true; });
  setBusy("adding " + files.length + " file" + (files.length === 1 ? "" : "s") + "…");
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var meta = parseName(f.name);
    if (existing[meta.name + "|" + f.size]) { skipped++; continue; }
    if (f.type && !probe.canPlayType(f.type)) { skipped++; continue; }
    var record = { id: newId(), name: meta.name, artist: meta.artist, size: f.size, type: f.type || "", added: Date.now() + i, duration: await readDuration(f), blob: f };
    try {
      await run("readwrite", function (s) { return s.put(record); });
      existing[meta.name + "|" + f.size] = true; // the same file twice in one batch
      added++;
      setBusy("added " + added + " of " + files.length + "…");
    } catch (e) {
      toast(e.message || "couldn't save " + f.name, "error");
      break;
    }
  }
  setBusy("");
  await loadTracks();
  renderLocal();
  if (added) toast("added " + added + " track" + (added === 1 ? "" : "s") + (skipped ? " (" + skipped + " skipped: already here or can't play)" : ""));
  else if (skipped) toast("nothing new: those are already here or this browser can't play them", "warn");
  return added;
}

async function removeTrack(id) {
  if (current && current.id === id) stopLocal(true);
  await run("readwrite", function (s) { return s.delete(id); });
  await loadTracks();
  renderLocal();
  refresh();
}

async function clearLibrary() {
  stopLocal(true);
  await run("readwrite", function (s) { return s.clear(); });
  await loadTracks();
  renderLocal();
  refresh();
}

var heard = {};   // tracks played in this shuffle round

/* iOS only lets audio start inside a tap. Reading the file from storage
   takes a moment, so start (silent) playback right in the tap; the real
   track then replaces it. */
var unlocked = false;
var SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  var a = getAudio();
  if (a.getAttribute("src")) return;
  a.muted = true;
  a.src = SILENCE;
  var p = a.play();
  var done = function () { a.muted = false; };
  if (p && p.then) p.then(done, done); else done();
}

async function playTrack(id) {
  var meta = tracks.find(function (t) { return t.id === id; });
  if (!meta) return;
  heard[id] = true;
  var record = await run("readonly", function (s) { return s.get(id); });
  if (!record || !record.blob) return toast("that track is missing from storage", "error");
  var a = getAudio();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(record.blob);
  current = meta;
  a.src = objectUrl;
  save({ lastTrack: id, source: "local" });
  setMediaSession();
  try {
    await a.play();
  } catch (e) {
    if (e.name !== "AbortError") toast("press play to start (the browser blocked autoplay)", "warn");
  }
  refresh();
}

function order() {
  return tracks.map(function (t) { return t.id; });
}

function nextId(direction, auto) {
  var ids = order();
  if (!ids.length) return null;
  if (!current) return ids[0];
  if (settings.shuffle && ids.length > 1) {
    // every track once per round; with repeat off, stop when the round is done
    var left = ids.filter(function (id) { return !heard[id] && id !== current.id; });
    if (!left.length) {
      if (auto && settings.repeat === "off") { heard = {}; return null; }
      heard = {};
      left = ids.filter(function (id) { return id !== current.id; });
    }
    return left[Math.floor(Math.random() * left.length)];
  }
  var i = ids.indexOf(current.id) + direction;
  if (i >= ids.length) return auto && settings.repeat === "off" ? null : ids[0];
  if (i < 0) return ids[ids.length - 1];
  return ids[i];
}

function onEnded() {
  if (settings.repeat === "one") {
    audio.currentTime = 0;
    audio.play().catch(function () {});
    return;
  }
  var id = nextId(1, true);
  if (id) playTrack(id);
  else refresh();
}

export function localPlayPause() {
  var a = getAudio();
  if (!current) {
    var start = settings.lastTrack && tracks.some(function (t) { return t.id === settings.lastTrack; }) ? settings.lastTrack : order()[0];
    if (start) playTrack(start);
    else toast("add some music first", "warn");
    return;
  }
  if (a.paused) a.play().catch(function () {});
  else a.pause();
}

function stopLocal(unload) {
  if (!audio) return;
  audio.pause();
  if (unload) {
    audio.removeAttribute("src");
    audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    current = null;
  }
}

function localPlaying() {
  return Boolean(audio && current && !audio.paused);
}

function setMediaSession() {
  if (!("mediaSession" in navigator) || !current) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.name,
      artist: current.artist || "logbook",
      album: "logbook",
      artwork: [{ src: "assets/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "assets/icon-512.png", sizes: "512x512", type: "image/png" }]
    });
  } catch (e) {}
}

var sessionWired = false;
function wireMediaSession() {
  if (sessionWired || !("mediaSession" in navigator)) return;
  sessionWired = true;
  var handlers = {
    play: function () { localPlayPause(); },
    pause: function () { if (audio) audio.pause(); },
    previoustrack: function () { prev(); },
    nexttrack: function () { var id = nextId(1, false); if (id) playTrack(id); },
    seekto: function (d) { if (audio && d.seekTime != null) audio.currentTime = d.seekTime; },
    seekbackward: function (d) { if (audio) audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); },
    seekforward: function (d) { if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10)); }
  };
  Object.keys(handlers).forEach(function (k) {
    try { navigator.mediaSession.setActionHandler(k, handlers[k]); } catch (e) {}
  });
}

function prev() {
  if (audio && audio.currentTime > 4) { audio.currentTime = 0; return; }
  var id = nextId(-1, false);
  if (id) playTrack(id);
}

/* =====================================================================
   2. ambient sound, generated (no files, works offline)
   ===================================================================== */

export var SOUNDS = [
  { id: "rain", label: "rain", glyph: "⋮⋮" },
  { id: "waves", label: "waves", glyph: "≈≈" },
  { id: "wind", label: "wind", glyph: "~~" },
  { id: "fire", label: "fireplace", glyph: "∴" },
  { id: "brown", label: "brown noise", glyph: "▁▂" },
  { id: "pink", label: "pink noise", glyph: "▂▃" },
  { id: "white", label: "white noise", glyph: "▃▅" },
  { id: "focus", label: "focus tone", glyph: "∿", hint: "10 Hz binaural beat. use headphones" }
];

var MIXES = [
  { name: "rainstorm", mix: { rain: 0.8, wind: 0.35, brown: 0.3 } },
  { name: "by the fire", mix: { fire: 0.75, rain: 0.3 } },
  { name: "ocean", mix: { waves: 0.85, wind: 0.2 } },
  { name: "deep focus", mix: { brown: 0.6, focus: 0.35 } }
];

var ac = null, master = null, buffers = {}, playing = {};
var ambientOn = false;

function ctx() {
  if (!ac) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("this browser can't generate sound");
    ac = new AC();
    master = ac.createGain();
    master.gain.value = settings.ambientVolume;
    master.connect(ac.destination);
  }
  if (ac.state === "suspended") ac.resume().catch(function () {});
  return ac;
}

function noise(kind) {
  if (buffers[kind]) return buffers[kind];
  var c = ctx(), len = c.sampleRate * 8, buf = c.createBuffer(2, len, c.sampleRate);
  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w * 0.5;
      else if (kind === "pink") {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (kind === "crackle") {
        d[i] = 0;
      }
    }
    if (kind === "crackle") {
      // sparse pops that decay fast: a fire
      for (var p = 0; p < 140; p++) {
        var at = Math.floor(Math.random() * (len - 2000)), amp = 0.2 + Math.random() * 0.8, decay = 150 + Math.random() * 900;
        for (var k = 0; k < decay; k++) d[at + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (decay / 5));
      }
    }
    // fade the loop seam
    for (var f = 0; f < 2000; f++) { var g = f / 2000; d[f] *= g; d[len - 1 - f] *= g; }
  }
  buffers[kind] = buf;
  return buf;
}

function source(kind) {
  var s = ctx().createBufferSource();
  s.buffer = noise(kind);
  s.loop = true;
  // start somewhere random so two layers of the same noise don't line up
  s.start(0, Math.random() * 7);
  return s;
}

function lfo(rate, depth, target) {
  var c = ctx(), o = c.createOscillator(), g = c.createGain();
  o.frequency.value = rate;
  g.gain.value = depth;
  o.connect(g);
  g.connect(target);
  o.start();
  return o;
}

function filter(type, freq, q) {
  var f = ctx().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  if (q) f.Q.value = q;
  return f;
}

/* Each builder connects its sound into `out` and returns things to stop later. */
var BUILD = {
  white: function (out) { var s = source("white"); s.connect(out); return [s]; },
  pink: function (out) { var s = source("pink"); s.connect(out); return [s]; },
  brown: function (out) { var s = source("brown"); s.connect(out); return [s]; },
  rain: function (out) {
    var s = source("pink"), hp = filter("highpass", 500), lp = filter("lowpass", 6500);
    s.connect(hp); hp.connect(lp); lp.connect(out);
    var s2 = source("white"), bp = filter("bandpass", 2500, 0.6), g2 = ctx().createGain();
    g2.gain.value = 0.18;
    s2.connect(bp); bp.connect(g2); g2.connect(out);
    return [s, s2];
  },
  waves: function (out) {
    var s = source("brown"), lp = filter("lowpass", 700), swell = ctx().createGain();
    swell.gain.value = 0.55;
    s.connect(lp); lp.connect(swell); swell.connect(out);
    var o = lfo(0.075, 0.45, swell.gain);
    var o2 = lfo(0.075, 350, lp.frequency);
    return [s, o, o2];
  },
  wind: function (out) {
    var s = source("pink"), bp = filter("bandpass", 450, 1.4), g = ctx().createGain();
    g.gain.value = 1.6;
    s.connect(bp); bp.connect(g); g.connect(out);
    var o = lfo(0.06, 260, bp.frequency);
    var o2 = lfo(0.11, 0.6, g.gain);
    return [s, o, o2];
  },
  fire: function (out) {
    var rumble = source("brown"), lp = filter("lowpass", 320), rg = ctx().createGain();
    rg.gain.value = 0.6;
    rumble.connect(lp); lp.connect(rg); rg.connect(out);
    var pops = source("crackle"), hp = filter("highpass", 900), pg = ctx().createGain();
    pg.gain.value = 0.5;
    pops.connect(hp); hp.connect(pg); pg.connect(out);
    return [rumble, pops];
  },
  focus: function (out) {
    var c = ctx(), merge = c.createChannelMerger(2), l = c.createOscillator(), r = c.createOscillator(), g = c.createGain();
    l.frequency.value = 200; r.frequency.value = 210;   // 10 Hz apart: alpha
    l.connect(merge, 0, 0); r.connect(merge, 0, 1);
    g.gain.value = 0.12;
    merge.connect(g); g.connect(out);
    l.start(); r.start();
    return [l, r];
  }
};

function curve(level) {
  return Math.pow(Math.max(0, Math.min(1, level)), 2);
}

function startSound(id, level) {
  var c = ctx();
  var gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(master);
  var parts = BUILD[id](gain);
  gain.gain.setTargetAtTime(curve(level), c.currentTime, 0.25);
  playing[id] = { gain: gain, parts: parts };
}

function stopSound(id) {
  var p = playing[id];
  if (!p) return;
  delete playing[id];
  var c = ctx();
  p.gain.gain.setTargetAtTime(0, c.currentTime, 0.15);
  setTimeout(function () {
    p.parts.forEach(function (n) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
    try { p.gain.disconnect(); } catch (e) {}
  }, 900);
}

function setLevel(id, level) {
  settings.ambient[id] = level;
  save();
  if (!ambientOn) {
    if (level > 0) ambientPlay();
    return;
  }
  if (level <= 0) stopSound(id);
  else if (playing[id]) playing[id].gain.gain.setTargetAtTime(curve(level), ctx().currentTime, 0.1);
  else startSound(id, level);
  if (!Object.keys(playing).length) { ambientOn = false; refresh(); }
}

function anyAmbientLevel() {
  return SOUNDS.some(function (s) { return (settings.ambient[s.id] || 0) > 0; });
}

export function ambientPlay() {
  if (!anyAmbientLevel()) settings.ambient = Object.assign({}, MIXES[0].mix);
  try { ctx(); } catch (e) { return toast(e.message, "error"); }
  ambientOn = true;
  SOUNDS.forEach(function (s) {
    var lv = settings.ambient[s.id] || 0;
    if (lv > 0 && !playing[s.id]) startSound(s.id, lv);
  });
  save({ source: "ambient" });
  stopOthers("ambient");
  refresh();
}

export function ambientPause() {
  ambientOn = false;
  Object.keys(playing).forEach(stopSound);
  refresh();
}

function applyMix(mix) {
  Object.keys(playing).forEach(stopSound);
  settings.ambient = Object.assign({}, mix);
  save();
  ambientOn = false;
  ambientPlay();
}

/* =====================================================================
   3. Spotify
   ===================================================================== */

export function parseSpotify(input) {
  var s = String(input || "").trim();
  var m = s.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/);
  if (!m) m = s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/);
  return m ? { type: m[1], id: m[2], uri: "spotify:" + m[1] + ":" + m[2], url: "https://open.spotify.com/" + m[1] + "/" + m[2] } : null;
}

/* Spotify's player script runs inside a sandboxed frame with no access to
   this page (your login token, AI key and journal stay out of its reach).
   We talk to it with postMessage: load, play, pause, toggle. */
var spotify = { frame: null, paused: true, entity: null, height: 0 };

function spotifyHeight(type) {
  return type === "track" || type === "episode" ? 152 : 352;
}

function bridgeHtml(entity, height, autoplay) {
  var start = JSON.stringify({ uri: entity.uri, height: height, autoplay: Boolean(autoplay) }).replace(/</g, "\\u003c");
  return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style></head><body><div id="t"></div><script>' +
    "var start=" + start + ",controller=null;" +
    'function post(m){m.source="logbook-spotify";parent.postMessage(m,"*");}' +
    "window.onSpotifyIframeApiReady=function(api){api.createController(document.getElementById('t'),{uri:start.uri,width:'100%',height:start.height},function(c){controller=c;" +
      "c.addListener('ready',function(){post({type:'ready'});if(start.autoplay)c.play();});" +
      "c.addListener('playback_update',function(e){post({type:'state',paused:e.data.isPaused});});});};" +
    "window.addEventListener('message',function(e){if(e.source!==parent||!e.data)return;var m=e.data;" +
      "if(m.type==='load'){if(controller){controller.loadUri(m.uri);if(m.autoplay)controller.play();}else{start.uri=m.uri;start.autoplay=m.autoplay;}return;}" +
      "if(!controller)return;if(m.type==='play')controller.play();if(m.type==='pause')controller.pause();if(m.type==='toggle')controller.togglePlay();});" +
    '<\/script><script async src="https://open.spotify.com/embed/iframe-api/v1" onerror="post({type:\'error\'})"><\/script></body></html>';
}

function tell(message) {
  if (spotify.frame && spotify.frame.contentWindow) spotify.frame.contentWindow.postMessage(message, "*");
}

function loadSpotify(entity, autoplay) {
  var host = document.getElementById("spotifyEmbed");
  if (!host) return;
  spotify.entity = entity;
  save({ spotify: Object.assign({}, settings.spotify, { current: entity.url }), source: "spotify" });
  var height = spotifyHeight(entity.type);
  if (spotify.frame && spotify.frame.isConnected && spotify.height === height) {
    tell({ type: "load", uri: entity.uri, autoplay: Boolean(autoplay) });
    return;
  }
  spotify.height = height;
  spotify.paused = true;
  var f = document.createElement("iframe");
  f.title = "Spotify player";
  f.className = "spotify-frame";
  f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation");
  f.setAttribute("allow", "autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture");
  f.width = "100%";
  f.height = String(height);
  f.srcdoc = bridgeHtml(entity, height, autoplay);
  host.innerHTML = "";
  host.appendChild(f);
  spotify.frame = f;
}

window.addEventListener("message", function (e) {
  if (!spotify.frame || e.source !== spotify.frame.contentWindow) return;
  var m = e.data || {};
  if (m.source !== "logbook-spotify") return;
  if (m.type === "state") {
    var was = spotify.paused;
    spotify.paused = Boolean(m.paused);
    if (was && !spotify.paused) { save({ source: "spotify" }); stopOthers("spotify"); }
    if (was !== spotify.paused) refresh();
  }
  if (m.type === "error" && spotify.entity) {
    // no player script (offline or blocked): the plain embed still plays when Spotify is reachable
    var host = document.getElementById("spotifyEmbed");
    var ent = spotify.entity;
    spotify.frame = null;
    if (host) host.innerHTML = '<iframe title="Spotify" src="https://open.spotify.com/embed/' + ent.type + "/" + ent.id + '?utm_source=generator" width="100%" height="' + spotifyHeight(ent.type) +
      '" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>';
  }
});

function spotifyPlay() {
  if (!spotify.frame) return false;
  tell({ type: "play" });
  return true;
}

function spotifyPause() {
  if (spotify.frame && !spotify.paused) tell({ type: "pause" });
}

/* =====================================================================
   one thing at a time, the focus timer, and the mini player
   ===================================================================== */

function stopOthers(keep) {
  if (keep !== "local" && localPlaying()) audio.pause();
  if (keep !== "ambient" && ambientOn) ambientPause();
  if (keep !== "spotify") spotifyPause();
}

function anythingPlaying() {
  return localPlaying() || ambientOn || (spotify.frame && !spotify.paused);
}

export function pauseAll() {
  if (localPlaying()) audio.pause();
  if (ambientOn) ambientPause();
  spotifyPause();
}

export function resumeLast() {
  var src = settings.source || (tracks.length ? "local" : "ambient");
  if (src === "spotify" && spotifyPlay()) return;
  if (src === "local" && tracks.length) {
    if (!localPlaying()) localPlayPause();
    return;
  }
  ambientPlay();
}

function onPomodoro(e) {
  if (!settings.linkFocus) return;
  var type = e.detail && e.detail.type;
  if (type === "focus-started") resumeLast();
  if (type === "break-started" || type === "focus-completed" || type === "paused" || (type === "session-reset" && e.detail.reason !== "mode-change")) pauseAll();
}

function nowPlaying() {
  if (current && (localPlaying() || settings.source === "local")) {
    return { kind: "local", title: current.name, sub: current.artist || "your music", playing: localPlaying() };
  }
  if (ambientOn || (settings.source === "ambient" && anyAmbientLevel() && ac)) {
    var names = SOUNDS.filter(function (s) { return (settings.ambient[s.id] || 0) > 0; }).map(function (s) { return s.label; });
    return { kind: "ambient", title: names.slice(0, 3).join(" + ") || "ambient", sub: "ambient sound", playing: ambientOn };
  }
  if (spotify.frame && (settings.source === "spotify" || !spotify.paused)) {
    return { kind: "spotify", title: "Spotify", sub: spotify.entity ? spotify.entity.type : "", playing: !spotify.paused };
  }
  return null;
}

function toggleNowPlaying() {
  var np = nowPlaying();
  if (!np) return;
  if (np.kind === "local") localPlayPause();
  if (np.kind === "ambient") (ambientOn ? ambientPause : ambientPlay)();
  if (np.kind === "spotify") tell({ type: "toggle" });
}

function renderMini() {
  var el = document.getElementById("miniPlayer");
  if (!el) return;
  var np = nowPlaying();
  el.hidden = !np;
  document.body.classList.toggle("has-mini-player", Boolean(np));
  if (!np) return;
  el.dataset.kind = np.kind;
  el.classList.toggle("is-playing", np.playing);
  el.innerHTML =
    '<button type="button" class="mini-info" data-music="open" title="open the soundtrack">' +
      '<span class="mini-eq" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="mini-text"><span class="mini-title">' + escapeHtml(np.title) + '</span><span class="mini-sub">' + escapeHtml(np.sub) + "</span></span>" +
    "</button>" +
    '<button type="button" class="mini-btn" data-music="toggle" aria-label="' + (np.playing ? "pause" : "play") + '">' + (np.playing ? "❚❚" : "▶") + "</button>" +
    (np.kind === "local" ? '<button type="button" class="mini-btn" data-music="next" aria-label="next track">▶▶</button>' : "") +
    '<button type="button" class="mini-btn mini-close" data-music="close" aria-label="stop">✕</button>';
}

/* =====================================================================
   the soundtrack card (on the focus page)
   ===================================================================== */

var busyText = "";
function setBusy(text) {
  busyText = text;
  var el = document.getElementById("musicBusy");
  if (el) { el.textContent = text; el.hidden = !text; }
}

function tabsHtml() {
  return [["local", "my music"], ["ambient", "ambient"], ["spotify", "spotify"]].map(function (t) {
    return '<button type="button" class="music-tab" role="tab" data-music-tab="' + t[0] + '" aria-selected="' + (settings.tab === t[0]) + '">' + t[1] + "</button>";
  }).join("");
}

function render() {
  var el = document.getElementById("musicSection");
  if (!el) return;
  el.innerHTML =
    '<div class="music-card" id="musicCard">' +
      '<div class="music-head">' +
        '<h3 class="daily-section-title">soundtrack</h3>' +
        '<label class="music-link"><input type="checkbox" class="switch" id="musicLinkFocus"' + (settings.linkFocus ? " checked" : "") + '><span>play with the focus timer</span></label>' +
      "</div>" +
      '<div class="music-tabs" role="tablist">' + tabsHtml() + "</div>" +
      '<div class="music-panel" data-panel="local"' + (settings.tab === "local" ? "" : " hidden") + ' id="musicLocal"></div>' +
      '<div class="music-panel" data-panel="ambient"' + (settings.tab === "ambient" ? "" : " hidden") + ' id="musicAmbient"></div>' +
      '<div class="music-panel" data-panel="spotify"' + (settings.tab === "spotify" ? "" : " hidden") + ' id="musicSpotify"></div>' +
    "</div>";
  renderLocal();
  renderAmbient();
  renderSpotify();
}

function renderLocal() {
  var el = document.getElementById("musicLocal");
  if (!el) return;
  var total = tracks.reduce(function (s, t) { return s + (t.size || 0); }, 0);
  var playingId = current ? current.id : "";
  el.innerHTML =
    '<div class="player"' + (tracks.length ? "" : " hidden") + ">" +
      '<div class="player-now"><span class="player-title" id="playerTitle">' + escapeHtml(current ? current.name : "nothing playing") + '</span><span class="player-artist" id="playerArtist">' + escapeHtml(current ? current.artist : "pick a track or press play") + "</span></div>" +
      '<div class="player-seek"><span id="playerPos">0:00</span><input type="range" class="range" id="playerSeek" min="0" max="1000" value="0" aria-label="position"><span id="playerDur">0:00</span></div>' +
      '<div class="player-controls">' +
        '<button type="button" class="player-btn' + (settings.shuffle ? " is-on" : "") + '" data-music="shuffle" aria-pressed="' + settings.shuffle + '" title="shuffle">⤮</button>' +
        '<button type="button" class="player-btn" data-music="prev" title="previous">⏮</button>' +
        '<button type="button" class="player-btn player-btn--main" data-music="play" id="playerPlay" title="play or pause">' + (localPlaying() ? "❚❚" : "▶") + "</button>" +
        '<button type="button" class="player-btn" data-music="next" title="next">⏭</button>' +
        '<button type="button" class="player-btn' + (settings.repeat !== "off" ? " is-on" : "") + '" data-music="repeat" title="repeat: ' + settings.repeat + '">' + (settings.repeat === "one" ? "↻1" : "↻") + "</button>" +
        '<label class="player-volume"><span aria-hidden="true">vol</span><input type="range" class="range" id="playerVolume" min="0" max="100" value="' + Math.round(settings.volume * 100) + '" aria-label="volume"></label>' +
      "</div>" +
    "</div>" +
    '<div class="music-drop" id="musicDrop">' +
      "<p>" + (tracks.length ? "add more" : "bring your own music. it's saved in this browser, plays offline, and never leaves the device.") + "</p>" +
      '<div class="settings-actions">' +
        '<label class="file-pick"><input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac,.webm" multiple id="musicFiles"><span>add audio files</span></label>' +
        (folderPickSupported() ? '<label class="file-pick"><input type="file" webkitdirectory multiple id="musicFolder"><span>add a folder</span></label>' : "") +
      "</div>" +
      '<p class="setting-hint">or drop files here. mp3, m4a, ogg, opus, wav, flac (whatever this browser can play).</p>' +
      '<p class="music-busy" id="musicBusy"' + (busyText ? "" : " hidden") + ">" + escapeHtml(busyText) + "</p>" +
    "</div>" +
    (tracks.length
      ? '<ol class="track-list">' + tracks.map(function (t, i) {
          return '<li class="track' + (t.id === playingId ? " is-current" : "") + '">' +
            '<button type="button" class="track-play" data-play-track="' + t.id + '"><span class="track-n">' + (t.id === playingId && localPlaying() ? "▶" : String(i + 1).padStart(2, "0")) + "</span>" +
              '<span class="track-text"><span class="track-name">' + escapeHtml(t.name) + "</span>" + (t.artist ? '<span class="track-artist">' + escapeHtml(t.artist) + "</span>" : "") + "</span>" +
              '<span class="track-dur">' + (t.duration ? fmtTime(t.duration) : "") + "</span></button>" +
            '<button type="button" class="track-del" data-del-track="' + t.id + '" aria-label="remove ' + escapeHtml(t.name) + '">✕</button>' +
          "</li>";
        }).join("") + "</ol>" +
        '<p class="setting-hint music-foot">' + tracks.length + " track" + (tracks.length === 1 ? "" : "s") + ", " + fmtSize(total) + ' on this device. <button type="button" class="link-btn" data-music="clear">remove all</button></p>'
      : "");
  updateProgress();
}

function updateProgress() {
  var seek = document.getElementById("playerSeek");
  if (!seek || !audio) return;
  var d = audio.duration || 0;
  if (!seek.matches(":active")) seek.value = d ? Math.round(audio.currentTime / d * 1000) : 0;
  document.getElementById("playerPos").textContent = fmtTime(audio.currentTime);
  document.getElementById("playerDur").textContent = fmtTime(d);
  if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && d && isFinite(d)) {
    try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, d) }); } catch (e) {}
  }
}

function renderAmbient() {
  var el = document.getElementById("musicAmbient");
  if (!el) return;
  el.innerHTML =
    '<div class="ambient-top">' +
      '<button type="button" class="primary-btn" data-music="ambient-toggle">' + (ambientOn ? "❚❚ pause" : "▶ play") + "</button>" +
      '<div class="ambient-mixes">' + MIXES.map(function (m, i) { return '<button type="button" class="chip" data-mix="' + i + '">' + escapeHtml(m.name) + "</button>"; }).join("") + "</div>" +
    "</div>" +
    '<div class="ambient-grid">' +
      SOUNDS.map(function (s) {
        var lv = settings.ambient[s.id] || 0;
        return '<label class="ambient-sound' + (lv > 0 ? " is-on" : "") + '"' + (s.hint ? ' title="' + escapeHtml(s.hint) + '"' : "") + ">" +
          '<span class="ambient-glyph" aria-hidden="true">' + s.glyph + "</span>" +
          '<span class="ambient-label">' + escapeHtml(s.label) + "</span>" +
          '<input type="range" class="range" min="0" max="100" value="' + Math.round(lv * 100) + '" data-ambient="' + s.id + '" aria-label="' + escapeHtml(s.label) + ' volume">' +
        "</label>";
      }).join("") +
    "</div>" +
    '<label class="player-volume ambient-master"><span>master</span><input type="range" class="range" id="ambientVolume" min="0" max="100" value="' + Math.round(settings.ambientVolume * 100) + '" aria-label="ambient volume"></label>' +
    '<p class="setting-hint">made live in your browser, nothing downloads, works offline. slide any sound up to add it to the mix.</p>';
}

function renderSpotify() {
  var el = document.getElementById("musicSpotify");
  if (!el) return;
  var presets = settings.spotify.presets || [];
  el.innerHTML =
    '<form class="spotify-form" id="spotifyForm" autocomplete="off">' +
      '<input class="text-input" name="link" placeholder="paste a Spotify link: playlist, album, track, podcast" value="' + escapeHtml(settings.spotify.current || "") + '">' +
      '<button type="submit" class="primary-btn">load</button>' +
    "</form>" +
    (presets.length
      ? '<div class="spotify-presets">' + presets.map(function (p, i) {
          return '<span class="preset"><button type="button" class="chip" data-preset="' + i + '">' + escapeHtml(p.name) + '</button><button type="button" class="preset-del" data-del-preset="' + i + '" aria-label="remove ' + escapeHtml(p.name) + '">✕</button></span>';
        }).join("") + "</div>"
      : "") +
    '<div id="spotifyEmbed" class="spotify-embed"></div>' +
    '<div class="settings-actions spotify-actions"' + (settings.spotify.current ? "" : " hidden") + '><button type="button" class="tool-btn" data-music="save-preset">save to my list</button>' +
      '<a class="link-btn" href="https://open.spotify.com/search/lofi%20focus" target="_blank" rel="noopener">find playlists on Spotify ↗</a></div>' +
    '<p class="setting-hint">full songs if you\'re logged in to Spotify in this browser; otherwise Spotify plays 30-second previews. the player loads from Spotify, so it needs internet.</p>';
  // the player only loads when you open this tab or press load: nothing contacts Spotify before that
  if (parseSpotify(settings.spotify.current) && settings.tab === "spotify") {
    document.getElementById("spotifyEmbed").innerHTML = '<button type="button" class="tool-btn" data-music="spotify-resume">load the Spotify player</button>';
  }
}

function refresh() {
  var play = document.getElementById("playerPlay");
  if (play) play.textContent = localPlaying() ? "❚❚" : "▶";
  var title = document.getElementById("playerTitle");
  if (title && current) {
    title.textContent = current.name;
    document.getElementById("playerArtist").textContent = current.artist || "";
  }
  document.querySelectorAll(".track").forEach(function (li, i) {
    var id = li.querySelector("[data-play-track]").getAttribute("data-play-track");
    var isCur = current && current.id === id;
    li.classList.toggle("is-current", Boolean(isCur));
    li.querySelector(".track-n").textContent = isCur && localPlaying() ? "▶" : String(i + 1).padStart(2, "0");
  });
  var at = document.querySelector('[data-music="ambient-toggle"]');
  if (at) at.textContent = ambientOn ? "❚❚ pause" : "▶ play";
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = localPlaying() ? "playing" : current ? "paused" : "none"; } catch (e) {}
  }
  renderMini();
}

function handleClick(e) {
  var t = e.target;
  var tab = t.closest("[data-music-tab]");
  if (tab) {
    save({ tab: tab.getAttribute("data-music-tab") });
    document.querySelectorAll(".music-tab").forEach(function (b) { b.setAttribute("aria-selected", String(b === tab)); });
    document.querySelectorAll(".music-panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== settings.tab; });
    if (settings.tab === "spotify" && !spotify.frame) {
      var ent = parseSpotify(settings.spotify.current);
      if (ent) loadSpotify(ent, false);
    }
    return;
  }
  if (t.closest("[data-play-track], [data-music='play'], [data-music='toggle'], [data-music='next'], [data-music='prev']")) unlockAudio();
  var playBtn = t.closest("[data-play-track]");
  if (playBtn) {
    var id = playBtn.getAttribute("data-play-track");
    if (current && current.id === id) localPlayPause();
    else playTrack(id);
    return;
  }
  var del = t.closest("[data-del-track]");
  if (del) { removeTrack(del.getAttribute("data-del-track")).catch(function (er) { toast(er.message, "error"); }); return; }
  var mix = t.closest("[data-mix]");
  if (mix) { applyMix(MIXES[Number(mix.getAttribute("data-mix"))].mix); renderAmbient(); return; }
  var preset = t.closest("[data-preset]");
  if (preset) {
    var p = settings.spotify.presets[Number(preset.getAttribute("data-preset"))];
    var ent2 = p && parseSpotify(p.url);
    if (ent2) {
      var input = document.querySelector("#spotifyForm [name=link]");
      if (input) input.value = p.url;
      loadSpotify(ent2, true);
      var actions = document.querySelector(".spotify-actions");
      if (actions) actions.hidden = false;
    }
    return;
  }
  var delPreset = t.closest("[data-del-preset]");
  if (delPreset) {
    settings.spotify.presets.splice(Number(delPreset.getAttribute("data-del-preset")), 1);
    save();
    renderSpotifyList();
    return;
  }
  var act = t.closest("[data-music]");
  if (!act) return;
  var a = act.getAttribute("data-music");
  if (a === "play" || a === "toggle") { a === "toggle" ? toggleNowPlaying() : localPlayPause(); }
  if (a === "next") { var n = nextId(1, false); if (n) playTrack(n); }
  if (a === "prev") prev();
  if (a === "shuffle") { save({ shuffle: !settings.shuffle }); act.classList.toggle("is-on", settings.shuffle); act.setAttribute("aria-pressed", String(settings.shuffle)); }
  if (a === "repeat") {
    var nextRepeat = { off: "all", all: "one", one: "off" }[settings.repeat] || "all";
    save({ repeat: nextRepeat });
    act.classList.toggle("is-on", nextRepeat !== "off");
    act.textContent = nextRepeat === "one" ? "↻1" : "↻";
    act.title = "repeat: " + nextRepeat;
    toast("repeat: " + nextRepeat);
  }
  if (a === "clear" && confirm("remove all " + tracks.length + " tracks from this device?")) clearLibrary().catch(function (er) { toast(er.message, "error"); });
  if (a === "ambient-toggle") { ambientOn ? ambientPause() : ambientPlay(); renderAmbient(); }
  if (a === "open") { navigateTo("focus"); setTimeout(function () { var c = document.getElementById("musicCard"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80); }
  if (a === "spotify-resume") { var resume = parseSpotify(settings.spotify.current); if (resume) loadSpotify(resume, false); }
  if (a === "close") { stopLocal(true); ambientPause(); spotifyPause(); save({ source: "" }); refresh(); renderLocal(); }
  if (a === "save-preset") {
    var entity = parseSpotify(settings.spotify.current);
    if (!entity) return;
    var name = prompt("name it", entity.type === "playlist" ? "focus playlist" : entity.type);
    if (!name) return;
    settings.spotify.presets = (settings.spotify.presets || []).filter(function (x) { return x.url !== entity.url; }).concat([{ name: name.slice(0, 40), url: entity.url }]);
    save();
    renderSpotifyList();
    toast("saved");
  }
}

function renderSpotifyList() {
  // re-render the presets without touching the embed
  var form = document.getElementById("spotifyForm");
  if (!form) return;
  var old = document.querySelector(".spotify-presets");
  if (old) old.remove();
  var presets = settings.spotify.presets || [];
  if (!presets.length) return;
  var div = document.createElement("div");
  div.className = "spotify-presets";
  div.innerHTML = presets.map(function (p, i) {
    return '<span class="preset"><button type="button" class="chip" data-preset="' + i + '">' + escapeHtml(p.name) + '</button><button type="button" class="preset-del" data-del-preset="' + i + '" aria-label="remove ' + escapeHtml(p.name) + '">✕</button></span>';
  }).join("");
  form.after(div);
}

function wire() {
  document.addEventListener("click", function (e) {
    if (e.target.closest("#musicSection, #miniPlayer")) handleClick(e);
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "playerSeek" && audio && audio.duration) audio.currentTime = t.value / 1000 * audio.duration;
    if (t.id === "playerVolume") { save({ volume: t.value / 100 }); getAudio().volume = settings.volume; }
    if (t.id === "ambientVolume") {
      save({ ambientVolume: t.value / 100 });
      if (master) master.gain.setTargetAtTime(settings.ambientVolume, ac.currentTime, 0.05);
    }
    if (t.hasAttribute && t.hasAttribute("data-ambient")) {
      var lv = t.value / 100;
      t.closest(".ambient-sound").classList.toggle("is-on", lv > 0);
      setLevel(t.getAttribute("data-ambient"), lv);
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "musicFiles" || t.id === "musicFolder") {
      var files = t.files;
      addFiles(files).catch(function (er) { toast(er.message, "error"); });
      t.value = "";
    }
    if (t.id === "musicLinkFocus") {
      save({ linkFocus: t.checked });
      toast(t.checked ? "music starts with focus and pauses on breaks" : "music no longer follows the timer");
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "spotifyForm") return;
    e.preventDefault();
    var entity = parseSpotify(e.target.elements.link.value);
    if (!entity) return toast("that doesn't look like a Spotify link. copy it from Share → Copy link", "warn");
    loadSpotify(entity, true);
    var actions = document.querySelector(".spotify-actions");
    if (actions) actions.hidden = false;
  });
  // drag and drop files onto the card
  document.addEventListener("dragover", function (e) {
    var drop = e.target.closest && e.target.closest("#musicCard");
    if (!drop) return;
    e.preventDefault();
    drop.classList.add("is-dragging");
  });
  document.addEventListener("dragleave", function (e) {
    var drop = e.target.closest && e.target.closest("#musicCard");
    if (drop && !drop.contains(e.relatedTarget)) drop.classList.remove("is-dragging");
  });
  document.addEventListener("drop", function (e) {
    var drop = e.target.closest && e.target.closest("#musicCard");
    if (!drop) return;
    e.preventDefault();
    drop.classList.remove("is-dragging");
    if (settings.tab !== "local") {
      var tab = drop.querySelector('[data-music-tab="local"]');
      if (tab) tab.click();
    }
    addFiles(e.dataTransfer.files).catch(function (er) { toast(er.message, "error"); });
  });
  document.addEventListener("logbook:pomodoro", onPomodoro);
}

export async function startMusic() {
  await loadTracks();
  render();
  wire();
  wireMediaSession();
  renderMini();
}

export function musicCommand(action) {
  if (action === "toggle") { if (nowPlaying()) toggleNowPlaying(); else resumeLast(); }
  if (action === "ambient") { settings.tab = "ambient"; save(); ambientOn ? ambientPause() : ambientPlay(); renderAmbient(); }
  if (action === "stop") pauseAll();
  refresh();
}
