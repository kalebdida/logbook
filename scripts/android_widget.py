"""Adds the home screen widget to the Android project that `npx cap add
android` generates (android/ isn't kept in git, so this runs after it).

    python scripts/android_widget.py

Copies android-extras/ into the app (Java into the app's package, res/ as
is), registers the widget in AndroidManifest.xml, and is safe to run twice."""

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTRAS = ROOT / "android-extras"
APP = ROOT / "android" / "app" / "src" / "main"
RECEIVER = """
        <receiver android:name=".LogbookWidget" android:exported="false" android:label="Logbook">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/logbook_widget_info" />
        </receiver>
"""


def main() -> None:
    if not APP.exists():
        raise SystemExit("android/ isn't there yet: run `npx cap add android` first")
    app_id = json.loads((ROOT / "capacitor.config.json").read_text())["appId"]
    java_dir = APP / "java" / Path(*app_id.split("."))
    java_dir.mkdir(parents=True, exist_ok=True)
    for src in (EXTRAS / "java").glob("*.java"):
        text = src.read_text().replace("package com.kaleb.logbook;", f"package {app_id};")
        (java_dir / src.name).write_text(text)
    for src in (EXTRAS / "res").rglob("*"):
        if src.is_file():
            dest = APP / "res" / src.relative_to(EXTRAS / "res")
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
    manifest = APP / "AndroidManifest.xml"
    text = manifest.read_text()
    if ".LogbookWidget" not in text:
        text = text.replace("</application>", RECEIVER + "    </application>", 1)
        manifest.write_text(text)
    print(f"widget added to {app_id}")


if __name__ == "__main__":
    main()
