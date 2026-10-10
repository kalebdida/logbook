"""Build the static web app into dist/.

dist/ is what GitHub Pages (or any static host) serves, and what the
Android app (Capacitor) bundles. With no server next to it, the app runs
in device mode: everything is stored in the browser, and it can still
connect to a Logbook server from settings.

Set LOGBOOK_API_URL to point the build at a server instead (the Pages
front door for a server on Render). It's written into dist/config.js, and a
first visit then connects to that server on its own.

    python3 scripts/build_web.py
    LOGBOOK_API_URL=https://logbook-xxxx.onrender.com python3 scripts/build_web.py
"""
import hashlib
import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FILES = ["index.html", "manifest.webmanifest", "sw.js", "config.js"]
DIRS = ["css", "js", "assets"]


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    digest = hashlib.sha1()
    for name in FILES:
        shutil.copy2(ROOT / name, DIST / name)
    for d in DIRS:
        shutil.copytree(ROOT / d, DIST / d)
    api_url = write_config(os.environ.get("LOGBOOK_API_URL", ""))
    for path in sorted(p for p in DIST.rglob("*") if p.is_file()):
        digest.update(path.relative_to(DIST).as_posix().encode())
        digest.update(path.read_bytes())
    version = digest.hexdigest()[:10]

    # a new cache name for every build, so installed copies pick up changes
    sw = DIST / "sw.js"
    sw.write_text(re.sub(r'var VERSION = "[^"]*";', f'var VERSION = "{version}";', sw.read_text()))
    (DIST / ".nojekyll").write_text("")
    (DIST / "build.json").write_text(json.dumps({"version": version}) + "\n")

    count = sum(1 for p in DIST.rglob("*") if p.is_file())
    size = sum(p.stat().st_size for p in DIST.rglob("*") if p.is_file())
    print(f"built dist/ ({count} files, {size / 1024:.0f} KB), version {version}")
    print(f"server: {api_url}" if api_url else "server: none set, a first visit picks by itself (device mode on a static host)")


def write_config(api_url: str) -> str:
    """Bakes the server address into dist/config.js. Empty: keep the default."""
    api_url = api_url.strip().rstrip("/")
    if not api_url:
        return ""
    if not re.match(r"^https?://[^/\s]+(/\S*)?$", api_url):
        raise SystemExit(f"LOGBOOK_API_URL should look like https://logbook-xxxx.onrender.com, got {api_url!r}")
    (DIST / "config.js").write_text(
        "/* Written by scripts/build_web.py from LOGBOOK_API_URL. */\n"
        f"window.LOGBOOK_CONFIG = {json.dumps({'apiUrl': api_url})};\n"
    )
    return api_url


if __name__ == "__main__":
    main()
