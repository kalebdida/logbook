import { apiListPhotos, apiSavePhoto, apiDeletePhoto, apiPhotoUrl, forgetPhotoUrl } from './api.js';
import { dateKey } from './dayRecord.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { emitChange } from './bus.js';
import { toast } from './toast.js';
import { mascotSay } from './mascot.js';

/* Photo of the day: one picture, kept like a polaroid. The browser shrinks
   it first (1280px and a 240px thumbnail), so it uploads fast and a year of
   them stays small. A new one "develops" like instant film. */

var photos = [];        // [{date, caption}]
var justAdded = false;

function shift(key, days) {
  var p = key.split("-").map(Number);
  return dateKey(new Date(p[0], p[1] - 1, p[2] + days));
}

export function hasPhoto(day) { return photos.some(function (p) { return p.date === day; }); }

function shrink(file, max, quality) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Not an image")); };
    img.src = url;
  });
}

function draw() {
  var el = document.getElementById("photoSection");
  if (!el) return;
  var today = dateKey(new Date());
  var mine = photos.filter(function (p) { return p.date === today; })[0];
  var week = "";
  for (var i = 6; i >= 1; i--) {
    var k = shift(today, -i);
    var has = hasPhoto(k);
    week += '<span class="pw-day' + (has ? " has-photo" : "") + '" data-week-photo="' + (has ? k : "") + '" title="' +
      new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) + '"></span>';
  }
  el.innerHTML =
    '<div class="card photo-card">' +
      '<div class="habits-head"><h3 class="daily-section-title">' + icon("camera") + "<span>Photo of the day</span></h3>" +
        (mine ? '<button type="button" class="link-btn" data-photo="remove">Remove</button>' : "") + "</div>" +
      (mine
        ? '<figure class="polaroid' + (justAdded ? " is-developing" : "") + '"><span class="polaroid-img"><img alt="' + escapeHtml(mine.caption || "Today's photo") + '" data-photo-img="' + today + '"></span>' +
            '<figcaption><input class="polaroid-caption" maxlength="300" placeholder="Say something about it" value="' + escapeHtml(mine.caption || "") + '" aria-label="Caption"></figcaption></figure>'
        : '<label class="polaroid is-empty"><input type="file" accept="image/*" class="sr-only" data-photo="pick">' +
            '<span class="polaroid-img">' + icon("camera") + "<span>Add today's photo</span></span><figcaption>One picture of today</figcaption></label>") +
      '<div class="photo-week" aria-label="This week">' + week + '<span class="pw-day is-today' + (mine ? " has-photo" : "") + '" data-week-photo="' + (mine ? today : "") + '" title="Today"></span></div>' +
    "</div>";
  justAdded = false;
  var img = el.querySelector("[data-photo-img]");
  if (img) apiPhotoUrl(img.getAttribute("data-photo-img")).then(function (u) { img.src = u; }).catch(function () {});
  el.querySelectorAll("[data-week-photo]").forEach(function (d) {
    var k = d.getAttribute("data-week-photo");
    if (k) apiPhotoUrl(k, "thumb").then(function (u) { d.style.backgroundImage = "url(" + JSON.stringify(u) + ")"; }).catch(function () {});
  });
}

async function onPick(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var today = dateKey(new Date());
  try {
    var big = await shrink(file, 1280, 0.85);
    var small = await shrink(file, 240, 0.8);
    var saved = await apiSavePhoto(today, big, small, "");
    forgetPhotoUrl(today);
    photos = photos.filter(function (p) { return p.date !== today; }).concat([{ date: today, caption: saved.caption || "" }]);
    justAdded = true;
    draw();
    emitChange("photos");
    mascotSay("Nice one. That's today, kept.");
  } catch (e) {
    toast(e.message === "Not an image" ? "That file isn't a picture" : "Couldn't save the photo", "error");
  }
}

var captionTimer = null;
var wired = false;
export async function renderPhoto() {
  var el = document.getElementById("photoSection");
  if (!el) return;
  var today = dateKey(new Date());
  try {
    photos = await apiListPhotos(shift(today, -7), today);
  } catch (e) {
    if (e.status === 404) { el.hidden = true; return; }
    throw e;
  }
  el.hidden = false;
  draw();
  if (wired) return;
  wired = true;
  el.addEventListener("change", function (e) {
    if (e.target.matches('[data-photo="pick"]')) onPick(e.target);
  });
  el.addEventListener("input", function (e) {
    if (!e.target.classList.contains("polaroid-caption")) return;
    clearTimeout(captionTimer);
    var text = e.target.value;
    captionTimer = setTimeout(async function () {
      var day = dateKey(new Date());
      try {
        // the caption rides along with the picture we already have
        var full = await apiPhotoUrl(day), thumb = await apiPhotoUrl(day, "thumb");
        var asData = function (u) {
          if (u.indexOf("data:") === 0) return Promise.resolve(u);
          return fetch(u).then(function (r) { return r.blob(); }).then(function (b) {
            return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
          });
        };
        await apiSavePhoto(day, await asData(full), await asData(thumb), text);
        photos.forEach(function (p) { if (p.date === day) p.caption = text; });
      } catch (err) {
        toast("Couldn't save the caption", "error");
      }
    }, 900);
  });
  el.addEventListener("click", async function (e) {
    if (!e.target.closest('[data-photo="remove"]')) return;
    var day = dateKey(new Date());
    try {
      await apiDeletePhoto(day);
      forgetPhotoUrl(day);
      photos = photos.filter(function (p) { return p.date !== day; });
      draw();
      emitChange("photos");
    } catch (err) { toast("Couldn't remove it", "error"); }
  });
}
