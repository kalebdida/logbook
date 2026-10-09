"""Build the static web app into dist/.

dist/ is what GitHub Pages (or any static host) serves, and what the
Android app (Capacitor) bundles. With no server next to it, the app runs
in device mode: everything is stored in the browser, and it can still
connect to a Logbook server from settings.

    python3 scripts/build_web.py
"""
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FILES = ["index.html", "manifest.webmanifest", "sw.js"]
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


if __name__ == "__main__":
    main()
