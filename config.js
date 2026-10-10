/* Where this copy of the app finds its server, for copies hosted apart from
   it (GitHub Pages in front of a server on Render).
   apiUrl: "" means "decide by yourself": the server this page came from if
   there is one, otherwise this device. The Pages build fills it in from the
   LOGBOOK_API_URL repo variable (scripts/build_web.py).
   Only the first visit uses it; after that the app remembers its choice,
   and settings can change it. */
window.LOGBOOK_CONFIG = { apiUrl: "" };
