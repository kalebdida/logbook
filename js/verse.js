import { dayOfYear } from './utils.js';

export var VERSES = [
  { text: "Be strong and of a good courage.", ref: "Joshua 1:9" },
  { text: "I can do all things through Christ which strengtheneth me.", ref: "Philippians 4:13" },
  { text: "Trust in the LORD with all thine heart.", ref: "Proverbs 3:5" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "The LORD is my shepherd; I shall not want.", ref: "Psalm 23:1" },
  { text: "This is the day which the LORD hath made.", ref: "Psalm 118:24" },
  { text: "Fear not: for I am with thee.", ref: "Isaiah 41:10" },
  { text: "Weeping may endure for a night, but joy cometh in the morning.", ref: "Psalm 30:5" },
  { text: "The joy of the LORD is your strength.", ref: "Nehemiah 8:10" },
  { text: "Delight thyself also in the LORD.", ref: "Psalm 37:4" },
  { text: "Cast thy burden upon the LORD.", ref: "Psalm 55:22" },
  { text: "In every thing give thanks.", ref: "1 Thessalonians 5:18" },
  { text: "Let all your things be done with charity.", ref: "1 Corinthians 16:14" },
  { text: "Commit thy works unto the LORD.", ref: "Proverbs 16:3" }
];

export function renderVerse() {
  var verse = VERSES[dayOfYear(new Date()) % VERSES.length];
  document.getElementById("verseText").textContent = '"' + verse.text + '"';
  document.getElementById("verseRef").textContent = "\u00B7 " + verse.ref;
}
