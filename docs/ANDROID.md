# Logbook on Android

The Android app is the same web app wrapped with Capacitor, so every feature
(themes, habits, music, the companion, offline) comes along. It runs in
device mode: your data is stored in the app on the phone. From settings it
can connect to your Logbook server, like any other copy.

There are two ways to get an APK.

## A. Let GitHub build it (no Android Studio)

1. Push this repo to GitHub.
2. **Actions → android apk → Run workflow** (or push a tag like `v2.1.0`).
3. When it finishes (about 5 minutes), open the run and download
   **logbook-apk** under Artifacts. Unzip it: `app-debug.apk`.
4. Copy it to your phone and open it. Android asks you to allow installing
   apps from your file manager or browser; allow it for that app only.

This is a *debug* build: fine for your own phone, not for the Play Store.

## B. Build it on your computer

Needs Node 22+, Python 3, and Android Studio 2025.2.1 or newer (it installs
the Android SDK and Java for you). These are Capacitor 8's requirements.

```bash
npm install
npm run android:init     # once: builds the web app, creates android/, adds the icon
npm run apk              # builds android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run android:open` opens the project in Android Studio, where you can run
it on a plugged-in phone or an emulator.

After changing the web code: `npm run android:sync`, then build again.

## What's different in the app

- Data lives in the app's storage. Uninstalling the app deletes it, so download a
  backup from settings first (or connect to your server).
- Reminders show inside the app while it's open. Notifications that arrive when
  the app is closed would need Capacitor's Local Notifications plugin; not added yet.
- Music: pick audio files from the phone (folders can't be picked on Android).
  Ambient sound and Spotify work as on the web; Spotify needs internet.
- The AI companion works with a key saved on the phone, or through your server.

## Releasing on the Play Store (later)

You'd need a signed release build (`./gradlew bundleRelease` with a keystore),
a Google Play developer account, and a privacy policy page. The app ID is
`com.kaleb.logbook` (in `capacitor.config.json`); pick the final one before
the first release, because it can't change afterwards.
