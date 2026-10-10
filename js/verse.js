import { dayOfYear } from './utils.js';
import { getPrefs } from './prefs.js';

/* The line on the dashboard: a Bible verse, a quote, an affirmation, your
   own lines, or nothing. Picked in settings ("dailyLine"). The same line
   shows all day; the small refresh button shows another one. */

export var VERSES = [
  { text: "Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", ref: "Joshua 1:9" },
  { text: "I can do all things through Christ which strengtheneth me.", ref: "Philippians 4:13" },
  { text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding.", ref: "Proverbs 3:5" },
  { text: "In all thy ways acknowledge him, and he shall direct thy paths.", ref: "Proverbs 3:6" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "God is our refuge and strength, a very present help in trouble.", ref: "Psalm 46:1" },
  { text: "The LORD is my shepherd; I shall not want.", ref: "Psalm 23:1" },
  { text: "This is the day which the LORD hath made; we will rejoice and be glad in it.", ref: "Psalm 118:24" },
  { text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God.", ref: "Isaiah 41:10" },
  { text: "Weeping may endure for a night, but joy cometh in the morning.", ref: "Psalm 30:5" },
  { text: "The joy of the LORD is your strength.", ref: "Nehemiah 8:10" },
  { text: "Delight thyself also in the LORD; and he shall give thee the desires of thine heart.", ref: "Psalm 37:4" },
  { text: "Commit thy way unto the LORD; trust also in him; and he shall bring it to pass.", ref: "Psalm 37:5" },
  { text: "Cast thy burden upon the LORD, and he shall sustain thee.", ref: "Psalm 55:22" },
  { text: "In every thing give thanks: for this is the will of God in Christ Jesus concerning you.", ref: "1 Thessalonians 5:18" },
  { text: "Let all your things be done with charity.", ref: "1 Corinthians 16:14" },
  { text: "Commit thy works unto the LORD, and thy thoughts shall be established.", ref: "Proverbs 16:3" },
  { text: "A man's heart deviseth his way: but the LORD directeth his steps.", ref: "Proverbs 16:9" },
  { text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.", ref: "Isaiah 40:31" },
  { text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest.", ref: "Matthew 11:28" },
  { text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.", ref: "Romans 8:28" },
  { text: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.", ref: "Jeremiah 29:11" },
  { text: "Thy word is a lamp unto my feet, and a light unto my path.", ref: "Psalm 119:105" },
  { text: "Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself.", ref: "Matthew 6:34" },
  { text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.", ref: "Philippians 4:6" },
  { text: "And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.", ref: "Philippians 4:7" },
  { text: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.", ref: "2 Timothy 1:7" },
  { text: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men.", ref: "Colossians 3:23" },
  { text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", ref: "Galatians 6:9" },
  { text: "His compassions fail not. They are new every morning: great is thy faithfulness.", ref: "Lamentations 3:22–23" },
  { text: "The LORD is my light and my salvation; whom shall I fear?", ref: "Psalm 27:1" },
  { text: "I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.", ref: "Psalm 121:1–2" },
  { text: "Peace I leave with you, my peace I give unto you. Let not your heart be troubled, neither let it be afraid.", ref: "John 14:27" },
  { text: "In the world ye shall have tribulation: but be of good cheer; I have overcome the world.", ref: "John 16:33" },
  { text: "What doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?", ref: "Micah 6:8" },
  { text: "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.", ref: "James 1:5" },
  { text: "Casting all your care upon him; for he careth for you.", ref: "1 Peter 5:7" },
  { text: "So teach us to number our days, that we may apply our hearts unto wisdom.", ref: "Psalm 90:12" },
  { text: "To every thing there is a season, and a time to every purpose under the heaven.", ref: "Ecclesiastes 3:1" },
  { text: "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.", ref: "Isaiah 26:3" },
  { text: "Let us run with patience the race that is set before us.", ref: "Hebrews 12:1" },
  { text: "Rejoicing in hope; patient in tribulation; continuing instant in prayer.", ref: "Romans 12:12" },
  { text: "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.", ref: "Matthew 5:16" },
  { text: "Keep thy heart with all diligence; for out of it are the issues of life.", ref: "Proverbs 4:23" },
  { text: "My grace is sufficient for thee: for my strength is made perfect in weakness.", ref: "2 Corinthians 12:9" }
];

export var QUOTES = [
  { text: "The impediment to action advances action. What stands in the way becomes the way.", ref: "Marcus Aurelius" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", ref: "Marcus Aurelius" },
  { text: "Very little is needed to make a happy life.", ref: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", ref: "Seneca" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", ref: "Seneca" },
  { text: "First say to yourself what you would be; and then do what you have to do.", ref: "Epictetus" },
  { text: "Make the best use of what is in your power, and take the rest as it happens.", ref: "Epictetus" },
  { text: "Do not spoil what you have by desiring what you have not.", ref: "Epicurus" },
  { text: "A journey of a thousand miles begins with a single step.", ref: "Lao Tzu" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", ref: "Will Durant, on Aristotle" },
  { text: "The unexamined life is not worth living.", ref: "Socrates" },
  { text: "He who has a why to live can bear almost any how.", ref: "Friedrich Nietzsche" },
  { text: "Do what you can, with what you have, where you are.", ref: "Theodore Roosevelt" },
  { text: "Be patient toward all that is unsolved in your heart.", ref: "Rainer Maria Rilke" },
  { text: "Hope is the thing with feathers that perches in the soul.", ref: "Emily Dickinson" },
  { text: "Not all those who wander are lost.", ref: "J. R. R. Tolkien" },
  { text: "I am not afraid of storms, for I am learning how to sail my ship.", ref: "Louisa May Alcott" },
  { text: "Rest is not idleness.", ref: "John Lubbock" },
  { text: "Fall seven times, stand up eight.", ref: "Japanese proverb" },
  { text: "Little by little, one goes far.", ref: "Spanish proverb" },
  { text: "If you want to go fast, go alone. If you want to go far, go together.", ref: "African proverb" },
  { text: "The best time to plant a tree was twenty years ago. The second best time is now.", ref: "Proverb" },
  { text: "Slow and steady wins the race.", ref: "Aesop" }
];

export var AFFIRMATIONS = [
  "Small steps still move me forward.",
  "I don't have to finish everything today. I just have to start.",
  "I'm allowed to rest and still be someone who works hard.",
  "Progress, not perfection.",
  "I can do hard things, one at a time.",
  "My worth isn't measured by today's to-do list.",
  "I show up, even when it's quiet and nobody sees.",
  "A bad day is a day, not a verdict.",
  "I'm building something that takes time. That's okay.",
  "Do the next right thing.",
  "I choose what gets my attention today.",
  "Consistency beats intensity.",
  "I'm further along than I was a year ago.",
  "Today counts, even if it's small."
].map(function (t) { return { text: t, ref: "" }; });

export var LINE_KINDS = {
  verse: { label: "Bible verse", title: "Verse for today", icon: "book-open" },
  quote: { label: "Quote", title: "Words for today", icon: "quote" },
  affirmation: { label: "Affirmation", title: "For today", icon: "sparkle" },
  custom: { label: "My own lines", title: "For today", icon: "pen-line" },
  mix: { label: "A mix of all", title: "For today", icon: "sparkles" },
  off: { label: "Nothing", title: "", icon: "" }
};

var offset = 0;   // how many times "show another" was pressed today

export function customLines() {
  return String(getPrefs().dailyLineCustom || "").split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
    // "text — who" or "text - who" splits off a source
    var m = l.match(/^(.*\S)\s+[—–-]{1,2}\s+(\S.*)$/);
    return m ? { text: m[1], ref: m[2] } : { text: l, ref: "" };
  });
}

export function linesFor(kind) {
  if (kind === "quote") return QUOTES;
  if (kind === "affirmation") return AFFIRMATIONS;
  if (kind === "custom") return customLines().length ? customLines() : AFFIRMATIONS;
  if (kind === "mix") return VERSES.concat(QUOTES, AFFIRMATIONS, customLines());
  return VERSES;
}

export function renderVerse() {
  var kind = getPrefs().dailyLine || "verse";
  var box = document.getElementById("dailyLine");
  if (!box) return;
  box.hidden = kind === "off";
  if (kind === "off") return;
  var info = LINE_KINDS[kind] || LINE_KINDS.verse;
  var list = linesFor(kind);
  // a stable pick for the day, spread so neighbouring days differ
  var pick = list[(dayOfYear(new Date()) * 7 + offset * 13) % list.length];
  document.getElementById("dailyLineTitle").textContent = info.title;
  var iconEl = document.getElementById("dailyLineIcon");
  if (iconEl && iconEl.getAttribute("data-icon") !== info.icon) {
    iconEl.setAttribute("data-icon", info.icon);
    iconEl.innerHTML = "";
    import('./icons.js').then(function (m) { m.paintIcons(box); });
  }
  var textEl = document.getElementById("verseText");
  textEl.textContent = pick.text;
  textEl.classList.remove("is-new"); void textEl.offsetWidth; textEl.classList.add("is-new");
  document.getElementById("verseRef").textContent = pick.ref ? pick.ref : "";
  box.dataset.kind = kind;
}

var wired = false;
export function wireDailyLine() {
  if (wired) return;
  wired = true;
  var next = document.getElementById("dailyLineNext");
  if (next) next.addEventListener("click", function () { offset++; renderVerse(); });
  document.addEventListener("logbook:prefs-changed", function (e) {
    var p = e.detail.patch || {};
    if ("dailyLine" in p || "dailyLineCustom" in p) { offset = 0; renderVerse(); }
  });
}
